import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/mongo";
import {
	championIconUrl,
	getAccountByPuuidForRoute,
	getAccountByRiotIdForRoute,
	getActiveGameByPuuidForRoute,
	getChallengerLeagueForRoute,
	getGrandmasterLeagueForRoute,
	getLeagueEntriesByPuuidForRoute,
	getMatchByIdForRoute,
	getMatchIdsByPuuidForRoute,
	getSummonerByPuuidForRoute,
	isRiotMatchRemake,
	itemIconUrl,
	participantInventoryItemIds,
	obsRiotRoute,
	parseRiotId,
	profileIconUrl,
	RiotApiError,
	type RiotAccount,
	type RiotLeagueEntry,
	type RiotApexLeague,
	type RiotActiveGame,
	type RiotMatchParticipant,
	type ObsOverlayName,
	type RiotApiCredential,
	type RiotRoute,
} from "@/lib/riot";
import { listCommunityOverlayStreamersByPuuid, type CommunityOverlayStreamer } from "@/lib/tournament-storage";
import { getStream } from "@/lib/twitch";

const SESSION_COLLECTION = "community_obs_sessions";
const ACCOUNT_COLLECTION = "community_obs_accounts";
const SNAPSHOT_CACHE_MS = 60_000;
const ACCOUNT_CACHE_MS = 24 * 60 * 60_000;
const LIVE_RANK_CACHE_MS = 55_000;
const OFFLINE_RANK_CACHE_MS = 5 * 60_000;
const LIVE_HISTORY_CACHE_MS = 2 * 60_000;
const OFFLINE_HISTORY_CACHE_MS = 5 * 60_000;
const NEW_SNAPSHOT_WINDOW_MS = 120_000;
const NEW_SNAPSHOT_LIMIT = 3;
const KNOWN_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
const DIVISION_ORDER = ["IV", "III", "II", "I"] as const;

const OBS_OVERLAY_BY_STREAMER = {
	lauchgruen: "lauchgruen",
	akuma: "akuma",
	happygiganto: "happygiganto",
	hippokrate: "hippokrate",
	n4cht4r4: "n4cht4r4",
	nachtdienst: "nachtdienst",
} as const satisfies Record<string, ObsOverlayName>;

function obsOverlayForStreamer(streamer: string): ObsOverlayName {
	return OBS_OVERLAY_BY_STREAMER[streamer as keyof typeof OBS_OVERLAY_BY_STREAMER] ?? "public";
}

export type CommunityObsRank = {
	queueId: 420 | 440;
	queueLabel: string;
	tier: string;
	division: string;
	leaguePoints: number;
	wins: number;
	losses: number;
	winRate: number;
	label: string;
	score: number;
	progressPercent: number;
	nextLabel: string;
} | null;

export type CommunityObsGame = {
	matchId: string;
	championName: string;
	championIconUrl: string;
	win: boolean;
	kda: string;
	durationSeconds: number;
	creepScore: number;
	goldEarned: number;
	lpChange: null;
	badge: "MVP" | "ACE" | null;
	items: Array<{ id: number; iconUrl: string }>;
	endedAt: string;
};

export type CommunityObsLiveGame = {
	gameLength: number;
	observedAt: string;
	queueId: number;
	queueLabel: string;
	gameMode: string;
	participants: Array<{
		name: string;
		championIconUrl: string;
		teamId: number;
		role: LiveGameRole;
		isTrackedPlayer: boolean;
		streamer: CommunityOverlayStreamer | null;
	}>;
} | null;

export type LiveGameRole = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";

export type CommunityObsApexGoals = {
	grandmasterScore: number | null;
	challengerScore: number | null;
	rankOneScore: number | null;
} | null;

export type CommunityObsSnapshot = {
	streamer: string;
	riotId: string;
	accountId: string;
	region: string;
	online: boolean;
	leagueLive: boolean;
	streamStartedAt: string | null;
	streamDurationSeconds: number;
	rank: CommunityObsRank;
	baselineRank: CommunityObsRank;
	lpDelta: number;
	lpDeltaAvailable: boolean;
	sessionWins: number;
	sessionLosses: number;
	games: CommunityObsGame[];
	profileIconUrl: string | null;
	liveGame: CommunityObsLiveGame;
	apexGoals: CommunityObsApexGoals;
	updatedAt: string;
	message?: string;
};

type CommunitySession = {
	_id: string;
	streamer: string;
	streamId: string;
	startedAt: string;
	baselineRank: CommunityObsRank;
	createdAt: string;
};

type CommunityObsAccount = {
	_id: string;
	legacyIds?: string[];
	region: string;
	riotId: string;
	riotIdLower: string;
	gameName: string;
	tagLine: string;
	puuid: string;
	credential?: RiotApiCredential;
	/** Legacy field from the former rotating-key system. */
	overlayKeyId?: string;
	updatedAt: string;
};

type ChampionRoleTag = "assassin" | "fighter" | "mage" | "marksman" | "support" | "tank";

type CommunityDragonChampion = {
	id: number;
	roles?: string[];
};

