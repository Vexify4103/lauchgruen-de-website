/**
 * Reads the metadata block of a League of Legends replay (.rofl). Runs in the browser and on the
 * server, so a captain's upload never has to send the whole 20+ MB file.
 *
 * Verified against a 16.22 custom game (ROFL2: magic "RIOT\x02", version string at byte 15, metadata
 * JSON at the end of the file followed by its length as a little-endian uint32). The game id is not
 * stored in plain bytes; only the file name ("EUW1-<gameId>.rofl") carries it.
 */

export type ReplayTeam = 100 | 200;
export type ReplayPosition = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | "";

export type ReplayPlayer = {
	riotIdName: string;
	riotIdTag: string;
	puuid: string;
	/** Data Dragon champion id, e.g. "MonkeyKing". */
	champion: string;
	team: ReplayTeam;
	win: boolean;
	position: ReplayPosition;
	kills: number;
	deaths: number;
	assists: number;
	gold: number;
	creepScore: number;
	damageToChampions: number;
	visionScore: number;
	level: number;
	/** Item ids ITEM0–ITEM6 (slot 6 is the trinket, 0 = empty). Missing on replays stored before this field existed. */
	items?: number[];
	/** Summoner spell ids, e.g. 4 = Flash. */
	summonerSpells?: number[];
	/** Rune ids PERK0–PERK5; PERK0 is the keystone. */
	perks?: number[];
	primaryStyle?: number;
	subStyle?: number;
	controlWardsPlaced?: number;
	wardsPlaced?: number;
	wardsKilled?: number;
	damageTaken?: number;
};

export type ReplaySummary = {
	gameVersion: string | null;
	durationSeconds: number;
	players: ReplayPlayer[];
	/** Team that won, from the players' WIN flags. Null when the flags disagree. */
	winningTeam: ReplayTeam | null;
};

export class RoflParseError extends Error {}

const MAGIC = [0x52, 0x49, 0x4f, 0x54]; // "RIOT"
const POSITIONS = new Set(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);

function readGameVersion(bytes: Uint8Array): string | null {
	const head = new TextDecoder("latin1").decode(bytes.subarray(0, 64));
	return /\d+\.\d+\.\d+\.\d+/.exec(head)?.[0] ?? null;
}

function decodeJson(bytes: Uint8Array): unknown {
	try {
		return JSON.parse(new TextDecoder("utf-8").decode(bytes));
	} catch {
		return null;
	}
}

/** ROFL2 keeps the metadata at the end; older files have it near the start. Both are tried. */
function findMetadata(bytes: Uint8Array): Record<string, unknown> {
	if (bytes.length > 8) {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const length = view.getUint32(bytes.length - 4, true);
		if (length > 2 && length < bytes.length - 4) {
			const parsed = decodeJson(bytes.subarray(bytes.length - 4 - length, bytes.length - 4));
			if (parsed && typeof parsed === "object" && "statsJson" in parsed) return parsed as Record<string, unknown>;
		}
	}
	// Fallback: locate `{"gameLength"` and read to its matching closing brace.
	const text = new TextDecoder("latin1").decode(bytes);
	const start = text.indexOf('{"gameLength"');
	if (start < 0) throw new RoflParseError("Keine Spieldaten in der Datei gefunden. Ist das eine .rofl-Datei aus League of Legends?");
	let depth = 0;
	let inString = false;
	for (let index = start; index < text.length; index += 1) {
		const char = text[index];
		if (inString) {
			if (char === "\\") index += 1;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === "{") depth += 1;
		else if (char === "}" && --depth === 0) {
			const parsed = decodeJson(bytes.subarray(start, index + 1));
			if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
			break;
		}
	}
	throw new RoflParseError("Die Spieldaten der Replay-Datei konnten nicht gelesen werden.");
}

function number(value: unknown) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

/** Maps one raw stats row. Kept in one place because Riot renames keys between patches. */
export function normalizeReplayPlayer(raw: Record<string, unknown>): ReplayPlayer {
	const team = number(raw.TEAM) === 200 ? 200 : 100;
	const position = text(raw.TEAM_POSITION) || text(raw.INDIVIDUAL_POSITION);
	return {
		riotIdName: text(raw.RIOT_ID_GAME_NAME) || text(raw.NAME),
		riotIdTag: text(raw.RIOT_ID_TAG_LINE),
		puuid: text(raw.PUUID),
		champion: text(raw.SKIN),
		team,
		win: text(raw.WIN).toLowerCase() === "win",
		position: (POSITIONS.has(position) ? position : "") as ReplayPosition,
		kills: number(raw.CHAMPIONS_KILLED),
		deaths: number(raw.NUM_DEATHS),
		assists: number(raw.ASSISTS),
		gold: number(raw.GOLD_EARNED),
		creepScore: number(raw.MINIONS_KILLED) + number(raw.NEUTRAL_MINIONS_KILLED),
		damageToChampions: number(raw.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS),
		visionScore: number(raw.VISION_SCORE),
		level: number(raw.LEVEL),
		items: [0, 1, 2, 3, 4, 5, 6].map((slot) => number(raw[`ITEM${slot}`])),
		summonerSpells: [number(raw.SUMMONER_SPELL_1), number(raw.SUMMONER_SPELL_2)],
		perks: [0, 1, 2, 3, 4, 5].map((slot) => number(raw[`PERK${slot}`])),
		primaryStyle: number(raw.PERK_PRIMARY_STYLE),
		subStyle: number(raw.PERK_SUB_STYLE),
		controlWardsPlaced: number(raw.WARD_PLACED_DETECTOR),
		wardsPlaced: number(raw.WARD_PLACED),
		wardsKilled: number(raw.WARD_KILLED),
		damageTaken: number(raw.TOTAL_DAMAGE_TAKEN_FROM_CHAMPIONS),
	};
}

export function parseRoflMetadata(bytes: Uint8Array): ReplaySummary {
	if (bytes.length < 16 || MAGIC.some((value, index) => bytes[index] !== value)) {
		throw new RoflParseError("Das ist keine League-of-Legends-Replay-Datei (.rofl).");
	}
	const metadata = findMetadata(bytes);
	const stats = typeof metadata.statsJson === "string" ? decodeJson(new TextEncoder().encode(metadata.statsJson)) : metadata.statsJson;
	if (!Array.isArray(stats) || stats.length === 0) throw new RoflParseError("Die Replay-Datei enthält keine Spielerdaten.");
	const players = stats.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object").map(normalizeReplayPlayer);
	const winners = new Set(players.filter((player) => player.win).map((player) => player.team));
	const losers = new Set(players.filter((player) => !player.win).map((player) => player.team));
	const winningTeam = winners.size === 1 && ![...winners].some((team) => losers.has(team)) ? [...winners][0] : null;
	return {
		gameVersion: readGameVersion(bytes),
		durationSeconds: Math.round(number(metadata.gameLength) / 1000),
		players,
		winningTeam,
	};
}

/** "EUW1-8040261664.rofl" → { platform: "EUW1", gameId: "8040261664" }. The client names files this way. */
export function gameIdFromReplayFileName(fileName: string): { platform: string; gameId: string } | null {
	const match = /^([A-Z0-9]{2,5})-(\d{6,})\.rofl$/i.exec(fileName.trim());
	return match ? { platform: match[1].toUpperCase(), gameId: match[2] } : null;
}
