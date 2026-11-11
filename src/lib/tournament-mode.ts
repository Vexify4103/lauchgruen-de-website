export const TOURNAMENT_MODES = ["teaser", "registration", "preparation", "live", "paused", "finished"] as const;

export type TournamentMode = (typeof TOURNAMENT_MODES)[number];

/** Captains need the portal from team publication on (team name, tag) until the event ends. */
export function captainPortalOpen(mode: TournamentMode): boolean {
	return mode === "preparation" || mode === "live" || mode === "paused";
}