const globalCache = globalThis as unknown as {
	__communityObsCache?: Map<string, { expiresAt: number; data: CommunityObsSnapshot }>;
	__communityObsRequests?: Map<string, Promise<CommunityObsSnapshot>>;
	__communityObsKnownKeys?: Map<string, number>;
	__communityObsNewSnapshots?: number[];
	__communityObsApexCache?: Map<string, { expiresAt: number; goals: NonNullable<CommunityObsApexGoals> }>;
	__communityObsApexRequests?: Map<string, Promise<CommunityObsApexGoals>>;
	__communityObsAccountCache?: Map<string, { expiresAt: number; account: Awaited<ReturnType<typeof getAccountByRiotIdForRoute>> }>;
	__communityObsAccountRequests?: Map<string, Promise<Awaited<ReturnType<typeof getAccountByRiotIdForRoute>>>>;
	__communityObsAccountIndex?: Promise<string>;
	__communityObsRankCache?: Map<string, { fetchedAt: number; entries: RiotLeagueEntry[] }>;
	__communityObsRankRequests?: Map<string, Promise<RiotLeagueEntry[]>>;
	__communityObsSummonerCache?: Map<string, { fetchedAt: number; profileIconUrl: string }>;
	__communityObsSummonerRequests?: Map<string, Promise<string>>;
	__communityObsMatchIdCache?: Map<string, { fetchedAt: number; ids: string[] }>;
	__communityObsMatchIdRequests?: Map<string, Promise<string[]>>;
	__communityObsDiagnostics?: CommunityObsDiagnosticsState;
};

type CommunityObsDiagnosticsState = {
	hits: number;
	misses: number;
	deduplicated: number;
	staleFallbacks: number;
	errors: number;
	lastSuccessAt: string | null;
	lastErrorAt: string | null;
	lastError: string | null;
};

function diagnosticsState() {
	globalCache.__communityObsDiagnostics ??= {
		hits: 0,
		misses: 0,
		deduplicated: 0,
		staleFallbacks: 0,
		errors: 0,
		lastSuccessAt: null,
		lastErrorAt: null,
		lastError: null,
	};
	return globalCache.__communityObsDiagnostics;
}

export function getCommunityObsDiagnostics() {
	const diagnostics = diagnosticsState();
	return {
		...diagnostics,
		snapshotCacheEntries: globalCache.__communityObsCache?.size ?? 0,
		inFlightSnapshots: globalCache.__communityObsRequests?.size ?? 0,
		accountCacheEntries: globalCache.__communityObsAccountCache?.size ?? 0,
		rankCacheEntries: globalCache.__communityObsRankCache?.size ?? 0,
		matchIdCacheEntries: globalCache.__communityObsMatchIdCache?.size ?? 0,
	};
}

