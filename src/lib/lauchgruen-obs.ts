import { getDb } from "@/lib/mongo";
import { championIconUrl, formatRank, getAccountByRiotId, getLeagueEntriesByPuuid, getMatchById, getMatchIdsByPuuid, itemIconUrl, type RiotLeagueEntry } from "@/lib/riot";
import { getStream } from "@/lib/twitch";

const SESSION_COLLECTION = "lauchgruen_obs_sessions";
const RANKED_QUEUE_IDS = new Set([420, 440]);
const SNAPSHOT_CACHE_MS = 20_000;

const TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
const DIVISION_ORDER = ["IV", "III", "II", "I"] as const;

type RankSnapshot = {
	queueType: string;
	tier: string;
	rank: string;
	leaguePoints: number;
	label: string;
	score: number;
	tierStartScore: number;
	tierEndScore: number;
	tierProgressPercent: number;
	nextTierLabel: string;
} | null;

type SessionDoc = {
	_id: string;
	streamId: string;
	twitchLogin: string;
	startedAt: string;
	createdAt: string;
	baselineRank: RankSnapshot;
};

type StreamerConfig = {
	slug: "lauchgruen" | "hippokrate";
	displayName: string;
	twitchLogin: string;
	riotGameName: string;
	riotTagLine: string;
};

const STREAMERS: Record<StreamerConfig["slug"], StreamerConfig> = {
	lauchgruen: {
		slug: "lauchgruen",
		displayName: "Lauchgruen",
		twitchLogin: process.env.LAUCHGRUEN_OBS_TWITCH_LOGIN?.trim() || "lauchgruen",
		riotGameName: process.env.LAUCHGRUEN_OBS_RIOT_GAME_NAME?.trim() || "lauchgruentv",
		riotTagLine: process.env.LAUCHGRUEN_OBS_RIOT_TAG_LINE?.trim() || "euw",
	},
	hippokrate: {
		slug: "hippokrate",
		displayName: "Hippokrate",
		twitchLogin: process.env.HIPPOKRATE_OBS_TWITCH_LOGIN?.trim() || "hippokrate",
		riotGameName: process.env.HIPPOKRATE_OBS_RIOT_GAME_NAME?.trim() || "Hìppokrate",
		riotTagLine: process.env.HIPPOKRATE_OBS_RIOT_TAG_LINE?.trim() || "7758",
	},
};

const g = globalThis as unknown as {
	__streamerObsSnapshots?: Record<
		string,
		{
			expiresAt: number;
			data: LauchgruenObsResponse;
		}
	>;
	__streamerObsRequests?: Map<string, Promise<LauchgruenObsResponse>>;
};

export type LauchgruenObsGame = {
	matchId: string;
	championId: number;
	championName: string;
	championIconUrl: string;
	win: boolean;
	kda: string;
	kills: number;
	deaths: number;
	assists: number;
	creepScore: number;
	goldEarned: number;
	durationSeconds: number;
	items: Array<{ id: number; iconUrl: string }>;
	endedAt: string;
	queueId: number;
};

export type LauchgruenObsResponse = {
	online: boolean;
	leagueLive: boolean;
	streamTitle: string | null;
	streamStartedAt: string | null;
	streamDurationSeconds: number;
	viewerCount: number;
	rank: RankSnapshot;
	baselineRank: RankSnapshot;
	lpDelta: number;
	sessionWins: number;
	sessionLosses: number;
	winRate: number;
	lastGames: LauchgruenObsGame[];
	riotId: string;
	twitchLogin: string;
	updatedAt: string;
	message?: string;
};

function queueRank(entries: RiotLeagueEntry[]): RiotLeagueEntry | null {
	return entries.find((entry) => entry.queueType === "RANKED_SOLO_5x5") ?? entries.find((entry) => entry.queueType === "RANKED_FLEX_SR") ?? null;
}

function rankScore(entry: RiotLeagueEntry): number {
	const tierIndex = Math.max(0, TIER_ORDER.indexOf(entry.tier.toUpperCase() as (typeof TIER_ORDER)[number]));
	const divisionIndex = Math.max(0, DIVISION_ORDER.indexOf(entry.rank.toUpperCase() as (typeof DIVISION_ORDER)[number]));
	if (tierIndex >= TIER_ORDER.indexOf("MASTER")) return tierIndex * 400 + entry.leaguePoints;
	return tierIndex * 400 + divisionIndex * 100 + entry.leaguePoints;
}

