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

function apiKey(): string {
	const key = process.env.RIOT_API_KEY;
	if (!key) throw new Error("Missing RIOT_API_KEY");
	return key;
}

function platform(): string {
	return process.env.RIOT_PLATFORM ?? "EUW1";
}

function region(): string {
	return process.env.RIOT_REGION ?? "europe";
}

async function riotGet<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		headers: { "X-Riot-Token": apiKey() },
		cache: "no-store",
		// Belt-and-suspenders: Next's fetch wrapper sometimes ignores cache:"no-store"
		// in route handlers, so explicitly disable its data cache too.
		next: { revalidate: 0 },
	});

	if (!response.ok) {
		let detail = "";
		try {
			const body = (await response.json()) as { status?: { message?: string } };
			detail = body.status?.message ?? "";
		} catch {
			// ignore
		}
		const message =
			response.status === 401 || response.status === 403
				? "Riot-API-Key ungültig oder abgelaufen."
				: response.status === 404
					? "Riot-Account nicht gefunden."
					: response.status === 429
						? "Riot-Rate-Limit erreicht — kurz warten und erneut versuchen."
						: `Riot-API-Fehler ${response.status}${detail ? `: ${detail}` : ""}`;
		throw new RiotApiError(response.status, url, message);
	}

	return (await response.json()) as T;
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

export type RiotMatchParticipant = {
	puuid: string;
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

export async function getAccountByPuuid(puuid: string): Promise<RiotAccount> {
	const url = `https://${region()}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`;
	return riotGet<RiotAccount>(url);
}

export async function getSummonerByPuuid(puuid: string): Promise<RiotSummoner> {
	const url = `https://${platform()}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
	return riotGet<RiotSummoner>(url);
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