const APEX_CACHE_MS = 5 * 60 * 1000;
const MASTER_SCORE = TIER_ORDER.indexOf("MASTER") * 400;
const LIVE_ROLE_ORDER: LiveGameRole[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const COMMUNITY_DRAGON_CHAMPIONS = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json";

let championRoleTagsPromise: Promise<Map<number, ChampionRoleTag[]>> | null = null;

function trimMap<K, V>(map: Map<K, V>, maxSize: number) {
	while (map.size > maxSize) {
		const oldest = map.keys().next().value;
		if (oldest === undefined) return;
		map.delete(oldest);
	}
}

async function cachedAccount(gameName: string, tagLine: string, routing: RiotRoute) {
	globalCache.__communityObsAccountCache ??= new Map();
	globalCache.__communityObsAccountRequests ??= new Map();
	const key = `${routing.credential}:${routing.region}:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`;
	const cached = globalCache.__communityObsAccountCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.account;
	const pending = globalCache.__communityObsAccountRequests.get(key);
	if (pending) return pending;
	const request = getAccountByRiotIdForRoute(gameName, tagLine, routing)
		.then((account) => {
			globalCache.__communityObsAccountCache!.set(key, { account, expiresAt: Date.now() + ACCOUNT_CACHE_MS });
			trimMap(globalCache.__communityObsAccountCache!, 1_000);
			return account;
		})
		.finally(() => globalCache.__communityObsAccountRequests?.delete(key));
	globalCache.__communityObsAccountRequests.set(key, request);
	return request;
}

async function cachedAccountByPuuid(puuid: string, routing: RiotRoute) {
	globalCache.__communityObsAccountCache ??= new Map();
	globalCache.__communityObsAccountRequests ??= new Map();
	const key = `${routing.credential}:${routing.region}:puuid:${puuid}`;
	const cached = globalCache.__communityObsAccountCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.account;
	const pending = globalCache.__communityObsAccountRequests.get(key);
	if (pending) return pending;
	const request = getAccountByPuuidForRoute(puuid, routing)
		.then((account) => {
			globalCache.__communityObsAccountCache!.set(key, { account, expiresAt: Date.now() + ACCOUNT_CACHE_MS });
			trimMap(globalCache.__communityObsAccountCache!, 1_000);
			return account;
		})
		.finally(() => globalCache.__communityObsAccountRequests?.delete(key));
	globalCache.__communityObsAccountRequests.set(key, request);
	return request;
}

async function persistCommunityAccount(id: string, region: string, account: RiotAccount, routing: RiotRoute, legacyId?: string) {
	const riotId = `${account.gameName}#${account.tagLine}`;
	await (await getDb()).collection<CommunityObsAccount>(ACCOUNT_COLLECTION).updateOne(
		{ _id: id },
		{
			$set: {
				region,
				riotId,
				riotIdLower: riotId.toLocaleLowerCase("en-US"),
				gameName: account.gameName,
				tagLine: account.tagLine,
				puuid: account.puuid,
				credential: routing.credential,
				updatedAt: new Date().toISOString(),
			},
			$unset: { overlayKeyId: "" },
			...(legacyId ? { $addToSet: { legacyIds: legacyId } } : {}),
		},
		{ upsert: true }
	);
}

async function ensureCommunityAccountIndex() {
	globalCache.__communityObsAccountIndex ??= (async () => {
		const collection = (await getDb()).collection<CommunityObsAccount>(ACCOUNT_COLLECTION);
		const indexes = await collection.indexes();

		if (indexes.some((index) => index.name === "unique_region_puuid")) {
			await collection.dropIndex("unique_region_puuid");
		}

		return collection.createIndex({ credential: 1, region: 1, puuid: 1 }, { unique: true, name: "unique_credential_region_puuid" });
	})().catch((error) => {
		globalCache.__communityObsAccountIndex = undefined;
		throw error;
	});

	await globalCache.__communityObsAccountIndex;
}

function isDuplicateKeyError(error: unknown) {
	return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

async function findOrCreateCommunityAccount(region: string, account: RiotAccount, routing: RiotRoute, legacyId?: string) {
	await ensureCommunityAccountIndex();
	const collection = (await getDb()).collection<CommunityObsAccount>(ACCOUNT_COLLECTION);
	const riotIdLower = `${account.gameName}#${account.tagLine}`.toLocaleLowerCase("en-US");
	const existing = await collection.findOne({
		credential: routing.credential,
		region,
		$or: [{ puuid: account.puuid }, { riotIdLower }],
	});

	if (existing) {
		await persistCommunityAccount(existing._id, region, account, routing, legacyId);
		return existing._id;
	}

	const accountId = randomBytes(18).toString("base64url");
	try {
		await persistCommunityAccount(accountId, region, account, routing, legacyId);
		return accountId;
	} catch (error) {
		if (!isDuplicateKeyError(error)) throw error;
		const concurrent = await collection.findOne({
			credential: routing.credential,
			region,
			puuid: account.puuid,
		});
		if (!concurrent) throw error;
		await persistCommunityAccount(concurrent._id, region, account, routing, legacyId);
		return concurrent._id;
	}
}

async function resolveCommunityAccount(input: {
	accountId: string;
	ingame: string;
	region: string;
	routing: RiotRoute;
}): Promise<{ accountId: string; account: RiotAccount; routing: RiotRoute }> {
	const collection = (await getDb()).collection<CommunityObsAccount>(ACCOUNT_COLLECTION);

	if (input.accountId) {
		const storedForCredential = await collection.findOne({
			credential: input.routing.credential,
			$or: [{ _id: input.accountId }, { legacyIds: input.accountId }],
		});
		const stored =
			storedForCredential ??
			(await collection.findOne({ _id: input.accountId })) ??
			(input.accountId.length > 64 ? await collection.findOne({ legacyIds: input.accountId }) : null);

		if (stored) {
			if (stored.credential === input.routing.credential) {
				let account: RiotAccount;

				try {
					account = await cachedAccountByPuuid(stored.puuid, input.routing);
				} catch (error) {
					if (!(error instanceof RiotApiError) || (error.status !== 400 && error.status !== 404)) throw error;
					account = await cachedAccount(stored.gameName, stored.tagLine, input.routing);
				}

				await persistCommunityAccount(stored._id, input.region, account, input.routing);
				return { accountId: stored._id, account, routing: input.routing };
			}

			// The stored PUUID belongs to a different Riot API credential, or to
			// the legacy rotating-key system. Resolve the Riot ID with the fixed
			// credential assigned to this overlay and store a credential-scoped record.
			const account = await cachedAccount(stored.gameName, stored.tagLine, input.routing);
			const resolvedId = await findOrCreateCommunityAccount(input.region, account, input.routing, input.accountId);
			return { accountId: resolvedId, account, routing: input.routing };
		}

		// Migrate the briefly shipped raw-PUUID URLs through the verified account
		// record. Tournament and OBS API apps can encrypt PUUIDs differently.
		if (input.accountId.length > 64) {
			const verified = await (await getDb()).collection<{ puuid: string; riotId: string }>("verified_riot_accounts").findOne({ puuid: input.accountId });

			if (verified?.riotId) {
				const legacyRiotId = parseRiotId(verified.riotId);
				const account = await cachedAccount(legacyRiotId.gameName, legacyRiotId.tagLine, input.routing);
				const resolvedId = await findOrCreateCommunityAccount(input.region, account, input.routing, input.accountId);
				return { accountId: resolvedId, account, routing: input.routing };
			}
		}

		throw new Error("Der gespeicherte Overlay-Account wurde nicht gefunden. Bitte die Riot-ID im Builder erneut auswählen.");
	}

	const riotId = parseRiotId(input.ingame);
	const riotIdLower = `${riotId.gameName}#${riotId.tagLine}`.toLocaleLowerCase("en-US");
	const existing = await collection.findOne({
		credential: input.routing.credential,
		region: input.region,
		riotIdLower,
	});
	const account = await cachedAccount(riotId.gameName, riotId.tagLine, input.routing);
	const resolvedId = existing?._id ?? (await findOrCreateCommunityAccount(input.region, account, input.routing));
	if (existing) {
		await persistCommunityAccount(existing._id, input.region, account, input.routing);
	}

	return { accountId: resolvedId, account, routing: input.routing };
}

async function cachedRankEntries(puuid: string, routing: RiotRoute, maxAgeMs: number) {
	globalCache.__communityObsRankCache ??= new Map();
	globalCache.__communityObsRankRequests ??= new Map();
	const key = `${routing.credential}:${routing.platform}:${puuid}`;
	const cached = globalCache.__communityObsRankCache.get(key);
	if (cached && Date.now() - cached.fetchedAt < maxAgeMs) return cached.entries;
	const pending = globalCache.__communityObsRankRequests.get(key);
	if (pending) return pending;
	const request = getLeagueEntriesByPuuidForRoute(puuid, routing)
		.then((entries) => {
			globalCache.__communityObsRankCache!.set(key, { entries, fetchedAt: Date.now() });
			trimMap(globalCache.__communityObsRankCache!, 1_000);
			return entries;
		})
		.finally(() => globalCache.__communityObsRankRequests?.delete(key));
	globalCache.__communityObsRankRequests.set(key, request);
	return request;
}

async function cachedProfileIconUrl(puuid: string, routing: RiotRoute) {
	globalCache.__communityObsSummonerCache ??= new Map();
	globalCache.__communityObsSummonerRequests ??= new Map();
	const key = `${routing.credential}:${routing.platform}:${puuid}`;
	const cached = globalCache.__communityObsSummonerCache.get(key);
	if (cached && Date.now() - cached.fetchedAt < 5 * 60_000) return cached.profileIconUrl;
	const pending = globalCache.__communityObsSummonerRequests.get(key);
	if (pending) return pending;
	const request = getSummonerByPuuidForRoute(puuid, routing)
		.then((summoner) => {
			const url = profileIconUrl(summoner.profileIconId);
			globalCache.__communityObsSummonerCache!.set(key, { profileIconUrl: url, fetchedAt: Date.now() });
			trimMap(globalCache.__communityObsSummonerCache!, 1_000);
			return url;
		})
		.finally(() => globalCache.__communityObsSummonerRequests?.delete(key));
	globalCache.__communityObsSummonerRequests.set(key, request);
	return request;
}

function rankedQueueId(queueId?: number): 420 | 440 | null {
	return queueId === 420 || queueId === 440 ? queueId : null;
}

function rankedQueueLabel(queueId: 420 | 440) {
	return queueId === 440 ? "Ranked Flex" : "Ranked Solo/Duo";
}

function queueLabel(queueId: number, gameMode: string) {
	const labels: Record<number, string> = {
		0: "Custom Game",
		400: "Normal Draft",
		420: "Ranked Solo/Duo",
		430: "Normal Blind Pick",
		440: "Ranked Flex",
		450: "ARAM",
		490: "Quickplay",
		700: "Clash",
		830: "Co-op vs. AI",
		840: "Co-op vs. AI",
		850: "Co-op vs. AI",
		900: "URF",
		1020: "One for All",
		1300: "Nexus Blitz",
		1700: "Arena",
		1710: "Arena",
	};
	return (
		labels[queueId] ??
		gameMode
			.replaceAll("_", " ")
			.toLowerCase()
			.replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase())
	);
}

async function championRoleTags() {
	championRoleTagsPromise ??= fetch(COMMUNITY_DRAGON_CHAMPIONS, { next: { revalidate: 24 * 60 * 60 } })
		.then(async (response) => {
			if (!response.ok) throw new Error("Champion-Rollen konnten nicht geladen werden.");
			const champions = (await response.json()) as CommunityDragonChampion[];
			return new Map(
				champions.map((champion) => [
					champion.id,
					(champion.roles ?? [])
						.map((role) => role.toLowerCase())
						.filter((role): role is ChampionRoleTag => ["assassin", "fighter", "mage", "marksman", "support", "tank"].includes(role)),
				])
			);
		})
		.catch(() => new Map<number, ChampionRoleTag[]>());
	return championRoleTagsPromise;
}

function roleAffinity(role: LiveGameRole, tags: ChampionRoleTag[]) {
	const has = (tag: ChampionRoleTag) => tags.includes(tag);
	if (role === "TOP") return (has("fighter") ? 5 : 0) + (has("tank") ? 4 : 0) + (has("mage") ? 1 : 0);
	if (role === "JUNGLE") return (has("fighter") ? 4 : 0) + (has("tank") ? 3 : 0) + (has("assassin") ? 3 : 0);
	if (role === "MIDDLE") return (has("mage") ? 5 : 0) + (has("assassin") ? 5 : 0) + (has("fighter") ? 1 : 0);
	if (role === "BOTTOM") return (has("marksman") ? 8 : 0) + (has("mage") ? 1 : 0);
	if (role === "UTILITY") return (has("support") ? 8 : 0) + (has("tank") ? 3 : 0) + (has("mage") ? 2 : 0);
	return 0;
}

function permutations<T>(values: T[]): T[][] {
	if (values.length <= 1) return [values];
	return values.flatMap((value, index) => permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [value, ...rest]));
}

