/**
 * Generic bracket engine for the flexible tournament kinds.
 *
 * A bracket is a list of definitions whose two slots point at a seed, a table rank or the
 * winner/loser of another match. Generators build the definitions for every supported format,
 * `resolveBracket` fills in team names from seeds and stored results. Every definition carries
 * layout hints so one renderer can draw any of the formats.
 */
import { seriesWinnerSide } from "@/lib/tournament-series";
import type { PlayoffFormat } from "@/lib/tournament-structure";

export type BracketSlot = { kind: "seed"; seed: number } | { kind: "winner" | "loser"; matchId: string } | { kind: "table"; rank: number };
export type BracketLane = "upper" | "lower" | "final" | "placement" | "table";
export type BracketStage = "play-in" | "day-one" | "playoffs" | "finals";
export type BracketLayout = { lane: BracketLane; column: number; columnLabel: string; row: number; span: number };

export type BracketDefinition = {
	id: string;
	bracket: "Upper" | "Lower" | "Grand";
	round: string;
	teamA: BracketSlot;
	teamB: BracketSlot;
	stage: BracketStage;
	layout: BracketLayout;
	/** Bracket reset: only played when the lower-bracket finalist (team B) wins the referenced final. */
	resetOf?: string;
};

export type BracketStoredMatch = {
	teamAName?: string;
	teamBName?: string;
	scoreA?: number;
	scoreB?: number;
	status?: "Scheduled" | "Live" | "Finished" | "Locked" | "Pending";
};

export type ResolvedBracketMatch<S extends BracketStoredMatch = BracketStoredMatch> = {
	id: string;
	bracket: BracketDefinition["bracket"];
	round: string;
	stage: BracketStage;
	layout: BracketLayout;
	bestOf: number;
	teamAName: string | null;
	teamBName: string | null;
	teamALabel: string;
	teamBLabel: string;
	status: NonNullable<BracketStoredMatch["status"]>;
	/** The stored result, dropped when it belongs to a different pairing than the one resolved now. */
	stored: S | undefined;
	winner: string | null;
	loser: string | null;
	/** Winner sources, used to draw connectors. */
	sources: { teamA?: string; teamB?: string };
	teamASeed?: number;
	teamBSeed?: number;
	/** Bracket reset that only happens if the lower-bracket finalist wins the grand final. */
	conditional: boolean;
};

const seed = (value: number): BracketSlot => ({ kind: "seed", seed: value });
const winner = (matchId: string): BracketSlot => ({ kind: "winner", matchId });
const loser = (matchId: string): BracketSlot => ({ kind: "loser", matchId });
const table = (rank: number): BracketSlot => ({ kind: "table", rank });
const layout = (lane: BracketLane, column: number, columnLabel: string, row: number, span: number): BracketLayout => ({ lane, column, columnLabel, row, span });

export function nextPowerOfTwo(value: number): number {
	let size = 1;
	while (size < value) size *= 2;
	return size;
}

/** Standard bracket order so #1 and #2 can only meet in the final (1, 8, 4, 5, 2, 7, 3, 6 for eight). */
export function standardSeedOrder(size: number): number[] {
	let order = [1];
	while (order.length < size) {
		const length = order.length * 2;
		order = order.flatMap((value) => [value, length + 1 - value]);
	}
	return order;
}

function eliminationRoundName(roundsFromEnd: number, round: number): string {
	if (roundsFromEnd === 0) return "Finale";
	if (roundsFromEnd === 1) return "Halbfinale";
	if (roundsFromEnd === 2) return "Viertelfinale";
	if (roundsFromEnd === 3) return "Achtelfinale";
	return `Runde ${round}`;
}

