import type { DraftSide } from "@/lib/tournament-draft-shared";

export type PoolHistoryScope = "groups" | "playoffs";

export function poolHistoryScopeForMatchPhase(phase: "groups" | "playoffs"): PoolHistoryScope {
	return phase === "groups" ? "groups" : "playoffs";
}

export function poolHistoryScopeForMatchId(matchId: string): PoolHistoryScope {
	return /^[ab]-r\d+-\d+$/.test(matchId) ? "groups" : "playoffs";
}

export function bonusBanSideForMatch(input: { id: string; blueSide: "teamA" | "teamB" }): DraftSide | null {
	const bonusBracketSide = input.id === "ub-r1-1" || input.id === "ub-r1-2" ? "teamA" : null;
	if (!bonusBracketSide) return null;

	return input.blueSide === bonusBracketSide ? "teamA" : "teamB";
}
