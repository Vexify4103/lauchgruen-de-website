import assert from "node:assert/strict";
import test from "node:test";
import { computeFearlessLocks, lockedChampionsByTeam } from "../src/lib/fearless.ts";
import { fearlessCapacity, maxGamesPerTeam } from "../src/lib/fearless-capacity.ts";
import { DEFAULT_STRUCTURE_OPTIONS } from "../src/lib/tournament-structure.ts";

const history = [
	{ id: "swiss-1-1", round: "Swiss Runde 1", teamAName: "Alpha", teamBName: "Bravo", teamAChampions: ["Ahri", "Garen"], teamBChampions: ["Lux", "Zed"] },
	{ id: "swiss-1-2", round: "Swiss Runde 1", teamAName: "Charlie", teamBName: "Delta", teamAChampions: ["Jinx"], teamBChampions: ["Ahri"] },
	{ id: "swiss-2-1", round: "Swiss Runde 2", teamAName: "Alpha", teamBName: "Charlie", teamAChampions: [], teamBChampions: [] },
];
const match = { lockOpponentChampions: false, scope: "tournament", variant: "match" };

test("Match-Fearless locks both sides of every game a team played", () => {
	const locks = computeFearlessLocks({ matches: history, matchId: "swiss-2-1", blueTeamName: "Alpha", redTeamName: "Charlie", rules: match });
	assert.deepEqual(Object.keys(locks.teamA).sort(), ["Ahri", "Garen", "Lux", "Zed"]);
	assert.equal(locks.teamA.Lux.source, "faced");
	assert.equal(locks.teamA.Ahri.source, "own");
	// Charlie faced Delta, not Bravo: Bravo's picks stay free for Charlie.
	assert.deepEqual(Object.keys(locks.teamB).sort(), ["Ahri", "Jinx"]);
	assert.equal(locks.teamB.Ahri.source, "faced");
});

test("classic Fearless keeps locking only own picks", () => {
	const locks = computeFearlessLocks({ matches: history, matchId: "swiss-2-1", blueTeamName: "Alpha", redTeamName: "Charlie", rules: { ...match, variant: "own" } });
	assert.deepEqual(Object.keys(locks.teamA).sort(), ["Ahri", "Garen"]);
	assert.deepEqual(Object.keys(locks.teamB), ["Jinx"]);
});

test("earlier games of the running series lock both teams in Match-Fearless", () => {
	const series = [{ id: "ub-r1-1", round: "Upper Runde 1", teamAName: "Alpha", teamBName: "Bravo", games: [{ number: 1, teamAChampions: ["Ahri"], teamBChampions: ["Zed"] }] }];
	const locks = computeFearlessLocks({ matches: series, matchId: "ub-r1-1", blueTeamName: "Bravo", redTeamName: "Alpha", rules: { ...match, scope: "series" } });
	assert.deepEqual(Object.keys(locks.teamA).sort(), ["Ahri", "Zed"]);
	assert.deepEqual(Object.keys(locks.teamB).sort(), ["Ahri", "Zed"]);
});

test("public lock lists count faced champions only in Match-Fearless", () => {
	assert.equal(lockedChampionsByTeam(history, "match").get("Alpha").length, 4);
	assert.equal(lockedChampionsByTeam(history, "own").get("Alpha").length, 2);
});

const swissThenDoubleElim = {
	...DEFAULT_STRUCTURE_OPTIONS,
	teamCount: 8,
	dayOneFormat: "swiss",
	groupCount: 1,
	groupRoundRobinLegs: 1,
	swissRounds: 3,
	advanceTeamCount: 8,
	format: "double-elimination",
};

test("worst case games per team for 8-team formats", () => {
	assert.equal(maxGamesPerTeam(swissThenDoubleElim), 3 + 6);
	assert.equal(maxGamesPerTeam({ ...swissThenDoubleElim, grandFinalReset: true }), 3 + 7);
	assert.equal(maxGamesPerTeam({ ...swissThenDoubleElim, dayOneFormat: "swiss-elimination", advanceTeamCount: 4, grandFinalReset: true }), 5 + 5);
	assert.equal(maxGamesPerTeam({ ...swissThenDoubleElim, bestOf: { dayOne: 1, playoffs: 3, finals: 3 } }), 3 + 18);
});

test("Match-Fearless capacity for ten games still leaves a pool", () => {
	const capacity = fearlessCapacity({ ...swissThenDoubleElim, grandFinalReset: true }, match, 173);
	assert.equal(capacity.games, 10);
	assert.equal(capacity.lockedBeforeLastGame, 90);
	assert.equal(capacity.leftForLastPick, 173 - 90 - 10 - 9);
	assert.equal(capacity.enough, true);
	assert.equal(fearlessCapacity({ ...swissThenDoubleElim, bestOf: { dayOne: 1, playoffs: 3, finals: 3 } }, match, 173).enough, false);
});
