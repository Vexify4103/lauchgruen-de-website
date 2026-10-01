/**
 * Builds every match of a flexible-engine tournament (Ultimate Bravery, Fearless):
 * optional play-in → Day 1 (none, groups, GSL, Swiss, Swiss with elimination) → playoff bracket.
 */
import { gslGroupDefinitions, gslPlacements, playoffDefinitions, resolveBracket, titleDecidingMatch, type ResolvedBracketMatch } from "@/lib/bracket-engine";
import type { ControlMatch } from "@/lib/match-control";
import { computeStandings, openTieBlocks, type StandingMatch, type StandingsResult } from "@/lib/tournament-standings";
import { getPlayInOutcome, type ResolvedPlayIn } from "@/lib/tournament-play-in";
import { PLAY_IN_GROUP, type TournamentContext } from "@/lib/tournament-runtime";
import { seriesWinnerSide, sideChooser, type SeriesSide } from "@/lib/tournament-series";
import type { TournamentSettings } from "@/lib/tournament-settings";
import { getStandingOverrides, type StandingOverrides } from "@/lib/tournament-standing-overrides";
import type { StoredTournamentMatch } from "@/lib/tournament-storage";
import { mainEventTeamCount, type DayOneFormat } from "@/lib/tournament-structure";
import { getSwissStageState, type SwissPairing, type SwissStageState } from "@/lib/tournament-swiss";
import { computeUltimateBraverySwissSeeds } from "@/lib/ultimate-bravery-playoffs";
import type { WheelMatchAssignment } from "@/lib/tournament-wheel";

export type GroupStage = {
	group: string;
	teams: string[];
	standings: StandingsResult | null;
	/** GSL only: final placements 1–4. */
	placements: Record<number, string | null> | null;
	/** Places per group that advance (used to decide which ties matter). */
	advancingPlaces: number;
};

export type FlexibleStages = {
	playIn: ResolvedPlayIn | null;
	dayOne: {
		format: DayOneFormat;
		participants: number;
		groups: GroupStage[];
		swiss: SwissStageState | null;
		swissStandings: StandingsResult | null;
		seeds: Record<number, string | null>;
		complete: boolean;
		/** Why the playoff seeds are not final yet. */
		pendingReason: string | null;
	};
	playoffs: { table: StandingsResult | null; available: boolean };
	champion: { name: string; finalist: string; matchId: string } | null;
	overrides: StandingOverrides;
};

type Assignment = (matchId: string) => WheelMatchAssignment | null;
type Stored = Record<string, StoredTournamentMatch>;

const emptySeeds = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, index) => [index + 1, null])) as Record<number, string | null>;

function higherSeedSide(teamASeed?: number, teamBSeed?: number): SeriesSide {
	if (teamASeed === undefined || teamBSeed === undefined) return "teamA";
	return teamASeed <= teamBSeed ? "teamA" : "teamB";
}

function controlFields(
	stored: StoredTournamentMatch | undefined,
	input: {
		id: string;
		teamAName: string | null;
		teamBName: string | null;
		bestOf: number;
		rule: TournamentSettings["ultimateBravery"]["sideSelection"];
		teamASeed?: number;
		teamBSeed?: number;
	}
) {
	const games = stored?.games ?? [];
	const side = input.teamAName && input.teamBName ? seriesWinnerSide(stored?.scoreA, stored?.scoreB, input.bestOf) : null;
	const chooser = sideChooser({ rule: input.rule, games, higherSeedSide: higherSeedSide(input.teamASeed, input.teamBSeed) });
	const chooserSeed = chooser === "teamA" ? input.teamASeed : chooser === "teamB" ? input.teamBSeed : undefined;
	return {
		scoreA: stored?.scoreA,
		scoreB: stored?.scoreB,
		gameDurationSeconds: stored?.gameDurationSeconds,
		teamAChampions: stored?.teamAChampions ?? [],
		teamBChampions: stored?.teamBChampions ?? [],
		blueSide: stored?.blueSide ?? ("teamA" as const),
		isCasted: stored?.isCasted ?? false,
		winner: side === "teamA" ? (input.teamAName ?? undefined) : side === "teamB" ? (input.teamBName ?? undefined) : undefined,
		adminNote: stored?.adminNote,
		bestOf: input.bestOf,
		games,
		sideSelectionTeamName: chooser ? ((chooser === "teamA" ? input.teamAName : input.teamBName) ?? undefined) : undefined,
		sideSelectionSeed: chooserSeed,
	};
}

