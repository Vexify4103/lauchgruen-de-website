/**
 * Tournament structure options shared by the admin panel, the settings API and every stage engine.
 *
 * Day 1 (`dayOneFormat`) produces the playoff seeds, Day 2 (`format`) is the playoff bracket.
 * An optional play-in knocks the lowest seeds down to half before Day 1 starts.
 */

export const DAY_ONE_FORMATS = ["undecided", "none", "groups", "gsl", "swiss", "swiss-elimination"] as const;
export type DayOneFormat = (typeof DAY_ONE_FORMATS)[number];

export const PLAYOFF_FORMATS = ["undecided", "single-elimination", "double-elimination", "double-elimination-light", "page-playoffs", "gauntlet", "round-robin"] as const;
export type PlayoffFormat = (typeof PLAYOFF_FORMATS)[number];

export const BEST_OF_VALUES = [1, 3, 5] as const;
export type BestOf = (typeof BEST_OF_VALUES)[number];
export type BestOfConfig = { dayOne: BestOf; playoffs: BestOf; finals: BestOf };

export const TIEBREAKERS = ["head-to-head", "game-difference", "buchholz", "win-duration", "seed"] as const;
export type Tiebreaker = (typeof TIEBREAKERS)[number];

export const SIDE_SELECTION_RULES = ["higher-seed", "loser-picks", "coin-flip", "alternate"] as const;
export type SideSelectionRule = (typeof SIDE_SELECTION_RULES)[number];

export type SwissRoundOneSeeding = "random" | "seeded";

export type StructureConfig = {
	teamCount: number;
	dayOneFormat: DayOneFormat;
	groupCount: number;
	groupRoundRobinLegs: 1 | 2;
	swissRounds: number;
	/** Swiss with elimination: this many wins advance, the same number of losses eliminates. */
	swissWinsToAdvance: 2 | 3;
	swissRoundOneSeeding: SwissRoundOneSeeding;
	/** Lowest seeds that play a knockout before Day 1; 0 disables the play-in. */
	playInTeamCount: number;
	advanceTeamCount: number;
	format: PlayoffFormat;
	bestOf: BestOfConfig;
	thirdPlaceMatch: boolean;
	grandFinalReset: boolean;
	tiebreakers: Tiebreaker[];
	sideSelection: SideSelectionRule;
};

export const DEFAULT_STRUCTURE_OPTIONS = {
	swissWinsToAdvance: 3,
	swissRoundOneSeeding: "random",
	playInTeamCount: 0,
	bestOf: { dayOne: 1, playoffs: 1, finals: 1 },
	thirdPlaceMatch: false,
	grandFinalReset: false,
	tiebreakers: ["head-to-head", "game-difference", "win-duration"],
	sideSelection: "higher-seed",
} satisfies Partial<StructureConfig>;

export const DAY_ONE_FORMAT_LABELS: Record<DayOneFormat, string> = {
	undecided: "Noch nicht entschieden",
	none: "Keine Vorrunde · direkt in die Playoffs",
	groups: "Gruppenphase (Round Robin)",
	gsl: "GSL-Gruppen (4er-Gruppen, Double Elimination)",
	swiss: "Swiss Stage (feste Rundenzahl)",
	"swiss-elimination": "Swiss mit Ausscheiden (Major-Format)",
};

export const PLAYOFF_FORMAT_LABELS: Record<PlayoffFormat, string> = {
	undecided: "Noch nicht entschieden",
	"single-elimination": "Single Elimination",
	"double-elimination": "Double Elimination",
	"double-elimination-light": "Double Elimination Light",
	"page-playoffs": "Page-Playoffs",
	gauntlet: "Gauntlet",
	"round-robin": "Round Robin + Finale",
};

export const TIEBREAKER_LABELS: Record<Tiebreaker, string> = {
	"head-to-head": "Direkter Vergleich",
	"game-difference": "Spieldifferenz",
	buchholz: "Buchholz (Stärke der Gegner)",
	"win-duration": "Ø Spielzeit der Siege",
	seed: "Setzliste",
};

export const SIDE_SELECTION_LABELS: Record<SideSelectionRule, string> = {
	"higher-seed": "Höher gesetztes Team wählt",
	"loser-picks": "Spiel 1 höherer Seed, danach wählt der Verlierer",
	"coin-flip": "Münzwurf, danach abwechselnd",
	alternate: "Abwechselnd (Team A beginnt auf Blau)",
};

const isPowerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0;

