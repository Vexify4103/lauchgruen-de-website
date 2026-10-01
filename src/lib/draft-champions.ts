import { getAllChampions, getChampionPools, type ChampionPoolEntry } from "@/lib/champion-pools";
import { computeFearlessLocks, emptyFearlessLocks, type FearlessLocks } from "@/lib/fearless";
import type { ControlMatch } from "@/lib/match-control";
import type { DraftSide, DraftTurn } from "@/lib/tournament-draft-shared";
import { usesFearless } from "@/lib/tournament-kind";
import type { TournamentSettings } from "@/lib/tournament-settings";

export type DraftChampionRules = {
	mode: "pools" | "fearless";
	/** Pick candidates for Blue (teamA) and Red (teamB). */
	blueChampions: ChampionPoolEntry[];
	redChampions: ChampionPoolEntry[];
	locks: FearlessLocks;
	/** Fearless: whether locks last the whole event or one series. */
	scope: "tournament" | "series";
	/** Whether captains may draft this match yet. */
	open: boolean;
	closedReason: string | null;
};

function blueRedNames(match: Pick<ControlMatch, "blueSide" | "teamAName" | "teamBName">) {
	return match.blueSide === "teamA" ? { blue: match.teamAName, red: match.teamBName } : { blue: match.teamBName, red: match.teamAName };
}

export async function resolveDraftChampionRules(settings: TournamentSettings, matches: ControlMatch[], match: ControlMatch): Promise<DraftChampionRules> {
	if (usesFearless(settings.activeTournament)) {
		const champions = await getAllChampions();
		const names = blueRedNames(match);
		const released = match.status === "Pending" || match.status === "Live" || match.status === "Finished";
		return {
			mode: "fearless",
			blueChampions: champions,
			redChampions: champions,
			locks: computeFearlessLocks({ matches, matchId: match.id, blueTeamName: names.blue, redTeamName: names.red, rules: settings.fearless }),
			scope: settings.fearless.scope,
			open: released,
			closedReason: released ? null : "Die Turnierleitung hat dieses Match noch nicht freigegeben.",
		};
	}
	const pools = await getChampionPools();
	const bluePool = match.blueSide === "teamA" ? match.poolAssignment?.teamAPool : match.poolAssignment?.teamBPool;
	const redPool = match.blueSide === "teamA" ? match.poolAssignment?.teamBPool : match.poolAssignment?.teamAPool;
	const championsFor = (pool: string | undefined) => (pool ? (pools.find((entry) => entry.pool === pool)?.champions ?? []) : []);
	return {
		mode: "pools",
		blueChampions: championsFor(bluePool),
		redChampions: championsFor(redPool),
		locks: emptyFearlessLocks(),
		scope: "tournament",
		open: Boolean(match.poolAssignment),
		closedReason: match.poolAssignment ? null : "Für dieses Match wurden noch keine Pools gezogen.",
	};
}

/**
 * Pools: picks come from the own pool, bans target the enemy pool.
 * Fearless: every champion can be banned; picks exclude the side's fearless locks.
 */
export function allowedChampionsForTurn(rules: DraftChampionRules, turn: DraftTurn): Set<string> {
	const own = turn.side === "teamA" ? rules.blueChampions : rules.redChampions;
	const enemy = turn.side === "teamA" ? rules.redChampions : rules.blueChampions;
	if (rules.mode === "fearless") {
		if (turn.kind === "ban") return new Set(own.map((champion) => champion.name));
		const locks = rules.locks[turn.side];
		return new Set(own.filter((champion) => !locks[champion.name]).map((champion) => champion.name));
	}
	return new Set((turn.kind === "pick" ? own : enemy).map((champion) => champion.name));
}

export function disallowedChampionMessage(rules: DraftChampionRules, turn: DraftTurn, champion: string): string {
	if (rules.mode === "fearless") {
		const lock = rules.locks[turn.side][champion];
		const where = rules.scope === "series" ? "in dieser Serie" : "in diesem Turnier";
		if (lock) return lock.source === "own" ? `${champion} hat euer Team ${where} bereits gespielt.` : `${champion} hat euer Gegner ${where} bereits gespielt.`;
		return `${champion} ist kein gültiger Champion.`;
	}
	return turn.kind === "ban" ? "Bans müssen aus dem gegnerischen Pool kommen." : "Picks müssen aus deinem eigenen Pool kommen.";
}

export type { DraftSide };