function inferTeamRoles(participants: RiotActiveGame["participants"], tagsByChampion: Map<number, ChampionRoleTag[]>) {
	const assigned = new Map<string, LiveGameRole>();
	const jungler = participants.find((participant) => participant.spell1Id === 11 || participant.spell2Id === 11);
	if (jungler) assigned.set(jungler.puuid, "JUNGLE");
	const remaining = participants.filter((participant) => participant !== jungler);
	const roles = jungler ? LIVE_ROLE_ORDER.filter((role) => role !== "JUNGLE") : LIVE_ROLE_ORDER;
	let best = roles;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (const candidate of permutations(roles)) {
		const score = remaining.reduce((total, participant, index) => total + roleAffinity(candidate[index], tagsByChampion.get(participant.championId) ?? []), 0);
		if (score > bestScore) {
			best = candidate;
			bestScore = score;
		}
	}
	remaining.forEach((participant, index) => assigned.set(participant.puuid, best[index]));
	return assigned;
}

function liveGamePreview(showStreamerParticipants: boolean): NonNullable<CommunityObsLiveGame> {
	const championIds = [266, 64, 103, 145, 40, 86, 121, 157, 22, 89];
	const previewStreamers = new Map<number, CommunityOverlayStreamer>([
		[1, { login: "lauchgruen", displayName: "Lauchgruen" }],
		[7, { login: "hippokrate", displayName: "Hippokrate" }],
	]);
	return {
		gameLength: 754,
		observedAt: new Date().toISOString(),
		queueId: 420,
		queueLabel: "Ranked Solo/Duo",
		gameMode: "CLASSIC",
		participants: championIds.map((championId, index) => ({
			name: `Vorschau · ${LIVE_ROLE_ORDER[index % LIVE_ROLE_ORDER.length]}`,
			championIconUrl: championIconUrl(championId),
			teamId: index < 5 ? 100 : 200,
			role: LIVE_ROLE_ORDER[index % LIVE_ROLE_ORDER.length],
			isTrackedPlayer: index === 0,
			streamer: showStreamerParticipants ? (previewStreamers.get(index) ?? null) : null,
		})),
	};
}

