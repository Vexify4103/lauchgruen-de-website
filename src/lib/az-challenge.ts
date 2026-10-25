/**
 * A-Z champion challenge for fixed streamer overlays.
 *
 * Rules: the streamer walks the champion list alphabetically and needs one win
 * on each champion before moving on. Only games on the current target champion
 * count as tries. Other champions (bans, taken picks, off-stream games) are
 * ignored. Remakes never count.
 *
 * Match results are stored in MongoDB so a long challenge does not need the
 * full match history from Riot on every refresh.
 */
import { getDb } from "@/lib/mongo";
import {
	championIconUrl,
	getChampionMasteryByPuuidForRoute,
	getMatchByIdForRoute,
	getMatchIdsByPuuidForRoute,
	isRiotMatchRemake,
	RiotApiError,
	type RiotRoute,
} from "@/lib/riot";
import { compactRankLabel, getStreamerObsSnapshot, getStreamerPrimaryAccount, type StreamerSlug } from "@/lib/streamer-obs";

const MATCH_COLLECTION = "az_challenge_matches";
const STATE_COLLECTION = "az_challenge_state";
const DATA_DRAGON_BASE = "https://ddragon.leagueoflegends.com";
const FALLBACK_DDRAGON_VERSION = "15.24.1";
const ROSTER_CACHE_MS = 6 * 60 * 60_000;
const SNAPSHOT_CACHE_MS = 10_000;
const SYNC_INTERVAL_MS = 45_000;
const MAX_DETAILS_PER_SYNC = 24;
const MATCH_ID_PAGE_SIZE = 100;
const MAX_MATCH_ID_PAGES = 10;
const INCREMENTAL_OVERLAP_SECONDS = 6 * 60 * 60;
const MASTERY_CACHE_MS = 10 * 60_000;
const UPCOMING_COUNT = 6;
const RECENT_COMPLETED_COUNT = 8;
const ATTEMPT_HISTORY_COUNT = 10;
export type AzChallengeSlug = Extract<StreamerSlug, "tlgfabi" | "spaceffs">;

/**
 * Streamers running the A-Z challenge. Every value can be overridden with
 * `<SLUG>_AZ_START_AT`, `_AZ_QUEUE_IDS`, `_AZ_MANUAL_DONE` and `_AZ_EXCLUDE_MATCHES`.
 */
export const AZ_CHALLENGES: Record<AzChallengeSlug, { startAt: string; theme: "gold" | "ice"; excludedMatchIds: string[] }> = {
	tlgfabi: {
		startAt: "2026-10-15T00:00:00Z",
		theme: "gold",
		// Games Fabi marked as "not challenge" in his tracking sheet:
		// Viktor win on 2026-10-18.
		excludedMatchIds: ["EUW1_8017912568"],
	},
	spaceffs: {
		// Started on 25.10 after his last Solo/Duo game that day (two Blitzcrank
		// losses that ended ~18:51 Berlin were before the challenge).
		startAt: "2026-10-25T19:00:00+01:00",
		theme: "ice",
		excludedMatchIds: [],
	},
};

export function isAzChallengeSlug(value: string): value is AzChallengeSlug {
	return Object.hasOwn(AZ_CHALLENGES, value);
}

type AzChallengeConfig = {
	slug: AzChallengeSlug;
	startAt: string;
	queueIds: number[];
	/** Champion names or numeric ids that count as done without a tracked win. */
	manualDone: string[];
	/** Match ids played outside the challenge (like "Counts: No" in Fabi's sheet). */
	excludedMatchIds: string[];
};