/** Single elimination for any team count; the top seeds get byes when the count is no power of two. */
export function singleEliminationDefinitions(teamCount: number, options: { thirdPlaceMatch?: boolean } = {}): BracketDefinition[] {
	const size = nextPowerOfTwo(Math.max(2, teamCount));
	const rounds = Math.log2(size);
	const order = standardSeedOrder(size);
	const definitions: BracketDefinition[] = [];
	// Per round: the slot every bracket position feeds into the next round (a match or a bye seed).
	let previous: BracketSlot[] = order.map((value) => seed(value));
	for (let round = 1; round <= rounds; round += 1) {
		const next: BracketSlot[] = [];
		const matchCount = size / 2 ** round;
		const name = eliminationRoundName(rounds - round, round);
		for (let index = 0; index < matchCount; index += 1) {
			const teamA = previous[index * 2];
			const teamB = previous[index * 2 + 1];
			const isBye = round === 1 && ((teamA.kind === "seed" && teamA.seed > teamCount) || (teamB.kind === "seed" && teamB.seed > teamCount));
			if (isBye) {
				next.push(teamA.kind === "seed" && teamA.seed <= teamCount ? teamA : teamB);
				continue;
			}
			const id = round === rounds ? "gf" : `ub-r${round}-${index + 1}`;
			definitions.push({
				id,
				bracket: round === rounds ? "Grand" : "Upper",
				round: round === rounds ? "Finale" : matchCount === 1 ? name : `${name} ${index + 1}`,
				teamA,
				teamB,
				stage: round === rounds ? "finals" : "playoffs",
				layout: round === rounds ? layout("final", 0, "Finale", 0, 2) : layout("upper", round - 1, name, index * 2 ** round, 2 ** round),
			});
			next.push(winner(id));
		}
		previous = next;
	}
	if (options.thirdPlaceMatch && rounds >= 2) {
		const semis = definitions.filter((definition) => definition.id.startsWith(`ub-r${rounds - 1}-`));
		if (semis.length === 2) {
			definitions.push({
				id: "p3",
				bracket: "Grand",
				round: "Spiel um Platz 3",
				teamA: loser(semis[0].id),
				teamB: loser(semis[1].id),
				stage: "playoffs",
				layout: layout("placement", 0, "Spiel um Platz 3", 0, 2),
			});
		}
	}
	return definitions;
}

function grandFinal(options: { grandFinalReset?: boolean }): BracketDefinition[] {
	const final: BracketDefinition = {
		id: "gf",
		bracket: "Grand",
		round: "Grand Final",
		teamA: winner("ub-f"),
		teamB: winner("lb-f"),
		stage: "finals",
		layout: layout("final", 0, "Grand Final", 0, 2),
	};
	if (!options.grandFinalReset) return [final];
	return [
		final,
		{
			id: "gf-2",
			bracket: "Grand",
			round: "Grand Final · Reset",
			teamA: winner("ub-f"),
			teamB: winner("lb-f"),
			stage: "finals",
			layout: layout("final", 1, "Bracket Reset", 0, 2),
			resetOf: "gf",
		},
	];
}