function regionalApexCutoff(league: RiotApexLeague) {
	const sorted = [...league.entries].sort((a, b) => b.leaguePoints - a.leaguePoints);
	const standardSlotCounts = [50, 100, 200, 300, 500, 700];
	const slots = standardSlotCounts.reduce((best, candidate) => (Math.abs(candidate - sorted.length) < Math.abs(best - sorted.length) ? candidate : best));
	return sorted[Math.min(sorted.length, slots) - 1]?.leaguePoints ?? null;
}

async function apexGoalScores(routing: RiotRoute): Promise<CommunityObsApexGoals> {
	globalCache.__communityObsApexCache ??= new Map();
	globalCache.__communityObsApexRequests ??= new Map();
	const cacheKey = `slots-v3:${routing.credential}:${routing.platform}`;
	const cached = globalCache.__communityObsApexCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.goals;
	const pending = globalCache.__communityObsApexRequests.get(cacheKey);
	if (pending) return pending;

	const request = Promise.all([getGrandmasterLeagueForRoute(routing), getChallengerLeagueForRoute(routing)])
		.then(([grandmaster, challenger]) => {
			const grandmasterCutoff = regionalApexCutoff(grandmaster);
			const challengerCutoff = regionalApexCutoff(challenger);
			const challengerLp = challenger.entries.map((entry) => entry.leaguePoints);
			const goals = {
				grandmasterScore: grandmasterCutoff === null ? null : MASTER_SCORE + grandmasterCutoff,
				challengerScore: challengerCutoff === null ? null : MASTER_SCORE + challengerCutoff,
				rankOneScore: challengerLp.length ? MASTER_SCORE + Math.max(...challengerLp) : null,
			};
			globalCache.__communityObsApexCache?.set(cacheKey, { goals, expiresAt: Date.now() + APEX_CACHE_MS });
			return goals;
		})
		.catch(() => null)
		.finally(() => globalCache.__communityObsApexRequests?.delete(cacheKey));

	globalCache.__communityObsApexRequests.set(cacheKey, request);
	return request;
}

function reserveNewSnapshot(key: string) {
	const now = Date.now();
	globalCache.__communityObsKnownKeys ??= new Map();
	globalCache.__communityObsNewSnapshots = (globalCache.__communityObsNewSnapshots ?? []).filter((timestamp) => now - timestamp < NEW_SNAPSHOT_WINDOW_MS);
	for (const [knownKey, lastSeen] of globalCache.__communityObsKnownKeys) {
		if (now - lastSeen > KNOWN_SNAPSHOT_TTL_MS) globalCache.__communityObsKnownKeys.delete(knownKey);
	}
	if (!globalCache.__communityObsKnownKeys.has(key)) {
		if (globalCache.__communityObsNewSnapshots.length >= NEW_SNAPSHOT_LIMIT) {
			throw new Error("Gerade werden mehrere neue Overlays geladen. Bitte versuche es in zwei Minuten erneut.");
		}
		globalCache.__communityObsNewSnapshots.push(now);
	}
	globalCache.__communityObsKnownKeys.set(key, now);
}

function rankScore(entry: RiotLeagueEntry) {
	const tier = Math.max(0, TIER_ORDER.indexOf(entry.tier.toUpperCase() as (typeof TIER_ORDER)[number]));
	const division = Math.max(0, DIVISION_ORDER.indexOf(entry.rank.toUpperCase() as (typeof DIVISION_ORDER)[number]));
	return tier >= TIER_ORDER.indexOf("MASTER") ? MASTER_SCORE + entry.leaguePoints : tier * 400 + division * 100 + entry.leaguePoints;
}

