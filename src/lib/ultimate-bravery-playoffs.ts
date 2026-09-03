import type { TournamentTeam } from "@/lib/tournament-data";
import type { GroupMatch } from "@/lib/tournament-data";
import type { GroupStandings } from "@/lib/bracket-resolver";
import type { TournamentSettings } from "@/lib/tournament-settings";
import type { StoredTournamentMatch } from "@/lib/tournament-storage";
import type { SwissStageState } from "@/lib/tournament-swiss";

type StoredMap = Record<string, StoredTournamentMatch>;
type SeedSlot = { kind: "seed"; seed: number };
type MatchSlot = { kind: "winner" | "loser"; matchId: string };
type PlayoffSlot = SeedSlot | MatchSlot;

type PlayoffDefinition = {
	id: string;
	bracket: "Upper" | "Lower" | "Grand";
	round: string;
	time: string;
	teamA: PlayoffSlot;
	teamB: PlayoffSlot;
};

export type UltimateBraveryPlayoffMatch = {
	id: string;
	bracket: PlayoffDefinition["bracket"];
	round: string;
	time: string;
	teamAName: string | null;
	teamBName: string | null;
	teamALabel: string;
	teamBLabel: string;
	status: NonNullable<StoredTournamentMatch["status"]>;
	scoreA?: number;
	scoreB?: number;
	gameDurationSeconds?: number;
	teamAChampions?: string[];
	teamBChampions?: string[];
	blueSide: "teamA" | "teamB";
	isCasted?: boolean;
	winner?: string;
	adminNote?: string;
	sideSelectionTeamName?: string;
	sideSelectionSeed?: number;
};

const seed = (value: number): SeedSlot => ({ kind: "seed", seed: value });
const winner = (matchId: string): MatchSlot => ({ kind: "winner", matchId });
const loser = (matchId: string): MatchSlot => ({ kind: "loser", matchId });

const QUARTERFINALS: PlayoffDefinition[] = [
	{ id: "ub-r1-1", bracket: "Upper", round: "Viertelfinale 1", time: "Rolling Schedule", teamA: seed(1), teamB: seed(8) },
	{ id: "ub-r1-2", bracket: "Upper", round: "Viertelfinale 2", time: "Rolling Schedule", teamA: seed(4), teamB: seed(5) },
	{ id: "ub-r1-3", bracket: "Upper", round: "Viertelfinale 3", time: "Rolling Schedule", teamA: seed(2), teamB: seed(7) },
	{ id: "ub-r1-4", bracket: "Upper", round: "Viertelfinale 4", time: "Rolling Schedule", teamA: seed(3), teamB: seed(6) },
];

const UPPER_ROUNDS: PlayoffDefinition[] = [
	{ id: "ub-r2-1", bracket: "Upper", round: "Upper Halbfinale 1", time: "Rolling Schedule", teamA: winner("ub-r1-1"), teamB: winner("ub-r1-2") },
	{ id: "ub-r2-2", bracket: "Upper", round: "Upper Halbfinale 2", time: "Rolling Schedule", teamA: winner("ub-r1-3"), teamB: winner("ub-r1-4") },
	{ id: "ub-f", bracket: "Upper", round: "Upper Final", time: "Rolling Schedule", teamA: winner("ub-r2-1"), teamB: winner("ub-r2-2") },
];

const LOWER_ROUNDS: PlayoffDefinition[] = [
	{ id: "lb-r1-1", bracket: "Lower", round: "Lower Runde 1 · Match 1", time: "Rolling Schedule", teamA: loser("ub-r1-1"), teamB: loser("ub-r1-2") },
	{ id: "lb-r1-2", bracket: "Lower", round: "Lower Runde 1 · Match 2", time: "Rolling Schedule", teamA: loser("ub-r1-3"), teamB: loser("ub-r1-4") },
	{ id: "lb-r2-1", bracket: "Lower", round: "Lower Runde 2 · Match 1", time: "Rolling Schedule", teamA: winner("lb-r1-1"), teamB: loser("ub-r2-2") },
	{ id: "lb-r2-2", bracket: "Lower", round: "Lower Runde 2 · Match 2", time: "Rolling Schedule", teamA: winner("lb-r1-2"), teamB: loser("ub-r2-1") },
	{ id: "lb-r3", bracket: "Lower", round: "Lower Halbfinale", time: "Rolling Schedule", teamA: winner("lb-r2-1"), teamB: winner("lb-r2-2") },
	{ id: "lb-f", bracket: "Lower", round: "Lower Final", time: "Rolling Schedule", teamA: winner("lb-r3"), teamB: loser("ub-f") },
];

