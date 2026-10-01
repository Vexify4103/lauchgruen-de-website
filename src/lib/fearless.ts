import type { DraftSide } from "@/lib/tournament-draft-shared";

/**
 * Fearless champion locks.
 *
 * A champion counts as "played" by a team once a completed draft stored it in that team's champions,
 * either for another match or for an earlier game of the current series. With the `tournament` scope a
 * team can never pick a champion again; with the `series` scope the locks reset for every Bo3/Bo5.
 * With `lockOpponentChampions` a team also cannot pick anything its current opponent has played.
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

export type FearlessLockSource = "own" | "opponent";

export type FearlessLock = {
	champion: string;
	source: FearlessLockSource;
	matchId: string;
	round?: string;
};

/** Locks per draft side, keyed by champion name. */
export type FearlessLocks = Record<DraftSide, Record<string, FearlessLock>>;

export type FearlessRules = { lockOpponentChampions: boolean; scope?: "tournament" | "series" };

/**
 * Champions per team. For `currentMatchId` only the finished games count; its match-level champions
 * belong to the game being drafted right now.
 */
export function playedChampionsByTeam(matches: FearlessHistoryMatch[], currentMatchId?: string): Map<string, FearlessLock[]> {
	const played = new Map<string, FearlessLock[]>();
	const add = (teamName: string | null, champions: string[] | undefined, match: FearlessHistoryMatch, round: string | undefined) => {
		if (!teamName || !champions?.length) return;
		const list = played.get(teamName) ?? [];
		for (const champion of champions) {
			if (!list.some((entry) => entry.champion === champion)) list.push({ champion, source: "own", matchId: match.id, round });
		}
		played.set(teamName, list);
	};
	for (const match of matches) {
		for (const game of match.games ?? []) {
			const round = game.number ? `${match.round ?? match.id} · Spiel ${game.number}` : match.round;
			add(match.teamAName, game.teamAChampions, match, round);
			add(match.teamBName, game.teamBChampions, match, round);
		}
		if (match.id === currentMatchId) continue;
		add(match.teamAName, match.teamAChampions, match, match.round);
		add(match.teamBName, match.teamBChampions, match, match.round);
	}
	return played;
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
	const locksFor = (ownTeam: string | null, opponentTeam: string | null) => {
		const locks: Record<string, FearlessLock> = {};
		if (input.rules.lockOpponentChampions && opponentTeam) {
			for (const entry of played.get(opponentTeam) ?? []) locks[entry.champion] = { ...entry, source: "opponent" };
		}
		// Own history wins when a champion was played by both teams.
		if (ownTeam) for (const entry of played.get(ownTeam) ?? []) locks[entry.champion] = entry;
		return locks;
	};
	return {
		teamA: locksFor(input.blueTeamName, input.redTeamName),
		teamB: locksFor(input.redTeamName, input.blueTeamName),
	};
}

export function fearlessLockLabel(lock: FearlessLock): string {
	const where = lock.round ? ` (${lock.round})` : "";
	return lock.source === "own" ? `Bereits von diesem Team gespielt${where}` : `Bereits vom Gegner gespielt${where}`;
}

export function emptyFearlessLocks(): FearlessLocks {
	return { teamA: {}, teamB: {} };
}