function envList(name: string): string[] {
	return (process.env[name] ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

function challengeConfig(slug: AzChallengeSlug): AzChallengeConfig {
	const prefix = slug.toUpperCase();
	const queueIds = envList(`${prefix}_AZ_QUEUE_IDS`)
		.map(Number)
		.filter((value) => Number.isInteger(value) && value > 0);
	const defaults = AZ_CHALLENGES[slug];
	const defaultStart = new Date(defaults.startAt).toISOString();
	const startDate = new Date(process.env[`${prefix}_AZ_START_AT`]?.trim() || defaults.startAt);
	return {
		slug,
		startAt: Number.isNaN(startDate.getTime()) ? defaultStart : startDate.toISOString(),
		// Default: Ranked Solo/Duo, the queue the challenge runs in.
		queueIds: queueIds.length ? queueIds : [420],
		manualDone: envList(`${prefix}_AZ_MANUAL_DONE`),
		// The env list replaces the defaults when set.
		excludedMatchIds: process.env[`${prefix}_AZ_EXCLUDE_MATCHES`] !== undefined ? envList(`${prefix}_AZ_EXCLUDE_MATCHES`) : defaults.excludedMatchIds,
	};
}

export type AzChampion = {
	id: number;
	name: string;
	letter: string;
	iconUrl: string;
	splashUrl: string;
};

export type AzMatchDoc = {
	_id: string;
	slug: AzChallengeSlug;
	matchId: string;
	queueId: number;
	championId: number;
	win: boolean;
	remake: boolean;
	kills: number;
	deaths: number;
	assists: number;
	creepScore: number;
	durationSeconds: number;
	startedAt: string;
	endedAt: string;
	createdAt: string;
};

type AzStateDoc = {
	_id: AzChallengeSlug;
	puuid: string;
	startAt: string;
	backfilled: boolean;
	lastSyncAt: string;
};

export type AzAttempt = {
	matchId: string;
	win: boolean;
	kda: string;
	kills: number;
	deaths: number;
	assists: number;
	creepScore: number;
	durationSeconds: number;
	endedAt: string;
};

export type AzCompleted = {
	champion: AzChampion;
	tries: number;
	manual: boolean;
	winGame: AzAttempt | null;
	completedAt: string | null;
};

export type AzLetterProgress = {
	letter: string;
	total: number;
	done: number;
	current: boolean;
};

export type AzChallengeSnapshot = {
	slug: AzChallengeSlug;
	displayName: string;
	riotId: string;
	twitchLogin: string;
	online: boolean;
	leagueLive: boolean;
	/** True while a game in a counted queue is running on stream. */
	challengeGameLive: boolean;
	rankLabel: string | null;
	leaguePoints: number | null;
	lpDelta: number;
	startAt: string;
	dayNumber: number;
	totalChampions: number;
	completedCount: number;
	percent: number;
	finished: boolean;
	current: {
		champion: AzChampion;
		position: number;
		tryNumber: number;
		losses: number;
		attempts: AzAttempt[];
		mastery: { level: number; points: number } | null;
	} | null;
	/** Running Solo/Duo game, from the Spectator API. */
	live: {
		champion: AzChampion | null;
		/** True when he plays the current target champion. */
		onTarget: boolean;
		/** Try number this game counts as, for not-yet-done challenge champions. */
		tryNumber: number | null;
	} | null;
	insights: {
		pace: { perDay: number; etaDays: number | null; etaDate: string | null };
		/** How the current champion compares with the most tries any champion needed. */
		record: { champion: AzChampion; tries: number; state: "none" | "close" | "broken" } | null;
		playSeconds: number;
		currentPlaySeconds: number;
		deaths: number;
		currentDeaths: number;
		firstTryStreak: number;
		today: { label: "Stream" | "Heute"; games: number; wins: number; losses: number; completed: AzChampion[] };
	};
	upcoming: AzChampion[];
	lastCompleted: AzCompleted | null;
	recentCompleted: AzCompleted[];
	letters: AzLetterProgress[];
	stats: {
		games: number;
		wins: number;
		losses: number;
		winRate: number;
		averageTries: number;
		firstTryCount: number;
		offPicks: number;
		hardest: { champion: AzChampion; tries: number } | null;
	};
	syncing: boolean;
	updatedAt: string;
	message?: string;
};

const g = globalThis as unknown as {
	__azRoster?: { expiresAt: number; data: AzChampion[] };
	__azRosterRequest?: Promise<AzChampion[]>;
	__azSnapshots?: Map<string, { expiresAt: number; data: AzChallengeSnapshot }>;
	__azSnapshotRequests?: Map<string, Promise<AzChallengeSnapshot>>;
	__azSyncRequests?: Map<string, Promise<void>>;
	__azMastery?: Map<string, { expiresAt: number; data: { level: number; points: number } | null }>;
	__azIndexesReady?: boolean;
};

/* ------------------------------------------------------------------ roster */

type DataDragonChampion = { id: string; key: string; name: string };

async function dataDragonVersion(): Promise<string> {
	try {
		const response = await fetch(`${DATA_DRAGON_BASE}/api/versions.json`, { cache: "no-store" });
		if (!response.ok) return FALLBACK_DDRAGON_VERSION;
		const versions = (await response.json()) as unknown;
		return Array.isArray(versions) && typeof versions[0] === "string" ? versions[0] : FALLBACK_DDRAGON_VERSION;
	} catch {
		return FALLBACK_DDRAGON_VERSION;
	}
}

function letterOf(name: string): string {
	return name.normalize("NFD").replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase() || "#";
}

/** Every released champion, sorted like the League client (A-Z by display name). */
export async function getAzRoster(): Promise<AzChampion[]> {
	if (g.__azRoster && g.__azRoster.expiresAt > Date.now()) return g.__azRoster.data;
	if (g.__azRosterRequest) return g.__azRosterRequest;

	g.__azRosterRequest = (async () => {
		const version = await dataDragonVersion();
		const response = await fetch(`${DATA_DRAGON_BASE}/cdn/${version}/data/en_US/champion.json`, { cache: "no-store" });
		if (!response.ok) throw new Error(`Champion-Liste konnte nicht geladen werden (${response.status}).`);
		const json = (await response.json()) as { data: Record<string, DataDragonChampion> };
		const roster = Object.values(json.data)
			.map((champion) => ({
				id: Number(champion.key),
				name: champion.name,
				letter: letterOf(champion.name),
				iconUrl: championIconUrl(Number(champion.key)),
				splashUrl: `${DATA_DRAGON_BASE}/cdn/img/champion/centered/${champion.id}_0.jpg`,
			}))
			.filter((champion) => Number.isInteger(champion.id) && champion.id > 0)
			.sort((a, b) => a.name.localeCompare(b.name, "en"));
		g.__azRoster = { data: roster, expiresAt: Date.now() + ROSTER_CACHE_MS };
		return roster;
	})()
		.catch((error) => {
			// A stale roster is better than a broken overlay.
			if (g.__azRoster) return g.__azRoster.data;
			throw error;
		})
		.finally(() => {
			g.__azRosterRequest = undefined;
		});
	return g.__azRosterRequest;
}

/* -------------------------------------------------------------- match sync */

async function collections() {
	const db = await getDb();
	const matches = db.collection<AzMatchDoc>(MATCH_COLLECTION);
	const state = db.collection<AzStateDoc>(STATE_COLLECTION);
	if (!g.__azIndexesReady) {
		await matches.createIndex({ slug: 1, endedAt: 1 }).catch(() => undefined);
		g.__azIndexesReady = true;
	}
	return { matches, state };
}

function matchNumber(matchId: string): number {
	return Number(matchId.split("_").pop() ?? 0) || 0;
}

async function listChallengeMatchIds(puuid: string, routing: RiotRoute, config: AzChallengeConfig, startTime: number): Promise<string[]> {
	const queue = config.queueIds.length === 1 ? config.queueIds[0] : undefined;
	const ids: string[] = [];
	for (let page = 0; page < MAX_MATCH_ID_PAGES; page += 1) {
		const batch = await getMatchIdsByPuuidForRoute(puuid, routing, {
			start: page * MATCH_ID_PAGE_SIZE,
			count: MATCH_ID_PAGE_SIZE,
			startTime,
			...(queue ? { queue } : {}),
		});
		ids.push(...batch);
		if (batch.length < MATCH_ID_PAGE_SIZE) break;
	}
	return ids;
}

function toMatchDoc(slug: AzChallengeSlug, puuid: string, match: Awaited<ReturnType<typeof getMatchByIdForRoute>>): AzMatchDoc | null {
	const participant = match.info.participants.find((entry) => entry.puuid === puuid);
	if (!participant) return null;
	const startedAt = match.info.gameStartTimestamp ?? match.info.gameCreation;
	const endedAt = match.info.gameEndTimestamp ?? startedAt + match.info.gameDuration * 1000;
	return {
		_id: `${slug}:${match.metadata.matchId}`,
		slug,
		matchId: match.metadata.matchId,
		queueId: match.info.queueId,
		championId: participant.championId,
		win: participant.win,
		remake: isRiotMatchRemake(match),
		kills: participant.kills,
		deaths: participant.deaths,
		assists: participant.assists,
		creepScore: participant.totalMinionsKilled + participant.neutralMinionsKilled,
		durationSeconds: match.info.gameDuration,
		startedAt: new Date(startedAt).toISOString(),
		endedAt: new Date(endedAt).toISOString(),
		createdAt: new Date().toISOString(),
	};
}

/**
 * Pulls new match ids, then loads unknown match details oldest first. Each run
 * loads at most MAX_DETAILS_PER_SYNC details so a cold start never bursts the
 * Riot key. Later polls continue the backfill.
 */
async function syncChallengeMatches(config: AzChallengeConfig, puuid: string, routing: RiotRoute): Promise<void> {
	const { matches, state } = await collections();
	const stored = await state.findOne({ _id: config.slug });
	const sameScope = stored?.puuid === puuid && stored.startAt === config.startAt;
	if (sameScope && stored.backfilled && Date.now() - new Date(stored.lastSyncAt).getTime() < SYNC_INTERVAL_MS) return;

	const challengeStartSeconds = Math.floor(new Date(config.startAt).getTime() / 1000);
	let startTime = challengeStartSeconds;
	if (sameScope && stored.backfilled) {
		const newest = await matches.find({ slug: config.slug }).sort({ endedAt: -1 }).limit(1).next();
		if (newest) startTime = Math.max(challengeStartSeconds, Math.floor(new Date(newest.startedAt).getTime() / 1000) - INCREMENTAL_OVERLAP_SECONDS);
	}

	const ids = await listChallengeMatchIds(puuid, routing, config, startTime);
	const known = new Set(
		(await matches.find({ slug: config.slug, matchId: { $in: ids } }, { projection: { matchId: 1 } }).toArray()).map((doc) => doc.matchId)
	);
	const missing = ids.filter((id) => !known.has(id)).sort((a, b) => matchNumber(a) - matchNumber(b));
	const batch = missing.slice(0, MAX_DETAILS_PER_SYNC);

	let failed = 0;
	for (const matchId of batch) {
		try {
			const doc = toMatchDoc(config.slug, puuid, await getMatchByIdForRoute(matchId, routing));
			if (doc) await matches.updateOne({ _id: doc._id }, { $set: doc }, { upsert: true });
		} catch (error) {
			failed += 1;
			console.warn(`[az-challenge:${config.slug}] Match ${matchId} konnte nicht geladen werden:`, error);
			// Stop on rate limits; the next poll continues the backfill.
			if (error instanceof RiotApiError && error.status === 429) break;
		}
	}

	const backfilled = failed === 0 && missing.length <= MAX_DETAILS_PER_SYNC;
	await state.updateOne(
		{ _id: config.slug },
		{ $set: { puuid, startAt: config.startAt, backfilled, lastSyncAt: new Date().toISOString() } },
		{ upsert: true }
	);
}

async function syncOnce(config: AzChallengeConfig, puuid: string, routing: RiotRoute) {
	g.__azSyncRequests ??= new Map();
	const pending = g.__azSyncRequests.get(config.slug);
	if (pending) return pending;
	const request = syncChallengeMatches(config, puuid, routing).finally(() => g.__azSyncRequests?.delete(config.slug));
	g.__azSyncRequests.set(config.slug, request);
	return request;
}

async function cachedMastery(puuid: string, championId: number, routing: RiotRoute) {
	g.__azMastery ??= new Map();
	const key = `${routing.credential}:${puuid}:${championId}`;
	const cached = g.__azMastery.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.data;
	try {
		const mastery = await getChampionMasteryByPuuidForRoute(puuid, championId, routing);
		const data = mastery ? { level: mastery.championLevel, points: mastery.championPoints } : null;
		g.__azMastery.set(key, { data, expiresAt: Date.now() + MASTERY_CACHE_MS });
		return data;
	} catch {
		return cached?.data ?? null;
	}
}

/* ---------------------------------------------------------------- progress */

function toAttempt(doc: AzMatchDoc): AzAttempt {
	return {
		matchId: doc.matchId,
		win: doc.win,
		kda: `${doc.kills}/${doc.deaths}/${doc.assists}`,
		kills: doc.kills,
		deaths: doc.deaths,
		assists: doc.assists,
		creepScore: doc.creepScore,
		durationSeconds: doc.durationSeconds,
		endedAt: doc.endedAt,
	};
}

/** Same remake rule as the tracking sheet: early surrender or under 5 minutes. */
function isAzRemake(doc: AzMatchDoc) {
	return doc.remake || doc.durationSeconds < 300;
}

function normalizeName(value: string) {
	return value
		.normalize("NFD")
		.replace(/[^A-Za-z0-9]/g, "")
		.toLowerCase();
}

export function computeAzProgress(
	roster: AzChampion[],
	docs: AzMatchDoc[],
	config: Pick<AzChallengeConfig, "queueIds" | "manualDone" | "startAt"> & Partial<Pick<AzChallengeConfig, "excludedMatchIds">>
) {
	const excluded = new Set(config.excludedMatchIds ?? []);
	const manual = new Set(config.manualDone.map(normalizeName));
	const isManual = (champion: AzChampion) => manual.has(normalizeName(champion.name)) || manual.has(String(champion.id));
	const startMs = new Date(config.startAt).getTime();
	const games = docs
		.filter((doc) => !isAzRemake(doc) && !excluded.has(doc.matchId) && config.queueIds.includes(doc.queueId) && new Date(doc.endedAt).getTime() >= startMs)
		.sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());

	// Same rule as Fabi's tracking sheet: per champion, games count in date order
	// until its first win (the win is a try too). A win completes the champion
	// whenever it happens, even out of alphabetical order (e.g. filled into
	// another role). Games after the first win are ignored.
	const rosterById = new Map(roster.map((champion) => [champion.id, champion]));
	const manualChampions = roster.filter(isManual);
	const doneIds = new Set(manualChampions.map((champion) => champion.id));
	const completed: AzCompleted[] = manualChampions.map((champion) => ({ champion, tries: 0, manual: true, winGame: null, completedAt: null }));
	const pending = new Map<number, AzMatchDoc[]>();
	let offPicks = 0;
	let challengeGames = 0;
	let challengeWins = 0;
	for (const game of games) {
		if (doneIds.has(game.championId)) {
			offPicks += 1;
			continue;
		}
		const tries = pending.get(game.championId) ?? [];
		tries.push(game);
		pending.set(game.championId, tries);
		challengeGames += 1;
		if (!game.win) continue;
		challengeWins += 1;
		const champion = rosterById.get(game.championId);
		if (!champion) continue;
		completed.push({ champion, tries: tries.length, manual: false, winGame: toAttempt(game), completedAt: game.endedAt });
		doneIds.add(champion.id);
		pending.delete(champion.id);
	}

	// The target is the first champion in A-Z order without a win yet.
	const firstOpen = roster.findIndex((champion) => !doneIds.has(champion.id));
	const index = firstOpen === -1 ? roster.length : firstOpen;
	const doneCount = roster.filter((champion) => doneIds.has(champion.id)).length;
	const attempts = roster[index] ? (pending.get(roster[index].id) ?? []) : [];

	const tracked = completed.filter((entry) => !entry.manual);
	const hardest = tracked.reduce<AzCompleted | null>((worst, entry) => (!worst || entry.tries > worst.tries ? entry : worst), null);
	const currentLetter = roster[index]?.letter ?? null;
	const letters = new Map<string, AzLetterProgress>();
	for (let i = 0; i < 26; i += 1) {
		const letter = String.fromCharCode(65 + i);
		letters.set(letter, { letter, total: 0, done: 0, current: letter === currentLetter });
	}
	for (const champion of roster) {
		const entry = letters.get(champion.letter);
		if (!entry) continue;
		entry.total += 1;
		if (doneIds.has(champion.id)) entry.done += 1;
	}

	let firstTryStreak = 0;
	for (let i = tracked.length - 1; i >= 0 && tracked[i].tries === 1; i -= 1) firstTryStreak += 1;

	return {
		/** Roster position of the current target (first champion without a win). */
		index,
		doneCount,
		doneIds,
		/** Manual entries first, then tracked completions in the order they happened. */
		completed,
		attempts,
		offPicks,
		/** Counted games (queue + start date, no remakes), oldest first. */
		games,
		/** Tries already played on champions that are not done yet, by champion id. */
		pendingTries: Object.fromEntries([...pending].map(([championId, tries]) => [championId, tries.length])) as Record<number, number>,
		letters: [...letters.values()],
		playSeconds: games.reduce((sum, game) => sum + game.durationSeconds, 0),
		deaths: games.reduce((sum, game) => sum + game.deaths, 0),
		firstTryStreak,
		stats: {
			games: challengeGames,
			wins: challengeWins,
			losses: challengeGames - challengeWins,
			winRate: challengeGames ? Math.round((challengeWins / challengeGames) * 100) : 0,
			averageTries: tracked.length ? Math.round((tracked.reduce((sum, entry) => sum + entry.tries, 0) / tracked.length) * 10) / 10 : 0,
			firstTryCount: tracked.filter((entry) => entry.tries === 1).length,
			offPicks,
			hardest: hardest ? { champion: hardest.champion, tries: hardest.tries } : null,
		},
	};
}

/* ---------------------------------------------------------------- snapshot */

export type AzSnapshotOptions = {
	preview?: boolean;
	/** Test helper (preview only): simulate a live game. "" = current target, otherwise a champion name. */
	demoLive?: string;
};

/** Start of the current calendar day in Europe/Berlin, as epoch ms. */
function berlinDayStart(now = new Date()): number {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Berlin",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);
	const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
	return now.getTime() - ((part("hour") * 60 + part("minute")) * 60 + part("second")) * 1000 - now.getMilliseconds();
}

function findChampion(roster: AzChampion[], value: string): AzChampion | null {
	const wanted = normalizeName(value);
	return roster.find((champion) => normalizeName(champion.name) === wanted || String(champion.id) === value) ?? null;
}

async function buildAzSnapshot(slug: AzChallengeSlug, options: AzSnapshotOptions): Promise<AzChallengeSnapshot> {
	const config = challengeConfig(slug);
	const [roster, account, stream] = await Promise.all([
		getAzRoster(),
		getStreamerPrimaryAccount(slug),
		getStreamerObsSnapshot(slug, { preview: options.preview }).catch((error) => {
			console.warn(`[az-challenge:${slug}] Stream-Status nicht verfügbar:`, error);
			return null;
		}),
	]);

	let message: string | undefined;
	try {
		await syncOnce(config, account.puuid, account.routing);
	} catch (error) {
		// Keep showing stored progress when Riot or MongoDB hiccups.
		console.warn(`[az-challenge:${slug}] Sync fehlgeschlagen:`, error);
		message = "Riot-Daten kurzzeitig nicht erreichbar. Letzter Stand bleibt sichtbar.";
	}

	const { matches, state } = await collections();
	const [docs, syncState] = await Promise.all([matches.find({ slug }).toArray(), state.findOne({ _id: slug })]);
	const progress = computeAzProgress(roster, docs, config);
	const currentChampion = roster[progress.index] ?? null;
	const mastery = currentChampion ? await cachedMastery(account.puuid, currentChampion.id, account.routing) : null;
	const tracked = progress.completed.filter((entry) => !entry.manual);
	const lastCompleted = tracked.at(-1) ?? null;
	const startMs = new Date(config.startAt).getTime();
	const liveQueueId = stream?.liveQueueId ?? null;
	const challengeGameLive = Boolean(stream?.leagueLive && liveQueueId !== null && config.queueIds.includes(liveQueueId));
	const now = Date.now();

	// Live game: which champion and which try it counts as.
	const demoChampion = options.preview && options.demoLive !== undefined ? (options.demoLive ? findChampion(roster, options.demoLive) : currentChampion) : null;
	const liveChampionId = demoChampion?.id ?? (challengeGameLive ? (stream?.liveChampionId ?? null) : null);
	const liveChampion = liveChampionId !== null ? (roster.find((champion) => champion.id === liveChampionId) ?? null) : null;
	const liveIsOpen = liveChampion ? !progress.doneIds.has(liveChampion.id) : false;
	const live =
		demoChampion || challengeGameLive
			? {
					champion: liveChampion,
					onTarget: Boolean(liveChampion && currentChampion && liveChampion.id === currentChampion.id),
					tryNumber: liveChampion && liveIsOpen ? (progress.pendingTries[liveChampion.id] ?? 0) + 1 : null,
				}
			: null;

	// Pace: finished champions per day since the start, projected to Z.
	const elapsedDays = Math.max(1, (now - startMs) / 86_400_000);
	const perDay = tracked.length / elapsedDays;
	const remaining = Math.max(0, roster.length - progress.doneCount);
	const etaDays = perDay > 0 ? Math.ceil(remaining / perDay) : null;

	// Record watch: compare current tries with the most tries any champion needed.
	const hardest = progress.stats.hardest;
	const currentTries = progress.attempts.length;
	const record = hardest
		? { champion: hardest.champion, tries: hardest.tries, state: currentTries >= hardest.tries ? ("broken" as const) : currentTries === hardest.tries - 1 ? ("close" as const) : ("none" as const) }
		: null;

	// Today: this stream when live, otherwise the Berlin calendar day.
	const todayLabel: "Stream" | "Heute" = stream?.online && stream.streamStartedAt ? "Stream" : "Heute";
	const todaySince = todayLabel === "Stream" && stream?.streamStartedAt ? new Date(stream.streamStartedAt).getTime() : berlinDayStart();
	const todayGames = progress.games.filter((game) => new Date(game.endedAt).getTime() >= todaySince);
	const todayWins = todayGames.filter((game) => game.win).length;

	return {
		slug,
		displayName: account.displayName,
		riotId: account.riotId,
		twitchLogin: account.twitchLogin,
		online: stream?.online ?? false,
		leagueLive: stream?.leagueLive ?? false,
		challengeGameLive: challengeGameLive || Boolean(demoChampion),
		rankLabel: stream?.rank ? compactRankLabel(stream.rank) : null,
		leaguePoints: stream?.rank?.leaguePoints ?? null,
		lpDelta: stream?.lpDelta ?? 0,
		startAt: config.startAt,
		dayNumber: Math.max(1, Math.floor((Date.now() - startMs) / 86_400_000) + 1),
		totalChampions: roster.length,
		completedCount: progress.doneCount,
		percent: roster.length ? Math.round((progress.doneCount / roster.length) * 1000) / 10 : 0,
		finished: roster.length > 0 && progress.doneCount >= roster.length,
		current: currentChampion
			? {
					champion: currentChampion,
					position: progress.index + 1,
					tryNumber: progress.attempts.length + 1,
					losses: progress.attempts.filter((attempt) => !attempt.win).length,
					attempts: progress.attempts.slice(-ATTEMPT_HISTORY_COUNT).map(toAttempt),
					mastery,
				}
			: null,
		live,
		insights: {
			pace: {
				perDay: Math.round(perDay * 100) / 100,
				etaDays,
				etaDate: etaDays !== null ? new Date(now + etaDays * 86_400_000).toISOString() : null,
			},
			record,
			playSeconds: progress.playSeconds,
			currentPlaySeconds: progress.attempts.reduce((sum, game) => sum + game.durationSeconds, 0),
			deaths: progress.deaths,
			currentDeaths: progress.attempts.reduce((sum, game) => sum + game.deaths, 0),
			firstTryStreak: progress.firstTryStreak,
			today: {
				label: todayLabel,
				games: todayGames.length,
				wins: todayWins,
				losses: todayGames.length - todayWins,
				completed: tracked.filter((entry) => entry.completedAt && new Date(entry.completedAt).getTime() >= todaySince).map((entry) => entry.champion),
			},
		},
		// Skip champions already won out of order.
		upcoming: roster
			.slice(progress.index + 1)
			.filter((champion) => !progress.doneIds.has(champion.id))
			.slice(0, UPCOMING_COUNT),
		lastCompleted,
		recentCompleted: tracked.slice(-RECENT_COMPLETED_COUNT).reverse(),
		letters: progress.letters,
		stats: progress.stats,
		syncing: !syncState?.backfilled,
		updatedAt: new Date().toISOString(),
		message: message ?? (options.preview ? "Testmodus: Overlay ist immer sichtbar." : undefined),
	};
}

export async function getAzChallengeSnapshot(slug: AzChallengeSlug, options: AzSnapshotOptions = {}): Promise<AzChallengeSnapshot> {
	g.__azSnapshots ??= new Map();
	g.__azSnapshotRequests ??= new Map();
	const demoKey = options.preview && options.demoLive !== undefined ? `:live=${options.demoLive}` : "";
	const cacheKey = `${slug}:${options.preview ? "preview" : "live"}${demoKey}`;
	const cached = g.__azSnapshots.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.data;
	const pending = g.__azSnapshotRequests.get(cacheKey);
	if (pending) return pending;

	const request = buildAzSnapshot(slug, options)
		.then((data) => {
			// While the backfill runs, refresh faster so progress fills in quickly.
			g.__azSnapshots?.set(cacheKey, { data, expiresAt: Date.now() + (data.syncing ? 5_000 : SNAPSHOT_CACHE_MS) });
			return data;
		})
		.catch((error) => {
			if (cached) return { ...cached.data, message: "Externer Dienst kurzzeitig nicht erreichbar. Letzter Stand bleibt sichtbar." };
			throw error;
		})
		.finally(() => g.__azSnapshotRequests?.delete(cacheKey));
	g.__azSnapshotRequests.set(cacheKey, request);
	return request;
}