/** Double elimination for 4, 8, 16 or 32 teams: everyone starts in the upper bracket. */
export function doubleEliminationDefinitions(teamCount: number, options: { grandFinalReset?: boolean } = {}): BracketDefinition[] {
	if (![4, 8, 16, 32].includes(teamCount)) return [];
	const rounds = Math.log2(teamCount);
	const order = standardSeedOrder(teamCount);
	const definitions: BracketDefinition[] = [];
	const upperIds: string[][] = [];
	for (let round = 1; round <= rounds; round += 1) {
		const matchCount = teamCount / 2 ** round;
		const ids: string[] = [];
		for (let index = 0; index < matchCount; index += 1) {
			const id = round === rounds ? "ub-f" : `ub-r${round}-${index + 1}`;
			const label = round === rounds ? "Upper Final" : round === rounds - 1 ? "Upper Halbfinale" : `Upper Runde ${round}`;
			const columnLabel = round === rounds ? "Upper Final" : round === rounds - 1 ? "Upper-Halbfinale" : `Runde ${round}`;
			definitions.push({
				id,
				bracket: "Upper",
				round: matchCount === 1 ? label : `${label} ${label.startsWith("Upper Runde") ? "· Match " : ""}${index + 1}`,
				teamA: round === 1 ? seed(order[index * 2]) : winner(upperIds[round - 2][index * 2]),
				teamB: round === 1 ? seed(order[index * 2 + 1]) : winner(upperIds[round - 2][index * 2 + 1]),
				stage: "playoffs",
				layout: layout("upper", round - 1, columnLabel, index * 2 ** round, 2 ** round),
			});
			ids.push(id);
		}
		upperIds.push(ids);
	}

	const lowerRounds = 2 * (rounds - 1);
	const laneRows = teamCount / 2;
	let lowerWinners: string[] = [];
	for (let lowerRound = 1; lowerRound <= lowerRounds; lowerRound += 1) {
		const isFinal = lowerRound === lowerRounds;
		// Round 1 pairs the upper round 1 losers, even rounds bring in the next upper losers, odd rounds consolidate.
		const pairs: Array<[BracketSlot, BracketSlot]> = [];
		if (lowerRound === 1) {
			const losers = upperIds[0];
			for (let index = 0; index < losers.length / 2; index += 1) pairs.push([loser(losers[index * 2]), loser(losers[index * 2 + 1])]);
		} else if (lowerRound % 2 === 0) {
			const dropping = [...upperIds[lowerRound / 2]].reverse();
			lowerWinners.forEach((id, index) => pairs.push([winner(id), loser(dropping[index])]));
		} else {
			for (let index = 0; index < lowerWinners.length / 2; index += 1) pairs.push([winner(lowerWinners[index * 2]), winner(lowerWinners[index * 2 + 1])]);
		}
		const semi = lowerRound === lowerRounds - 1 && pairs.length === 1;
		const label = isFinal ? "Lower Final" : semi ? "Lower Halbfinale" : `Lower Runde ${lowerRound}`;
		const ids = pairs.map((_, index) => (isFinal ? "lb-f" : pairs.length === 1 ? `lb-r${lowerRound}` : `lb-r${lowerRound}-${index + 1}`));
		pairs.forEach(([teamA, teamB], index) => {
			const span = laneRows / pairs.length;
			definitions.push({
				id: ids[index],
				bracket: "Lower",
				round: pairs.length === 1 ? label : `${label} · Match ${index + 1}`,
				teamA,
				teamB,
				stage: "playoffs",
				layout: layout("lower", lowerRound - 1, isFinal ? "Lower Final" : semi ? "Lower-Halbfinale" : `Runde ${lowerRound}`, index * span, span),
			});
		});
		lowerWinners = ids;
	}
	return [...definitions, ...grandFinal(options)];
}