export function isOneOf<T extends readonly unknown[]>(values: T, value: unknown): value is T[number] {
	return values.includes(value);
}

export function winsNeeded(bestOf: number): number {
	return Math.floor(Math.max(1, bestOf) / 2) + 1;
}

export function bestOfLabel(bestOf: number): string {
	return `Bo${bestOf}`;
}

/** Teams that start Day 1: everyone except the play-in losers. */
export function mainEventTeamCount(config: Pick<StructureConfig, "teamCount" | "playInTeamCount">): number {
	return config.teamCount - Math.floor(config.playInTeamCount / 2);
}

export function swissEliminationRounds(winsToAdvance: number): number {
	return winsToAdvance * 2 - 1;
}

/** Playoff sizes each bracket can be generated for. */
export function supportedPlayoffSizes(format: PlayoffFormat): number[] {
	switch (format) {
		case "single-elimination":
			return Array.from({ length: 31 }, (_, index) => index + 2);
		case "double-elimination":
			return [4, 8, 16, 32];
		case "double-elimination-light":
			return [6, 8];
		case "page-playoffs":
			return [4];
		case "gauntlet":
			return [3, 4, 5, 6, 7, 8];
		case "round-robin":
			return [3, 4, 5, 6, 7, 8];
		case "undecided":
			return [];
	}
}

/**
 * Forces the values a format fully determines (for example GSL always sends two teams per group through)
 * so stored settings can never disagree with the engine.
 */
export function deriveStructure<T extends StructureConfig>(config: T): T {
	const next = { ...config, bestOf: { ...config.bestOf }, tiebreakers: [...config.tiebreakers] };
	next.playInTeamCount = Math.max(0, Math.min(next.playInTeamCount - (next.playInTeamCount % 2), next.teamCount - 2));
	if (next.playInTeamCount === 2 && next.teamCount < 3) next.playInTeamCount = 0;
	const participants = mainEventTeamCount(next);
	switch (next.dayOneFormat) {
		case "none":
			next.advanceTeamCount = participants;
			break;
		case "gsl":
			next.groupCount = Math.max(1, Math.floor(participants / 4));
			next.advanceTeamCount = next.groupCount * 2;
			break;
		case "swiss-elimination":
			next.swissRounds = swissEliminationRounds(next.swissWinsToAdvance);
			next.advanceTeamCount = Math.max(2, Math.floor(participants / 2));
			break;
		case "swiss": {
			const allTeamsAdvance = next.advanceTeamCount >= participants;
			const winsToAdvance = Math.max(2, Math.ceil(Math.log2(participants)) - 1);
			next.advanceTeamCount = allTeamsAdvance ? participants : Math.max(2, Math.floor(participants / 2));
			next.swissRounds = allTeamsAdvance ? (participants === 8 ? 4 : Math.max(2, Math.ceil(Math.log2(participants)) + 1)) : winsToAdvance * 2 - 1;
			break;
		}
		default:
			next.groupCount = Math.max(1, Math.min(next.groupCount, participants));
			next.advanceTeamCount = Math.max(2, Math.min(next.advanceTeamCount, participants));
	}
	if (next.format === "page-playoffs" || next.format === "gauntlet" || next.format === "round-robin") next.grandFinalReset = false;
	if (next.format !== "single-elimination") next.thirdPlaceMatch = false;
	const seen = new Set<Tiebreaker>();
	next.tiebreakers = next.tiebreakers.filter((entry) => !seen.has(entry) && Boolean(seen.add(entry))).slice(0, TIEBREAKERS.length);
	return next;
}

export type StructureReview = { errors: string[]; warnings: string[] };