function bracketToControl(
	match: ResolvedBracketMatch<StoredTournamentMatch>,
	phase: ControlMatch["phase"],
	settings: TournamentSettings,
	assignment: Assignment,
	group?: string
): ControlMatch {
	return {
		id: match.id,
		phase,
		stage: match.stage,
		bracket: match.bracket,
		round: match.round,
		time: "Rolling Schedule",
		teamAName: match.teamAName,
		teamBName: match.teamBName,
		teamALabel: match.teamALabel,
		teamBLabel: match.teamBLabel,
		status: match.status,
		...controlFields(match.stored, {
			id: match.id,
			teamAName: match.teamAName,
			teamBName: match.teamBName,
			bestOf: match.bestOf,
			rule: settings.ultimateBravery.sideSelection,
			teamASeed: match.teamASeed,
			teamBSeed: match.teamBSeed,
		}),
		layout: match.layout,
		sources: match.sources,
		conditional: match.conditional,
		group,
		poolAssignment: assignment(match.id),
	};
}

function standingMatch(id: string, teamAName: string | null, teamBName: string | null, stored: StoredTournamentMatch | undefined, bestOf: number): StandingMatch {
	return {
		id,
		teamAName,
		teamBName,
		scoreA: stored?.scoreA,
		scoreB: stored?.scoreB,
		bestOf,
		games: stored?.games,
		gameDurationSeconds: stored?.gameDurationSeconds,
	};
}

/** A Swiss pairing as a table result; the stored series score wins over the pairing's winner. */
function swissStandingMatch(pairing: SwissPairing, stored: StoredTournamentMatch | undefined, bestOf: number): StandingMatch {
	if (pairing.bye) return { id: pairing.id, teamAName: pairing.teamAName, teamBName: null, bestOf: 1, bye: true };
	const decided = seriesWinnerSide(stored?.scoreA, stored?.scoreB, bestOf);
	if (decided || !pairing.winnerTeamKey) return standingMatch(pairing.id, pairing.teamAName, pairing.teamBName, stored, bestOf);
	const teamAWon = pairing.winnerTeamKey === pairing.teamAKey;
	return { id: pairing.id, teamAName: pairing.teamAName, teamBName: pairing.teamBName, scoreA: teamAWon ? 1 : 0, scoreB: teamAWon ? 0 : 1, bestOf: 1 };
}

function seedLabel(format: DayOneFormat): (seed: number) => string {
	switch (format) {
		case "swiss":
		case "swiss-elimination":
			return (seed) => `Swiss-Seed #${seed}`;
		case "groups":
			return (seed) => `Gruppen-Seed #${seed}`;
		case "gsl":
			return (seed) => `GSL-Seed #${seed}`;
		default:
			return (seed) => `Seed #${seed}`;
	}
}