/** Double elimination light: the top seeds skip the opening round, the bottom seeds start in the lower bracket. */
export function doubleEliminationLightDefinitions(teamCount: number, options: { grandFinalReset?: boolean } = {}): BracketDefinition[] {
	const upper = (id: string, round: string, teamA: BracketSlot, teamB: BracketSlot, column: number, columnLabel: string, row: number, span: number): BracketDefinition => ({
		id,
		bracket: "Upper",
		round,
		teamA,
		teamB,
		stage: "playoffs",
		layout: layout("upper", column, columnLabel, row, span),
	});
	const lower = (id: string, round: string, teamA: BracketSlot, teamB: BracketSlot, column: number, columnLabel: string, row: number, span: number): BracketDefinition => ({
		id,
		bracket: "Lower",
		round,
		teamA,
		teamB,
		stage: "playoffs",
		layout: layout("lower", column, columnLabel, row, span),
	});
	if (teamCount === 8) {
		return [
			upper("ub-r1-1", "Upper Runde 1 · Match 1", seed(3), seed(6), 0, "Runde 1", 0, 2),
			upper("ub-r1-2", "Upper Runde 1 · Match 2", seed(4), seed(5), 0, "Runde 1", 2, 2),
			upper("ub-r2-1", "Upper Halbfinale 1", seed(2), winner("ub-r1-1"), 1, "Upper-Halbfinale", 0, 2),
			upper("ub-r2-2", "Upper Halbfinale 2", seed(1), winner("ub-r1-2"), 1, "Upper-Halbfinale", 2, 2),
			upper("ub-f", "Upper Final", winner("ub-r2-1"), winner("ub-r2-2"), 2, "Upper Final", 0, 4),
			lower("lb-r1-1", "Lower Runde 1 · Match 1", loser("ub-r1-1"), seed(7), 0, "Runde 1", 0, 2),
			lower("lb-r1-2", "Lower Runde 1 · Match 2", loser("ub-r1-2"), seed(8), 0, "Runde 1", 2, 2),
			lower("lb-r2-1", "Lower Runde 2 · Match 1", winner("lb-r1-1"), loser("ub-r2-1"), 1, "Runde 2", 0, 2),
			lower("lb-r2-2", "Lower Runde 2 · Match 2", winner("lb-r1-2"), loser("ub-r2-2"), 1, "Runde 2", 2, 2),
			lower("lb-r3", "Lower Halbfinale", winner("lb-r2-1"), winner("lb-r2-2"), 2, "Lower-Halbfinale", 0, 4),
			lower("lb-f", "Lower Final", winner("lb-r3"), loser("ub-f"), 3, "Lower Final", 0, 4),
			...grandFinal(options),
		];
	}
	if (teamCount === 6) {
		return [
			upper("ub-r2-1", "Upper Halbfinale 1", seed(1), seed(4), 0, "Upper-Halbfinale", 0, 2),
			upper("ub-r2-2", "Upper Halbfinale 2", seed(2), seed(3), 0, "Upper-Halbfinale", 2, 2),
			upper("ub-f", "Upper Final", winner("ub-r2-1"), winner("ub-r2-2"), 1, "Upper Final", 0, 4),
			lower("lb-r1-1", "Lower Runde 1 · Match 1", loser("ub-r2-1"), seed(5), 0, "Runde 1", 0, 2),
			lower("lb-r1-2", "Lower Runde 1 · Match 2", loser("ub-r2-2"), seed(6), 0, "Runde 1", 2, 2),
			lower("lb-r3", "Lower Halbfinale", winner("lb-r1-1"), winner("lb-r1-2"), 1, "Lower-Halbfinale", 0, 4),
			lower("lb-f", "Lower Final", winner("lb-r3"), loser("ub-f"), 2, "Lower Final", 0, 4),
			...grandFinal(options),
		];
	}
	return [];
}

/** Page playoffs: #1 vs #2 for a direct final spot, #3 vs #4 as an elimination match, the loser of the top match gets a second chance. */
export function pagePlayoffDefinitions(): BracketDefinition[] {
	return [
		{ id: "pg-q", bracket: "Upper", round: "Qualifier (#1 gegen #2)", teamA: seed(1), teamB: seed(2), stage: "playoffs", layout: layout("upper", 0, "Qualifier", 0, 2) },
		{ id: "pg-e", bracket: "Lower", round: "Eliminator (#3 gegen #4)", teamA: seed(3), teamB: seed(4), stage: "playoffs", layout: layout("lower", 0, "Eliminator", 0, 2) },
		{
			id: "pg-sf",
			bracket: "Lower",
			round: "Halbfinale",
			teamA: loser("pg-q"),
			teamB: winner("pg-e"),
			stage: "playoffs",
			layout: layout("lower", 1, "Halbfinale", 0, 2),
		},
		{ id: "gf", bracket: "Grand", round: "Finale", teamA: winner("pg-q"), teamB: winner("pg-sf"), stage: "finals", layout: layout("final", 0, "Finale", 0, 2) },
	];
}

