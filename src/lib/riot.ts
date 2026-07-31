/**
 * Minimal Riot API helpers for tournament-application Riot ID verification.
 * Only the endpoints we actually need: account-v1, summoner-v4, league-v4.
 */

export class RiotApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly endpoint: string,
		message: string
	) {
		super(message);
		this.name = "RiotApiError";
	}
}

type RiotApiCredential = "tournament" | "overlay";

type OverlayKeyState = {
	requestTimestamps: number[]; // rolling log of request times, for sliding-window limits
	blockedUntil: number;
};

const SHORT_WINDOW_MS = 1_000;
const SHORT_WINDOW_LIMIT = 20;
const LONG_WINDOW_MS = 120_000;
const LONG_WINDOW_LIMIT = 100;
const MAX_OVERLAY_WAIT_MS = 5_000;
const OVERLAY_RATE_STATE_VERSION = 2;

const overlayRateState = globalThis as unknown as {
	__riotOverlayGates?: Map<string, Promise<void>>;
	__riotOverlayKeyState?: Map<string, OverlayKeyState>;
	__riotOverlayRateStateVersion?: number;
};

if (overlayRateState.__riotOverlayRateStateVersion !== OVERLAY_RATE_STATE_VERSION) {
	overlayRateState.__riotOverlayGates = new Map();
	overlayRateState.__riotOverlayKeyState = new Map();
	overlayRateState.__riotOverlayRateStateVersion = OVERLAY_RATE_STATE_VERSION;
}

