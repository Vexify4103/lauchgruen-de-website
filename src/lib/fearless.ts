import type { DraftSide } from "@/lib/tournament-draft-shared";

/**
 * Fearless champion locks.
 *
 * A champion counts as "played" by a team once a completed draft stored it in that team's champions,
 * either for another match or for an earlier game of the current series. With the `tournament` scope a
 * team can never pick a champion again; with the `series` scope the locks reset for every Bo3/Bo5.
 * With `lockOpponentChampions` a team also cannot pick anything its current opponent has played.
 *
 * Variant `match` ("Match-Fearless"): everything played in a team's games counts for that team, its own
 * picks and the picks of the teams it faced. After A vs B, all ten champions are locked for A and for B.
 */

type GameChampions = { number?: number; teamAChampions?: string[]; teamBChampions?: string[] };

export type FearlessHistoryMatch = {
	id: string;
	round?: string;
	teamAName: string | null;
	teamBName: string | null;
	teamAChampions?: string[];
	teamBChampions?: string[];
	/** Earlier games of a series; the match-level champions belong to the running game. */
	games?: GameChampions[];
};

/** own: the team played it. faced: picked against the team (Match-Fearless). opponent: the current opponent played it. */
export type FearlessLockSource = "own" | "faced" | "opponent";

export type FearlessLock = {
	champion: string;
	source: FearlessLockSource;
	matchId: string;
	round?: string;
};

/** Locks per draft side, keyed by champion name. */
export type FearlessLocks = Record<DraftSide, Record<string, FearlessLock>>;

export const FEARLESS_VARIANTS = ["own", "match"] as const;
export type FearlessVariant = (typeof FEARLESS_VARIANTS)[number];

export type FearlessRules = { lockOpponentChampions: boolean; scope?: "tournament" | "series"; variant?: FearlessVariant };

/** Champions that can lock for one team per game: its own five, plus the opponent's five in Match-Fearless. */
export function fearlessLocksPerGame(rules: Pick<FearlessRules, "variant" | "lockOpponentChampions">): number {
	return rules.variant === "match" || rules.lockOpponentChampions ? 10 : 5;
}

/**
 * Champions per team. For `currentMatchId` only the finished games count; its match-level champions
 * belong to the game being drafted right now.
 */
export function playedChampionsByTeam(matches: FearlessHistoryMatch[], currentMatchId?: string): Map<string, FearlessLock[]> {
	return championsByTeam(matches, currentMatchId, false);
}

/**
 * Everything a team can no longer pick because of its own games: own picks, and in Match-Fearless also the
 * picks of every team it faced. Own picks win when a champion appears on both sides.
 */
export function lockedChampionsByTeam(matches: FearlessHistoryMatch[], variant: FearlessVariant | undefined, currentMatchId?: string): Map<string, FearlessLock[]> {
	return championsByTeam(matches, currentMatchId, variant === "match");
}

function championsByTeam(matches: FearlessHistoryMatch[], currentMatchId: string | undefined, includeFaced: boolean): Map<string, FearlessLock[]> {
	const played = new Map<string, Map<string, FearlessLock>>();
	const add = (teamName: string | null, champions: string[] | undefined, source: "own" | "faced", match: FearlessHistoryMatch, round: string | undefined) => {
		if (!teamName || !champions?.length) return;
		const list = played.get(teamName) ?? new Map<string, FearlessLock>();
		for (const champion of champions) {
			const existing = list.get(champion);
			if (!existing || (existing.source === "faced" && source === "own")) list.set(champion, { champion, source, matchId: match.id, round });
		}
		played.set(teamName, list);
	};
	const addGame = (match: FearlessHistoryMatch, teamA: string[] | undefined, teamB: string[] | undefined, round: string | undefined) => {
		add(match.teamAName, teamA, "own", match, round);
		add(match.teamBName, teamB, "own", match, round);
		if (!includeFaced) return;
		add(match.teamAName, teamB, "faced", match, round);
		add(match.teamBName, teamA, "faced", match, round);
	};
	for (const match of matches) {
		for (const game of match.games ?? []) {
			addGame(match, game.teamAChampions, game.teamBChampions, game.number ? `${match.round ?? match.id} · Spiel ${game.number}` : match.round);
		}
		if (match.id === currentMatchId) continue;
		addGame(match, match.teamAChampions, match.teamBChampions, match.round);
	}
	return new Map([...played].map(([team, list]) => [team, [...list.values()]]));
}

export function computeFearlessLocks(input: {
	matches: FearlessHistoryMatch[];
	matchId: string;
	blueTeamName: string | null;
	redTeamName: string | null;
	rules: FearlessRules;
}): FearlessLocks {
	const history = input.rules.scope === "series" ? input.matches.filter((match) => match.id === input.matchId) : input.matches;
	const played = playedChampionsByTeam(history, input.matchId);
	const locked = lockedChampionsByTeam(history, input.rules.variant, input.matchId);
	const locksFor = (ownTeam: string | null, opponentTeam: string | null) => {
		const locks: Record<string, FearlessLock> = {};
		if (input.rules.lockOpponentChampions && opponentTeam) {
			for (const entry of played.get(opponentTeam) ?? []) locks[entry.champion] = { ...entry, source: "opponent" };
		}
		// The team's own games win over the opponent's history; own picks win over faced ones.
		if (ownTeam) for (const entry of locked.get(ownTeam) ?? []) locks[entry.champion] = entry;
		return locks;
	};
	return {
		teamA: locksFor(input.blueTeamName, input.redTeamName),
		teamB: locksFor(input.redTeamName, input.blueTeamName),
	};
}

export function fearlessLockLabel(lock: FearlessLock): string {
	const where = lock.round ? ` (${lock.round})` : "";
	if (lock.source === "own") return `Bereits von diesem Team gespielt${where}`;
	if (lock.source === "faced") return `Bereits gegen dieses Team gespielt${where}`;
	return `Bereits vom Gegner gespielt${where}`;
}

/** Short badge for champion tiles. */
export function fearlessLockBadge(lock: FearlessLock): string {
	return lock.source === "own" ? "Gespielt" : lock.source === "faced" ? "Gegen euch" : "Gegner";
}

export function emptyFearlessLocks(): FearlessLocks {
	return { teamA: {}, teamB: {} };
}