/** Gauntlet: the lowest seeds start, every winner climbs one step and meets the next-higher seed. */
export function gauntletDefinitions(teamCount: number): BracketDefinition[] {
	if (teamCount < 3) return [];
	const definitions: BracketDefinition[] = [];
	let previous: BracketSlot = seed(teamCount);
	for (let step = 1; step < teamCount; step += 1) {
		const opponentSeed = teamCount - step;
		const final = opponentSeed === 1;
		const id = final ? "gf" : `gt-${step}`;
		definitions.push({
			id,
			bracket: final ? "Grand" : "Upper",
			round: final ? "Finale" : `Gauntlet Stufe ${step} (#${opponentSeed})`,
			teamA: seed(opponentSeed),
			teamB: previous,
			stage: final ? "finals" : "playoffs",
			layout: final ? layout("final", 0, "Finale", 0, 2) : layout("upper", step - 1, `Stufe ${step}`, 0, 2),
		});
		previous = winner(id);
	}
	return definitions;
}

/** Circle method: every pair meets once, odd counts get one bye per round. */
export function roundRobinPairs(count: number): Array<{ round: number; slot: number; teamA: number; teamB: number }> {
	const rotation: Array<number | null> = Array.from({ length: count }, (_, index) => index + 1);
	if (rotation.length % 2 !== 0) rotation.push(null);
	const rounds = rotation.length - 1;
	const pairs: Array<{ round: number; slot: number; teamA: number; teamB: number }> = [];
	for (let round = 1; round <= rounds; round += 1) {
		let slot = 0;
		for (let index = 0; index < rotation.length / 2; index += 1) {
			const teamA = rotation[index];
			const teamB = rotation[rotation.length - 1 - index];
			if (teamA === null || teamB === null) continue;
			slot += 1;
			pairs.push({ round, slot, teamA, teamB });
		}
		rotation.splice(1, 0, rotation.pop() ?? null);
	}
	return pairs;
}

/** Round-robin playoffs: every playoff team meets every other once, then #1 and #2 of the table play the final. */
export function roundRobinPlayoffDefinitions(teamCount: number): BracketDefinition[] {
	if (teamCount < 3) return [];
	const matches: BracketDefinition[] = roundRobinPairs(teamCount).map((pair) => ({
		id: `rr-r${pair.round}-${pair.slot}`,
		bracket: "Upper",
		round: `Playoff-Runde ${pair.round} · Match ${pair.slot}`,
		teamA: seed(pair.teamA),
		teamB: seed(pair.teamB),
		stage: "playoffs",
		layout: layout("table", pair.round - 1, `Runde ${pair.round}`, pair.slot - 1, 1),
	}));
	return [
		...matches,
		{ id: "gf", bracket: "Grand", round: "Finale (Tabellen-#1 gegen #2)", teamA: table(1), teamB: table(2), stage: "finals", layout: layout("final", 0, "Finale", 0, 2) },
	];
}

/** GSL group of four: opening matches, winners' match, elimination match and decider. */
export function gslGroupDefinitions(group: string): BracketDefinition[] {
	const prefix = `${group.toLowerCase()}-gsl`;
	return [
		{
			id: `${prefix}-o1`,
			bracket: "Upper",
			round: `Gruppe ${group} · Eröffnung 1`,
			teamA: seed(1),
			teamB: seed(4),
			stage: "day-one",
			layout: layout("upper", 0, "Eröffnung", 0, 2),
		},
		{
			id: `${prefix}-o2`,
			bracket: "Upper",
			round: `Gruppe ${group} · Eröffnung 2`,
			teamA: seed(2),
			teamB: seed(3),
			stage: "day-one",
			layout: layout("upper", 0, "Eröffnung", 2, 2),
		},
		{
			id: `${prefix}-w`,
			bracket: "Upper",
			round: `Gruppe ${group} · Winners' Match`,
			teamA: winner(`${prefix}-o1`),
			teamB: winner(`${prefix}-o2`),
			stage: "day-one",
			layout: layout("upper", 1, "Winners' Match", 0, 4),
		},
		{
			id: `${prefix}-e`,
			bracket: "Lower",
			round: `Gruppe ${group} · Elimination Match`,
			teamA: loser(`${prefix}-o1`),
			teamB: loser(`${prefix}-o2`),
			stage: "day-one",
			layout: layout("lower", 0, "Elimination", 0, 2),
		},
		{
			id: `${prefix}-d`,
			bracket: "Lower",
			round: `Gruppe ${group} · Decider Match`,
			teamA: loser(`${prefix}-w`),
			teamB: winner(`${prefix}-e`),
			stage: "day-one",
			layout: layout("lower", 1, "Decider", 0, 2),
		},
	];
}