const GRAND_FINALS: PlayoffDefinition[] = [{ id: "gf", bracket: "Grand", round: "Grand Final", time: "Rolling Schedule", teamA: winner("ub-f"), teamB: winner("lb-f") }];

const DOUBLE_ELIMINATION_LIGHT: PlayoffDefinition[] = [
	{ id: "ub-r1-1", bracket: "Upper", round: "Upper Runde 1 · Match 1", time: "Rolling Schedule", teamA: seed(3), teamB: seed(6) },
	{ id: "ub-r1-2", bracket: "Upper", round: "Upper Runde 1 · Match 2", time: "Rolling Schedule", teamA: seed(4), teamB: seed(5) },
	{ id: "ub-r2-1", bracket: "Upper", round: "Upper Halbfinale 1", time: "Rolling Schedule", teamA: seed(2), teamB: winner("ub-r1-1") },
	{ id: "ub-r2-2", bracket: "Upper", round: "Upper Halbfinale 2", time: "Rolling Schedule", teamA: seed(1), teamB: winner("ub-r1-2") },
	{ id: "ub-f", bracket: "Upper", round: "Upper Final", time: "Rolling Schedule", teamA: winner("ub-r2-1"), teamB: winner("ub-r2-2") },
	{ id: "lb-r1-1", bracket: "Lower", round: "Lower Runde 1 · Match 1", time: "Rolling Schedule", teamA: loser("ub-r1-1"), teamB: seed(7) },
	{ id: "lb-r1-2", bracket: "Lower", round: "Lower Runde 1 · Match 2", time: "Rolling Schedule", teamA: loser("ub-r1-2"), teamB: seed(8) },
	{ id: "lb-r2-1", bracket: "Lower", round: "Lower Runde 2 · Match 1", time: "Rolling Schedule", teamA: winner("lb-r1-1"), teamB: loser("ub-r2-1") },
	{ id: "lb-r2-2", bracket: "Lower", round: "Lower Runde 2 · Match 2", time: "Rolling Schedule", teamA: winner("lb-r1-2"), teamB: loser("ub-r2-2") },
	{ id: "lb-r3", bracket: "Lower", round: "Lower Halbfinale", time: "Rolling Schedule", teamA: winner("lb-r2-1"), teamB: winner("lb-r2-2") },
	{ id: "lb-f", bracket: "Lower", round: "Lower Final", time: "Rolling Schedule", teamA: winner("lb-r3"), teamB: loser("ub-f") },
	{ id: "gf", bracket: "Grand", round: "Grand Final", time: "Rolling Schedule", teamA: winner("ub-f"), teamB: winner("lb-f") },
];

const DOUBLE_ELIMINATION_FOUR: PlayoffDefinition[] = [
	{ id: "ub-r2-1", bracket: "Upper", round: "Upper Halbfinale 1", time: "Rolling Schedule", teamA: seed(1), teamB: seed(4) },
	{ id: "ub-r2-2", bracket: "Upper", round: "Upper Halbfinale 2", time: "Rolling Schedule", teamA: seed(2), teamB: seed(3) },
	{ id: "ub-f", bracket: "Upper", round: "Upper Final", time: "Rolling Schedule", teamA: winner("ub-r2-1"), teamB: winner("ub-r2-2") },
	{ id: "lb-r1", bracket: "Lower", round: "Lower Runde 1", time: "Rolling Schedule", teamA: loser("ub-r2-1"), teamB: loser("ub-r2-2") },
	{ id: "lb-f", bracket: "Lower", round: "Lower Final", time: "Rolling Schedule", teamA: winner("lb-r1"), teamB: loser("ub-f") },
	{ id: "gf", bracket: "Grand", round: "Grand Final", time: "Rolling Schedule", teamA: winner("ub-f"), teamB: winner("lb-f") },
];

