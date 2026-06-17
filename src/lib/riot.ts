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

export function formatRank(entries: RiotLeagueEntry[]): string | null {
	const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
	const flex = entries.find((e) => e.queueType === "RANKED_FLEX_SR");
	const chosen = solo ?? flex;
	if (!chosen) return null;
	return `${chosen.tier} ${chosen.rank} (${chosen.leaguePoints} LP)`;
}
