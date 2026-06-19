export const DEFAULT_TOURNAMENT_APPLICATION_DEADLINE = "2026-06-18T20:00:00+02:00";

const DEFAULT_TOURNAMENT_APPLICATION_DEADLINE_LABEL = "Donnerstag, 18.06.2026 um 20:00 Uhr CEST";

function isEnabled(value: string | undefined): boolean {
	return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

export const TOURNAMENT_APPLICATION_DEADLINE =
	process.env.TOURNAMENT_APPLICATION_DEADLINE ?? DEFAULT_TOURNAMENT_APPLICATION_DEADLINE;

export const TOURNAMENT_APPLICATION_DEADLINE_LABEL =
	process.env.TOURNAMENT_APPLICATION_DEADLINE_LABEL ?? DEFAULT_TOURNAMENT_APPLICATION_DEADLINE_LABEL;

export function formatTournamentApplicationDeadlineLabel(deadline = TOURNAMENT_APPLICATION_DEADLINE): string {
	const date = new Date(deadline);
	if (Number.isNaN(date.getTime())) return TOURNAMENT_APPLICATION_DEADLINE_LABEL;

	return new Intl.DateTimeFormat("de-DE", {
		weekday: "long",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Europe/Berlin",
		timeZoneName: "short",
	}).format(date);
}

export function isTournamentApplicationDeadlineBypassed(): boolean {
	return isEnabled(process.env.TOURNAMENT_APPLICATION_DEADLINE_BYPASS);
}

export function isTournamentApplicationDeadlinePassed(now = new Date(), deadlineOverride = false, deadline = TOURNAMENT_APPLICATION_DEADLINE): boolean {
	if (deadlineOverride || isTournamentApplicationDeadlineBypassed()) return false;

	return now.getTime() >= new Date(deadline).getTime();
}

export function areTournamentApplicationsOpen(applicationsEnabled: boolean, now = new Date(), deadlineOverride = false, deadline = TOURNAMENT_APPLICATION_DEADLINE): boolean {
	return applicationsEnabled && !isTournamentApplicationDeadlinePassed(now, deadlineOverride, deadline);
}
