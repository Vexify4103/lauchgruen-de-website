/**
 * Minimal Riot API helpers for tournament verification and OBS overlays.
 *
 * Important: Riot PUUID values are credential scoped. Resolve a Riot ID and
 * consume the returned PUUID with the same RiotApiCredential.
 */

export class RiotApiError extends Error {
	public readonly status: number;
	public readonly endpoint: string;
	public readonly credential: RiotApiCredential;
	public readonly detail: string;

	constructor(status: number, endpoint: string, message: string, credential: RiotApiCredential = "tournament", detail = "") {
		super(message);
		this.name = "RiotApiError";
		this.status = status;
		this.endpoint = endpoint;
		this.credential = credential;
		this.detail = detail;
	}
}

export type RiotApiCredential = "tournament" | "obs_public" | "obs_lauchgruen" | "obs_akuma" | "obs_happygiganto" | "obs_hippokrate" | "obs_n4cht4r4" | "obs_nachtdienst";

export type ObsRiotCredential = Exclude<RiotApiCredential, "tournament">;

export const OBS_RIOT_CREDENTIALS = {
	public: "obs_public",
	lauchgruen: "obs_lauchgruen",
	akuma: "obs_akuma",
	happygiganto: "obs_happygiganto",
	hippokrate: "obs_hippokrate",
	n4cht4r4: "obs_n4cht4r4",
	nachtdienst: "obs_nachtdienst",
} as const satisfies Record<string, ObsRiotCredential>;

export type ObsOverlayName = keyof typeof OBS_RIOT_CREDENTIALS;

type RiotKeyState = {
	requestTimestamps: number[];
	blockedUntil: number;
};

type RiotServiceState = {
	blockedUntil: number;
	lastRequestAt: number;
};

const SHORT_WINDOW_MS = 1_000;
// Keep headroom for Riot's stricter per-method limits and parallel app instances.
const SHORT_WINDOW_LIMIT = 10;
const LONG_WINDOW_MS = 120_000;
const LONG_WINDOW_LIMIT = 80;
const MAX_RATE_LIMIT_WAIT_MS = 5_000;
const DEFAULT_RIOT_BACKOFF_MS = 10_000;
const SERVER_RATE_LIMIT_BACKOFF_MS = 60_000;
const SPECTATOR_REQUEST_SPACING_MS = 1_500;
const RIOT_RATE_STATE_VERSION = 4;

const riotRateState = globalThis as unknown as {
	__riotCredentialGates?: Map<RiotApiCredential, Promise<void>>;
	__riotCredentialKeyState?: Map<RiotApiCredential, RiotKeyState>;
	__riotServiceGates?: Map<string, Promise<void>>;
	__riotServiceState?: Map<string, RiotServiceState>;
	__riotRateStateVersion?: number;
};

