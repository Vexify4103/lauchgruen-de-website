import assert from "node:assert/strict";
import test from "node:test";
import {
	doubleEliminationDefinitions,
	gauntletDefinitions,
	gslGroupDefinitions,
	gslPlacements,
	pagePlayoffDefinitions,
	playoffDefinitions,
	resolveBracket,
	roundRobinPlayoffDefinitions,
	singleEliminationDefinitions,
	standardSeedOrder,
	titleDecidingMatch,
} from "../src/lib/bracket-engine.ts";
import { computeStandings } from "../src/lib/tournament-standings.ts";
import { automaticBlueSide, seriesWinnerSide, sideChooser, validateSeriesScore } from "../src/lib/tournament-series.ts";
import { deriveStructure, mainEventTeamCount, reviewStructure, DEFAULT_STRUCTURE_OPTIONS } from "../src/lib/tournament-structure.ts";

const seedsOf = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [index + 1, `T${index + 1}`]));

/** Plays every open match: the team named first in `favourites` (or team A) wins. */
function playOut(definitions, seeds, bestOf = () => 1, pick = (match) => match.teamAName, table) {
	const stored = {};
	for (let guard = 0; guard < 100; guard += 1) {
		const resolved = resolveBracket({ definitions, seeds, stored, bestOf, table });
		const open = resolved.find((match) => match.teamAName && match.teamBName && !match.winner);
		if (!open) return resolved;
		const winnerName = pick(open);
		const needed = Math.floor(bestOf(open) / 2) + 1;
		stored[open.id] = {
			teamAName: open.teamAName,
			teamBName: open.teamBName,
			scoreA: winnerName === open.teamAName ? needed : needed - 1,
			scoreB: winnerName === open.teamAName ? needed - 1 : needed,
			status: "Finished",
		};
	}
	throw new Error("bracket never finished");
}

