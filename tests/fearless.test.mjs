import assert from "node:assert/strict";
import test from "node:test";
import { computeFearlessLocks, playedChampionsByTeam } from "../src/lib/fearless.ts";

const history = [
	{ id: "swiss-1-1", round: "Swiss Runde 1", teamAName: "Alpha", teamBName: "Bravo", teamAChampions: ["Ahri", "Garen"], teamBChampions: ["Lux", "Zed"] },
	{ id: "swiss-1-2", round: "Swiss Runde 1", teamAName: "Charlie", teamBName: "Delta", teamAChampions: ["Jinx"], teamBChampions: ["Ahri"] },
	{ id: "swiss-2-1", round: "Swiss Runde 2", teamAName: "Alpha", teamBName: "Charlie", teamAChampions: [], teamBChampions: [] },
];

test("collects every champion a team played, once", () => {
	const played = playedChampionsByTeam([...history, { id: "x", teamAName: "Alpha", teamBName: "Delta", teamAChampions: ["Ahri"], teamBChampions: [] }]);
	assert.deepEqual(
		played.get("Alpha").map((entry) => entry.champion),
		["Ahri", "Garen"]
	);
});

test("locks only a team's own champions by default", () => {
	const locks = computeFearlessLocks({ matches: history, matchId: "swiss-2-1", blueTeamName: "Alpha", redTeamName: "Charlie", rules: { lockOpponentChampions: false } });
	assert.deepEqual(Object.keys(locks.teamA).sort(), ["Ahri", "Garen"]);
	assert.deepEqual(Object.keys(locks.teamB), ["Jinx"]);
	assert.equal(locks.teamA.Ahri.source, "own");
});

test("also locks the opponent's champions when enabled", () => {
	const locks = computeFearlessLocks({ matches: history, matchId: "swiss-2-1", blueTeamName: "Alpha", redTeamName: "Charlie", rules: { lockOpponentChampions: true } });
	assert.deepEqual(Object.keys(locks.teamA).sort(), ["Ahri", "Garen", "Jinx"]);
	assert.equal(locks.teamA.Jinx.source, "opponent");
	assert.deepEqual(Object.keys(locks.teamB).sort(), ["Ahri", "Garen", "Jinx"]);
});

test("ignores the champions of the match being drafted", () => {
	const locks = computeFearlessLocks({ matches: history, matchId: "swiss-1-1", blueTeamName: "Alpha", redTeamName: "Bravo", rules: { lockOpponentChampions: true } });
	assert.deepEqual(locks, { teamA: {}, teamB: {} });
});

const series = [
	...history,
	{
		id: "ub-r1-1",
		round: "Viertelfinale 1",
		teamAName: "Alpha",
		teamBName: "Bravo",
		teamAChampions: ["Thresh"],
		teamBChampions: ["Kaisa"],
		games: [{ number: 1, teamAChampions: ["Orianna"], teamBChampions: ["Nautilus"] }],
	},
];

test("earlier games of the running series lock their champions, the running game does not", () => {
	const locks = computeFearlessLocks({ matches: series, matchId: "ub-r1-1", blueTeamName: "Alpha", redTeamName: "Bravo", rules: { lockOpponentChampions: false } });
	assert.deepEqual(Object.keys(locks.teamA).sort(), ["Ahri", "Garen", "Orianna"]);
	assert.equal(locks.teamA.Orianna.round, "Viertelfinale 1 · Spiel 1");
	assert.equal(locks.teamA.Thresh, undefined);
});

test("series scope only locks champions from the same series", () => {
	const locks = computeFearlessLocks({
		matches: series,
		matchId: "ub-r1-1",
		blueTeamName: "Alpha",
		redTeamName: "Bravo",
		rules: { lockOpponentChampions: true, scope: "series" },
	});
	assert.deepEqual(Object.keys(locks.teamA).sort(), ["Nautilus", "Orianna"]);
	assert.deepEqual(Object.keys(locks.teamB).sort(), ["Nautilus", "Orianna"]);
});