function rankSnapshot(entries: RiotLeagueEntry[]): RankSnapshot {
	const entry = queueRank(entries);
	if (!entry) return null;
	const tierIndex = Math.max(0, TIER_ORDER.indexOf(entry.tier.toUpperCase() as (typeof TIER_ORDER)[number]));
	const score = rankScore(entry);
	const tierStartScore = tierIndex * 400;
	const tierEndScore = tierStartScore + 400;
	const nextTier = TIER_ORDER[Math.min(tierIndex + 1, TIER_ORDER.length - 1)];
	return {
		queueType: entry.queueType,
		tier: entry.tier,
		rank: entry.rank,
		leaguePoints: entry.leaguePoints,
		label: formatRank([entry]) ?? `${entry.tier} ${entry.rank} (${entry.leaguePoints} LP)`,
		score,
		tierStartScore,
		tierEndScore,
		tierProgressPercent: Math.max(0, Math.min(100, ((score - tierStartScore) / (tierEndScore - tierStartScore)) * 100)),
		nextTierLabel: `${nextTier} IV`,
	};
}

function displayTier(tier?: string) {
	if (!tier) return "Unranked";
	const map: Record<string, string> = {
		IRON: "Iron",
		BRONZE: "Bronze",
		SILVER: "Silber",
		GOLD: "Gold",
		PLATINUM: "Platin",
		EMERALD: "Emerald",
		DIAMOND: "Diamond",
		MASTER: "Master",
		GRANDMASTER: "Grandmaster",
		CHALLENGER: "Challenger",
	};
	return map[tier.toUpperCase()] ?? tier;
}

export function compactRankLabel(rank: RankSnapshot) {
	if (!rank) return "Unranked";
	return `${displayTier(rank.tier)} ${rank.rank}`;
}

async function sessionCollection() {
	return (await getDb()).collection<SessionDoc>(SESSION_COLLECTION);
}

async function pruneOldStreamerSessions(config: StreamerConfig, currentSessionId: string): Promise<void> {
	try {
		const col = await sessionCollection();
		await col.deleteMany({
			twitchLogin: config.twitchLogin,
			_id: { $ne: currentSessionId },
		});
	} catch (error) {
		console.warn("[lauchgruen-obs] session cleanup failed:", error);
	}
}

async function getOrCreateSession(config: StreamerConfig, streamId: string, startedAt: string, baselineRank: RankSnapshot): Promise<SessionDoc> {
	const col = await sessionCollection();
	const id = config.slug === "lauchgruen" ? streamId : `${config.slug}:${streamId}`;
	const existing = await col.findOne({ _id: id });
	if (existing) {
		await pruneOldStreamerSessions(config, id);
		return existing;
	}
	const doc: SessionDoc = {
		_id: id,
		streamId,
		twitchLogin: config.twitchLogin,
		startedAt,
		createdAt: new Date().toISOString(),
		baselineRank,
	};
	await col.insertOne(doc);
	await pruneOldStreamerSessions(config, id);
	return doc;
}

async function loadSessionGames(puuid: string, startedAt?: string): Promise<LauchgruenObsGame[]> {
	const startedSeconds = startedAt ? Math.max(0, Math.floor(new Date(startedAt).getTime() / 1000) - 300) : undefined;
	const matchIds = await getMatchIdsByPuuid(puuid, { ...(startedSeconds === undefined ? {} : { startTime: startedSeconds }), count: 5, type: "ranked" });
	const matches = await Promise.all(matchIds.map((matchId) => getMatchById(matchId)));
	return matches
		.map((match) => {
			const participant = match.info.participants.find((entry) => entry.puuid === puuid);
			if (!participant || !RANKED_QUEUE_IDS.has(match.info.queueId)) return null;
			const endedAt = new Date(match.info.gameEndTimestamp ?? match.info.gameStartTimestamp ?? match.info.gameCreation).toISOString();
			const itemIds = [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5].filter((itemId) => itemId > 0);
			return {
				matchId: match.metadata.matchId,
				championId: participant.championId,
				championName: participant.championName,
				championIconUrl: championIconUrl(participant.championId),
				win: participant.win,
				kda: `${participant.kills}/${participant.deaths}/${participant.assists}`,
				kills: participant.kills,
				deaths: participant.deaths,
				assists: participant.assists,
				creepScore: participant.totalMinionsKilled + participant.neutralMinionsKilled,
				goldEarned: participant.goldEarned,
				durationSeconds: match.info.gameDuration,
				items: itemIds.map((id) => ({ id, iconUrl: itemIconUrl(id, match.info.gameVersion) })),
				endedAt,
				queueId: match.info.queueId,
			};
		})
		.filter((game): game is LauchgruenObsGame => Boolean(game))
		.sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
}

