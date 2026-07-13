export const DEFAULT_TOURNAMENT_APPLICATION_OPEN_AT = "2026-08-01T18:00:00+02:00";
export const DEFAULT_TOURNAMENT_APPLICATION_DEADLINE = "2026-09-04T20:00:00+02:00";

const DEFAULT_TOURNAMENT_APPLICATION_DEADLINE_LABEL = "Freitag, 04.09.2026 um 20:00 Uhr MESZ";

function isEnabled(value: string | undefined): boolean {
	return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

export const TOURNAMENT_APPLICATION_DEADLINE = process.env.TOURNAMENT_APPLICATION_DEADLINE ?? DEFAULT_TOURNAMENT_APPLICATION_DEADLINE;

export const TOURNAMENT_APPLICATION_OPEN_AT = process.env.TOURNAMENT_APPLICATION_OPEN_AT ?? DEFAULT_TOURNAMENT_APPLICATION_OPEN_AT;

export const TOURNAMENT_APPLICATION_DEADLINE_LABEL = process.env.TOURNAMENT_APPLICATION_DEADLINE_LABEL ?? DEFAULT_TOURNAMENT_APPLICATION_DEADLINE_LABEL;

export function formatTournamentApplicationDeadlineLabel(deadline = TOURNAMENT_APPLICATION_DEADLINE): string {
	return formatTournamentDateTimeLabel(deadline, TOURNAMENT_APPLICATION_DEADLINE_LABEL);
}

export function formatTournamentApplicationOpenLabel(openAt: string | null | undefined = TOURNAMENT_APPLICATION_OPEN_AT): string {
	if (!openAt) return "Sofort, sobald Bewerbungen aktiviert sind";
	return formatTournamentDateTimeLabel(openAt, "Bewerbungsstart wird noch festgelegt");
}

function formatTournamentDateTimeLabel(dateTime: string, fallback: string): string {
	const date = new Date(dateTime);
	if (Number.isNaN(date.getTime())) return fallback;

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

export function isTournamentApplicationOpenDateReached(now = new Date(), openAt: string | null | undefined = TOURNAMENT_APPLICATION_OPEN_AT): boolean {
	if (!openAt) return true;
	const date = new Date(openAt);
	if (Number.isNaN(date.getTime())) return true;
	return now.getTime() >= date.getTime();
}

export function areTournamentApplicationsOpen(
	applicationsEnabled: boolean,
	now = new Date(),
	deadlineOverride = false,
	deadline = TOURNAMENT_APPLICATION_DEADLINE,
	openAt: string | null | undefined = TOURNAMENT_APPLICATION_OPEN_AT
): boolean {
	return applicationsEnabled && isTournamentApplicationOpenDateReached(now, openAt) && !isTournamentApplicationDeadlinePassed(now, deadlineOverride, deadline);
}