test("standard seed order keeps #1 and #2 apart until the final", () => {
	assert.deepEqual(standardSeedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
	assert.deepEqual(standardSeedOrder(4), [1, 4, 2, 3]);
});

test("single elimination keeps the legacy eight-team ids and gives byes to the top seeds", () => {
	assert.deepEqual(
		singleEliminationDefinitions(8).map((definition) => definition.id),
		["ub-r1-1", "ub-r1-2", "ub-r1-3", "ub-r1-4", "ub-r2-1", "ub-r2-2", "gf"]
	);
	const six = singleEliminationDefinitions(6);
	assert.equal(six.length, 5);
	const opening = six.filter((definition) => definition.id.startsWith("ub-r1-"));
	assert.deepEqual(
		opening.map((definition) => [definition.teamA.seed, definition.teamB.seed]),
		[
			[4, 5],
			[3, 6],
		]
	);
	const final = playOut(six, seedsOf(6)).find((match) => match.id === "gf");
	assert.equal(final.winner, "T1");
	assert.equal(final.loser, "T2");
});

test("third-place match takes both semifinal losers", () => {
	const resolved = playOut(singleEliminationDefinitions(8, { thirdPlaceMatch: true }), seedsOf(8));
	const third = resolved.find((match) => match.id === "p3");
	assert.deepEqual([third.teamAName, third.teamBName].sort(), ["T3", "T4"]);
});

test("double elimination for 8 matches the legacy bracket and scales to 16", () => {
	assert.deepEqual(
		doubleEliminationDefinitions(8).map((definition) => definition.id),
		["ub-r1-1", "ub-r1-2", "ub-r1-3", "ub-r1-4", "ub-r2-1", "ub-r2-2", "ub-f", "lb-r1-1", "lb-r1-2", "lb-r2-1", "lb-r2-2", "lb-r3", "lb-f", "gf"]
	);
	const sixteen = doubleEliminationDefinitions(16);
	assert.equal(sixteen.length, 30);
	const resolved = playOut(
		sixteen,
		seedsOf(16),
		() => 1,
		(match) => (Number(match.teamAName.slice(1)) < Number(match.teamBName.slice(1)) ? match.teamAName : match.teamBName)
	);
	const final = resolved.find((match) => match.id === "gf");
	assert.deepEqual([final.teamAName, final.teamBName], ["T1", "T2"]);
	// Double elimination: every team except the champion is out after exactly two losses.
	const losses = new Map();
	for (const match of resolved) if (match.loser) losses.set(match.loser, (losses.get(match.loser) ?? 0) + 1);
	assert.equal(losses.get("T1"), undefined);
	assert.equal(losses.get("T2"), 2);
	assert.equal([...losses.values()].filter((count) => count === 2).length, 15);
});

test("a bracket reset only appears when the lower-bracket finalist wins the grand final", () => {
	const definitions = doubleEliminationDefinitions(4, { grandFinalReset: true });
	const lowerWins = playOut(
		definitions,
		seedsOf(4),
		() => 1,
		(match) => (match.id === "gf" ? match.teamBName : match.teamAName)
	);
	const reset = lowerWins.find((match) => match.id === "gf-2");
	assert.ok(reset?.teamAName && reset.teamBName);
	assert.equal(titleDecidingMatch(lowerWins).id, "gf-2");

	const upperWins = playOut(definitions, seedsOf(4));
	assert.equal(
		upperWins.find((match) => match.id === "gf-2"),
		undefined
	);
	assert.equal(titleDecidingMatch(upperWins).id, "gf");
});

test("page playoffs give #1 and #2 a second chance", () => {
	const resolved = playOut(
		pagePlayoffDefinitions(),
		seedsOf(4),
		() => 1,
		(match) => (match.id === "pg-q" ? match.teamBName : match.teamAName)
	);
	const semi = resolved.find((match) => match.id === "pg-sf");
	assert.deepEqual([semi.teamAName, semi.teamBName], ["T1", "T3"]);
	const final = resolved.find((match) => match.id === "gf");
	assert.deepEqual([final.teamAName, final.teamBName], ["T2", "T1"]);
});

test("gauntlet climbs from the lowest seeds to #1", () => {
	const resolved = playOut(
		gauntletDefinitions(5),
		seedsOf(5),
		() => 1,
		(match) => match.teamBName
	);
	assert.deepEqual(
		resolved.map((match) => [match.id, match.teamAName, match.teamBName]),
		[
			["gt-1", "T4", "T5"],
			["gt-2", "T3", "T5"],
			["gt-3", "T2", "T5"],
			["gf", "T1", "T5"],
		]
	);
});

test("round-robin playoffs send table #1 and #2 into the final", () => {
	const definitions = roundRobinPlayoffDefinitions(4);
	assert.equal(definitions.filter((definition) => definition.id.startsWith("rr-")).length, 6);
	const table = (matches) => {
		const standings = computeStandings({
			teams: Object.values(seedsOf(4)).map((name) => ({ name })),
			matches: matches.map((match) => ({ ...match, ...match.stored, bestOf: 1 })),
			tiebreakers: ["head-to-head"],
		});
		return Object.fromEntries(standings.rows.map((row) => [row.rank, standings.complete ? row.name : null]));
	};
	const resolved = playOut(
		definitions,
		seedsOf(4),
		() => 1,
		(match) => (Number(match.teamAName.slice(1)) < Number(match.teamBName.slice(1)) ? match.teamAName : match.teamBName),
		table
	);
	const final = resolved.find((match) => match.id === "gf");
	assert.deepEqual([final.teamAName, final.teamBName], ["T1", "T2"]);
});

test("GSL groups place winners' match winner first and decider winner second", () => {
	const resolved = playOut(
		gslGroupDefinitions("A"),
		seedsOf(4),
		() => 1,
		(match) => (match.id === "a-gsl-w" ? match.teamBName : match.teamAName)
	);
	assert.deepEqual(gslPlacements("A", resolved), { 1: "T2", 2: "T1", 3: "T4", 4: "T3" });
});

test("best-of series only produce a winner once enough games are won", () => {
	assert.equal(seriesWinnerSide(1, 0, 3), null);
	assert.equal(seriesWinnerSide(2, 1, 3), "teamA");
	assert.equal(seriesWinnerSide(1, 3, 5), "teamB");
	assert.equal(seriesWinnerSide(2, 0, 1), "teamA", "legacy Bo1 scores stay valid");
	assert.equal(validateSeriesScore(2, 1, 3), null);
	assert.ok(validateSeriesScore(3, 1, 3));
	assert.ok(validateSeriesScore(1, 0, 3));
	const decided = resolveBracket({
		definitions: singleEliminationDefinitions(2),
		seeds: seedsOf(2),
		stored: { gf: { teamAName: "T1", teamBName: "T2", scoreA: 1, scoreB: 1 } },
		bestOf: () => 3,
	});
	assert.equal(decided[0].winner, null);
});

test("side selection rules", () => {
	assert.equal(automaticBlueSide({ rule: "alternate", games: [] }), "teamA");
	assert.equal(automaticBlueSide({ rule: "alternate", games: [{ blueSide: "teamA", winner: "teamB" }] }), "teamB");
	assert.equal(automaticBlueSide({ rule: "coin-flip", games: [], coinFlip: () => "teamB" }), "teamB");
	assert.equal(automaticBlueSide({ rule: "higher-seed", games: [] }), null);
	assert.equal(sideChooser({ rule: "loser-picks", games: [{ winner: "teamA" }], higherSeedSide: "teamA" }), "teamB");
	assert.equal(sideChooser({ rule: "loser-picks", games: [], higherSeedSide: "teamA" }), "teamA");
});

const rr = (teamAName, teamBName, scoreA, scoreB, extra = {}) => ({ id: `${teamAName}-${teamBName}`, teamAName, teamBName, scoreA, scoreB, bestOf: 1, ...extra });

test("standings split ties with the direct comparison inside the tied group", () => {
	const standings = computeStandings({
		teams: ["A", "B", "C", "D"].map((name) => ({ name })),
		matches: [rr("A", "B", 0, 1), rr("A", "C", 1, 0), rr("A", "D", 1, 0), rr("B", "C", 0, 1), rr("B", "D", 1, 0), rr("C", "D", 1, 0)],
		tiebreakers: ["head-to-head", "game-difference"],
	});
	// A, B and C all have 2 wins and beat each other once: still tied, so staff has to decide.
	assert.deepEqual(
		standings.rows.map((row) => row.name),
		["A", "B", "C", "D"]
	);
	assert.equal(standings.tiebreakerRequired, true);
	assert.deepEqual(standings.rows[0].tiedWith.sort(), ["B", "C"]);

	const decided = computeStandings({
		teams: ["A", "B", "C", "D"].map((name) => ({ name })),
		matches: [rr("A", "B", 0, 1), rr("A", "C", 1, 0), rr("A", "D", 1, 0), rr("B", "C", 0, 1), rr("B", "D", 1, 0), rr("C", "D", 1, 0)],
		tiebreakers: ["head-to-head"],
		override: ["C", "A", "B"],
	});
	assert.deepEqual(
		decided.rows.map((row) => row.name),
		["C", "A", "B", "D"]
	);
	assert.equal(decided.tiebreakerRequired, false);
});

test("game difference and win duration break ties in configured order", () => {
	const matches = [rr("A", "C", 2, 0, { bestOf: 3 }), rr("B", "D", 2, 1, { bestOf: 3 }), rr("A", "D", 0, 2, { bestOf: 3 }), rr("B", "C", 1, 2, { bestOf: 3 })];
	// Everyone is 1-1. Games: D +1, A 0, B 0, C -1; A and B stay tied.
	const byGames = computeStandings({ teams: ["A", "B", "C", "D"].map((name) => ({ name })), matches, tiebreakers: ["game-difference"] });
	assert.deepEqual(
		byGames.rows.map((row) => [row.name, row.gameDifference]),
		[
			["D", 1],
			["A", 0],
			["B", 0],
			["C", -1],
		]
	);
	assert.equal(byGames.tiebreakerRequired, true);
	assert.deepEqual(byGames.rows[1].tiedWith, ["B"]);

	const timed = computeStandings({
		teams: ["A", "B", "X", "Y"].map((name) => ({ name })),
		matches: [rr("A", "X", 1, 0, { gameDurationSeconds: 1800 }), rr("B", "Y", 1, 0, { gameDurationSeconds: 1500 })],
		tiebreakers: ["win-duration"],
	});
	assert.deepEqual(
		timed.rows.slice(0, 2).map((row) => row.name),
		["B", "A"]
	);
});

test("structure derivation fixes the values a format determines", () => {
	const base = {
		teamCount: 16,
		dayOneFormat: "gsl",
		groupCount: 1,
		groupRoundRobinLegs: 1,
		swissRounds: 3,
		advanceTeamCount: 16,
		format: "single-elimination",
		...DEFAULT_STRUCTURE_OPTIONS,
	};
	const gsl = deriveStructure(base);
	assert.equal(gsl.groupCount, 4);
	assert.equal(gsl.advanceTeamCount, 8);
	assert.deepEqual(reviewStructure(gsl).errors, []);

	const major = deriveStructure({ ...base, dayOneFormat: "swiss-elimination", swissWinsToAdvance: 3 });
	assert.equal(major.swissRounds, 5);
	assert.equal(major.advanceTeamCount, 8);
	assert.deepEqual(reviewStructure(major).errors, []);
	assert.ok(reviewStructure(deriveStructure({ ...major, teamCount: 8 })).errors.length > 0);

	const playIn = deriveStructure({ ...base, teamCount: 10, dayOneFormat: "none", playInTeamCount: 4, format: "single-elimination" });
	assert.equal(mainEventTeamCount(playIn), 8);
	assert.equal(playIn.advanceTeamCount, 8);

	const badDouble = deriveStructure({ ...base, teamCount: 6, dayOneFormat: "none", format: "double-elimination" });
	assert.ok(reviewStructure(badDouble).errors.some((error) => error.includes("Double Elimination")));
	assert.equal(playoffDefinitions("double-elimination", 6).length, 0);
});