/** Play-in: stored pairings, first against second, third against fourth, and so on. */
export function playInDefinitions(pairCount: number): BracketDefinition[] {
	return Array.from({ length: pairCount }, (_, index) => ({
		id: `pi-m${index + 1}`,
		bracket: "Upper" as const,
		round: `Play-in · Match ${index + 1}`,
		teamA: seed(index * 2 + 1),
		teamB: seed(index * 2 + 2),
		stage: "play-in" as const,
		layout: layout("upper", 0, "Play-in", index * 2, 2),
	}));
}

export function playoffDefinitions(format: PlayoffFormat, teamCount: number, options: { thirdPlaceMatch?: boolean; grandFinalReset?: boolean } = {}): BracketDefinition[] {
	switch (format) {
		case "single-elimination":
			return teamCount >= 2 ? singleEliminationDefinitions(teamCount, options) : [];
		case "double-elimination":
			return doubleEliminationDefinitions(teamCount, options);
		case "double-elimination-light":
			return doubleEliminationLightDefinitions(teamCount, options);
		case "page-playoffs":
			return teamCount === 4 ? pagePlayoffDefinitions() : [];
		case "gauntlet":
			return gauntletDefinitions(teamCount);
		case "round-robin":
			return roundRobinPlayoffDefinitions(teamCount);
		case "undecided":
			return [];
	}
}

/**
 * Fills every definition with team names. Results only count when they belong to the pairing that is
 * resolved now, so a changed earlier result can never leak into a later match.
 */