const DOUBLE_ELIMINATION_LIGHT_SIX: PlayoffDefinition[] = [
	{ id: "ub-r2-1", bracket: "Upper", round: "Upper Halbfinale 1", time: "Rolling Schedule", teamA: seed(1), teamB: seed(4) },
	{ id: "ub-r2-2", bracket: "Upper", round: "Upper Halbfinale 2", time: "Rolling Schedule", teamA: seed(2), teamB: seed(3) },
	{ id: "ub-f", bracket: "Upper", round: "Upper Final", time: "Rolling Schedule", teamA: winner("ub-r2-1"), teamB: winner("ub-r2-2") },
	{ id: "lb-r1-1", bracket: "Lower", round: "Lower Runde 1 · Match 1", time: "Rolling Schedule", teamA: loser("ub-r2-1"), teamB: seed(5) },
	{ id: "lb-r1-2", bracket: "Lower", round: "Lower Runde 1 · Match 2", time: "Rolling Schedule", teamA: loser("ub-r2-2"), teamB: seed(6) },
	{ id: "lb-r3", bracket: "Lower", round: "Lower Halbfinale", time: "Rolling Schedule", teamA: winner("lb-r1-1"), teamB: winner("lb-r1-2") },
	{ id: "lb-f", bracket: "Lower", round: "Lower Final", time: "Rolling Schedule", teamA: winner("lb-r3"), teamB: loser("ub-f") },
	{ id: "gf", bracket: "Grand", round: "Grand Final", time: "Rolling Schedule", teamA: winner("ub-f"), teamB: winner("lb-f") },
];

const SINGLE_ELIMINATION: PlayoffDefinition[] = [
	...QUARTERFINALS,
	{ id: "ub-r2-1", bracket: "Upper", round: "Halbfinale 1", time: "Rolling Schedule", teamA: winner("ub-r1-1"), teamB: winner("ub-r1-2") },
	{ id: "ub-r2-2", bracket: "Upper", round: "Halbfinale 2", time: "Rolling Schedule", teamA: winner("ub-r1-3"), teamB: winner("ub-r1-4") },
	{ id: "gf", bracket: "Grand", round: "Finale", time: "Rolling Schedule", teamA: winner("ub-r2-1"), teamB: winner("ub-r2-2") },
];

type SwissStanding = {
	key: string;
	name: string;
	wins: number;
	losses: number;
	opponents: string[];
	buchholz: number;
};

export function computeUltimateBraverySwissSeeds(swiss: SwissStageState, teams: TournamentTeam[], requiredRounds: number): Record<number, string | null> {
	const empty = Object.fromEntries(Array.from({ length: teams.length }, (_, index) => [index + 1, null])) as Record<number, string | null>;
	if (swiss.rounds.length < requiredRounds) return empty;
	const relevantRounds = swiss.rounds.slice(0, requiredRounds);
	if (relevantRounds.some((round) => !round.complete || round.pairings.some((pairing) => !pairing.bye && !pairing.winnerTeamKey))) return empty;

	const swissKeysByName = new Map<string, string>();
	for (const round of relevantRounds)
		for (const pairing of round.pairings) {
			swissKeysByName.set(pairing.teamAName, pairing.teamAKey);
			if (pairing.teamBKey && pairing.teamBName) swissKeysByName.set(pairing.teamBName, pairing.teamBKey);
		}
	const standings = new Map<string, SwissStanding>(
		teams.map((team) => {
			const key = swissKeysByName.get(team.name) ?? team.id;
			return [key, { key, name: team.name, wins: 0, losses: 0, opponents: [], buchholz: 0 }];
		})
	);
	for (const round of relevantRounds) {
		for (const pairing of round.pairings) {
			const first = standings.get(pairing.teamAKey);
			if (!first) continue;
			if (pairing.bye) {
				first.wins += 1;
				continue;
			}
			const second = pairing.teamBKey ? standings.get(pairing.teamBKey) : undefined;
			if (!second || !pairing.winnerTeamKey) continue;
			first.opponents.push(second.key);
			second.opponents.push(first.key);
			if (pairing.winnerTeamKey === first.key) {
				first.wins += 1;
				second.losses += 1;
			} else {
				second.wins += 1;
				first.losses += 1;
			}
		}
	}

	for (const standing of standings.values()) {
		standing.buchholz = standing.opponents.reduce((sum, opponent) => sum + (standings.get(opponent)?.wins ?? 0), 0);
	}
	const playedWinner = new Map<string, string>();
	for (const round of relevantRounds)
		for (const pairing of round.pairings)
			if (pairing.teamBKey && pairing.winnerTeamKey) playedWinner.set([pairing.teamAKey, pairing.teamBKey].sort().join(":"), pairing.winnerTeamKey);

	const ordered = [...standings.values()].sort((first, second) => {
		if (second.wins !== first.wins) return second.wins - first.wins;
		if (second.buchholz !== first.buchholz) return second.buchholz - first.buchholz;
		const directWinner = playedWinner.get([first.key, second.key].sort().join(":"));
		if (directWinner) return directWinner === first.key ? -1 : 1;
		return first.name.localeCompare(second.name, "de");
	});
	return Object.fromEntries(ordered.map((standing, index) => [index + 1, standing.name]));
}

