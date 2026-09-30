/**
 * A tournament "kind" selects which rule set and match engine the site runs.
 *
 * - `az`: legacy A-Z event with fixed groups A/B, the pool wheel and champ select.
 * - `ultimate-bravery`: flexible engine (groups or Swiss + configurable playoffs) with rolled builds instead of a draft.
 * - `fearless`: flexible engine with a full-roster champ select and fearless champion locks.
 */
export const TOURNAMENT_KINDS = ["az", "ultimate-bravery", "fearless"] as const;

export type TournamentKind = (typeof TOURNAMENT_KINDS)[number];

type ActiveTournamentLike = { id: string; kind?: TournamentKind };

export const TOURNAMENT_KIND_LABELS: Record<TournamentKind, string> = {
	az: "A-Z Pools",
	"ultimate-bravery": "Ultimate Bravery",
	fearless: "Fearless Draft",
};

export function isTournamentKind(value: unknown): value is TournamentKind {
	return typeof value === "string" && (TOURNAMENT_KINDS as readonly string[]).includes(value);
}

/** Older settings documents predate `kind`; their ids identify the rule set. */
export function tournamentKind(active: ActiveTournamentLike): TournamentKind {
	if (isTournamentKind(active.kind)) return active.kind;
	if (active.id === "ultimate-bravery") return "ultimate-bravery";
	if (active.id.startsWith("fearless")) return "fearless";
	return "az";
}

/** Groups or Swiss followed by configurable playoffs (settings.ultimateBravery holds the structure). */
export function usesFlexibleEngine(active: ActiveTournamentLike): boolean {
	return tournamentKind(active) !== "az";
}

export function usesChampSelect(active: ActiveTournamentLike): boolean {
	return tournamentKind(active) !== "ultimate-bravery";
}

export function usesUltimateBravery(active: ActiveTournamentLike): boolean {
	return tournamentKind(active) === "ultimate-bravery";
}

/** Random A-Z champion pools per match, drawn with the wheel. */
export function usesPoolWheel(active: ActiveTournamentLike): boolean {
	return tournamentKind(active) === "az";
}

export function usesFearless(active: ActiveTournamentLike): boolean {
	return tournamentKind(active) === "fearless";
}
