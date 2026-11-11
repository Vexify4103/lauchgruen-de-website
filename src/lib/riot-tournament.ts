/**
 * Riot Tournament API (tournament-v5): one code per game of a released match.
 *
 * Off unless RIOT_TOURNAMENT_API is "stub" or "live". "stub" works with a development key and
 * returns codes that do not open real lobbies; "live" needs the approved production key.
 * Codes are server-only: never put them into ControlMatch or anything public.
 */
import { getDb } from "@/lib/mongo";
import type { ControlMatch } from "@/lib/match-control";
import type { TournamentSettings } from "@/lib/tournament-settings";

export type RiotTournamentApi = "stub" | "live";

const PICK_TYPES = ["BLIND_PICK", "DRAFT_MODE", "ALL_RANDOM", "TOURNAMENT_DRAFT"] as const;
const SPECTATOR_TYPES = ["NONE", "LOBBYONLY", "ALL"] as const;
const REQUEST_TIMEOUT_MS = 5_000;

export function riotTournamentApi(): RiotTournamentApi | null {
	const value = process.env.RIOT_TOURNAMENT_API?.trim().toLowerCase();
	return value === "stub" || value === "live" ? value : null;
}

function config() {
	const pickType = process.env.RIOT_TOURNAMENT_PICK_TYPE?.trim().toUpperCase();
	const spectatorType = process.env.RIOT_TOURNAMENT_SPECTATOR_TYPE?.trim().toUpperCase();
	return {
		// Riot serves tournament-v5 and tournament-stub-v5 only on the americas host, for every region.
		host: process.env.RIOT_TOURNAMENT_HOST?.trim() || "americas.api.riotgames.com",
		region: process.env.RIOT_TOURNAMENT_REGION?.trim().toUpperCase() || "EUW",
		callbackUrl: process.env.RIOT_TOURNAMENT_CALLBACK_URL?.trim() || "https://tournament.lauchgruen.de/api/riot/callback",
		pickType: PICK_TYPES.find((type) => type === pickType) ?? "TOURNAMENT_DRAFT",
		spectatorType: SPECTATOR_TYPES.find((type) => type === spectatorType) ?? "ALL",
	};
}

type RegistryDoc = { _id: string; value: number; createdAt: string };

export type TournamentCodeDoc = {
	/** `${tournamentId}:${api}:${matchId}:${gameNumber}` */
	_id: string;
	api: RiotTournamentApi;
	tournamentId: string;
	matchId: string;
	gameNumber: number;
	code: string;
	createdAt: string;
	createdBy: string;
	/** Set when Riot posts the game result for this code. */
	callbackAt?: string;
	riotGameId?: number;
};

type CallbackDoc = { receivedAt: string; shortCode: string; known: boolean; payload: Record<string, unknown> };

async function collections() {
	const db = await getDb();
	return {
		registry: db.collection<RegistryDoc>("riot_tournament_registry"),
		codes: db.collection<TournamentCodeDoc>("riot_tournament_codes"),
		callbacks: db.collection<CallbackDoc>("riot_tournament_callbacks"),
	};
}

async function riotTournamentRequest<T>(api: RiotTournamentApi, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
	const key = process.env.RIOT_API_KEY_TOURNAMENT?.trim();
	if (!key) throw new Error("RIOT_API_KEY_TOURNAMENT fehlt.");
	const base = api === "stub" ? "/lol/tournament-stub/v5" : "/lol/tournament/v5";
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(`https://${config().host}${base}${path}`, {
			method,
			headers: { "X-Riot-Token": key, ...(body === undefined ? {} : { "content-type": "application/json" }) },
			body: body === undefined ? undefined : JSON.stringify(body),
			cache: "no-store",
			signal: controller.signal,
		});
		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new Error(`Riot Tournament API ${response.status} bei ${path}: ${text.slice(0, 200)}`);
		}
		return (await response.json()) as T;
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") throw new Error(`Riot Tournament API hat nicht innerhalb von ${REQUEST_TIMEOUT_MS / 1000} s geantwortet.`);
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

/** Provider and tournament IDs are stored per API mode, so stub IDs never reach the live API. */
async function registryValue(id: string, create: () => Promise<number>): Promise<number> {
	const { registry } = await collections();
	const existing = await registry.findOne({ _id: id });
	if (existing) return existing.value;
	const value = await create();
	await registry.updateOne({ _id: id }, { $setOnInsert: { value, createdAt: new Date().toISOString() } }, { upsert: true });
	return (await registry.findOne({ _id: id }))?.value ?? value;
}