export function computeUltimateBraveryGroupSeeds(standings: GroupStandings, groupMatches: GroupMatch[], advanceTeamCount: number): Record<number, string | null> {
	const empty = Object.fromEntries(Array.from({ length: advanceTeamCount }, (_, index) => [index + 1, null])) as Record<number, string | null>;
	const groups = [...new Set(groupMatches.map((match) => match.group))].sort((a, b) => a.localeCompare(b));
	if (groups.length === 0) return empty;

	for (const group of groups) {
		const groupStandings = standings[group] ?? [];
		if (groupStandings.length === 0 || groupStandings.some((standing) => standing.tiebreakerRequired)) return empty;
		for (const standing of groupStandings) {
			const expected = groupMatches.filter((match) => match.group === group && (match.teamA === standing.team.name || match.teamB === standing.team.name)).length;
			if (standing.played !== expected) return empty;
		}
	}

	const ordered: string[] = [];
	const largestGroup = Math.max(...groups.map((group) => standings[group]?.length ?? 0));
	for (let rank = 0; rank < largestGroup; rank += 1) {
		for (const group of groups) {
			const team = standings[group]?.[rank]?.team.name;
			if (team) ordered.push(team);
		}
	}
	return Object.fromEntries(Array.from({ length: advanceTeamCount }, (_, index) => [index + 1, ordered[index] ?? null]));
}

function playoffDefinitions(format: TournamentSettings["ultimateBravery"]["format"], teamCount: number): PlayoffDefinition[] {
	if (format === "double-elimination-light") {
		if (teamCount === 6) return DOUBLE_ELIMINATION_LIGHT_SIX;
		if (teamCount === 8) return DOUBLE_ELIMINATION_LIGHT;
		return [];
	}
	if (format === "double-elimination") {
		if (teamCount === 4) return DOUBLE_ELIMINATION_FOUR;
		if (teamCount === 8) return [...QUARTERFINALS, ...UPPER_ROUNDS, ...LOWER_ROUNDS, ...GRAND_FINALS];
		return [];
	}
	if (format === "single-elimination") {
		if (teamCount === 8) return SINGLE_ELIMINATION;
		if (teamCount === 4)
			return [
				...DOUBLE_ELIMINATION_FOUR.slice(0, 2),
				{ id: "gf", bracket: "Grand", round: "Finale", time: "Rolling Schedule", teamA: winner("ub-r2-1"), teamB: winner("ub-r2-2") },
			];
	}
	return [];
}

