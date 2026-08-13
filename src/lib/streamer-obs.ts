import { getDb } from "@/lib/mongo";
import {
	championIconUrl,
	formatRank,
	getAccountByPuuidForRoute,
	getAccountByRiotIdForRoute,
	getActiveGameByPuuidForRoute,
	getLeagueEntriesByPuuidForRoute,
	getMatchByIdForRoute,
	getMatchIdsByPuuidForRoute,
	getSummonerByPuuidForRoute,
	isRiotMatchRemake,
	itemIconUrl,
	participantInventoryItemIds,
	parseRiotId,
	profileIconUrl,
	obsRiotRoute,
	RiotApiError,
	type ObsRiotCredential,
	type RiotAccount,
	type RiotLeagueEntry,
	type RiotMatch,
	type RiotSummoner,
	type RiotRoute,
} from "@/lib/riot";
import { getStream } from "@/lib/twitch";
import { summarizeObsSession } from "@/lib/obs-session";

const SESSION_COLLECTION = "lauchgruen_obs_sessions";
const ACCOUNT_COLLECTION = "streamer_obs_accounts";
const RANKED_QUEUE_IDS = new Set([420, 440]);
const SNAPSHOT_CACHE_MS = 60_000;
const ACCOUNT_CACHE_MS = 24 * 60 * 60_000;
const RANK_CACHE_MS = 60_000;
const HISTORY_CACHE_MS = 45_000;
const PREVIEW_MATCH_LIMIT = 8;
const SESSION_MATCH_LIMIT = 40;
const SESSION_START_BUFFER_SECONDS = 3 * 60 * 60;
const LIVE_QUEUE_CACHE_MS = 90_000;
const LIVE_QUEUE_STALE_MS = 10 * 60_000;
const LIVE_QUEUE_RATE_LIMIT_CACHE_MS = 2 * 60_000;

const TIER_ORDER = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
const DIVISION_ORDER = ["IV", "III", "II", "I"] as const;

type RankSnapshot = {
	queueType: string;
	tier: string;
	rank: string;
	leaguePoints: number;
	wins: number;
	losses: number;
	winRate: number;
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
	accountPuuid?: string;
	queueType?: string;
	startedAt: string;
	createdAt: string;
	baselineRank: RankSnapshot;
};

type StreamerAccountDoc = {
	_id: string;
	puuid: string;
	riotId: string;
	credential?: ObsRiotCredential;
	selectedAccountKey?: string;
	selectedAccountStreamId?: string;
	selectedQueueId?: 420 | 440;
	selectedQueueStreamId?: string;
	updatedAt: string;
};

type ResolvedStreamerAccount = {
	account: RiotAccount;
	routing: RiotRoute;
	accountKey: string;
	selectedAccountKey?: string;
	selectedAccountStreamId?: string;
	selectedQueueId?: 420 | 440;
	selectedQueueStreamId?: string;
};

type StreamerRiotAccountConfig = {
	key: string;
	riotGameName: string;
	riotTagLine: string;
};

type StreamerConfig = {
	slug: "lauchgruen" | "hippokrate" | "happygiganto" | "nachtdienst" | "akuma" | "n4cht4r4";
	displayName: string;
	twitchLogin: string;
	riotGameName: string;
	riotTagLine: string;
	alternateAccounts?: StreamerRiotAccountConfig[];
	rankedOnly?: boolean;
};

function alternateAccounts(prefix: string, fallbackRiotIds: string[] = []): StreamerRiotAccountConfig[] {
	const configuredRiotIds = process.env[`${prefix}_OBS_ALT_RIOT_IDS`]
		?.split(",")
		.map((riotId) => riotId.trim())
		.filter(Boolean);
	const riotIds = configuredRiotIds?.length ? configuredRiotIds : fallbackRiotIds;
	return riotIds.flatMap((riotId, index) => {
		try {
			const parsed = parseRiotId(riotId);
			return [{ key: `alt-${index + 1}`, riotGameName: parsed.gameName, riotTagLine: parsed.tagLine }];
		} catch {
			console.warn(`[${prefix.toLowerCase()}-obs] Ignoriere ungültige alternative Riot-ID: ${riotId}`);
			return [];
		}
	});
}