function delay(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getOverlayKeyState(key: string): OverlayKeyState {
	overlayRateState.__riotOverlayKeyState ??= new Map();
	let state = overlayRateState.__riotOverlayKeyState.get(key);
	if (!state) {
		state = { requestTimestamps: [], blockedUntil: 0 };
		overlayRateState.__riotOverlayKeyState.set(key, state);
	}
	return state;
}

async function paceOverlayRequest(key: string) {
	overlayRateState.__riotOverlayGates ??= new Map();
	const gates = overlayRateState.__riotOverlayGates;
	const previous = gates.get(key) ?? Promise.resolve();
	const gate = previous.then(async () => {
		const state = getOverlayKeyState(key);

		// Wait out any active block (429/401/403 cooldown) first.
		const now0 = Date.now();
		if (state.blockedUntil > now0) {
			const waitMs = state.blockedUntil - now0;
			if (waitMs > MAX_OVERLAY_WAIT_MS) {
				throw new RiotApiError(429, "riot://overlay-rate-limit", "Alle Riot-Overlay-Keys sind vorübergehend ausgelastet. Bitte gleich erneut versuchen.");
			}
			await delay(waitMs);
		}

		// Drop timestamps outside the long window — they no longer count against either limit.
		let now = Date.now();
		state.requestTimestamps = state.requestTimestamps.filter((t) => now - t < LONG_WINDOW_MS);

		// Check both windows; wait for whichever is currently the binding constraint.
		for (;;) {
			now = Date.now();
			const withinShort = state.requestTimestamps.filter((t) => now - t < SHORT_WINDOW_MS);
			const withinLong = state.requestTimestamps; // already pruned to long window

			let waitMs = 0;
			if (withinShort.length >= SHORT_WINDOW_LIMIT) {
				waitMs = Math.max(waitMs, SHORT_WINDOW_MS - (now - withinShort[0]));
			}
			if (withinLong.length >= LONG_WINDOW_LIMIT) {
				waitMs = Math.max(waitMs, LONG_WINDOW_MS - (now - withinLong[0]));
			}

			if (waitMs <= 0) break;
			if (waitMs > MAX_OVERLAY_WAIT_MS) {
				throw new RiotApiError(429, "riot://overlay-rate-limit", "Das Riot-Overlay-Limit ist gerade ausgelastet. Bitte gleich erneut versuchen.");
			}
			await delay(waitMs + 5); // small buffer to avoid boundary races
			state.requestTimestamps = state.requestTimestamps.filter((t) => Date.now() - t < LONG_WINDOW_MS);
		}

		state.requestTimestamps.push(Date.now());
	});
	gates.set(
		key,
		gate.catch(() => undefined)
	);
	await gate;
}

let overlayApiKeyIndex = 0;

function apiKey(credential: RiotApiCredential, overlayKeyId?: string): string {
	if (credential === "overlay") {
		if (overlayKeyId) {
			const pinned = overlayApiKeys.find((key) => overlayKeyIdentifier(key) === overlayKeyId);
			if (!pinned) throw new Error("Der diesem Overlay zugeordnete Riot-API-Key ist nicht mehr konfiguriert.");
			return pinned;
		}
		return nextOverlayApiKey();
	}

	const key = process.env.RIOT_API_KEY?.trim();

	if (!key) {
		throw new Error("RIOT_API_KEY fehlt.");
	}

	return key;
}

function parseApiKeys(value: string | undefined): string[] {
	return [
		...new Set(
			(value ?? "")
				.split(",")
				.map((key) => key.trim())
				.filter(Boolean)
		),
	];
}

const overlayApiKeys = parseApiKeys(process.env.RIOT_OVERLAY_API_KEYS || process.env.RIOT_API_KEY);

function overlayKeyIdentifier(key: string) {
	let hash = 2166136261;
	for (let index = 0; index < key.length; index += 1) {
		hash ^= key.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `rk_${(hash >>> 0).toString(36)}`;
}

function affinityIndex(value: string) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % Math.max(1, overlayApiKeys.length);
}

function nextOverlayApiKey(): string {
	if (overlayApiKeys.length === 0) {
		throw new Error("RIOT_OVERLAY_API_KEYS und RIOT_API_KEY fehlen.");
	}

	const now = Date.now();

	// Round-robin starting at the current index, skipping any key still on cooldown.
	for (let attempt = 0; attempt < overlayApiKeys.length; attempt++) {
		const idx = (overlayApiKeyIndex + attempt) % overlayApiKeys.length;
		const key = overlayApiKeys[idx];
		if (getOverlayKeyState(key).blockedUntil <= now) {
			overlayApiKeyIndex = (idx + 1) % overlayApiKeys.length;
			return key;
		}
	}

	// Never keep a page request open for minutes. A later overlay poll retries.
	const nextKey = overlayApiKeys.reduce((best, key) => (getOverlayKeyState(key).blockedUntil < getOverlayKeyState(best).blockedUntil ? key : best));
	if (getOverlayKeyState(nextKey).blockedUntil - now > MAX_OVERLAY_WAIT_MS) {
		throw new RiotApiError(429, "riot://overlay-rate-limit", "Alle Riot-Overlay-Keys sind vorübergehend ausgelastet. Bitte gleich erneut versuchen.");
	}
	return nextKey;
}

function platform(): string {
	return process.env.RIOT_PLATFORM ?? "EUW1";
}

function region(): string {
	return process.env.RIOT_REGION ?? "europe";
}

export type RiotRoute = {
	platform: string;
	region: string;
	overlayKeyId?: string;
};

export const RIOT_ROUTES = {
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
} as const satisfies Record<string, RiotRoute>;

export type RiotRouteKey = keyof typeof RIOT_ROUTES;

export function riotRoute(value?: string): RiotRoute {
	return RIOT_ROUTES[(value?.toLowerCase() as RiotRouteKey) || "euw1"] ?? RIOT_ROUTES.euw1;
}

export function bindOverlayRiotRoute(routing: RiotRoute, affinity: string, preferredKeyId?: string): RiotRoute {
	if (overlayApiKeys.length === 0) throw new Error("RIOT_OVERLAY_API_KEYS und RIOT_API_KEY fehlen.");
	const preferred = preferredKeyId && overlayApiKeys.some((key) => overlayKeyIdentifier(key) === preferredKeyId) ? preferredKeyId : undefined;
	const key = overlayApiKeys[affinityIndex(affinity.toLocaleLowerCase("en-US"))];
	return { ...routing, overlayKeyId: preferred ?? overlayKeyIdentifier(key) };
}

export function getRiotOverlayDiagnostics() {
	const now = Date.now();
	return {
		configuredKeys: overlayApiKeys.length,
		availableKeys: overlayApiKeys.filter((key) => getOverlayKeyState(key).blockedUntil <= now).length,
		blockedKeys: overlayApiKeys.filter((key) => getOverlayKeyState(key).blockedUntil > now).length,
		requestsLastSecond: overlayApiKeys.reduce(
			(total, key) => total + getOverlayKeyState(key).requestTimestamps.filter((timestamp) => now - timestamp < SHORT_WINDOW_MS).length,
			0
		),
		requestsLastTwoMinutes: overlayApiKeys.reduce(
			(total, key) => total + getOverlayKeyState(key).requestTimestamps.filter((timestamp) => now - timestamp < LONG_WINDOW_MS).length,
			0
		),
	};
}

async function riotGet<T>(
	url: string,
	credential: RiotApiCredential = "tournament",
	options: { forceFresh?: boolean; overlayKeyId?: string } = {}
): Promise<T> {
	const requestUrl = new URL(url);
	const maxAttempts = credential === "overlay" && !options.overlayKeyId ? Math.max(1, overlayApiKeys.length) : 1;
	let lastError: RiotApiError | null = null;

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const key = apiKey(credential, options.overlayKeyId);
		if (credential === "overlay") await paceOverlayRequest(key);
		const response = await fetch(requestUrl, {
			headers: {
				"X-Riot-Token": key,
				...(options.forceFresh ? { "Cache-Control": "no-cache, no-store, max-age=0", Pragma: "no-cache" } : {}),
			},
			cache: "no-store",
			// Belt-and-suspenders: Next's fetch wrapper sometimes ignores cache:"no-store"
			// in route handlers, so explicitly disable its data cache too.
			next: { revalidate: 0 },
		});

		if (response.ok) return (await response.json()) as T;

		let detail = "";
		try {
			const body = (await response.json()) as { status?: { message?: string } };
			detail = body.status?.message ?? "";
		} catch {
			// ignore
		}
		const decryptFailure = response.status === 400 && detail.toLowerCase().includes("decrypt");
		const retryableKeyFailure = response.status === 401 || response.status === 403 || response.status === 429;

		if (credential === "overlay") {
			const state = getOverlayKeyState(key);
			if (response.status === 429) {
				const retryAfter = Math.max(1, Number(response.headers.get("Retry-After") ?? "1") || 1);
				state.blockedUntil = Math.max(state.blockedUntil, Date.now() + retryAfter * 1000);
			} else if (response.status === 401 || response.status === 403) {
				// Invalid or expired keys should not poison subsequent overlay requests.
				state.blockedUntil = Math.max(state.blockedUntil, Date.now() + 5 * 60 * 1000);
			}
		}

		const message =
			response.status === 401 || response.status === 403
				? "Riot-API-Key ungültig oder abgelaufen."
				: decryptFailure
					? "Die gespeicherte Riot-Kennung ist nicht mehr gültig und muss neu aufgelöst werden."
				: response.status === 404
					? "Riot-Account nicht gefunden."
					: response.status === 429
						? "Riot-Rate-Limit erreicht — kurz warten und erneut versuchen."
						: `Riot-API-Fehler ${response.status}${detail ? `: ${detail}` : ""}`;
		lastError = new RiotApiError(response.status, requestUrl.toString(), message);

		if (credential !== "overlay" || !retryableKeyFailure || attempt === maxAttempts - 1) {
			throw lastError;
		}
	}

	throw lastError ?? new RiotApiError(500, requestUrl.toString(), "Riot-API-Anfrage fehlgeschlagen.");
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
		gameDuration: number;
		gameMode: string;
		gameType: string;
		queueId: number;
		participants: RiotMatchParticipant[];
	};
};