export function resolveUltimateBraveryPlayoffMatches(input: {
	format: TournamentSettings["ultimateBravery"]["format"];
	swiss?: SwissStageState;
	teams: TournamentTeam[];
	requiredRounds?: number;
	stored: StoredMap;
	seedNames?: Record<number, string | null>;
	playoffTeamCount?: number;
	seedSourceLabel?: string;
}): UltimateBraveryPlayoffMatch[] {
	const playoffTeamCount = input.playoffTeamCount ?? input.teams.length;
	if (input.format === "undecided") return [];
	const seeds = input.seedNames ?? (input.swiss ? computeUltimateBraverySwissSeeds(input.swiss, input.teams, input.requiredRounds ?? 0) : {});
	const definitions = playoffDefinitions(input.format, playoffTeamCount);
	if (definitions.length === 0) return [];
	const seedByTeam = new Map(Object.entries(seeds).flatMap(([seedNumber, teamName]) => (teamName ? [[teamName, Number(seedNumber)] as const] : [])));
	const resolved = new Map<string, UltimateBraveryPlayoffMatch>();

	function resolveSlot(slot: PlayoffSlot): string | null {
		if (slot.kind === "seed") return seeds[slot.seed] ?? null;
		const match = resolveMatch(slot.matchId);
		if (!match?.winner) return null;
		if (slot.kind === "winner") return match.winner;
		return match.teamAName && match.teamAName !== match.winner ? match.teamAName : match.teamBName && match.teamBName !== match.winner ? match.teamBName : null;
	}

	function slotLabel(slot: PlayoffSlot) {
		if (slot.kind === "seed") return `${input.seedSourceLabel ?? "Swiss Seed"} #${slot.seed}`;
		return `${slot.kind === "winner" ? "Sieger" : "Verlierer"} ${slot.matchId.toUpperCase()}`;
	}

	function resolveMatch(id: string): UltimateBraveryPlayoffMatch | undefined {
		if (resolved.has(id)) return resolved.get(id);
		const definition = definitions.find((match) => match.id === id);
		if (!definition) return undefined;
		const teamAName = resolveSlot(definition.teamA);
		const teamBName = resolveSlot(definition.teamB);
		const candidate = input.stored[id];
		const stored = candidate?.teamAName && candidate.teamBName && (candidate.teamAName !== teamAName || candidate.teamBName !== teamBName) ? undefined : candidate;
		const hasFinalScore = stored?.scoreA !== undefined && stored.scoreB !== undefined && stored.scoreA !== stored.scoreB;
		const matchWinner = hasFinalScore && teamAName && teamBName ? (stored.scoreA! > stored.scoreB! ? teamAName : teamBName) : undefined;
		const teamASeed = teamAName ? seedByTeam.get(teamAName) : undefined;
		const teamBSeed = teamBName ? seedByTeam.get(teamBName) : undefined;
		const sideSelectionSeed = teamASeed !== undefined && teamBSeed !== undefined ? Math.min(teamASeed, teamBSeed) : undefined;
		const sideSelectionTeamName = sideSelectionSeed === teamASeed ? (teamAName ?? undefined) : sideSelectionSeed === teamBSeed ? (teamBName ?? undefined) : undefined;
		const match: UltimateBraveryPlayoffMatch = {
			id,
			bracket: definition.bracket,
			round: definition.round,
			time: definition.time,
			teamAName,
			teamBName,
			teamALabel: teamAName ?? slotLabel(definition.teamA),
			teamBLabel: teamBName ?? slotLabel(definition.teamB),
			status: teamAName && teamBName ? (stored?.status && stored.status !== "Locked" ? stored.status : "Scheduled") : "Locked",
			scoreA: stored?.scoreA,
			scoreB: stored?.scoreB,
			gameDurationSeconds: stored?.gameDurationSeconds,
			teamAChampions: stored?.teamAChampions ?? [],
			teamBChampions: stored?.teamBChampions ?? [],
			blueSide: stored?.blueSide ?? "teamA",
			isCasted: stored?.isCasted ?? false,
			winner: matchWinner,
			adminNote: stored?.adminNote,
			sideSelectionTeamName,
			sideSelectionSeed,
		};
		resolved.set(id, match);
		return match;
	}

	return definitions.map((definition) => resolveMatch(definition.id)!);
}