const STREAMERS: Record<StreamerConfig["slug"], StreamerConfig> = {
	lauchgruen: {
		slug: "lauchgruen",
		displayName: "Lauchgruen",
		twitchLogin: process.env.LAUCHGRUEN_OBS_TWITCH_LOGIN?.trim() || "lauchgruen",
		riotGameName: process.env.LAUCHGRUEN_OBS_RIOT_GAME_NAME?.trim() || "lauchgruentv",
		riotTagLine: process.env.LAUCHGRUEN_OBS_RIOT_TAG_LINE?.trim() || "euw",
		alternateAccounts: alternateAccounts("LAUCHGRUEN"),
	},
	hippokrate: {
		slug: "hippokrate",
		displayName: "Hippokrate",
		twitchLogin: process.env.HIPPOKRATE_OBS_TWITCH_LOGIN?.trim() || "hippokrate",
		riotGameName: process.env.HIPPOKRATE_OBS_RIOT_GAME_NAME?.trim() || "Hìppokrate",
		riotTagLine: process.env.HIPPOKRATE_OBS_RIOT_TAG_LINE?.trim() || "7758",
		alternateAccounts: alternateAccounts("HIPPOKRATE"),
	},
	happygiganto: {
		slug: "happygiganto",
		displayName: "HappyGiganto",
		twitchLogin: process.env.HAPPYGIGANTO_OBS_TWITCH_LOGIN?.trim() || "happygiganto",
		riotGameName: process.env.HAPPYGIGANTO_OBS_RIOT_GAME_NAME?.trim() || "cutie patootie",
		riotTagLine: process.env.HAPPYGIGANTO_OBS_RIOT_TAG_LINE?.trim() || "happy",
	},
	nachtdienst: {
		slug: "nachtdienst",
		displayName: "Nachtdienst",
		twitchLogin: process.env.NACHTDIENST_OBS_TWITCH_LOGIN?.trim() || "nachtdienst",
		riotGameName: process.env.NACHTDIENST_OBS_RIOT_GAME_NAME?.trim() || "Nacktdienst",
		riotTagLine: process.env.NACHTDIENST_OBS_RIOT_TAG_LINE?.trim() || "LoL",
		alternateAccounts: alternateAccounts("NACHTDIENST"),
		rankedOnly: true,
	},
	akuma: {
		slug: "akuma",
		displayName: "Aoi Akuma",
		twitchLogin: process.env.AKUMA_OBS_TWITCH_LOGIN?.trim() || "akuma_flo",
		riotGameName: process.env.AKUMA_OBS_RIOT_GAME_NAME?.trim() || "Aoi Akuma",
		riotTagLine: process.env.AKUMA_OBS_RIOT_TAG_LINE?.trim() || "EUW",
		alternateAccounts: alternateAccounts("AKUMA", ["DarkinAkuma#420"]),
	},
	n4cht4r4: {
		slug: "n4cht4r4",
		displayName: "N4cht4r4",
		twitchLogin: process.env.N4CHT4R4_OBS_TWITCH_LOGIN?.trim() || "n4cht4r4",
		riotGameName: process.env.N4CHT4R4_OBS_RIOT_GAME_NAME?.trim() || "N4cht4r4",
		riotTagLine: process.env.N4CHT4R4_OBS_RIOT_TAG_LINE?.trim() || "cute",
		alternateAccounts: alternateAccounts("N4CHT4R4"),
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
	__streamerObsAccounts?: Map<string, { expiresAt: number; data: ResolvedStreamerAccount }>;
	__streamerObsAccountRequests?: Map<string, Promise<ResolvedStreamerAccount>>;
	__streamerObsPuuids?: Map<string, string>;
	__streamerObsSummoners?: Map<string, { expiresAt: number; data: RiotSummoner }>;
	__streamerObsSummonerRequests?: Map<string, Promise<RiotSummoner>>;
	__streamerObsRanks?: Map<string, { expiresAt: number; data: RiotLeagueEntry[] }>;
	__streamerObsRankRequests?: Map<string, Promise<RiotLeagueEntry[]>>;
	__streamerObsMatchIds?: Map<string, { expiresAt: number; data: string[] }>;
	__streamerObsMatchIdRequests?: Map<string, Promise<string[]>>;
	__streamerObsLiveQueues?: Map<string, { queueId: number | null; fetchedAt: number; retryAt?: number }>;
	__streamerObsLiveQueueRequests?: Map<string, Promise<number | null>>;
	__streamerObsSelectedAccounts?: Map<string, { accountKey: string; streamId: string }>;
	__streamerObsSelectedQueues?: Map<string, { queueId: 420 | 440; streamId: string }>;
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
	liveQueueId: number | null;
	streamTitle: string | null;
	streamStartedAt: string | null;
	streamDurationSeconds: number;
	viewerCount: number;
	rank: RankSnapshot;
	soloRank?: RankSnapshot;
	flexRank?: RankSnapshot;
	baselineRank: RankSnapshot;
	lpDelta: number;
	sessionWins: number;
	sessionLosses: number;
	winRate: number;
	lastGames: LauchgruenObsGame[];
	profileIconUrl: string | null;
	riotId: string;
	twitchLogin: string;
	updatedAt: string;
	message?: string;
};

function queueRank(entries: RiotLeagueEntry[], preferredQueueId?: number | null): RiotLeagueEntry | null {
	if (preferredQueueId === 440) {
		return entries.find((entry) => entry.queueType === "RANKED_FLEX_SR") ?? null;
	}
	if (preferredQueueId === 420) {
		return entries.find((entry) => entry.queueType === "RANKED_SOLO_5x5") ?? null;
	}
	return entries.find((entry) => entry.queueType === "RANKED_SOLO_5x5") ?? entries.find((entry) => entry.queueType === "RANKED_FLEX_SR") ?? null;
}

function rankScore(entry: RiotLeagueEntry): number {
	const tierIndex = Math.max(0, TIER_ORDER.indexOf(entry.tier.toUpperCase() as (typeof TIER_ORDER)[number]));
	const divisionIndex = Math.max(0, DIVISION_ORDER.indexOf(entry.rank.toUpperCase() as (typeof DIVISION_ORDER)[number]));
	if (tierIndex >= TIER_ORDER.indexOf("MASTER")) return tierIndex * 400 + entry.leaguePoints;
	return tierIndex * 400 + divisionIndex * 100 + entry.leaguePoints;
}

function rankSnapshot(entries: RiotLeagueEntry[], preferredQueueId?: number | null): RankSnapshot {
	const entry = queueRank(entries, preferredQueueId);
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
		wins: entry.wins,
		losses: entry.losses,
		winRate: entry.wins + entry.losses > 0 ? Math.round((entry.wins / (entry.wins + entry.losses)) * 100) : 0,
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

async function pruneOldStreamerSessions(config: StreamerConfig, currentStreamId: string): Promise<void> {
	try {
		const col = await sessionCollection();
		await col.deleteMany({
			twitchLogin: config.twitchLogin,
			streamId: { $ne: currentStreamId },
		});
	} catch (error) {
		console.warn("[lauchgruen-obs] session cleanup failed:", error);
	}
}

async function getOrCreateSession(config: StreamerConfig, streamId: string, startedAt: string, baselineRank: RankSnapshot, accountPuuid: string): Promise<SessionDoc> {
	const col = await sessionCollection();
	const queueType = baselineRank?.queueType ?? "RANKED_SOLO_5x5";
	const id = `${config.slug}:${streamId}:${accountPuuid}:${queueType}`;
	const existing = await col.findOne({ _id: id });
	if (existing) {
		await pruneOldStreamerSessions(config, streamId);
		return existing;
	}
	const doc: SessionDoc = {
		_id: id,
		streamId,
		twitchLogin: config.twitchLogin,
		accountPuuid,
		queueType,
		startedAt,
		createdAt: new Date().toISOString(),
		baselineRank,
	};
	await col.insertOne(doc);
	await pruneOldStreamerSessions(config, streamId);
	return doc;
}

function configuredRiotAccounts(config: StreamerConfig): StreamerRiotAccountConfig[] {
	return [{ key: "main", riotGameName: config.riotGameName, riotTagLine: config.riotTagLine }, ...(config.alternateAccounts ?? [])];
}

function accountStorageId(config: StreamerConfig, accountConfig: StreamerRiotAccountConfig) {
	return accountStorageIdFromKey(config, accountConfig.key);
}

function accountStorageIdFromKey(config: StreamerConfig, accountKey: string) {
	return accountKey === "main" ? config.slug : `${config.slug}:${accountKey}`;
}

async function cachedAccount(config: StreamerConfig, accountConfig: StreamerRiotAccountConfig): Promise<ResolvedStreamerAccount> {
	g.__streamerObsAccounts ??= new Map();
	g.__streamerObsAccountRequests ??= new Map();
	g.__streamerObsPuuids ??= new Map();

	const collection = (await getDb()).collection<StreamerAccountDoc>(ACCOUNT_COLLECTION);
	const storageId = accountStorageId(config, accountConfig);
	const stored = await collection.findOne({ _id: storageId });
	const routing = obsRiotRoute("euw1", config.slug);
	const cacheKey = `${routing.credential}:${storageId}`;
	const cachedAccount = g.__streamerObsAccounts.get(cacheKey);
	if (cachedAccount && cachedAccount.expiresAt > Date.now()) return cachedAccount.data;
	const pendingAccount = g.__streamerObsAccountRequests.get(cacheKey);
	if (pendingAccount) return pendingAccount;

	// A PUUID may only be reused with the credential that originally resolved it.
	// Legacy documents without a credential are re-resolved from the Riot ID.
	const puuidCacheKey = `${routing.credential}:${storageId}`;
	const puuid = g.__streamerObsPuuids.get(puuidCacheKey) || (stored?.credential === routing.credential ? stored.puuid : "");
	if (puuid) g.__streamerObsPuuids.set(puuidCacheKey, puuid);

	const resolveByRiotId = async () => {
		const fallback = stored?.riotId?.includes("#") ? stored.riotId : `${accountConfig.riotGameName}#${accountConfig.riotTagLine}`;
		const parsed = parseRiotId(fallback);
		return getAccountByRiotIdForRoute(parsed.gameName, parsed.tagLine, routing);
	};
	const persist = async (account: RiotAccount) => {
		const resolved = {
			account,
			routing,
			accountKey: accountConfig.key,
			selectedAccountKey: stored?.selectedAccountKey,
			selectedAccountStreamId: stored?.selectedAccountStreamId,
			selectedQueueId: stored?.selectedQueueId,
			selectedQueueStreamId: stored?.selectedQueueStreamId,
		} satisfies ResolvedStreamerAccount;
		g.__streamerObsPuuids?.set(puuidCacheKey, account.puuid);
		g.__streamerObsAccounts?.set(cacheKey, { data: resolved, expiresAt: Date.now() + ACCOUNT_CACHE_MS });
		await collection.updateOne(
			{ _id: storageId },
			{
				$set: {
					puuid: account.puuid,
					riotId: `${account.gameName}#${account.tagLine}`,
					credential: routing.credential,
					updatedAt: new Date().toISOString(),
				},
				$unset: { overlayKeyId: "" },
			},
			{ upsert: true }
		);
		return resolved;
	};

	const request = (puuid ? getAccountByPuuidForRoute(puuid, routing) : resolveByRiotId())
		.catch(async (error) => {
			if (!(error instanceof RiotApiError) || (error.status !== 400 && error.status !== 404)) throw error;
			return resolveByRiotId();
		})
		.then(persist)
		.finally(() => g.__streamerObsAccountRequests?.delete(cacheKey));
	g.__streamerObsAccountRequests.set(cacheKey, request);
	return request;
}

async function rememberSelectedAccount(config: StreamerConfig, accountKey: string, streamId: string) {
	g.__streamerObsSelectedAccounts ??= new Map();
	const selected = g.__streamerObsSelectedAccounts.get(config.slug);
	if (selected?.accountKey === accountKey && selected.streamId === streamId) return;
	await (await getDb())
		.collection<StreamerAccountDoc>(ACCOUNT_COLLECTION)
		.updateOne({ _id: config.slug }, { $set: { selectedAccountKey: accountKey, selectedAccountStreamId: streamId, updatedAt: new Date().toISOString() } });
	g.__streamerObsSelectedAccounts.set(config.slug, { accountKey, streamId });
}

async function rememberSelectedQueue(config: StreamerConfig, resolvedAccount: ResolvedStreamerAccount, queueId: 420 | 440, streamId: string) {
	g.__streamerObsSelectedQueues ??= new Map();
	const cacheKey = `${config.slug}:${resolvedAccount.accountKey}`;
	const selected = g.__streamerObsSelectedQueues.get(cacheKey);
	if (selected?.queueId === queueId && selected.streamId === streamId) return;
	await (await getDb())
		.collection<StreamerAccountDoc>(ACCOUNT_COLLECTION)
		.updateOne(
			{ _id: accountStorageIdFromKey(config, resolvedAccount.accountKey) },
			{ $set: { selectedQueueId: queueId, selectedQueueStreamId: streamId, updatedAt: new Date().toISOString() } }
		);
	g.__streamerObsSelectedQueues.set(cacheKey, { queueId, streamId });
}

async function clearStreamerSelection(config: StreamerConfig, accounts: ResolvedStreamerAccount[]) {
	const hasSelection =
		g.__streamerObsSelectedAccounts?.has(config.slug) ||
		accounts.some(
			(account) =>
				Boolean(account.selectedAccountKey || account.selectedAccountStreamId || account.selectedQueueId || account.selectedQueueStreamId) ||
				g.__streamerObsSelectedQueues?.has(`${config.slug}:${account.accountKey}`)
		);
	if (!hasSelection) return;

	g.__streamerObsSelectedAccounts?.delete(config.slug);
	for (const account of accounts) {
		g.__streamerObsSelectedQueues?.delete(`${config.slug}:${account.accountKey}`);
		account.selectedAccountKey = undefined;
		account.selectedAccountStreamId = undefined;
		account.selectedQueueId = undefined;
		account.selectedQueueStreamId = undefined;
	}

	await (await getDb()).collection<StreamerAccountDoc>(ACCOUNT_COLLECTION).updateMany(
		{ _id: { $in: accounts.map((account) => accountStorageIdFromKey(config, account.accountKey)) } },
		{
			$unset: {
				selectedAccountKey: "",
				selectedAccountStreamId: "",
				selectedQueueId: "",
				selectedQueueStreamId: "",
			},
		}
	);
}

async function cachedSummoner(puuid: string, routing: RiotRoute): Promise<RiotSummoner> {
	g.__streamerObsSummoners ??= new Map();
	g.__streamerObsSummonerRequests ??= new Map();
	const key = `${routing.credential}:${puuid}`;
	const cached = g.__streamerObsSummoners.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.data;
	const pending = g.__streamerObsSummonerRequests.get(key);
	if (pending) return pending;

	const request = getSummonerByPuuidForRoute(puuid, routing)
		.then((data) => {
			g.__streamerObsSummoners?.set(key, { data, expiresAt: Date.now() + 5 * 60_000 });
			return data;
		})
		.finally(() => g.__streamerObsSummonerRequests?.delete(key));
	g.__streamerObsSummonerRequests.set(key, request);
	return request;
}

async function cachedRankEntries(puuid: string, routing: RiotRoute): Promise<RiotLeagueEntry[]> {
	g.__streamerObsRanks ??= new Map();
	g.__streamerObsRankRequests ??= new Map();
	const key = `${routing.credential}:${puuid}`;
	const cached = g.__streamerObsRanks.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.data;
	const pending = g.__streamerObsRankRequests.get(key);
	if (pending) return pending;

	const request = getLeagueEntriesByPuuidForRoute(puuid, routing)
		.then((data) => {
			g.__streamerObsRanks?.set(key, { data, expiresAt: Date.now() + RANK_CACHE_MS });
			return data;
		})
		.finally(() => g.__streamerObsRankRequests?.delete(key));
	g.__streamerObsRankRequests.set(key, request);
	return request;
}

async function cachedMatchIds(
	puuid: string,
	routing: RiotRoute,
	options: { queueId?: number | null; startedAt?: string } = {}
): Promise<string[]> {
	g.__streamerObsMatchIds ??= new Map();
	g.__streamerObsMatchIdRequests ??= new Map();
	const sessionStartedAt = options.startedAt ? new Date(options.startedAt).getTime() : null;
	const startTime =
		sessionStartedAt !== null
			? Math.max(0, Math.floor(sessionStartedAt / 1000) - SESSION_START_BUFFER_SECONDS)
			: undefined;
	const key = `${routing.credential}:${routing.region}:${puuid}:${options.queueId ?? "ranked"}:${startTime ?? "latest"}`;
	const cached = g.__streamerObsMatchIds.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.data;
	const pending = g.__streamerObsMatchIdRequests.get(key);
	if (pending) return pending;

	const request = getMatchIdsByPuuidForRoute(puuid, routing, {
		...(options.queueId ? { queue: options.queueId } : {}),
		...(startTime !== undefined ? { startTime } : {}),
		count: options.startedAt ? SESSION_MATCH_LIMIT : PREVIEW_MATCH_LIMIT,
		type: "ranked",
	})
		.then((data) => {
			g.__streamerObsMatchIds?.set(key, { data, expiresAt: Date.now() + HISTORY_CACHE_MS });
			return data;
		})
		.finally(() => g.__streamerObsMatchIdRequests?.delete(key));
	g.__streamerObsMatchIdRequests.set(key, request);
	return request;
}

async function mapAvailableMatches(matchIds: string[], routing: RiotRoute) {
	const matches: RiotMatch[] = [];
	let cursor = 0;

	async function worker() {
		while (cursor < matchIds.length) {
			const matchId = matchIds[cursor++];
			try {
				matches.push(await getMatchByIdForRoute(matchId, routing));
			} catch (error) {
				console.warn(`[streamer-obs] Match ${matchId} konnte vorübergehend nicht geladen werden:`, error);
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(3, matchIds.length) }, () => worker()));
	return matches;
}

async function loadSessionGames(puuid: string, routing: RiotRoute, startedAt?: string, queueId?: number | null): Promise<LauchgruenObsGame[]> {
	const matchIds = await cachedMatchIds(puuid, routing, { queueId, startedAt });
	const matches = await mapAvailableMatches(matchIds, routing);
	const sessionStartedAt = startedAt ? new Date(startedAt).getTime() : null;
	return matches
		.map((match) => {
			if (isRiotMatchRemake(match)) return null;
			const participant = match.info.participants.find((entry) => entry.puuid === puuid);
			if (!participant || !RANKED_QUEUE_IDS.has(match.info.queueId) || (queueId && match.info.queueId !== queueId)) return null;
			const endedAtTimestamp = match.info.gameEndTimestamp ?? match.info.gameStartTimestamp ?? match.info.gameCreation;
			// Match-v5 startTime filters by game start. A stream may begin while a
			// match is already running, so session membership must use its end time.
			if (sessionStartedAt !== null && endedAtTimestamp < sessionStartedAt) return null;
			const endedAt = new Date(endedAtTimestamp).toISOString();
			const itemIds = participantInventoryItemIds(participant);
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

async function resolveLiveQueueId(config: StreamerConfig, puuid: string, routing: RiotRoute): Promise<number | null> {
	g.__streamerObsLiveQueues ??= new Map();
	const cacheKey = `${routing.credential}:${config.slug}:${puuid}`;
	const cached = g.__streamerObsLiveQueues.get(cacheKey);
	if (cached?.retryAt && cached.retryAt > Date.now()) return cached.queueId;
	if (cached && Date.now() - cached.fetchedAt < LIVE_QUEUE_CACHE_MS) return cached.queueId;

	g.__streamerObsLiveQueueRequests ??= new Map();
	const pending = g.__streamerObsLiveQueueRequests.get(cacheKey);
	if (pending) return pending;

	const request = (async () => {
		try {
			const activeGame = await getActiveGameByPuuidForRoute(puuid, routing);
			const queueId = activeGame?.gameQueueConfigId ?? null;
			g.__streamerObsLiveQueues?.set(cacheKey, { queueId, fetchedAt: Date.now() });
			return queueId;
		} catch (error) {
			// A transient Riot outage must not flash an active OBS source off-screen.
			if (cached && Date.now() - cached.fetchedAt < LIVE_QUEUE_STALE_MS) {
				g.__streamerObsLiveQueues?.set(cacheKey, {
					queueId: cached.queueId,
					fetchedAt: cached.fetchedAt,
					...(error instanceof RiotApiError && error.status === 429 ? { retryAt: Date.now() + LIVE_QUEUE_RATE_LIMIT_CACHE_MS } : {}),
				});
				return cached.queueId;
			}
			// On a cold start there is no previous queue to reuse. A rate limit should
			// hide the ranked-only source for one refresh instead of failing the API.
			if (error instanceof RiotApiError && error.status === 429) {
				g.__streamerObsLiveQueues?.set(cacheKey, { queueId: null, fetchedAt: Date.now(), retryAt: Date.now() + LIVE_QUEUE_RATE_LIMIT_CACHE_MS });
				return null;
			}
			throw error;
		}
	})().finally(() => g.__streamerObsLiveQueueRequests?.delete(cacheKey));

	g.__streamerObsLiveQueueRequests.set(cacheKey, request);
	return request;
}

async function selectStreamerAccount(config: StreamerConfig, accounts: ResolvedStreamerAccount[], leagueLive: boolean, streamId: string | null) {
	g.__streamerObsSelectedAccounts ??= new Map();
	const primary = accounts.find((entry) => entry.accountKey === "main") ?? accounts[0];
	if (!leagueLive || !streamId) {
		await clearStreamerSelection(config, accounts).catch((error) => {
			console.warn(`[${config.slug}-obs] Veraltete Konto-/Queue-Auswahl konnte nicht zurückgesetzt werden:`, error);
		});
		return { selected: primary, liveQueueId: null };
	}

	const persistedSelection = primary.selectedAccountStreamId === streamId ? primary.selectedAccountKey : undefined;
	const rememberedSelection = g.__streamerObsSelectedAccounts.get(config.slug);
	const rememberedKey = rememberedSelection?.streamId === streamId ? rememberedSelection.accountKey : persistedSelection;

	// Check the account used earlier in this stream first. This avoids probing
	// every alternate account on every refresh while still detecting switches.
	const orderedAccounts = rememberedKey
		? [
				...accounts.filter((entry) => entry.accountKey === rememberedKey),
				...accounts.filter((entry) => entry.accountKey !== rememberedKey),
			]
		: accounts;
	for (const selected of orderedAccounts) {
		const liveQueueId = await resolveLiveQueueId(config, selected.account.puuid, selected.routing);
		if (liveQueueId === null) continue;
		await rememberSelectedAccount(config, selected.accountKey, streamId).catch((error) => {
			console.warn(`[${config.slug}-obs] Aktives Riot-Konto konnte nicht gespeichert werden:`, error);
		});
		return { selected, liveQueueId };
	}

	const selected = accounts.find((entry) => entry.accountKey === rememberedKey) ?? primary;
	return { selected, liveQueueId: null };
}

async function loadGamesAcrossAccounts(accounts: ResolvedStreamerAccount[], startedAt?: string, queueId?: number | null) {
	const games = (await Promise.all(accounts.map((entry) => loadSessionGames(entry.account.puuid, entry.routing, startedAt, queueId)))).flat();
	const uniqueGames = [...new Map(games.map((game) => [game.matchId, game])).values()];
	return uniqueGames.sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
}

async function resolveConfiguredStreamerAccounts(config: StreamerConfig) {
	const [primaryConfig, ...alternateConfigs] = configuredRiotAccounts(config);
	const primary = await cachedAccount(config, primaryConfig);
	const alternates = await Promise.all(
		alternateConfigs.map((accountConfig) =>
			cachedAccount(config, accountConfig).catch((error) => {
				console.warn(`[${config.slug}-obs] Alternatives Riot-Konto ${accountConfig.riotGameName}#${accountConfig.riotTagLine} ist vorübergehend nicht verfügbar:`, error);
				return null;
			})
		)
	);
	return [primary, ...alternates.filter((entry): entry is ResolvedStreamerAccount => entry !== null)];
}

async function buildStreamerObsSnapshot(slug: StreamerConfig["slug"], options: { preview?: boolean } = {}): Promise<LauchgruenObsResponse> {
	const config = STREAMERS[slug];
	const snapshotTtl = config.rankedOnly || config.alternateAccounts?.length ? 20_000 : SNAPSHOT_CACHE_MS;
	const cacheKey = `${slug}:${options.preview ? "preview" : "live"}`;
	const cached = g.__streamerObsSnapshots?.[cacheKey];
	if (cached && cached.expiresAt > Date.now()) return cached.data;

	const updatedAt = new Date().toISOString();
	const [stream, resolvedAccounts] = await Promise.all([getStream(config.twitchLogin), resolveConfiguredStreamerAccounts(config)]);
	const leagueLive = Boolean(stream && stream.gameName.trim().toLowerCase() === "league of legends");
	const { selected: resolvedAccount, liveQueueId: detectedLiveQueueId } = await selectStreamerAccount(config, resolvedAccounts, leagueLive, stream?.id ?? null);
	const { account, routing } = resolvedAccount;
	const [entries, summoner] = await Promise.all([cachedRankEntries(account.puuid, routing), cachedSummoner(account.puuid, routing).catch(() => null)]);
	const currentProfileIconUrl = summoner ? profileIconUrl(summoner.profileIconId) : null;
	const liveQueueId = detectedLiveQueueId ?? (options.preview && config.rankedOnly ? 420 : null);
	const rankedQueueLive = liveQueueId !== null && RANKED_QUEUE_IDS.has(liveQueueId);
	g.__streamerObsSelectedQueues ??= new Map();
	const selectedQueueCacheKey = `${config.slug}:${resolvedAccount.accountKey}`;
	const detectedRankedQueueId: 420 | 440 | null = detectedLiveQueueId === 420 || detectedLiveQueueId === 440 ? detectedLiveQueueId : null;
	if (detectedRankedQueueId !== null && stream) {
		await rememberSelectedQueue(config, resolvedAccount, detectedRankedQueueId, stream.id).catch((error) => {
			console.warn(`[${config.slug}-obs] Aktive Ranked-Queue konnte nicht gespeichert werden:`, error);
		});
	}
	const rememberedQueue = g.__streamerObsSelectedQueues.get(selectedQueueCacheKey);
	const rememberedQueueId = rememberedQueue && rememberedQueue.streamId === stream?.id ? rememberedQueue.queueId : undefined;
	const persistedQueueId = resolvedAccount.selectedQueueStreamId === stream?.id ? resolvedAccount.selectedQueueId : undefined;
	const displayQueueId: 420 | 440 = detectedRankedQueueId ?? rememberedQueueId ?? persistedQueueId ?? 420;
	const currentRank = rankSnapshot(entries, displayQueueId);
	const soloRank = rankSnapshot(entries, 420);
	const flexRank = rankSnapshot(entries, 440);
	// The test view is a visual preview, not an active queue session. Show the
	// latest Ranked games across Solo/Duo and Flex so the history and rotating
	// last-game scene can always be tested while the streamer is offline.
	const previewGames = options.preview ? await loadGamesAcrossAccounts(resolvedAccounts) : [];

	if (!stream) {
		const sessionSummary = summarizeObsSession(previewGames);
		const response: LauchgruenObsResponse = {
			online: false,
			leagueLive: false,
			liveQueueId,
			streamTitle: null,
			streamStartedAt: null,
			streamDurationSeconds: 0,
			viewerCount: 0,
			rank: currentRank,
			soloRank,
			flexRank,
			baselineRank: currentRank,
			lpDelta: 0,
			sessionWins: sessionSummary.wins,
			sessionLosses: sessionSummary.losses,
			winRate: sessionSummary.winRate,
			lastGames: sessionSummary.visibleGames,
			profileIconUrl: currentProfileIconUrl,
			riotId: `${account.gameName}#${account.tagLine}`,
			twitchLogin: config.twitchLogin,
			updatedAt,
			message: options.preview ? "Testmodus: Die letzten Ranked-Games werden angezeigt." : `${config.displayName} ist gerade offline.`,
		};
		g.__streamerObsSnapshots ??= {};
		g.__streamerObsSnapshots[cacheKey] = { data: response, expiresAt: Date.now() + snapshotTtl };
		return response;
	}

	const shouldTrackSession = leagueLive && (!config.rankedOnly || rankedQueueLive);
	const session = shouldTrackSession ? await getOrCreateSession(config, stream.id, stream.startedAt, currentRank, account.puuid) : null;
	// Session W/L describes the whole stream. The displayed rank may follow the
	// current Solo/Duo or Flex queue, but changing queues must not erase games.
	const games = options.preview ? previewGames : shouldTrackSession ? await loadGamesAcrossAccounts(resolvedAccounts, stream.startedAt) : [];
	const sessionSummary = summarizeObsSession(games);

	const response: LauchgruenObsResponse = {
		online: true,
		leagueLive,
		liveQueueId,
		streamTitle: stream.title,
		streamStartedAt: stream.startedAt,
		streamDurationSeconds: Math.max(0, Math.floor((Date.now() - new Date(stream.startedAt).getTime()) / 1000)),
		viewerCount: stream.viewerCount,
		rank: currentRank,
		soloRank,
		flexRank,
		baselineRank: session?.baselineRank ?? currentRank,
		lpDelta: currentRank && session?.baselineRank ? currentRank.score - session.baselineRank.score : 0,
		sessionWins: sessionSummary.wins,
		sessionLosses: sessionSummary.losses,
		winRate: sessionSummary.winRate,
		lastGames: sessionSummary.visibleGames,
		profileIconUrl: currentProfileIconUrl,
		riotId: `${account.gameName}#${account.tagLine}`,
		twitchLogin: config.twitchLogin,
		updatedAt,
		message: !leagueLive
			? `Live, aber aktuell in Kategorie "${stream.gameName}".`
			: config.rankedOnly && !rankedQueueLive
				? "Das Overlay erscheint nur in Solo/Duo oder Ranked Flex."
				: undefined,
	};
	g.__streamerObsSnapshots ??= {};
	g.__streamerObsSnapshots[cacheKey] = { data: response, expiresAt: Date.now() + snapshotTtl };
	return response;
}

export async function getStreamerObsSnapshot(slug: StreamerConfig["slug"], options: { preview?: boolean } = {}): Promise<LauchgruenObsResponse> {
	const cacheKey = `${slug}:${options.preview ? "preview" : "live"}`;
	const cached = g.__streamerObsSnapshots?.[cacheKey];
	if (cached && cached.expiresAt > Date.now()) return cached.data;

	g.__streamerObsRequests ??= new Map();
	const pending = g.__streamerObsRequests.get(cacheKey);
	if (pending) return pending;

	const request = buildStreamerObsSnapshot(slug, options)
		.catch((error) => {
			const stale = g.__streamerObsSnapshots?.[cacheKey]?.data;
			if (stale && isTransientSnapshotError(error)) {
				return {
					...stale,
					message: "Externer Dienst kurzzeitig nicht erreichbar. Der letzte gültige Stand bleibt sichtbar.",
				};
			}
			if (isTransientSnapshotError(error)) {
				const config = STREAMERS[slug];
				const fallback = emptySnapshot(config, error);
				g.__streamerObsSnapshots ??= {};
				g.__streamerObsSnapshots[cacheKey] = { data: fallback, expiresAt: Date.now() + 15_000 };
				return fallback;
			}
			throw error;
		})
		.finally(() => g.__streamerObsRequests?.delete(cacheKey));
	g.__streamerObsRequests.set(cacheKey, request);
	return request;
}

function isTransientSnapshotError(error: unknown) {
	if (error instanceof RiotApiError) return error.status === 429 || error.status >= 500;
	return error instanceof TypeError && /fetch failed|timeout/i.test(error.message);
}

function emptySnapshot(config: StreamerConfig, error: unknown): LauchgruenObsResponse {
	return {
		online: false,
		leagueLive: false,
		liveQueueId: null,
		streamTitle: null,
		streamStartedAt: null,
		streamDurationSeconds: 0,
		viewerCount: 0,
		rank: null,
		baselineRank: null,
		lpDelta: 0,
		sessionWins: 0,
		sessionLosses: 0,
		winRate: 0,
		lastGames: [],
		profileIconUrl: null,
		riotId: `${config.riotGameName}#${config.riotTagLine}`,
		twitchLogin: config.twitchLogin,
		updatedAt: new Date().toISOString(),
		message:
			error instanceof RiotApiError && error.status === 429
				? "Riot-Limit kurzzeitig ausgelastet. Neuer Versuch folgt automatisch."
				: "Externer Dienst kurzzeitig nicht erreichbar.",
	};
}

export async function getLauchgruenObsSnapshot(): Promise<LauchgruenObsResponse> {
	return getStreamerObsSnapshot("lauchgruen");
}
