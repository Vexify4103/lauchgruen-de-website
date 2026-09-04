import assert from "node:assert/strict";
import test from "node:test";
import { computeSwissRecords, findExactSwissRecordMatching, placementSwissCandidates } from "../src/lib/tournament-swiss-rules.ts";

const teams = Array.from({ length: 8 }, (_, index) => ({ key: String(index + 1), name: `Team ${index + 1}` }));

test("keeps every even Round 3 score pool separate", () => {
	const records = new Map([
		["1", { wins: 2, losses: 0 }],
		["2", { wins: 2, losses: 0 }],
		["3", { wins: 1, losses: 1 }],
		["4", { wins: 1, losses: 1 }],
		["5", { wins: 1, losses: 1 }],
		["6", { wins: 1, losses: 1 }],
		["7", { wins: 0, losses: 2 }],
		["8", { wins: 0, losses: 2 }],
	]);
	const matching = findExactSwissRecordMatching(teams, records, new Set(["3:4"]));

	assert.ok(matching);
	assert.equal(matching.length, 4);
	for (const [first, second] of matching) assert.deepEqual(records.get(first.key), records.get(second.key));
});

test("computes the exact Round 3 pools from two completed rounds", () => {
	const rounds = [
		{
			pairings: [
				{ teamAKey: "1", teamBKey: "2", winnerTeamKey: "1", bye: false },
				{ teamAKey: "3", teamBKey: "4", winnerTeamKey: "3", bye: false },
				{ teamAKey: "5", teamBKey: "6", winnerTeamKey: "5", bye: false },
				{ teamAKey: "7", teamBKey: "8", winnerTeamKey: "7", bye: false },
			],
		},
		{
			pairings: [
				{ teamAKey: "1", teamBKey: "3", winnerTeamKey: "1", bye: false },
				{ teamAKey: "5", teamBKey: "7", winnerTeamKey: "5", bye: false },
				{ teamAKey: "2", teamBKey: "4", winnerTeamKey: "2", bye: false },
				{ teamAKey: "6", teamBKey: "8", winnerTeamKey: "6", bye: false },
			],
		},
	];
	const records = computeSwissRecords(teams, rounds);

	assert.deepEqual(records.get("1"), { wins: 2, losses: 0 });
	assert.deepEqual(records.get("5"), { wins: 2, losses: 0 });
	for (const key of ["2", "3", "6", "7"]) assert.deepEqual(records.get(key), { wins: 1, losses: 1 });
	for (const key of ["4", "8"]) assert.deepEqual(records.get(key), { wins: 0, losses: 2 });

	const matching = findExactSwissRecordMatching(teams, records, new Set(["1:2", "3:4", "5:6", "7:8", "1:3", "5:7", "2:4", "6:8"]));
	assert.ok(matching);
	assert.deepEqual(
		matching.map(([first, second]) => [records.get(first.key), records.get(second.key)]),
		[
			[
				{ wins: 2, losses: 0 },
				{ wins: 2, losses: 0 },
			],
			[
				{ wins: 1, losses: 1 },
				{ wins: 1, losses: 1 },
			],
			[
				{ wins: 1, losses: 1 },
				{ wins: 1, losses: 1 },
			],
			[
				{ wins: 0, losses: 2 },
				{ wins: 0, losses: 2 },
			],
		]
	);
});

test("Round 4 contains only the four middle-record teams", () => {
	const roundThreePairings = [
		{ teamAKey: "1", teamBKey: "2", recordA: "2-0", recordB: "2-0" },
		{ teamAKey: "3", teamBKey: "4", recordA: "1-1", recordB: "1-1" },
		{ teamAKey: "5", teamBKey: "6", recordA: "1-1", recordB: "1-1" },
		{ teamAKey: "7", teamBKey: "8", recordA: "0-2", recordB: "0-2" },
	];

	assert.deepEqual(
		placementSwissCandidates(teams, roundThreePairings, 4).map((team) => team.key),
		["3", "4", "5", "6"]
	);
});