/** Everything an admin must fix before saving (errors) or should know (warnings). */
export function reviewStructure(config: StructureConfig): StructureReview {
	const errors: string[] = [];
	const warnings: string[] = [];
	const participants = mainEventTeamCount(config);
	if (config.playInTeamCount % 2 !== 0) errors.push("Das Play-in braucht eine gerade Teamzahl.");
	if (config.playInTeamCount > 0 && participants < 2) errors.push("Nach dem Play-in müssen mindestens zwei Teams übrig bleiben.");

	if (config.dayOneFormat === "gsl" && participants % 4 !== 0) {
		errors.push(`GSL-Gruppen brauchen eine durch 4 teilbare Teamzahl an Tag 1 (aktuell ${participants}).`);
	}
	if (config.dayOneFormat === "swiss-elimination") {
		const minimum = 2 ** (config.swissWinsToAdvance * 2 - 2);
		if (!isPowerOfTwo(participants) || participants < minimum) {
			errors.push(
				`Swiss mit ${config.swissWinsToAdvance} Siegen/Niederlagen braucht eine Zweierpotenz von mindestens ${minimum} Teams an Tag 1 (aktuell ${participants}), damit jede Bilanzgruppe aufgeht.`
			);
		}
	}
	if (config.dayOneFormat === "groups") {
		if (config.groupCount > participants) errors.push("Es gibt mehr Gruppen als Teams.");
		else if (participants % config.groupCount !== 0) warnings.push("Die Teams lassen sich nicht gleichmäßig auf die Gruppen verteilen.");
		if (config.advanceTeamCount % config.groupCount !== 0) warnings.push("Die Playoff-Plätze verteilen sich nicht gleichmäßig; die besten Gruppenplatzierten füllen auf.");
	}
	if (config.dayOneFormat === "swiss") {
		if (config.swissRounds > (participants % 2 === 0 ? participants - 1 : participants)) {
			errors.push("Es sind mehr Swiss-Runden konfiguriert, als ohne Rematch möglich sind.");
		}
		if (participants % 2 !== 0) warnings.push("Bei ungerader Teamzahl erhält pro Runde ein Team ein Freilos.");
		else if (!isPowerOfTwo(participants)) {
			warnings.push("Bei dieser Teamzahl entstehen ungerade Bilanzgruppen; einzelne bilanzübergreifende Paarungen müssen bei der Auslosung freigegeben werden.");
		}
	}
	if (config.advanceTeamCount > participants) errors.push("Es können nicht mehr Teams die Playoffs erreichen, als an Tag 1 antreten.");

	if (config.format !== "undecided" && config.dayOneFormat !== "undecided") {
		const sizes = supportedPlayoffSizes(config.format);
		if (!sizes.includes(config.advanceTeamCount)) {
			errors.push(`${PLAYOFF_FORMAT_LABELS[config.format]} unterstützt ${formatSizes(sizes)} Playoff-Teams, geplant sind ${config.advanceTeamCount}.`);
		}
		if (config.format === "single-elimination" && !isPowerOfTwo(config.advanceTeamCount)) {
			warnings.push("Die bestgesetzten Teams erhalten ein Freilos in Runde 1, weil die Playoff-Teamzahl keine Zweierpotenz ist.");
		}
		if (config.format === "double-elimination-light" && config.advanceTeamCount !== participants) {
			warnings.push("Double Elimination Light ist dafür gedacht, dass alle Teams Tag 2 erreichen.");
		}
	}
	if (config.tiebreakers.includes("buchholz") && config.dayOneFormat !== "swiss" && config.dayOneFormat !== "swiss-elimination") {
		warnings.push("Buchholz unterscheidet nur in Swiss-Formaten; in Gruppen haben alle dieselben Gegner.");
	}
	if (config.tiebreakers.includes("game-difference") && Math.max(config.bestOf.dayOne, config.bestOf.playoffs) === 1) {
		warnings.push("Die Spieldifferenz entscheidet nur bei Bo3 oder Bo5 etwas.");
	}
	return { errors, warnings };
}

function formatSizes(sizes: number[]): string {
	if (sizes.length > 6) return `${sizes[0]} bis ${sizes.at(-1)}`;
	return sizes.length > 1 ? `${sizes.slice(0, -1).join(", ")} oder ${sizes.at(-1)}` : String(sizes[0] ?? "keine");
}

export function describeTiebreakers(tiebreakers: Tiebreaker[]): string {
	const names = tiebreakers.map((entry) => TIEBREAKER_LABELS[entry]);
	const tail = tiebreakers.includes("seed") ? "" : ", danach entscheidet ein Tiebreaker-Match";
	return `Siege, dann ${names.join(", ")}${tail}`;
}

export const PLAY_IN_RESET_CONFIRMATION = "PLAY-IN ZURÜCKSETZEN";

/**
 * Formats whose Day 1 needs published slots from the roster builder: groups and GSL need group seeds,
 * "none" and seeded Swiss need a single seed list. `null` means no manual slots are needed.
 */
export function seedSlotLayout(config: Pick<StructureConfig, "dayOneFormat" | "groupCount" | "swissRoundOneSeeding">): { groupCount: number; kind: "groups" | "seed-list" } | null {
	switch (config.dayOneFormat) {
		case "groups":
		case "gsl":
			return { groupCount: config.groupCount, kind: "groups" };
		case "none":
			return { groupCount: 1, kind: "seed-list" };
		case "swiss":
		case "swiss-elimination":
			return config.swissRoundOneSeeding === "seeded" ? { groupCount: 1, kind: "seed-list" } : null;
		default:
			return null;
	}
}

