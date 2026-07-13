export const TOURNAMENT_MODES = ["teaser", "registration", "preparation", "live", "paused"] as const;

export type TournamentMode = (typeof TOURNAMENT_MODES)[number];