if (riotRateState.__riotRateStateVersion !== RIOT_RATE_STATE_VERSION) {
	riotRateState.__riotCredentialGates = new Map();
	riotRateState.__riotCredentialKeyState = new Map();
	riotRateState.__riotServiceGates = new Map();
	riotRateState.__riotServiceState = new Map();
	riotRateState.__riotRateStateVersion = RIOT_RATE_STATE_VERSION;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObsCredential(credential: RiotApiCredential): credential is ObsRiotCredential {
	return credential.startsWith("obs_");
}

function obsServiceKey(url: URL) {
	return url.pathname.startsWith("/lol/spectator/") ? `${url.hostname}:spectator` : null;
}

function getServiceState(serviceKey: string): RiotServiceState {
	riotRateState.__riotServiceState ??= new Map();
	let state = riotRateState.__riotServiceState.get(serviceKey);
	if (!state) {
		state = { blockedUntil: 0, lastRequestAt: 0 };
		riotRateState.__riotServiceState.set(serviceKey, state);
	}
	return state;
}

async function paceObsServiceRequest(serviceKey: string): Promise<void> {
	riotRateState.__riotServiceGates ??= new Map();
	const gates = riotRateState.__riotServiceGates;
	const previous = gates.get(serviceKey) ?? Promise.resolve();
	const gate = previous.then(async () => {
		const state = getServiceState(serviceKey);
		const now = Date.now();
		if (state.blockedUntil > now) {
			const waitMs = state.blockedUntil - now;
			if (waitMs > MAX_RATE_LIMIT_WAIT_MS) {
				throw new RiotApiError(
					429,
					`riot://${serviceKey}/rate-limit`,
					"Der Riot-Spectator-Dienst ist vorübergehend ausgelastet.",
					"obs_public",
					"server rate limit cooldown"
				);
			}
			await delay(waitMs);
		}

		const spacingWaitMs = SPECTATOR_REQUEST_SPACING_MS - (Date.now() - state.lastRequestAt);
		if (spacingWaitMs > 0) await delay(spacingWaitMs);
		state.lastRequestAt = Date.now();
	});

	gates.set(
		serviceKey,
		gate.catch(() => undefined)
	);
	await gate;
}

function getCredentialState(credential: RiotApiCredential): RiotKeyState {
	riotRateState.__riotCredentialKeyState ??= new Map();

	let state = riotRateState.__riotCredentialKeyState.get(credential);
	if (!state) {
		state = { requestTimestamps: [], blockedUntil: 0 };
		riotRateState.__riotCredentialKeyState.set(credential, state);
	}

	return state;
}

async function paceObsRequest(credential: ObsRiotCredential): Promise<void> {
	riotRateState.__riotCredentialGates ??= new Map();
	const gates = riotRateState.__riotCredentialGates;
	const previous = gates.get(credential) ?? Promise.resolve();

	const gate = previous.then(async () => {
		const state = getCredentialState(credential);
		const nowBeforeBlock = Date.now();

		if (state.blockedUntil > nowBeforeBlock) {
			const waitMs = state.blockedUntil - nowBeforeBlock;

			if (waitMs > MAX_RATE_LIMIT_WAIT_MS) {
				throw new RiotApiError(
					429,
					`riot://${credential}/rate-limit`,
					`Das Riot-Rate-Limit für "${credential}" ist gerade ausgelastet. Bitte gleich erneut versuchen.`,
					credential
				);
			}

			await delay(waitMs);
		}

		let now = Date.now();
		state.requestTimestamps = state.requestTimestamps.filter((timestamp) => now - timestamp < LONG_WINDOW_MS);

		for (;;) {
			now = Date.now();
			const withinShort = state.requestTimestamps.filter((timestamp) => now - timestamp < SHORT_WINDOW_MS);
			const withinLong = state.requestTimestamps;
			let waitMs = 0;

			if (withinShort.length >= SHORT_WINDOW_LIMIT) {
				waitMs = Math.max(waitMs, SHORT_WINDOW_MS - (now - withinShort[0]));
			}

			if (withinLong.length >= LONG_WINDOW_LIMIT) {
				waitMs = Math.max(waitMs, LONG_WINDOW_MS - (now - withinLong[0]));
			}

			if (waitMs <= 0) break;

			if (waitMs > MAX_RATE_LIMIT_WAIT_MS) {
				throw new RiotApiError(
					429,
					`riot://${credential}/rate-limit`,
					`Das Riot-Rate-Limit für "${credential}" ist gerade ausgelastet. Bitte gleich erneut versuchen.`,
					credential
				);
			}

			await delay(waitMs + 5);
			state.requestTimestamps = state.requestTimestamps.filter((timestamp) => Date.now() - timestamp < LONG_WINDOW_MS);
		}

		state.requestTimestamps.push(Date.now());
	});

	gates.set(
		credential,
		gate.catch(() => undefined)
	);
	await gate;
}

const RIOT_API_KEY_ENV_NAMES = {
	tournament: "RIOT_API_KEY_TOURNAMENT",
	obs_public: "RIOT_API_KEY_OBS_PUBLIC",
	obs_lauchgruen: "RIOT_API_KEY_OBS_LAUCHGRUEN",
	obs_akuma: "RIOT_API_KEY_OBS_AKUMA",
	obs_happygiganto: "RIOT_API_KEY_OBS_HAPPYGIGANTO",
	obs_hippokrate: "RIOT_API_KEY_OBS_HIPPOKRATE",
	obs_n4cht4r4: "RIOT_API_KEY_OBS_N4CHT4R4",
	obs_nachtdienst: "RIOT_API_KEY_OBS_NACHTDIENST",
} as const satisfies Record<RiotApiCredential, string>;

function configuredRiotApiKeys(): Record<RiotApiCredential, string | undefined> {
	return {
		tournament: process.env.RIOT_API_KEY_TOURNAMENT,
		obs_public: process.env.RIOT_API_KEY_OBS_PUBLIC,
		obs_lauchgruen: process.env.RIOT_API_KEY_OBS_LAUCHGRUEN,
		obs_akuma: process.env.RIOT_API_KEY_OBS_AKUMA,
		obs_happygiganto: process.env.RIOT_API_KEY_OBS_HAPPYGIGANTO,
		obs_hippokrate: process.env.RIOT_API_KEY_OBS_HIPPOKRATE,
		obs_n4cht4r4: process.env.RIOT_API_KEY_OBS_N4CHT4R4,
		obs_nachtdienst: process.env.RIOT_API_KEY_OBS_NACHTDIENST,
	};
}

function apiKey(credential: RiotApiCredential): string {
	const key = configuredRiotApiKeys()[credential]?.trim();

	if (!key) {
		throw new Error(`${RIOT_API_KEY_ENV_NAMES[credential]} fehlt.`);
	}

	return key;
}

function platform(): string {
	return process.env.RIOT_PLATFORM?.trim() || "EUW1";
}

function region(): string {
	return process.env.RIOT_REGION?.trim() || "europe";
}

export type RiotRoute = {
	platform: string;
	region: string;
	credential: RiotApiCredential;
};

export type ObsRiotRoute = Omit<RiotRoute, "credential"> & {
	credential: ObsRiotCredential;
};

const RIOT_ROUTE_BASES = {
	euw1: { platform: "euw1", region: "europe" },
	eun1: { platform: "eun1", region: "europe" },
	na1: { platform: "na1", region: "americas" },
	kr: { platform: "kr", region: "asia" },
	br1: { platform: "br1", region: "americas" },
	la1: { platform: "la1", region: "americas" },
	la2: { platform: "la2", region: "americas" },
	oc1: { platform: "oc1", region: "sea" },
	jp1: { platform: "jp1", region: "asia" },
	tr1: { platform: "tr1", region: "europe" },
} as const;

export type RiotRouteKey = keyof typeof RIOT_ROUTE_BASES;

export function riotRoute(value?: string, credential: RiotApiCredential = "tournament"): RiotRoute {
	const routeKey = (value?.trim() || platform()).toLowerCase() as RiotRouteKey;
	const base = RIOT_ROUTE_BASES[routeKey] ?? RIOT_ROUTE_BASES.euw1;

	return {
		...base,
		credential,
	};
}

export function obsRiotRoute(value: string | undefined, overlay: ObsOverlayName): ObsRiotRoute {
	const credential = OBS_RIOT_CREDENTIALS[overlay];
	const routing = riotRoute(value, credential);

	return {
		platform: routing.platform,
		region: routing.region,
		credential,
	};
}

export function getRiotOverlayDiagnostics() {
	const now = Date.now();
	const configuredKeys = configuredRiotApiKeys();
	const credentials = Object.values(OBS_RIOT_CREDENTIALS);
	const configuredCredentials = credentials.filter((credential) => Boolean(configuredKeys[credential]?.trim()));

	return {
		configuredKeys: configuredCredentials.length,
		availableKeys: configuredCredentials.filter((credential) => getCredentialState(credential).blockedUntil <= now).length,
		blockedKeys: configuredCredentials.filter((credential) => getCredentialState(credential).blockedUntil > now).length,
		requestsLastSecond: configuredCredentials.reduce(
			(total, credential) => total + getCredentialState(credential).requestTimestamps.filter((timestamp) => now - timestamp < SHORT_WINDOW_MS).length,
			0
		),
		requestsLastTwoMinutes: configuredCredentials.reduce(
			(total, credential) => total + getCredentialState(credential).requestTimestamps.filter((timestamp) => now - timestamp < LONG_WINDOW_MS).length,
			0
		),
		credentials: credentials.map((credential) => {
			const state = getCredentialState(credential);
			return {
				credential,
				configured: Boolean(configuredKeys[credential]?.trim()),
				blockedUntil: state.blockedUntil || null,
				requestsLastSecond: state.requestTimestamps.filter((timestamp) => now - timestamp < SHORT_WINDOW_MS).length,
				requestsLastTwoMinutes: state.requestTimestamps.filter((timestamp) => now - timestamp < LONG_WINDOW_MS).length,
			};
		}),
	};
}

type RiotGetOptions = {
	forceFresh?: boolean;
	operation?: string;
	expectedStatuses?: readonly number[];
};

async function riotGet<T>(url: string, credential: RiotApiCredential, options: RiotGetOptions = {}): Promise<T> {
	const requestUrl = new URL(url);
	const key = apiKey(credential);
	const serviceKey = isObsCredential(credential) ? obsServiceKey(requestUrl) : null;

	if (isObsCredential(credential)) {
		if (serviceKey) await paceObsServiceRequest(serviceKey);
		await paceObsRequest(credential);
	}

	const fetchOptions: RequestInit & { next: { revalidate: number } } = {
		headers: {
			"X-Riot-Token": key,
			...(options.forceFresh
				? {
						"Cache-Control": "no-cache, no-store, max-age=0",
						Pragma: "no-cache",
					}
				: {}),
		},
		cache: "no-store",
		next: { revalidate: 0 },
	};

	const response = await fetch(requestUrl, fetchOptions);

	if (response.ok) {
		return (await response.json()) as T;
	}

	const rawBody = await response.text();
	let detail = rawBody;

	try {
		const body = JSON.parse(rawBody) as {
			status?: {
				status_code?: number;
				message?: string;
			};
		};
		detail = body.status?.message ?? rawBody;
	} catch {
		// Riot did not return JSON.
	}

	let rateLimitBackoffMs = 0;
	if (isObsCredential(credential) && response.status === 429) {
		const state = getCredentialState(credential);
		const retryAfterSeconds = Number(response.headers.get("Retry-After"));
		const fallbackBackoffMs = detail.toLowerCase().includes("server rate limit") ? SERVER_RATE_LIMIT_BACKOFF_MS : DEFAULT_RIOT_BACKOFF_MS;
		rateLimitBackoffMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1_000 : fallbackBackoffMs;
		state.blockedUntil = Math.max(state.blockedUntil, Date.now() + rateLimitBackoffMs);

		const rateLimitType = response.headers.get("X-Rate-Limit-Type")?.toLowerCase();
		const serviceLimited = rateLimitType === "service" || (!rateLimitType && detail.toLowerCase().includes("server rate limit"));
		if (serviceLimited && serviceKey) {
			const serviceState = getServiceState(serviceKey);
			serviceState.blockedUntil = Math.max(serviceState.blockedUntil, Date.now() + rateLimitBackoffMs);
		}
	}

	const expectedStatus = options.expectedStatuses?.includes(response.status) ?? false;

	if (!expectedStatus) {
		if (response.status === 429) {
			console.warn("[riot] request throttled", {
				operation: options.operation ?? "unknown",
				credential,
				detail,
				retryAfterSeconds: Math.ceil(rateLimitBackoffMs / 1_000),
			});
		} else {
			console.error("[riot] request failed", {
				operation: options.operation ?? "unknown",
				credential,
				status: response.status,
				statusText: response.statusText,
				endpoint: requestUrl.toString(),
				detail,
				rawBody,
			});
		}
	}

	const decryptFailure = response.status === 400 && detail.toLowerCase().includes("decrypt");

	const message =
		response.status === 401 || response.status === 403
			? `Riot-API-Key "${credential}" ist ungültig oder abgelaufen.`
			: decryptFailure
				? `Die Riot-Kennung gehört nicht zum API-Zugang "${credential}" oder ist ungültig. Sie muss mit diesem Zugang neu aufgelöst werden.`
				: response.status === 404
					? "Riot-Account nicht gefunden."
					: response.status === 429
						? `Riot-Rate-Limit für "${credential}" erreicht. Kurz warten und erneut versuchen.`
						: `Riot-API-Fehler ${response.status}${detail ? `: ${detail}` : ""}`;

	throw new RiotApiError(response.status, requestUrl.toString(), message, credential, detail);
}

export type RiotAccount = {
	puuid: string;
	gameName: string;
	tagLine: string;
};

export type RiotSummoner = {
	puuid: string;
	profileIconId: number;
	summonerLevel: number;
	revisionDate: number;
};

export type RiotLeagueEntry = {
	queueType: string;
	tier: string;
	rank: string;
	leaguePoints: number;
	wins: number;
	losses: number;
};

export type RiotApexLeague = {
	tier: string;
	queue: string;
	entries: Array<{
		puuid: string;
		leaguePoints: number;
		rank: string;
		wins: number;
		losses: number;
	}>;
};

export type RiotMatchParticipant = {
	puuid: string;
	teamId?: number;
	gameEndedInEarlySurrender?: boolean;
	championId: number;
	championName: string;
	riotIdGameName?: string;
	riotIdTagline?: string;
	win: boolean;
	kills: number;
	deaths: number;
	assists: number;
	totalMinionsKilled: number;
	neutralMinionsKilled: number;
	goldEarned: number;
	item0: number;
	item1: number;
	item2: number;
	item3: number;
	item4: number;
	item5: number;
	item6: number;
};

const TRINKET_ITEM_IDS = new Set([3330, 3340, 3341, 3342, 3363, 3364, 3513]);

export function participantInventoryItemIds(participant: RiotMatchParticipant) {
	return [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5, participant.item6].filter(
		(itemId) => itemId > 0 && !TRINKET_ITEM_IDS.has(itemId)
	);
}

export type RiotMatch = {
	metadata: {
		matchId: string;
		participants: string[];
	};
	info: {
		gameVersion: string;
		gameCreation: number;
		gameStartTimestamp?: number;
		gameEndTimestamp?: number;
		endOfGameResult?: string;
		gameDuration: number;
		gameMode: string;
		gameType: string;
		queueId: number;
		participants: RiotMatchParticipant[];
	};
};

export function isRiotMatchRemake(match: RiotMatch): boolean {
	if (match.info.participants.some((participant) => participant.gameEndedInEarlySurrender === true)) {
		return true;
	}

	if (match.info.gameDuration <= 0 || match.info.gameDuration >= 5 * 60) {
		return false;
	}

	const completedNormally = match.info.endOfGameResult?.toLowerCase() === "gamecomplete";
	const hasWinner = match.info.participants.some((participant) => participant.win === true);
	return !completedNormally || !hasWinner;
}

export type RiotActiveGame = {
	gameId: number;
	gameLength: number;
	gameStartTime: number;
	gameMode: string;
	gameQueueConfigId: number;
	participants: Array<{
		puuid: string;
		teamId: number;
		championId: number;
		riotId?: string;
		spell1Id: number;
		spell2Id: number;
	}>;
};

const riotCache = globalThis as unknown as {
	__riotMatchCache?: Map<string, RiotMatch>;
	__riotMatchRequests?: Map<string, Promise<RiotMatch>>;
};

export function parseRiotId(raw: string): { gameName: string; tagLine: string } {
	const trimmed = raw.trim();
	const hashIndex = trimmed.lastIndexOf("#");

	if (hashIndex <= 0 || hashIndex === trimmed.length - 1) {
		throw new Error("Riot-ID muss im Format Name#TAG vorliegen.");
	}

	const gameName = trimmed.slice(0, hashIndex).trim();
	const tagLine = trimmed.slice(hashIndex + 1).trim();

	if (!gameName || !tagLine) {
		throw new Error("Riot-ID muss im Format Name#TAG vorliegen.");
	}

	return { gameName, tagLine };
}

export async function getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount> {
	const url = `https://${region()}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
	return riotGet<RiotAccount>(url, "tournament", { operation: "getAccountByRiotId" });
}

export async function getAccountByRiotIdForRoute(gameName: string, tagLine: string, routing: RiotRoute): Promise<RiotAccount> {
	const url = `https://${routing.region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
	return riotGet<RiotAccount>(url, routing.credential, { operation: "getAccountByRiotIdForRoute" });
}

export async function getAccountByPuuidForRoute(puuid: string, routing: RiotRoute): Promise<RiotAccount> {
	const url = `https://${routing.region}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`;
	return riotGet<RiotAccount>(url, routing.credential, { operation: "getAccountByPuuidForRoute" });
}

export async function getAccountByPuuid(puuid: string): Promise<RiotAccount> {
	const url = `https://${region()}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`;
	return riotGet<RiotAccount>(url, "tournament", { operation: "getAccountByPuuid" });
}

export async function getSummonerByPuuid(puuid: string, options: { forceFresh?: boolean } = {}): Promise<RiotSummoner> {
	const url = `https://${platform()}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
	return riotGet<RiotSummoner>(url, "tournament", {
		forceFresh: options.forceFresh,
		operation: "getSummonerByPuuid",
	});
}

export async function getSummonerByPuuidForRoute(puuid: string, routing: RiotRoute): Promise<RiotSummoner> {
	const url = `https://${routing.platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
	return riotGet<RiotSummoner>(url, routing.credential, { operation: "getSummonerByPuuidForRoute" });
}

export async function getLeagueEntriesByPuuid(puuid: string): Promise<RiotLeagueEntry[]> {
	const url = `https://${platform()}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;

	try {
		return await riotGet<RiotLeagueEntry[]>(url, "tournament", { operation: "getLeagueEntriesByPuuid" });
	} catch (error) {
		if (error instanceof RiotApiError && error.status === 404) return [];
		throw error;
	}
}

export async function getLeagueEntriesByPuuidForRoute(puuid: string, routing: RiotRoute): Promise<RiotLeagueEntry[]> {
	const url = `https://${routing.platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;

	try {
		return await riotGet<RiotLeagueEntry[]>(url, routing.credential, { operation: "getLeagueEntriesByPuuidForRoute" });
	} catch (error) {
		if (error instanceof RiotApiError && error.status === 404) return [];
		throw error;
	}
}

export async function getChallengerLeagueForRoute(routing: RiotRoute): Promise<RiotApexLeague> {
	const url = `https://${routing.platform}.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5`;
	return riotGet<RiotApexLeague>(url, routing.credential, { operation: "getChallengerLeagueForRoute" });
}

export async function getGrandmasterLeagueForRoute(routing: RiotRoute): Promise<RiotApexLeague> {
	const url = `https://${routing.platform}.api.riotgames.com/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5`;
	return riotGet<RiotApexLeague>(url, routing.credential, { operation: "getGrandmasterLeagueForRoute" });
}

export async function getMatchIdsByPuuid(
	puuid: string,
	input: { startTime?: number; count?: number; type?: "ranked" | "normal" | "tourney" | "tutorial" } = {}
): Promise<string[]> {
	const params = new URLSearchParams({
		start: "0",
		count: String(Math.min(Math.max(input.count ?? 20, 1), 100)),
	});

	if (input.startTime) params.set("startTime", String(input.startTime));
	if (input.type) params.set("type", input.type);

	const url = `https://${region()}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`;
	return riotGet<string[]>(url, "tournament", { operation: "getMatchIdsByPuuid" });
}

export async function getMatchById(matchId: string): Promise<RiotMatch> {
	riotCache.__riotMatchCache ??= new Map();
	riotCache.__riotMatchRequests ??= new Map();

	const cacheKey = `tournament:${region()}:${matchId}`;
	const cached = riotCache.__riotMatchCache.get(cacheKey);
	if (cached) return cached;

	const pending = riotCache.__riotMatchRequests.get(cacheKey);
	if (pending) return pending;

	const url = `https://${region()}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
	const request = riotGet<RiotMatch>(url, "tournament", { operation: "getMatchById" })
		.then((match) => {
			riotCache.__riotMatchCache?.set(cacheKey, match);

			if ((riotCache.__riotMatchCache?.size ?? 0) > 500) {
				const oldest = riotCache.__riotMatchCache?.keys().next().value;
				if (oldest) riotCache.__riotMatchCache?.delete(oldest);
			}

			return match;
		})
		.finally(() => riotCache.__riotMatchRequests?.delete(cacheKey));

	riotCache.__riotMatchRequests.set(cacheKey, request);
	return request;
}

export async function getMatchIdsByPuuidForRoute(
	puuid: string,
	routing: RiotRoute,
	input: { startTime?: number; count?: number; queue?: number; type?: "ranked" | "normal" | "tourney" | "tutorial" } = {}
): Promise<string[]> {
	const params = new URLSearchParams({
		start: "0",
		count: String(Math.min(Math.max(input.count ?? 20, 1), 100)),
	});

	if (input.startTime) params.set("startTime", String(input.startTime));
	if (input.queue) params.set("queue", String(input.queue));
	if (input.type) params.set("type", input.type);

	const url = `https://${routing.region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`;
	return riotGet<string[]>(url, routing.credential, { operation: "getMatchIdsByPuuidForRoute" });
}

export async function getMatchByIdForRoute(matchId: string, routing: RiotRoute): Promise<RiotMatch> {
	const cacheKey = `${routing.credential}:${routing.region}:${matchId}`;
	riotCache.__riotMatchCache ??= new Map();
	riotCache.__riotMatchRequests ??= new Map();

	const cached = riotCache.__riotMatchCache.get(cacheKey);
	if (cached) return cached;

	const pending = riotCache.__riotMatchRequests.get(cacheKey);
	if (pending) return pending;

	const url = `https://${routing.region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
	const request = riotGet<RiotMatch>(url, routing.credential, { operation: "getMatchByIdForRoute" })
		.then((match) => {
			riotCache.__riotMatchCache?.set(cacheKey, match);

			if ((riotCache.__riotMatchCache?.size ?? 0) > 500) {
				const oldest = riotCache.__riotMatchCache?.keys().next().value;
				if (oldest) riotCache.__riotMatchCache?.delete(oldest);
			}

			return match;
		})
		.finally(() => riotCache.__riotMatchRequests?.delete(cacheKey));

	riotCache.__riotMatchRequests.set(cacheKey, request);
	return request;
}

export async function getActiveGameByPuuidForRoute(puuid: string, routing: RiotRoute): Promise<RiotActiveGame | null> {
	const url = `https://${routing.platform}.api.riotgames.com` + `/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`;

	try {
		return await riotGet<RiotActiveGame>(url, routing.credential, {
			operation: "getActiveGameByPuuidForRoute",
			// Both outcomes are handled by the overlay cache. A temporary
			// Spectator-service throttle is expected and should not spam logs.
			expectedStatuses: [404, 429],
		});
	} catch (error) {
		if (error instanceof RiotApiError && error.status === 404) {
			return null;
		}

		throw error;
	}
}

/**
 * Icons 0–28 are the original default summoner icons available to every account.
 */
export const DEFAULT_ICON_POOL: number[] = Array.from({ length: 29 }, (_, index) => index);

export function pickChallengeIcon(excludeIconId: number): number {
	const pool = DEFAULT_ICON_POOL.filter((id) => id !== excludeIconId);
	return pool[Math.floor(Math.random() * pool.length)];
}

export function profileIconUrl(iconId: number): string {
	return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;
}

export function championIconUrl(championId: number): string {
	return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;
}

export function itemIconUrl(itemId: number, gameVersion: string): string {
	const version = `${gameVersion.split(".").slice(0, 2).join(".")}.1`;
	return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

export function formatRank(entries: RiotLeagueEntry[]): string | null {
	const solo = entries.find((entry) => entry.queueType === "RANKED_SOLO_5x5");
	const flex = entries.find((entry) => entry.queueType === "RANKED_FLEX_SR");
	const chosen = solo ?? flex;

	if (!chosen) return null;
	return `${chosen.tier} ${chosen.rank} (${chosen.leaguePoints} LP)`;
}
