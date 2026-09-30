import type { DraftSide } from "@/lib/tournament-draft-shared";

/**
 * Fearless champion locks.
 *
 * A champion counts as "played" by a team once a completed draft stored it in
 * that team's champions for another match of the active tournament. A team can
 * never pick a champion it has played before; with `lockOpponentChampions`
 * it also cannot pick anything its current opponent has played.
 */

export type FearlessHistoryMatch = {
	id: string;
	round?: string;
	teamAName: string | null;
	teamBName: string | null;
	teamAChampions?: string[];
	teamBChampions?: string[];
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

export type FearlessRules = { lockOpponentChampions: boolean };

export function playedChampionsByTeam(matches: FearlessHistoryMatch[], excludeMatchId?: string): Map<string, FearlessLock[]> {
	const played = new Map<string, FearlessLock[]>();
	const add = (teamName: string | null, champions: string[] | undefined, match: FearlessHistoryMatch) => {
		if (!teamName || !champions?.length) return;
		const list = played.get(teamName) ?? [];
		for (const champion of champions) {
			if (!list.some((entry) => entry.champion === champion)) list.push({ champion, source: "own", matchId: match.id, round: match.round });
		}
		played.set(teamName, list);
	};
	for (const match of matches) {
		if (match.id === excludeMatchId) continue;
		add(match.teamAName, match.teamAChampions, match);
		add(match.teamBName, match.teamBChampions, match);
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
	const played = playedChampionsByTeam(input.matches, input.matchId);
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
