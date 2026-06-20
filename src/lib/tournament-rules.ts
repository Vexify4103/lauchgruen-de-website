import type { DraftSide } from "@/lib/tournament-draft-shared";

/**
 * Pools remain fearless through groups and the early playoff rounds. Only the
 * four teams reaching Upper Final or Lower Semi-Final begin the final cycle.
 */
export type PoolHistoryScope = "early" | "finals";

export function poolHistoryScopeForMatchPhase(phase: "groups" | "playoffs"): PoolHistoryScope {
	return phase === "groups" ? "early" : "finals";
}

export function poolHistoryScopeForMatchId(matchId: string): PoolHistoryScope {
	return ["ub-f", "lb-sf", "lb-f", "gf", "gf-reset"].includes(matchId) ? "finals" : "early";
}

export function bonusBanSideForMatch(input: { id: string; blueSide: "teamA" | "teamB" }): DraftSide | null {
	const bonusBracketSide = input.id === "ub-r1-1" || input.id === "ub-r1-2" ? "teamA" : null;
	if (!bonusBracketSide) return null;

	return input.blueSide === bonusBracketSide ? "teamA" : "teamB";
}