async function buildStreamerObsSnapshot(slug: StreamerConfig["slug"], options: { preview?: boolean } = {}): Promise<LauchgruenObsResponse> {
	const config = STREAMERS[slug];
	const cacheKey = `${slug}:${options.preview ? "preview" : "live"}`;
	const cached = g.__streamerObsSnapshots?.[cacheKey];
	if (cached && cached.expiresAt > Date.now()) return cached.data;

	const updatedAt = new Date().toISOString();
	const [stream, account] = await Promise.all([getStream(config.twitchLogin), getAccountByRiotId(config.riotGameName, config.riotTagLine)]);
	const entries = await getLeagueEntriesByPuuid(account.puuid);
	const currentRank = rankSnapshot(entries);
	const previewGames = options.preview ? (await loadSessionGames(account.puuid)).slice(0, 5) : [];

	if (!stream) {
		const wins = previewGames.filter((game) => game.win).length;
		const losses = previewGames.length - wins;
		const response: LauchgruenObsResponse = {
			online: false,
			leagueLive: false,
			streamTitle: null,
			streamStartedAt: null,
			streamDurationSeconds: 0,
			viewerCount: 0,
			rank: currentRank,
			baselineRank: currentRank,
			lpDelta: 0,
			sessionWins: wins,
			sessionLosses: losses,
			winRate: previewGames.length ? Math.round((wins / previewGames.length) * 100) : 0,
			lastGames: previewGames.slice(0, 5),
			riotId: `${config.riotGameName}#${config.riotTagLine}`,
			twitchLogin: config.twitchLogin,
			updatedAt,
			message: options.preview ? "Testmodus: Die letzten Ranked-Games werden angezeigt." : `${config.displayName} ist gerade offline.`,
		};
		g.__streamerObsSnapshots ??= {};
		g.__streamerObsSnapshots[cacheKey] = { data: response, expiresAt: Date.now() + SNAPSHOT_CACHE_MS };
		return response;
	}

	const leagueLive = stream.gameName.trim().toLowerCase() === "league of legends";
	const session = await getOrCreateSession(config, stream.id, stream.startedAt, currentRank);
	const games = options.preview ? previewGames : leagueLive ? await loadSessionGames(account.puuid, stream.startedAt) : [];
	const wins = games.filter((game) => game.win).length;
	const losses = games.length - wins;

	const response: LauchgruenObsResponse = {
		online: true,
		leagueLive,
		streamTitle: stream.title,
		streamStartedAt: stream.startedAt,
		streamDurationSeconds: Math.max(0, Math.floor((Date.now() - new Date(stream.startedAt).getTime()) / 1000)),
		viewerCount: stream.viewerCount,
		rank: currentRank,
		baselineRank: session.baselineRank,
		lpDelta: currentRank && session.baselineRank ? currentRank.score - session.baselineRank.score : 0,
		sessionWins: wins,
		sessionLosses: losses,
		winRate: games.length ? Math.round((wins / games.length) * 100) : 0,
		lastGames: games.slice(0, 5),
		riotId: `${config.riotGameName}#${config.riotTagLine}`,
		twitchLogin: config.twitchLogin,
		updatedAt,
		message: leagueLive ? undefined : `Live, aber aktuell in Kategorie "${stream.gameName}".`,
	};
	g.__streamerObsSnapshots ??= {};
	g.__streamerObsSnapshots[cacheKey] = { data: response, expiresAt: Date.now() + SNAPSHOT_CACHE_MS };
	return response;
}

export async function getStreamerObsSnapshot(slug: StreamerConfig["slug"], options: { preview?: boolean } = {}): Promise<LauchgruenObsResponse> {
	const cacheKey = `${slug}:${options.preview ? "preview" : "live"}`;
	const cached = g.__streamerObsSnapshots?.[cacheKey];
	if (cached && cached.expiresAt > Date.now()) return cached.data;

	g.__streamerObsRequests ??= new Map();
	const pending = g.__streamerObsRequests.get(cacheKey);
	if (pending) return pending;

	const request = buildStreamerObsSnapshot(slug, options).finally(() => g.__streamerObsRequests?.delete(cacheKey));
	g.__streamerObsRequests.set(cacheKey, request);
	return request;
}

export async function getLauchgruenObsSnapshot(): Promise<LauchgruenObsResponse> {
	return getStreamerObsSnapshot("lauchgruen");
}