export async function buildFlexibleStages(input: {
	settings: TournamentSettings;
	ctx: TournamentContext;
	stored: Stored;
	assignment: Assignment;
}): Promise<{ matches: ControlMatch[]; stages: FlexibleStages }> {
	const { settings, ctx, stored, assignment } = input;
	const config = settings.ultimateBravery;
	const tournamentId = settings.activeTournament.id;
	const [playIn, overrides, swiss] = await Promise.all([
		config.playInTeamCount > 0 ? getPlayInOutcome(tournamentId, config.bestOf.dayOne) : Promise.resolve(null),
		getStandingOverrides(tournamentId),
		config.dayOneFormat === "swiss" || config.dayOneFormat === "swiss-elimination" ? getSwissStageState(tournamentId) : Promise.resolve(null),
	]);
	const participants = mainEventTeamCount(config);
	const advance = config.advanceTeamCount;
	const dayOneTeams = ctx.teams.filter((team) => team.group !== PLAY_IN_GROUP);
	const matches: ControlMatch[] = [];

	if (playIn) matches.push(...playIn.matches.map((match) => bracketToControl(match, "play-in", settings, assignment)));
	const playInPending = config.playInTeamCount > 0 && (!playIn || !playIn.complete);

	let seeds = emptySeeds(advance);
	let complete = false;
	let pendingReason: string | null = playInPending ? (playIn ? "Das Play-in läuft noch." : "Das Play-in wurde noch nicht ausgelost.") : null;
	const groups: GroupStage[] = [];
	let swissStandings: StandingsResult | null = null;

	switch (config.dayOneFormat) {
		case "none": {
			if (ctx.groupSetupComplete && !playInPending) {
				const ordered = [...dayOneTeams].sort((a, b) => a.seed - b.seed);
				seeds = Object.fromEntries(Array.from({ length: advance }, (_, index) => [index + 1, ordered[index]?.name ?? null]));
				complete = true;
			} else pendingReason ??= "Die Setzliste ist noch nicht veröffentlicht.";
			break;
		}
		case "groups": {
			const groupNames = [...new Set(dayOneTeams.map((team) => team.group))].sort((a, b) => a.localeCompare(b));
			const advancingPlaces = Math.ceil(advance / Math.max(1, groupNames.length));
			for (const group of groupNames) {
				const groupTeams = dayOneTeams.filter((team) => team.group === group).sort((a, b) => a.seed - b.seed);
				const groupMatches = ctx.groupMatches.filter((match) => match.group === group);
				const standings = groupMatches.length
					? computeStandings({
							teams: groupTeams.map((team) => ({ name: team.name, seed: team.seed })),
							matches: groupMatches.map((match) => standingMatch(match.id, match.teamA, match.teamB, stored[match.id], config.bestOf.dayOne)),
							tiebreakers: config.tiebreakers,
							override: overrides[`group:${group}`],
						})
					: null;
				groups.push({ group, teams: groupTeams.map((team) => team.name), standings, placements: null, advancingPlaces });
				for (const match of groupMatches) {
					matches.push({
						id: match.id,
						phase: "groups",
						stage: "day-one",
						round: match.round,
						time: match.time,
						teamAName: match.teamA,
						teamBName: match.teamB,
						teamALabel: match.teamA,
						teamBLabel: match.teamB,
						status: stored[match.id]?.status ?? match.status,
						...controlFields(stored[match.id], {
							id: match.id,
							teamAName: match.teamA,
							teamBName: match.teamB,
							bestOf: config.bestOf.dayOne,
							rule: config.sideSelection,
						}),
						group,
						poolAssignment: assignment(match.id),
					});
				}
			}
			const allComplete = groups.length > 0 && groups.every((entry) => entry.standings?.complete);
			const blockingGroup = groups.find((entry) => entry.standings && openTieBlocks(entry.standings.rows, entry.advancingPlaces));
			if (!ctx.groupSetupComplete) pendingReason ??= "Die Gruppen sind noch nicht veröffentlicht.";
			else if (!allComplete) pendingReason ??= "Die Gruppenphase läuft noch.";
			else if (blockingGroup) pendingReason ??= `Gleichstand in Gruppe ${blockingGroup.group}: Die Turnierleitung muss die Reihenfolge festlegen.`;
			else {
				const ordered: string[] = [];
				const deepest = Math.max(...groups.map((entry) => entry.standings?.rows.length ?? 0));
				for (let rank = 1; rank <= deepest; rank += 1) {
					const tier = groups
						.flatMap((entry) => (entry.standings?.rows[rank - 1] ? [{ group: entry.group, row: entry.standings.rows[rank - 1] }] : []))
						.sort((a, b) => b.row.wins - a.row.wins || a.row.losses - b.row.losses || b.row.gameDifference - a.row.gameDifference || a.group.localeCompare(b.group));
					ordered.push(...tier.map((entry) => entry.row.name));
				}
				seeds = Object.fromEntries(Array.from({ length: advance }, (_, index) => [index + 1, ordered[index] ?? null]));
				complete = true;
			}
			break;
		}
		case "gsl": {
			const groupNames = [...new Set(dayOneTeams.map((team) => team.group))].sort((a, b) => a.localeCompare(b));
			for (const group of groupNames) {
				const groupTeams = dayOneTeams.filter((team) => team.group === group).sort((a, b) => a.seed - b.seed);
				if (!ctx.groupSetupComplete) {
					groups.push({ group, teams: groupTeams.map((team) => team.name), standings: null, placements: null, advancingPlaces: 2 });
					continue;
				}
				const resolved = resolveBracket({
					definitions: gslGroupDefinitions(group),
					seeds: Object.fromEntries(groupTeams.map((team) => [team.seed, team.name])),
					stored,
					bestOf: () => config.bestOf.dayOne,
					seedLabel: (value) => `Gruppe ${group} · Seed ${value}`,
				});
				groups.push({ group, teams: groupTeams.map((team) => team.name), standings: null, placements: gslPlacements(group, resolved), advancingPlaces: 2 });
				matches.push(...resolved.map((match) => bracketToControl(match, "groups", settings, assignment, group)));
			}
			if (!ctx.groupSetupComplete) pendingReason ??= "Die GSL-Gruppen sind noch nicht veröffentlicht.";
			else if (groups.some((entry) => !entry.placements?.[1] || !entry.placements?.[2])) pendingReason ??= "Die GSL-Gruppen laufen noch.";
			else {
				const ordered = [...groups.map((entry) => entry.placements![1]!), ...groups.map((entry) => entry.placements![2]!)];
				seeds = Object.fromEntries(Array.from({ length: advance }, (_, index) => [index + 1, ordered[index] ?? null]));
				complete = true;
			}
			break;
		}
		case "swiss":
		case "swiss-elimination": {
			const state = swiss ?? { tournamentId, rounds: [], updatedAt: new Date(0).toISOString() };
			for (const round of state.rounds) {
				for (const pairing of round.pairings) {
					if (pairing.bye || !pairing.teamBName) continue;
					matches.push({
						id: pairing.id,
						phase: "groups",
						stage: "day-one",
						round: `Swiss Runde ${round.round}`,
						time: "Rolling Schedule",
						teamAName: pairing.teamAName,
						teamBName: pairing.teamBName,
						teamALabel: pairing.teamAName,
						teamBLabel: pairing.teamBName,
						status: stored[pairing.id]?.status ?? "Scheduled",
						...controlFields(stored[pairing.id], {
							id: pairing.id,
							teamAName: pairing.teamAName,
							teamBName: pairing.teamBName,
							bestOf: config.bestOf.dayOne,
							rule: config.sideSelection,
						}),
						poolAssignment: assignment(pairing.id),
					});
				}
			}
			const swissMatches = state.rounds.flatMap((round) => round.pairings.map((pairing) => swissStandingMatch(pairing, stored[pairing.id], config.bestOf.dayOne)));
			swissStandings = computeStandings({
				teams: dayOneTeams.map((team) => ({ name: team.name, seed: team.group === "A" ? team.seed : undefined })),
				matches: swissMatches,
				tiebreakers: config.tiebreakers,
				override: overrides.swiss,
			});
			// A tie only needs a staff decision once the Swiss stage is over, never while rounds are still to come.
			const stageOver =
				config.dayOneFormat === "swiss"
					? state.rounds.length >= config.swissRounds && state.rounds.every((round) => round.complete)
					: swissStandings.rows.length > 0 && swissStandings.rows.every((row) => row.wins >= config.swissWinsToAdvance || row.losses >= config.swissWinsToAdvance);
			if (!stageOver) swissStandings = { ...swissStandings, complete: false, tiebreakerRequired: false };
			if (config.dayOneFormat === "swiss") {
				const roundsDone = state.rounds.length >= config.swissRounds && state.rounds.every((round) => round.complete) && swissStandings.complete;
				const legacy = state.finalSeedNames || (participants === 8 && advance === 8 && config.swissRounds === 4);
				if (!roundsDone) pendingReason ??= "Die Swiss Stage läuft noch.";
				else if (legacy) {
					seeds = computeUltimateBraverySwissSeeds(state, dayOneTeams, config.swissRounds);
					complete = Object.values(seeds).every(Boolean);
				} else if (openTieBlocks(swissStandings.rows, advance)) pendingReason ??= "Gleichstand in der Swiss-Tabelle: Die Turnierleitung muss die Reihenfolge festlegen.";
				else {
					seeds = Object.fromEntries(Array.from({ length: advance }, (_, index) => [index + 1, swissStandings!.rows[index]?.name ?? null]));
					complete = true;
				}
			} else {
				const threshold = config.swissWinsToAdvance;
				const everyoneDone = swissStandings.rows.length > 0 && swissStandings.rows.every((row) => row.wins >= threshold || row.losses >= threshold);
				if (!everyoneDone || !swissStandings.complete) pendingReason ??= "Die Swiss Stage läuft noch.";
				else if (openTieBlocks(swissStandings.rows, advance)) pendingReason ??= "Gleichstand in der Swiss-Tabelle: Die Turnierleitung muss die Reihenfolge festlegen.";
				else {
					const qualified = swissStandings.rows.filter((row) => row.wins >= threshold);
					seeds = Object.fromEntries(Array.from({ length: advance }, (_, index) => [index + 1, qualified[index]?.name ?? null]));
					complete = qualified.length === advance;
					if (!complete) pendingReason ??= `Es haben ${qualified.length} statt ${advance} Teams ${threshold} Siege erreicht.`;
				}
			}
			break;
		}
		case "undecided":
			pendingReason ??= "Das Format für Tag 1 steht noch nicht fest.";
			break;
	}
	if (complete) pendingReason = null;

	let table: StandingsResult | null = null;
	const definitions = playoffDefinitions(config.format, advance, { thirdPlaceMatch: config.thirdPlaceMatch, grandFinalReset: config.grandFinalReset });
	const playoffs = resolveBracket({
		definitions,
		seeds,
		stored,
		bestOf: (definition) => (definition.stage === "finals" ? config.bestOf.finals : config.bestOf.playoffs),
		seedLabel: seedLabel(config.dayOneFormat),
		table: (resolved): Record<number, string | null> => {
			table = computeStandings({
				teams: Object.values(seeds).flatMap((name) => (name ? [{ name, seed: Number(Object.entries(seeds).find(([, value]) => value === name)?.[0]) }] : [])),
				matches: resolved.map((match) => standingMatch(match.id, match.teamAName, match.teamBName, match.stored, match.bestOf)),
				tiebreakers: config.tiebreakers,
				override: overrides.playoffs,
			});
			if (!table.complete || table.rows.length < 2 || openTieBlocks(table.rows, 2)) return {};
			return { 1: table.rows[0].name, 2: table.rows[1].name };
		},
	});
	matches.push(...playoffs.map((match) => bracketToControl(match, "playoffs", settings, assignment)));
	const title = titleDecidingMatch(playoffs);
	const champion = title?.winner && title.loser ? { name: title.winner, finalist: title.loser, matchId: title.id } : null;

	return {
		matches,
		stages: {
			playIn,
			dayOne: { format: config.dayOneFormat, participants, groups, swiss, swissStandings, seeds, complete, pendingReason },
			playoffs: { table, available: definitions.length > 0 },
			champion,
			overrides,
		},
	};
}

