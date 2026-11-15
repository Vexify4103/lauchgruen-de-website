import assert from "node:assert/strict";
import test from "node:test";
import { orderBySeeds, placementSeeds } from "../src/lib/swiss-placement.ts";

const pair = (id, a, b, winner) => ({ id, teamAKey: a, teamAName: a, teamBKey: b, teamBName: b, winnerTeamKey: winner ?? null });

// Round 3 done (2-0 and 0-2 deciders played), round 4 still open.
const state = {
	rounds: [
		{ round: 1, complete: true, pairings: [pair("1a", "A", "B", "A"), pair("1b", "C", "D", "C"), pair("1c", "E", "F", "E"), pair("1d", "G", "H", "G")] },
		{ round: 2, complete: true, pairings: [pair("2a", "A", "C", "A"), pair("2b", "E", "G", "E"), pair("2c", "B", "D", "B"), pair("2d", "F", "H", "F")] },
		{ round: 3, complete: true, pairings: [pair("3a", "A", "E", "A"), pair("3b", "C", "B", "C"), pair("3c", "G", "F", "G"), pair("3d", "D", "H", "D")] },
		{ round: 4, complete: false, pairings: [pair("4a", "C", "G", "C"), pair("4b", "B", "F")] },
	],
};

test("placement seeds fill each decider as soon as it has a winner", () => {
	assert.deepEqual(placementSeeds(state), { 1: "A", 2: "E", 3: "C", 4: "G", 7: "D", 8: "H" });
});

test("a decided 2-1 seed ranks above a 3-1 team with a later seed", () => {
	const byRecord = [
		{ name: "A", rank: 1, wins: 3, losses: 0 },
		{ name: "C", rank: 2, wins: 3, losses: 1 },
		{ name: "E", rank: 3, wins: 2, losses: 1 },
		{ name: "G", rank: 4, wins: 2, losses: 2 },
		{ name: "B", rank: 5, wins: 1, losses: 2 },
		{ name: "F", rank: 6, wins: 1, losses: 2 },
		{ name: "D", rank: 7, wins: 1, losses: 2 },
		{ name: "H", rank: 8, wins: 0, losses: 3 },
	];
	const ordered = orderBySeeds(byRecord, placementSeeds(state));
	assert.deepEqual(
		ordered.map((row) => `${row.rank}:${row.name}`),
		["1:A", "2:E", "3:C", "4:G", "5:B", "6:F", "7:D", "8:H"]
	);
});

test("without seeds the table keeps its record order", () => {
	const rows = [
		{ name: "X", rank: 1 },
		{ name: "Y", rank: 2 },
	];
	assert.equal(orderBySeeds(rows, undefined), rows);
});
