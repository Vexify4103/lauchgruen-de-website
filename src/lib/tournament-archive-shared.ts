/** Typed by the owner before the active tournament is archived and its data is cleared. */
export const ARCHIVE_CONFIRMATION = "TURNIER ARCHIVIEREN";

export function slugifyTournamentId(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/ß/g, "ss")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}