async function riotTournamentId(api: RiotTournamentApi, settings: TournamentSettings): Promise<number> {
	const { region, callbackUrl } = config();
	const providerId = await registryValue(`${api}:provider:${region}:${callbackUrl}`, () =>
		riotTournamentRequest<number>(api, "POST", "/providers", { region, url: callbackUrl })
	);
	return registryValue(`${api}:tournament:${providerId}:${settings.activeTournament.id}`, () =>
		riotTournamentRequest<number>(api, "POST", "/tournaments", { providerId, name: settings.activeTournament.name.slice(0, 60) })
	);
}

function codeId(api: RiotTournamentApi, settings: TournamentSettings, matchId: string, gameNumber: number) {
	return `${settings.activeTournament.id}:${api}:${matchId}:${gameNumber}`;
}

/** Game the teams play next: the one after the recorded games. */
export function currentGameNumber(match: Pick<ControlMatch, "games">): number {
	return match.games.length + 1;
}

/**
 * Creates the code for one game once; later calls return the stored code.
 * Returns null when the feature is off.
 */
export async function ensureTournamentCode(input: { settings: TournamentSettings; matchId: string; gameNumber: number; actor: string }): Promise<TournamentCodeDoc | null> {
	const api = riotTournamentApi();
	if (!api) return null;
	const { codes } = await collections();
	const id = codeId(api, input.settings, input.matchId, input.gameNumber);
	const existing = await codes.findOne({ _id: id });
	if (existing) return existing;

	const tournamentId = await riotTournamentId(api, input.settings);
	const { pickType, spectatorType } = config();
	const [code] = await riotTournamentRequest<string[]>(api, "POST", `/codes?count=1&tournamentId=${tournamentId}`, {
		metadata: JSON.stringify({ tournament: input.settings.activeTournament.id, match: input.matchId, game: input.gameNumber }),
		teamSize: 5,
		pickType,
		mapType: "SUMMONERS_RIFT",
		spectatorType,
		enoughPlayers: false,
	});
	if (!code) throw new Error("Riot hat keinen Turniercode zurückgegeben.");
	await codes.updateOne(
		{ _id: id },
		{
			$setOnInsert: {
				api,
				tournamentId: input.settings.activeTournament.id,
				matchId: input.matchId,
				gameNumber: input.gameNumber,
				code,
				createdAt: new Date().toISOString(),
				createdBy: input.actor,
			},
		},
		{ upsert: true }
	);
	return codes.findOne({ _id: id });
}

/** Stored code for one game, or null. Only call this for viewers allowed to see it. */
export async function getTournamentCode(settings: TournamentSettings, matchId: string, gameNumber: number): Promise<TournamentCodeDoc | null> {
	const api = riotTournamentApi();
	if (!api) return null;
	const { codes } = await collections();
	return codes.findOne({ _id: codeId(api, settings, matchId, gameNumber) });
}

/**
 * Stores a result callback from Riot. Unknown codes are kept for review but change nothing;
 * results are never applied automatically, staff confirm them in the match control.
 */
export async function recordTournamentCallback(payload: Record<string, unknown>): Promise<{ known: boolean }> {
	const shortCode = typeof payload.shortCode === "string" ? payload.shortCode.slice(0, 100) : "";
	const { codes, callbacks } = await collections();
	const known = shortCode ? await codes.findOne({ code: shortCode }) : null;
	await callbacks.insertOne({ receivedAt: new Date().toISOString(), shortCode, known: Boolean(known), payload });
	if (known) {
		const gameId = typeof payload.gameId === "number" ? payload.gameId : undefined;
		await codes.updateOne({ _id: known._id }, { $set: { callbackAt: new Date().toISOString(), ...(gameId ? { riotGameId: gameId } : {}) } });
	}
	return { known: Boolean(known) };
}

/** Whether codes are on, and whether they are stub (test) codes. */
export function tournamentCodeMode(): { enabled: boolean; stub: boolean } {
	const api = riotTournamentApi();
	return { enabled: Boolean(api), stub: api === "stub" };
}

/** Shown to captains and admins only while the match is released or running. */
export function codeVisibleFor(match: Pick<ControlMatch, "status">): boolean {
	return match.status === "Pending" || match.status === "Live";
}