function storedRankScore(rank: CommunityObsRank) {
	if (!rank) return 0;
	const tier = Math.max(0, TIER_ORDER.indexOf(rank.tier.toUpperCase() as (typeof TIER_ORDER)[number]));
	const division = Math.max(0, DIVISION_ORDER.indexOf(rank.division.toUpperCase() as (typeof DIVISION_ORDER)[number]));
	return tier >= TIER_ORDER.indexOf("MASTER") ? MASTER_SCORE + rank.leaguePoints : tier * 400 + division * 100 + rank.leaguePoints;
}

function rankSnapshot(entries: RiotLeagueEntry[], preferredQueueId?: 420 | 440 | null): CommunityObsRank {
	const preferredQueueType = preferredQueueId === 440 ? "RANKED_FLEX_SR" : preferredQueueId === 420 ? "RANKED_SOLO_5x5" : null;
	const entry = preferredQueueType
		? entries.find((item) => item.queueType === preferredQueueType)
		: (entries.find((item) => item.queueType === "RANKED_SOLO_5x5") ?? entries.find((item) => item.queueType === "RANKED_FLEX_SR"));
	if (!entry) return null;
	const queueId = entry.queueType === "RANKED_SOLO_5x5" ? 420 : 440;
	const tierIndex = Math.max(0, TIER_ORDER.indexOf(entry.tier.toUpperCase() as (typeof TIER_ORDER)[number]));
	const score = rankScore(entry);
	const games = entry.wins + entry.losses;
	const nextTier = TIER_ORDER[Math.min(tierIndex + 1, TIER_ORDER.length - 1)];
	return {
		queueId,
		queueLabel: rankedQueueLabel(queueId),
		tier: entry.tier,
		division: entry.rank,
		leaguePoints: entry.leaguePoints,
		wins: entry.wins,
		losses: entry.losses,
		winRate: games ? Math.round((entry.wins / games) * 100) : 0,
		label: `${titleCase(entry.tier)} ${entry.rank}`,
		score,
		progressPercent: Math.max(0, Math.min(100, ((score - tierIndex * 400) / 400) * 100)),
		nextLabel: tierIndex >= TIER_ORDER.indexOf("MASTER") ? titleCase(nextTier) : `${titleCase(nextTier)} IV`,
	};
}