export function isRiotMatchRemake(match: RiotMatch): boolean {
	return match.info.participants.some((participant) => participant.gameEndedInEarlySurrender === true) || (match.info.gameDuration > 0 && match.info.gameDuration < 5 * 60);
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
	return riotGet<RiotAccount>(url);
}

export async function getAccountByRiotIdForRoute(gameName: string, tagLine: string, routing: RiotRoute): Promise<RiotAccount> {
	const url = `https://${routing.region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
	return riotGet<RiotAccount>(url, "overlay", { overlayKeyId: routing.overlayKeyId });
}

export async function getAccountByPuuidForRoute(puuid: string, routing: RiotRoute): Promise<RiotAccount> {
	const url = `https://${routing.region}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`;
	return riotGet<RiotAccount>(url, "overlay", { overlayKeyId: routing.overlayKeyId });
}

export async function getAccountByPuuid(puuid: string): Promise<RiotAccount> {
	const url = `https://${region()}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`;
	return riotGet<RiotAccount>(url);
}

export async function getSummonerByPuuid(puuid: string, options: { forceFresh?: boolean } = {}): Promise<RiotSummoner> {
	const url = `https://${platform()}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
	return riotGet<RiotSummoner>(url, "tournament", options);
}

export async function getSummonerByPuuidForRoute(puuid: string, routing: RiotRoute): Promise<RiotSummoner> {
	const url = `https://${routing.platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
	return riotGet<RiotSummoner>(url, "overlay", { overlayKeyId: routing.overlayKeyId });
}

export async function getLeagueEntriesByPuuid(puuid: string): Promise<RiotLeagueEntry[]> {
	const url = `https://${platform()}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;
	try {
		return await riotGet<RiotLeagueEntry[]>(url);
	} catch (error) {
		// 404 means no ranked entries — treat as unranked.
		if (error instanceof RiotApiError && error.status === 404) return [];
		throw error;
	}
}

export async function getLeagueEntriesByPuuidForRoute(puuid: string, routing: RiotRoute): Promise<RiotLeagueEntry[]> {
	const url = `https://${routing.platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;
	try {
		return await riotGet<RiotLeagueEntry[]>(url, "overlay", { overlayKeyId: routing.overlayKeyId });
	} catch (error) {
		if (error instanceof RiotApiError && error.status === 404) return [];
		throw error;
	}
}

