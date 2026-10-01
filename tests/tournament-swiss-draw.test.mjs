import assert from "node:assert/strict";
import test from "node:test";
import { computeSwissRecords, findClosestSwissRecordMatching, planSwissRecordRound, validateSwissRoundPlan } from "../src/lib/tournament-swiss-rules.ts";

function opponentKey(first, second) {
	return [first, second].sort().join(":");
}

function shuffle(values) {
	const result = [...values];
	for (let index = result.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(Math.random() * (index + 1));
		[result[index], result[swap]] = [result[swap], result[index]];
	}
	return result;
}

function history(rounds) {
	return rounds.map((pairings) => ({
		pairings: pairings.map(([teamAKey, teamBKey, winnerTeamKey]) => ({ teamAKey, teamBKey, winnerTeamKey, bye: false })),
	}));
}

function previousOpponentsOf(rounds) {
	return new Set(rounds.flatMap((round) => round.pairings.map((pairing) => opponentKey(pairing.teamAKey, pairing.teamBKey))));
}

function sameRecord(records, first, second) {
	const a = records.get(first.key);
	const b = records.get(second.key);
	return a.wins === b.wins && a.losses === b.losses;
}

// The real Ultimate Bravery Swiss (4 September 2026) before Round 3 was drawn.
const september = ["recommended", "weScale", "born", "trust", "arbeitszeit", "dasSpieltMan", "fullAp", "critYuumi"].map((key) => ({ key, name: key }));
const septemberRounds = history([
	[
		["critYuumi", "born", "born"],
		["weScale", "fullAp", "weScale"],
		["dasSpieltMan", "recommended", "recommended"],
		["arbeitszeit", "trust", "trust"],
	],
	[
		["recommended", "born", "recommended"],
		["trust", "weScale", "weScale"],
		["dasSpieltMan", "fullAp", "dasSpieltMan"],
		["critYuumi", "arbeitszeit", "arbeitszeit"],
	],
]);

test("replays the September Round 3 draw and never crosses score pools", () => {
	const records = computeSwissRecords(september, septemberRounds);
	const previousOpponents = previousOpponentsOf(septemberRounds);
	// In the 1-1 pool Arbeitszeit and Trust had already met. The old greedy search paired the other two
	// 1-1 teams first and then had to send Arbeitszeit and Trust down to the 0-2 teams.
	assert.ok(previousOpponents.has(opponentKey("arbeitszeit", "trust")));

	for (let attempt = 0; attempt < 500; attempt += 1) {
		const plan = planSwissRecordRound({ teams: september, records, previousOpponents, shuffle });
		assert.ok(plan);
		assert.equal(plan.crossRecordPairs.length, 0);
		assert.equal(plan.pairs.length, 4);
		for (const [first, second] of plan.pairs) {
			assert.ok(sameRecord(records, first, second), `${first.key} vs ${second.key} crosses score pools`);
			assert.ok(!previousOpponents.has(opponentKey(first.key, second.key)), `${first.key} vs ${second.key} is a rematch`);
		}
		assert.deepEqual(validateSwissRoundPlan({ teams: september, ...plan, records, previousOpponents, allowCrossRecord: false }), []);
	}
});

test("flags the pairings that actually happened in September as invalid", () => {
	const records = computeSwissRecords(september, septemberRounds);
	const previousOpponents = previousOpponentsOf(septemberRounds);
	const byKey = new Map(september.map((team) => [team.key, team]));
	const played = [
		["weScale", "recommended"],
		["born", "dasSpieltMan"],
		["arbeitszeit", "fullAp"],
		["trust", "critYuumi"],
	].map(([first, second]) => [byKey.get(first), byKey.get(second)]);

	const problems = validateSwissRoundPlan({ teams: september, pairs: played, byeTeam: null, records, previousOpponents, allowCrossRecord: false });
	assert.equal(problems.length, 2);
	assert.ok(problems.every((problem) => problem.includes("unterschiedlichen Bilanzgruppen")));
});