export const DAY_ONE_FORMAT_DETAILS: Record<DayOneFormat, string> = {
	undecided: "Die Stage bleibt öffentlich geschlossen, bis ein Format gewählt ist.",
	none: "Alle Teams starten direkt in den Playoffs; die Seeds kommen aus der Setzliste.",
	groups: "Jeder gegen jeden in einer oder mehreren Gruppen; die Tabelle bestimmt die Seeds.",
	gsl: "Vierergruppen: zwei Eröffnungsspiele, Winners' und Elimination Match, dann das Decider Match. Platz 1 und 2 kommen weiter.",
	swiss: "Paarungen nach gleicher Bilanz ohne Rematch; nach der festen Rundenzahl entscheidet die Tabelle.",
	"swiss-elimination": "Paarungen nach Bilanz, bis jedes Team die nötigen Siege oder Niederlagen erreicht hat.",
};

export const PLAYOFF_FORMAT_DETAILS: Record<PlayoffFormat, string> = {
	undecided: "Das Bracket wird später festgelegt.",
	"single-elimination": "Eine Niederlage und raus; bei ungerader Teamzahl erhalten die besten Seeds ein Freilos (2–32 Teams).",
	"double-elimination": "Erst die zweite Niederlage scheidet aus; alle starten im Upper Bracket (4, 8, 16 oder 32 Teams).",
	"double-elimination-light": "Die besten Seeds überspringen Runde 1, die untersten starten im Lower Bracket (6 oder 8 Teams).",
	"page-playoffs": "#1 gegen #2 um den direkten Finaleinzug, #3 gegen #4 als Eliminator; der Verlierer oben bekommt eine zweite Chance (4 Teams).",
	gauntlet: "Die niedrigsten Seeds starten, der Sieger klettert Stufe für Stufe bis zu #1 im Finale (3–8 Teams).",
	"round-robin": "Alle Playoff-Teams spielen einmal gegeneinander, danach Finale zwischen Tabellen-#1 und #2 (3–8 Teams).",
};

/** Plain-language summary of the whole event, used by the admin panel and the rulebook. */
export function describeStructurePlan(config: StructureConfig): string[] {
	const participants = mainEventTeamCount(config);
	const lines: string[] = [];
	const bo = (value: number) => `Bo${value}`;
	if (config.playInTeamCount > 0) {
		lines.push(`Play-in: ${config.playInTeamCount} Teams, ${config.playInTeamCount / 2} kommen weiter (${bo(config.bestOf.dayOne)}).`);
	}
	switch (config.dayOneFormat) {
		case "none":
			lines.push(`Keine Vorrunde: ${participants} Teams starten direkt in den Playoffs, gesetzt nach Setzliste.`);
			break;
		case "groups": {
			const groupCount = Math.max(1, Math.min(config.groupCount, participants));
			const base = Math.floor(participants / groupCount);
			const larger = participants % groupCount;
			const sizes = larger > 0 ? `${larger}× ${base + 1} und ${groupCount - larger}× ${base}` : `${groupCount}× ${base}`;
			const matches = Array.from({ length: groupCount }, (_, index) => base + (index < larger ? 1 : 0)).reduce(
				(total, size) => total + ((size * (size - 1)) / 2) * config.groupRoundRobinLegs,
				0
			);
			lines.push(
				`${groupCount} Gruppe${groupCount === 1 ? "" : "n"} (${sizes}) · ${matches} Matches (${bo(config.bestOf.dayOne)}); ${config.advanceTeamCount === participants ? "alle Teams" : `${config.advanceTeamCount} von ${participants} Teams`} erreichen die Playoffs.`
			);
			break;
		}
		case "gsl":
			lines.push(
				`${config.groupCount} GSL-Gruppe${config.groupCount === 1 ? "" : "n"} à 4 Teams · ${config.groupCount * 5} Matches (${bo(config.bestOf.dayOne)}); Platz 1 und 2 jeder Gruppe erreichen die Playoffs.`
			);
			break;
		case "swiss":
			lines.push(
				participants === 8 && config.advanceTeamCount === 8 && config.swissRounds === 4
					? `8-Team-Placement-Swiss · bis zu 4 Runden (${bo(config.bestOf.dayOne)}); alle Teams erreichen die Playoffs.`
					: `${config.swissRounds} Swiss-Runden (${bo(config.bestOf.dayOne)}); ${config.advanceTeamCount >= participants ? "alle Teams erreichen die Playoffs" : `die besten ${config.advanceTeamCount} erreichen die Playoffs`}.`
			);
			break;
		case "swiss-elimination":
			lines.push(
				`Swiss mit Ausscheiden: ${config.swissWinsToAdvance} Siege = weiter, ${config.swissWinsToAdvance} Niederlagen = raus, bis zu ${config.swissRounds} Runden (${bo(config.bestOf.dayOne)}); ${config.advanceTeamCount} Teams erreichen die Playoffs.`
			);
			break;
		case "undecided":
			lines.push("Tag 1: Format noch offen.");
	}
	if (config.format === "undecided") lines.push("Tag 2: Playoff-Format noch offen.");
	else {
		const extras = [config.thirdPlaceMatch ? "Spiel um Platz 3" : null, config.grandFinalReset ? "Bracket Reset" : null].filter(Boolean);
		lines.push(
			`${PLAYOFF_FORMAT_LABELS[config.format]} mit ${config.advanceTeamCount} Teams (${bo(config.bestOf.playoffs)}, Finale ${bo(config.bestOf.finals)})${extras.length ? ` · ${extras.join(" · ")}` : ""}.`
		);
	}
	lines.push(`Seitenwahl: ${SIDE_SELECTION_LABELS[config.sideSelection]}.`);
	return lines;
}