export async function getChallengerLeagueForRoute(routing: RiotRoute): Promise<RiotApexLeague> {
	const url = `https://${routing.platform}.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5`;
	return riotGet<RiotApexLeague>(url, "overlay", { overlayKeyId: routing.overlayKeyId });
}

export async function getGrandmasterLeagueForRoute(routing: RiotRoute): Promise<RiotApexLeague> {
	const url = `https://${routing.platform}.api.riotgames.com/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5`;
	return riotGet<RiotApexLeague>(url, "overlay", { overlayKeyId: routing.overlayKeyId });
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
	return riotGet<string[]>(url);
}

export async function getMatchById(matchId: string): Promise<RiotMatch> {
	riotCache.__riotMatchCache ??= new Map();
	riotCache.__riotMatchRequests ??= new Map();
	const cached = riotCache.__riotMatchCache.get(matchId);
	if (cached) return cached;
	const pending = riotCache.__riotMatchRequests.get(matchId);
	if (pending) return pending;

	const url = `https://${region()}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
	const request = riotGet<RiotMatch>(url)
		.then((match) => {
			riotCache.__riotMatchCache?.set(matchId, match);
			// Matches are immutable; retain a useful bounded working set per process.
			if ((riotCache.__riotMatchCache?.size ?? 0) > 250) {
				const oldest = riotCache.__riotMatchCache?.keys().next().value;
				if (oldest) riotCache.__riotMatchCache?.delete(oldest);
			}
			return match;
		})
		.finally(() => riotCache.__riotMatchRequests?.delete(matchId));
	riotCache.__riotMatchRequests.set(matchId, request);
	return request;
}

export async function getMatchIdsByPuuidForRoute(
	puuid: string,
	routing: RiotRoute,
	input: { startTime?: number; count?: number; queue?: number; type?: "ranked" | "normal" | "tourney" | "tutorial" } = {}
): Promise<string[]> {
	const params = new URLSearchParams({ start: "0", count: String(Math.min(Math.max(input.count ?? 20, 1), 100)) });
	if (input.startTime) params.set("startTime", String(input.startTime));
	if (input.queue) params.set("queue", String(input.queue));
	if (input.type) params.set("type", input.type);
	const url = `https://${routing.region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`;
	return riotGet<string[]>(url, "overlay", { overlayKeyId: routing.overlayKeyId });
}

export async function getMatchByIdForRoute(matchId: string, routing: RiotRoute): Promise<RiotMatch> {
	const key = `${routing.region}:${routing.overlayKeyId ?? "rotating"}:${matchId}`;
	riotCache.__riotMatchCache ??= new Map();
	riotCache.__riotMatchRequests ??= new Map();
	const cached = riotCache.__riotMatchCache.get(key);
	if (cached) return cached;
	const pending = riotCache.__riotMatchRequests.get(key);
	if (pending) return pending;
	const url = `https://${routing.region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
	const request = riotGet<RiotMatch>(url, "overlay", { overlayKeyId: routing.overlayKeyId })
		.then((match) => {
			riotCache.__riotMatchCache?.set(key, match);
			if ((riotCache.__riotMatchCache?.size ?? 0) > 500) {
				const oldest = riotCache.__riotMatchCache?.keys().next().value;
				if (oldest) riotCache.__riotMatchCache?.delete(oldest);
			}
			return match;
		})
		.finally(() => riotCache.__riotMatchRequests?.delete(key));
	riotCache.__riotMatchRequests.set(key, request);
	return request;
}

export async function getActiveGameByPuuidForRoute(puuid: string, routing: RiotRoute): Promise<RiotActiveGame | null> {
	const url = `https://${routing.platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`;
	try {
		return await riotGet<RiotActiveGame>(url, "overlay", { overlayKeyId: routing.overlayKeyId });
	} catch (error) {
		if (error instanceof RiotApiError && error.status === 404) return null;
		throw error;
	}
}

/**
 * Icons 0–28 are the original "default" summoner icons available to every account.
 * Safe to use as a verification challenge pool — every player can switch to any of them.
 */
export const DEFAULT_ICON_POOL: number[] = Array.from({ length: 29 }, (_, i) => i);

export function pickChallengeIcon(excludeIconId: number): number {
	const pool = DEFAULT_ICON_POOL.filter((id) => id !== excludeIconId);
	return pool[Math.floor(Math.random() * pool.length)];
}

export function profileIconUrl(iconId: number): string {
	// Community Dragon serves any historical profile icon by ID without versioning.
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
	const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
	const flex = entries.find((e) => e.queueType === "RANKED_FLEX_SR");
	const chosen = solo ?? flex;
	if (!chosen) return null;
	return `${chosen.tier} ${chosen.rank} (${chosen.leaguePoints} LP)`;
}