test("simulated Swiss stages stay inside the score pools whenever that is possible", () => {
	for (const teamCount of [8, 10, 12, 16]) {
		for (let simulation = 0; simulation < 60; simulation += 1) {
			const teams = Array.from({ length: teamCount }, (_, index) => ({ key: `t${index + 1}`, name: `Team ${index + 1}` }));
			const rounds = [];
			for (let round = 1; round <= Math.min(5, teamCount - 1); round += 1) {
				const records = computeSwissRecords(teams, rounds);
				const previousOpponents = previousOpponentsOf(rounds);
				const plan = planSwissRecordRound({ teams, records, previousOpponents, shuffle });
				assert.ok(plan, `no rematch-free round ${round} for ${teamCount} teams`);
				const problems = validateSwissRoundPlan({ teams, ...plan, records, previousOpponents, allowCrossRecord: true });
				assert.deepEqual(problems, []);
				if (plan.crossRecordPairs.length) {
					// Only acceptable when an exhaustive search inside the pools finds nothing.
					const closest = findClosestSwissRecordMatching(teams, records, previousOpponents);
					assert.ok(closest && closest.cost > 0);
				}
				rounds.push({
					pairings: plan.pairs.map(([first, second]) => ({
						teamAKey: first.key,
						teamBKey: second.key,
						winnerTeamKey: Math.random() < 0.5 ? first.key : second.key,
						bye: false,
					})),
				});
			}
		}
	}
});

test("uses the fewest cross-pool pairings when a pool cannot be paired cleanly", () => {
	const teams = ["a", "b", "c", "d", "e", "f"].map((key) => ({ key, name: key }));
	const records = new Map([
		["a", { wins: 2, losses: 0 }],
		["b", { wins: 2, losses: 0 }],
		["c", { wins: 1, losses: 1 }],
		["d", { wins: 1, losses: 1 }],
		["e", { wins: 0, losses: 2 }],
		["f", { wins: 0, losses: 2 }],
	]);
	// a and b already met, so exactly one team has to leave the 2-0 pool, and one more pair has to shift.
	const previousOpponents = new Set([opponentKey("a", "b")]);
	const plan = planSwissRecordRound({ teams, records, previousOpponents });
	assert.ok(plan);
	assert.equal(plan.crossRecordPairs.length, 2);
	assert.equal(findClosestSwissRecordMatching(teams, records, previousOpponents).cost, 4);
	for (const [first, second] of plan.pairs) assert.ok(Math.abs(records.get(first.key).wins - records.get(second.key).wins) <= 1);
});

test("picks the bye among teams with the fewest byes so the remaining pools stay even", () => {
	const teams = ["a", "b", "c", "d", "e"].map((key) => ({ key, name: key }));
	const records = new Map([
		["a", { wins: 1, losses: 0 }],
		["b", { wins: 1, losses: 0 }],
		["c", { wins: 1, losses: 0 }],
		["d", { wins: 0, losses: 1 }],
		["e", { wins: 0, losses: 1 }],
	]);
	// c already had a bye. A bye for d or e would leave odd pools, so it has to go to a or b.
	const byeCounts = new Map([["c", 1]]);
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const plan = planSwissRecordRound({ teams, records, previousOpponents: new Set(), byeCounts, shuffle });
		assert.ok(plan);
		assert.ok(["a", "b"].includes(plan.byeTeam.key));
		assert.equal(plan.crossRecordPairs.length, 0);
		assert.deepEqual(validateSwissRoundPlan({ teams, ...plan, records, previousOpponents: new Set(), allowCrossRecord: false }), []);
	}
});

test("rejects duplicates, missing teams and rematches", () => {
	const [a, b, c, d] = ["a", "b", "c", "d"].map((key) => ({ key, name: key }));
	const records = new Map([a, b, c, d].map((team) => [team.key, { wins: 0, losses: 0 }]));
	const problems = validateSwissRoundPlan({
		teams: [a, b, c, d],
		pairs: [
			[a, b],
			[a, c],
		],
		byeTeam: null,
		records,
		previousOpponents: new Set([opponentKey("a", "b")]),
		allowCrossRecord: false,
	});
	assert.ok(problems.some((problem) => problem.includes("Rematch")));
	assert.ok(problems.some((problem) => problem.includes("2-mal")));
	assert.ok(problems.some((problem) => problem.includes("fehlt")));
});