function titleCase(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function performanceScore(participant: RiotMatchParticipant) {
	const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
	return (participant.kills + participant.assists * 0.7) / Math.max(1, participant.deaths + 0.5) + participant.goldEarned / 6000 + cs / 250;
}

function performanceBadge(participant: RiotMatchParticipant, participants: RiotMatchParticipant[]): "MVP" | "ACE" | null {
	const peers = participants.filter((entry) => entry.win === participant.win);
	const best = [...peers].sort((a, b) => performanceScore(b) - performanceScore(a))[0];
	if (!best || best.puuid !== participant.puuid) return null;
	return participant.win ? "MVP" : "ACE";
}

async function mapLimited<T, R>(values: T[], limit: number, worker: (value: T) => Promise<R | null>): Promise<R[]> {
	const output: R[] = [];
	let cursor = 0;
	async function run() {
		while (cursor < values.length) {
			const index = cursor++;
			try {
				const result = await worker(values[index]);
				if (result) output.push(result);
			} catch {
				// One unavailable match must not take down the complete browser source.
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => run()));
	return output;
}

async function cachedMatchIds(puuid: string, routing: RiotRoute, queueId: 420 | 440, maxAgeMs: number, startedAt?: string) {
	const startTime = startedAt ? Math.max(0, Math.floor(new Date(startedAt).getTime() / 1000) - 300) : undefined;
	globalCache.__communityObsMatchIdCache ??= new Map();
	globalCache.__communityObsMatchIdRequests ??= new Map();
	const key = `${routing.credential}:${routing.region}:${puuid}:${queueId}:${startTime ?? "all"}`;
	const cached = globalCache.__communityObsMatchIdCache.get(key);
	if (cached && Date.now() - cached.fetchedAt < maxAgeMs) return cached.ids;
	const pending = globalCache.__communityObsMatchIdRequests.get(key);
	if (pending) return pending;
	const request = getMatchIdsByPuuidForRoute(puuid, routing, { count: 18, queue: queueId, type: "ranked", ...(startTime ? { startTime } : {}) })
		.then((ids) => {
			globalCache.__communityObsMatchIdCache!.set(key, { ids, fetchedAt: Date.now() });
			trimMap(globalCache.__communityObsMatchIdCache!, 1_000);
			return ids;
		})
		.finally(() => globalCache.__communityObsMatchIdRequests?.delete(key));
	globalCache.__communityObsMatchIdRequests.set(key, request);
	return request;
}

async function loadGames(puuid: string, routing: RiotRoute, count: number, queueId: 420 | 440, cacheMs: number, startedAt?: string): Promise<CommunityObsGame[]> {
	const ids = (await cachedMatchIds(puuid, routing, queueId, cacheMs, startedAt)).slice(0, Math.min(18, count + 3));
	const games = await mapLimited(ids, 3, async (matchId) => {
		const match = await getMatchByIdForRoute(matchId, routing);
		if (isRiotMatchRemake(match)) return null;
		const participant = match.info.participants.find((entry) => entry.puuid === puuid);
		if (!participant || match.info.queueId !== queueId) return null;
		const endedAt = new Date(match.info.gameEndTimestamp ?? match.info.gameStartTimestamp ?? match.info.gameCreation).toISOString();
		const itemIds = participantInventoryItemIds(participant);
		return {
			matchId,
			championName: participant.championName,
			championIconUrl: championIconUrl(participant.championId),
			win: participant.win,
			kda: `${participant.kills}/${participant.deaths}/${participant.assists}`,
			durationSeconds: match.info.gameDuration,
			creepScore: participant.totalMinionsKilled + participant.neutralMinionsKilled,
			goldEarned: participant.goldEarned,
			lpChange: null,
			badge: performanceBadge(participant, match.info.participants),
			items: itemIds.map((id) => ({ id, iconUrl: itemIconUrl(id, match.info.gameVersion) })),
			endedAt,
		} satisfies CommunityObsGame;
	});
	return games.sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime()).slice(0, count);
}

async function sessionBaseline(streamer: string, streamId: string, startedAt: string, rank: CommunityObsRank) {
	const collection = (await getDb()).collection<CommunitySession>(SESSION_COLLECTION);
	const id = `${streamer.toLowerCase()}:${streamId}:${rank?.queueId ?? "unranked"}`;
	const existing = await collection.findOne({ _id: id });
	if (existing) return existing;
	const session = { _id: id, streamer: streamer.toLowerCase(), streamId, startedAt, baselineRank: rank, createdAt: new Date().toISOString() } satisfies CommunitySession;
	await collection.insertOne(session);
	await collection.deleteMany({ streamer: streamer.toLowerCase(), streamId: { $ne: streamId } });
	return session;
}

async function rememberedSessionQueue(streamer: string, streamId: string) {
	const collection = (await getDb()).collection<CommunitySession>(SESSION_COLLECTION);
	const session = await collection.findOne({ streamer: streamer.toLowerCase(), streamId, "baselineRank.queueId": { $in: [420, 440] } }, { sort: { createdAt: -1 } });
	return rankedQueueId(session?.baselineRank?.queueId);
}

export async function getCommunityObsSnapshot(input: {
	streamer: string;
	ingame: string;
	accountId?: string;
	region: string;
	historyCount: number;
	sessionOnly: boolean;
	includeLiveGame: boolean;
	includeStreamerParticipants: boolean;
	detectLiveQueue: boolean;
	includeProfileIcon?: boolean;
	previewLiveGame?: boolean;
	includeApexGoals?: boolean;
	preview?: boolean;
}): Promise<CommunityObsSnapshot> {
	const streamer = input.streamer.trim().replace(/^@/, "").toLowerCase();
	const baseRouting = obsRiotRoute(input.region, obsOverlayForStreamer(streamer));
	const accountId = /^[a-z\d_-]{12,128}$/i.test(input.accountId ?? "") ? input.accountId! : "";
	const riotId = accountId ? null : parseRiotId(input.ingame);
	const count = Math.max(0, Math.min(15, input.historyCount));
	const key = [
		streamer,
		accountId || `${riotId!.gameName.toLowerCase()}#${riotId!.tagLine.toLowerCase()}`,
		input.region,
		count,
		input.sessionOnly ? 1 : 0,
		input.includeLiveGame ? 1 : 0,
		input.includeStreamerParticipants ? "streamers" : 0,
		input.detectLiveQueue ? "queue" : 0,
		input.includeProfileIcon ? "profile" : 0,
		input.previewLiveGame ? "live-preview" : 0,
		input.includeApexGoals ? "apex-v2" : 0,
		input.preview ? 1 : 0,
	].join(":");
	globalCache.__communityObsCache ??= new Map();
	globalCache.__communityObsRequests ??= new Map();
	const cached = globalCache.__communityObsCache.get(key);
	if (cached && cached.expiresAt > Date.now()) {
		diagnosticsState().hits += 1;
		return cached.data;
	}
	const pending = globalCache.__communityObsRequests.get(key);
	if (pending) {
		diagnosticsState().deduplicated += 1;
		return pending;
	}
	diagnosticsState().misses += 1;
	reserveNewSnapshot(key);

	const request = (async () => {
		const [resolvedAccount, stream] = await Promise.all([
			resolveCommunityAccount({ accountId, ingame: input.ingame, region: input.region, routing: baseRouting }),
			streamer ? getStream(streamer, "overlay") : Promise.resolve(null),
		]);
		const { account, routing } = resolvedAccount;
		const leagueLive = Boolean(stream && stream.gameName.trim().toLowerCase() === "league of legends");
		const fetchLiveGame = input.includeLiveGame || (input.detectLiveQueue && leagueLive);
		const [entries, liveGame, apexGoals, currentProfileIconUrl] = await Promise.all([
			cachedRankEntries(account.puuid, routing, leagueLive ? LIVE_RANK_CACHE_MS : OFFLINE_RANK_CACHE_MS),
			fetchLiveGame ? getActiveGameByPuuidForRoute(account.puuid, routing).catch(() => null) : Promise.resolve(null),
			input.includeApexGoals ? apexGoalScores(routing) : Promise.resolve(null),
			input.includeProfileIcon ? cachedProfileIconUrl(account.puuid, routing).catch(() => null) : Promise.resolve(null),
		]);
		const activeRankQueueId = rankedQueueId(liveGame?.gameQueueConfigId);
		const sessionRankQueueId = activeRankQueueId ?? (leagueLive ? await rememberedSessionQueue(streamer, stream!.id) : null);
		const rank = rankSnapshot(entries, sessionRankQueueId);
		const startedAt = leagueLive ? stream!.startedAt : undefined;
		const session = leagueLive ? await sessionBaseline(streamer, stream!.id, stream!.startedAt, rank) : null;
		const baselineRank = session?.baselineRank ?? rank;
		const historyStart = input.sessionOnly && !input.preview ? startedAt : undefined;
		const historyQueueId = sessionRankQueueId ?? rank?.queueId ?? null;
		const games =
			input.sessionOnly && !input.preview && !leagueLive
				? []
				: historyQueueId && count > 0
					? await loadGames(account.puuid, routing, count, historyQueueId, leagueLive ? LIVE_HISTORY_CACHE_MS : OFFLINE_HISTORY_CACHE_MS, historyStart)
					: [];
		const tagsByChampion = liveGame ? await championRoleTags() : new Map<number, ChampionRoleTag[]>();
		const liveRoles = liveGame
			? new Map(
					[100, 200].flatMap((teamId) => [
						...inferTeamRoles(
							liveGame.participants.filter((participant) => participant.teamId === teamId),
							tagsByChampion
						),
					])
				)
			: new Map<string, LiveGameRole>();
		const streamersByPuuid =
			input.includeStreamerParticipants && liveGame
				? await listCommunityOverlayStreamersByPuuid(liveGame.participants.map((participant) => participant.puuid))
				: new Map<string, CommunityOverlayStreamer>();
		const sessionWins = games.filter((game) => game.win).length;
		const sessionLosses = games.length - sessionWins;
		const lpDeltaAvailable = Boolean(
			session && rank && baselineRank && !input.preview && !games.some((game) => new Date(game.endedAt).getTime() <= new Date(session.createdAt).getTime())
		);
		const resolvedLiveGame: CommunityObsLiveGame =
			input.includeLiveGame && liveGame
				? {
						gameLength: liveGame.gameLength,
						observedAt: new Date().toISOString(),
						queueId: liveGame.gameQueueConfigId,
						queueLabel: queueLabel(liveGame.gameQueueConfigId, liveGame.gameMode),
						gameMode: liveGame.gameMode,
						participants: liveGame.participants
							.map((participant, index) => ({
								name: participant.riotId || `Spieler ${index + 1}`,
								championIconUrl: championIconUrl(participant.championId),
								teamId: participant.teamId,
								role: liveRoles.get(participant.puuid) ?? LIVE_ROLE_ORDER[index % LIVE_ROLE_ORDER.length],
								isTrackedPlayer: participant.puuid === account.puuid,
								streamer: streamersByPuuid.get(participant.puuid) ?? null,
							}))
							.sort((left, right) => left.teamId - right.teamId || LIVE_ROLE_ORDER.indexOf(left.role) - LIVE_ROLE_ORDER.indexOf(right.role)),
					}
				: input.previewLiveGame
					? liveGamePreview(input.includeStreamerParticipants)
					: null;
		const response: CommunityObsSnapshot = {
			streamer,
			riotId: `${account.gameName}#${account.tagLine}`,
			accountId: resolvedAccount.accountId,
			region: input.region,
			online: Boolean(stream),
			leagueLive,
			streamStartedAt: stream?.startedAt ?? null,
			streamDurationSeconds: stream ? Math.max(0, Math.floor((Date.now() - new Date(stream.startedAt).getTime()) / 1000)) : 0,
			rank,
			baselineRank,
			lpDelta: rank && baselineRank ? storedRankScore(rank) - storedRankScore(baselineRank) : 0,
			lpDeltaAvailable,
			sessionWins,
			sessionLosses,
			games,
			profileIconUrl: currentProfileIconUrl,
			liveGame: resolvedLiveGame,
			apexGoals,
			updatedAt: new Date().toISOString(),
			...(!streamer
				? { message: "Kein Twitch-Kanal hinterlegt." }
				: !stream
					? { message: `${streamer} ist gerade offline.` }
					: !leagueLive
						? { message: "Stream ist live, aber nicht in League of Legends." }
						: {}),
		};
		globalCache.__communityObsCache!.set(key, { data: response, expiresAt: Date.now() + SNAPSHOT_CACHE_MS });
		const diagnostics = diagnosticsState();
		diagnostics.lastSuccessAt = response.updatedAt;
		diagnostics.lastError = null;
		return response;
	})()
		.catch((error) => {
			const diagnostics = diagnosticsState();
			diagnostics.errors += 1;
			diagnostics.lastErrorAt = new Date().toISOString();
			diagnostics.lastError = error instanceof Error ? error.message : "Unbekannter Overlay-Fehler";
			if (cached?.data) {
				diagnostics.staleFallbacks += 1;
				return {
					...cached.data,
					message: "Riot oder Twitch ist kurzzeitig nicht erreichbar. Es werden die zuletzt bekannten Daten angezeigt.",
				};
			}
			throw error;
		})
		.finally(() => globalCache.__communityObsRequests?.delete(key));

	globalCache.__communityObsRequests.set(key, request);
	return request;
}