export function resolveBracket<S extends BracketStoredMatch>(input: {
	definitions: BracketDefinition[];
	seeds: Record<number, string | null>;
	stored: Record<string, S | undefined>;
	bestOf: (definition: BracketDefinition) => number;
	seedLabel?: (seed: number) => string;
	/** Table ranks for `table` slots, computed from the already resolved matches. */
	table?: (resolved: ResolvedBracketMatch<S>[]) => Record<number, string | null>;
}): ResolvedBracketMatch<S>[] {
	const byId = new Map(input.definitions.map((definition) => [definition.id, definition]));
	const resolved = new Map<string, ResolvedBracketMatch<S>>();
	const seedByTeam = new Map(Object.entries(input.seeds).flatMap(([number, name]) => (name ? [[name, Number(number)] as const] : [])));
	let tableCache: Record<number, string | null> | null = null;

	const tableRanks = () => {
		if (tableCache) return tableCache;
		const withoutTable = input.definitions.filter((definition) => definition.teamA.kind !== "table" && definition.teamB.kind !== "table");
		tableCache = input.table ? input.table(withoutTable.map((definition) => resolveMatch(definition.id)!)) : {};
		return tableCache;
	};

	function resolveSlot(slot: BracketSlot): string | null {
		if (slot.kind === "seed") return input.seeds[slot.seed] ?? null;
		if (slot.kind === "table") return tableRanks()[slot.rank] ?? null;
		const match = resolveMatch(slot.matchId);
		return (slot.kind === "winner" ? match?.winner : match?.loser) ?? null;
	}

	function slotLabel(slot: BracketSlot): string {
		if (slot.kind === "seed") return input.seedLabel ? input.seedLabel(slot.seed) : `Seed #${slot.seed}`;
		if (slot.kind === "table") return `Tabellen-#${slot.rank}`;
		const source = byId.get(slot.matchId);
		return `${slot.kind === "winner" ? "Sieger" : "Verlierer"} ${source?.round ?? slot.matchId.toUpperCase()}`;
	}

	function resolveMatch(id: string): ResolvedBracketMatch<S> | undefined {
		const cached = resolved.get(id);
		if (cached) return cached;
		const definition = byId.get(id);
		if (!definition) return undefined;
		const bestOf = input.bestOf(definition);
		let teamAName = resolveSlot(definition.teamA);
		let teamBName = resolveSlot(definition.teamB);
		let conditional = false;
		if (definition.resetOf) {
			const final = resolveMatch(definition.resetOf);
			conditional = true;
			teamAName = final?.teamAName ?? null;
			teamBName = final?.teamBName ?? null;
			// The reset only exists after the lower-bracket finalist won the first final.
			if (!final?.winner || final.winner !== final.teamBName) {
				teamAName = null;
				teamBName = null;
			}
		}
		const candidate = input.stored[id];
		const stored = candidate?.teamAName && candidate.teamBName && (candidate.teamAName !== teamAName || candidate.teamBName !== teamBName) ? undefined : candidate;
		const winnerSide = teamAName && teamBName ? seriesWinnerSide(stored?.scoreA, stored?.scoreB, bestOf) : null;
		const matchWinner = winnerSide === "teamA" ? teamAName : winnerSide === "teamB" ? teamBName : null;
		const matchLoser = winnerSide === "teamA" ? teamBName : winnerSide === "teamB" ? teamAName : null;
		const match: ResolvedBracketMatch<S> = {
			id,
			bracket: definition.bracket,
			round: definition.round,
			stage: definition.stage,
			layout: definition.layout,
			bestOf,
			teamAName,
			teamBName,
			teamALabel: teamAName ?? (definition.resetOf ? "Nur falls nötig" : slotLabel(definition.teamA)),
			teamBLabel: teamBName ?? (definition.resetOf ? "Nur falls nötig" : slotLabel(definition.teamB)),
			status: teamAName && teamBName ? (stored?.status && stored.status !== "Locked" ? stored.status : "Scheduled") : "Locked",
			stored,
			winner: matchWinner,
			loser: matchLoser,
			// A reset continues the grand final, so its line comes from there.
			sources: definition.resetOf
				? { teamA: definition.resetOf }
				: {
						...(definition.teamA.kind === "winner" ? { teamA: definition.teamA.matchId } : {}),
						...(definition.teamB.kind === "winner" ? { teamB: definition.teamB.matchId } : {}),
					},
			teamASeed: teamAName ? seedByTeam.get(teamAName) : undefined,
			teamBSeed: teamBName ? seedByTeam.get(teamBName) : undefined,
			conditional,
		};
		resolved.set(id, match);
		return match;
	}

	return input.definitions
		.map((definition) => resolveMatch(definition.id)!)
		.filter((match) => {
			if (!match.conditional) return true;
			// Hide the reset once the upper-bracket finalist has won the first final.
			const final = resolved.get(byId.get(match.id)?.resetOf ?? "");
			return !(final?.winner && final.winner === final.teamAName);
		});
}

/** The match that decides the title: the bracket reset when it was needed, otherwise the final. */
export function titleDecidingMatch<T extends { id: string; conditional?: boolean; teamAName: string | null; teamBName: string | null }>(matches: T[]): T | undefined {
	const reset = matches.find((match) => match.id === "gf-2" && match.teamAName && match.teamBName);
	return reset ?? matches.find((match) => match.id === "gf");
}

/** Final placements of a GSL group: 1st and 2nd advance, 3rd and 4th are out. */
export function gslPlacements(group: string, matches: ResolvedBracketMatch[]): Record<number, string | null> {
	const prefix = `${group.toLowerCase()}-gsl`;
	const find = (suffix: string) => matches.find((match) => match.id === `${prefix}-${suffix}`);
	return {
		1: find("w")?.winner ?? null,
		2: find("d")?.winner ?? null,
		3: find("d")?.loser ?? null,
		4: find("e")?.loser ?? null,
	};
}
