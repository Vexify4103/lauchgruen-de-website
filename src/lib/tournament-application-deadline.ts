export const TOURNAMENT_APPLICATION_DEADLINE = "2026-06-18T20:00:00+02:00";

export const TOURNAMENT_APPLICATION_DEADLINE_LABEL = "Donnerstag, 18.06.2026 um 20:00 Uhr CEST";

export function isTournamentApplicationDeadlinePassed(now = new Date()): boolean {
	return now.getTime() >= new Date(TOURNAMENT_APPLICATION_DEADLINE).getTime();
}

export function areTournamentApplicationsOpen(applicationsEnabled: boolean, now = new Date()): boolean {
	return applicationsEnabled && !isTournamentApplicationDeadlinePassed(now);
}
