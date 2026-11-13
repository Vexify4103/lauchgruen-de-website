export const DRAW_REEL_REVEAL_HOLD_MS = 750;
export const DRAW_REEL_BRAKE_DELAYS = [90, 130, 180, 250, 340, 460, DRAW_REEL_REVEAL_HOLD_MS] as const;
export const drawReelIntroSteps = (teamCount: number) => Math.max(18, teamCount * 3);

/** Visual cycling only. The winning key must always come from the server, never this reel. */
export function drawReelTeam(candidates: readonly string[], step: number, startIndex = 0): string {
	if (!candidates.length) throw new Error("Keine Teams im Animationstopf.");
	return candidates[(startIndex + step) % candidates.length];
}

/** End the slowdown on the actual result, not an arbitrary name followed by a hidden swap. */
export function drawReelBrakeTeam(candidates: readonly string[], winner: string, frame: number): string {
	const winnerIndex = candidates.indexOf(winner);
	if (winnerIndex < 0 || frame < 0 || frame >= DRAW_REEL_BRAKE_DELAYS.length) throw new Error("Ungültiges Ziehungsergebnis für die Animation.");
	const position = winnerIndex - (DRAW_REEL_BRAKE_DELAYS.length - 1 - frame);
	return candidates[((position % candidates.length) + candidates.length) % candidates.length];
}