export type StageTieCluster = { key: string; title: string; teams: string[] };

/** Ties that still need a staff decision, limited to ranks that change qualification or seeds. */
export function openStageTies(stages: FlexibleStages, advance: number): StageTieCluster[] {
	const clusters: StageTieCluster[] = [];
	const collect = (key: string, title: string, standings: StandingsResult | null, relevantRanks: number) => {
		if (!standings?.tiebreakerRequired) return;
		const seen = new Set<string>();
		for (const row of standings.rows) {
			if (!row.tiedWith.length || seen.has(row.name) || row.rank > relevantRanks) continue;
			const teams = standings.rows.filter((entry) => entry.name === row.name || row.tiedWith.includes(entry.name)).map((entry) => entry.name);
			teams.forEach((name) => seen.add(name));
			clusters.push({ key, title, teams });
		}
	};
	for (const group of stages.dayOne.groups) collect(`group:${group.group}`, `Gruppe ${group.group}`, group.standings, group.advancingPlaces);
	collect("swiss", "Swiss-Tabelle", stages.dayOne.swissStandings, advance);
	collect("playoffs", "Playoff-Tabelle", stages.playoffs.table, 2);
	return clusters;
}

export function standingOverrideTitle(key: string): string {
	if (key.startsWith("group:")) return `Gruppe ${key.slice(6)}`;
	return key === "swiss" ? "Swiss-Tabelle" : "Playoff-Tabelle";
}