/** Rule bullets for the chosen playoff bracket (terms page). */
export function playoffRuleBullets(config: StructureConfig): string[] {
	const sides = `Seitenwahl: ${SIDE_SELECTION_LABELS[config.sideSelection]}`;
	const reset = config.grandFinalReset
		? "Gewinnt das Team aus dem Lower Bracket das Grand Final, folgt ein Bracket Reset mit einem zweiten Finale"
		: "Das Grand Final ist ein einzelnes Do-or-die-Match ohne Bracket Reset";
	switch (config.format) {
		case "double-elimination":
			return [
				"Alle qualifizierten Teams starten im Upper Bracket",
				"Eine Niederlage im Upper Bracket führt ins Lower Bracket",
				"Eine Niederlage im Lower Bracket beendet das Turnier",
				reset,
				sides,
			];
		case "double-elimination-light":
			return [
				config.advanceTeamCount === 6
					? "Seed #1 spielt gegen #4 und #2 gegen #3 im Upper Bracket; Seed #5 und #6 beginnen im Lower Bracket"
					: "Seed #1 und #2 starten im Upper-Halbfinale; Seed #7 und #8 beginnen im Lower Bracket",
				"Eine Niederlage im Lower Bracket beendet das Turnier",
				reset,
				sides,
			];
		case "single-elimination":
			return [
				"Eine Niederlage in den Playoffs beendet das Turnier",
				config.advanceTeamCount & (config.advanceTeamCount - 1)
					? "Die bestgesetzten Teams erhalten ein Freilos in Runde 1"
					: "Seed #1 und #2 können sich erst im Finale treffen",
				...(config.thirdPlaceMatch ? ["Die Verlierer der Halbfinals spielen um Platz 3"] : []),
				sides,
			];
		case "page-playoffs":
			return [
				"#1 gegen #2: Der Sieger steht direkt im Finale, der Verlierer bekommt eine zweite Chance",
				"#3 gegen #4: Der Verlierer scheidet aus",
				"Im Halbfinale trifft der Verlierer von #1 gegen #2 auf den Sieger von #3 gegen #4",
				sides,
			];
		case "gauntlet":
			return [
				`Die Seeds #${config.advanceTeamCount} und #${config.advanceTeamCount - 1} eröffnen`,
				"Jeder Sieger steigt eine Stufe auf und trifft auf den nächsthöheren Seed",
				"Seed #1 wartet im Finale",
				sides,
			];
		case "round-robin":
			return [
				"Alle Playoff-Teams spielen einmal gegeneinander",
				`Die Tabelle entscheidet: ${describeTiebreakers(config.tiebreakers)}`,
				"Tabellen-#1 und #2 spielen das Finale",
				sides,
			];
		case "undecided":
			return ["Das Playoff-System wird anhand der finalen Teamzahl festgelegt", "Seeding und mögliche Freilose werden rechtzeitig veröffentlicht"];
	}
}
