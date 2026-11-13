import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import * as potDraw from "../src/lib/swiss-pot-draw.ts";
import * as livePot from "../src/lib/swiss-live-pot.ts";
import ts from "typescript";
import * as rules from "../src/lib/tournament-swiss-rules.ts";
import * as series from "../src/lib/tournament-series.ts";

const teams = Array.from({ length: 8 }, (_, index) => ({ key: String(index + 1), name: `Team ${index + 1}` }));
const opponentKey = (a, b) => [a, b].sort().join(":");
const opponentsOf = (rounds) => new Set(rounds.flatMap((round) => round.pairings.map((pair) => opponentKey(pair.teamAKey, pair.teamBKey))));

// Independent exhaustive enumerator: every perfect matching inside the exact score pools.
function matchings(remaining, records, opponents) {
	if (!remaining.length) return [[]];
	const [first, ...rest] = remaining;
	return rest.flatMap((second) => {
		const a = records.get(first.key);
		const b = records.get(second.key);
		if (a.wins !== b.wins || a.losses !== b.losses || opponents.has(opponentKey(first.key, second.key))) return [];
		return matchings(
			rest.filter((team) => team.key !== second.key),
			records,
			opponents
		).map((tail) => [[first, second], ...tail]);
	});
}
function playedRound(pairs, records, mask, round) {
	return {
		round,
		complete: true,
		drawnAt: "2026-11-13T00:00:00Z",
		pairings: pairs.map(([a, b], index) => ({
			id: `audit-r${round}-m${index + 1}`,
			round,
			slot: index + 1,
			teamAKey: a.key,
			teamAName: a.name,
			teamBKey: b.key,
			teamBName: b.name,
			bye: false,
			winnerTeamKey: mask & (1 << index) ? a.key : b.key,
			recordA: `${records.get(a.key).wins}-${records.get(a.key).losses}`,
			recordB: `${records.get(b.key).wins}-${records.get(b.key).losses}`,
		})),
	};
}

test("exhausts every eight-team result and legal draw through round three, then checks placement conflicts", (t) => {
	const stats = { drawStates: 0, completedHistories: 0, placementConflicts: 0 };
	let conflictingHistory;
	function visit(history) {
		const records = rules.computeSwissRecords(teams, history);
		const previousOpponents = opponentsOf(history);
		if (history.length === 3) {
			stats.completedHistories++;
			const middle = rules.placementSwissCandidates(teams, history[2].pairings, 4);
			assert.equal(middle.length, 4);
			const exact = rules.findExactSwissRecordMatching(middle, records, previousOpponents);
			if (!exact) {
				stats.placementConflicts++;
				conflictingHistory ??= history;
				const forced = rules.findExactSwissRecordMatching(middle, records, new Set());
				assert.ok(forced, "Same-record deciders exist if a rematch is permitted");
				assert.ok(forced.some(([a, b]) => previousOpponents.has(opponentKey(a.key, b.key))));
			}
			return;
		}
		stats.drawStates++;
		const plan = rules.planSwissRecordRound({ teams, records, previousOpponents });
		assert.ok(plan);
		assert.equal(plan.crossRecordPairs.length, 0);
		assert.deepEqual(rules.validateSwissRoundPlan({ teams, ...plan, records, previousOpponents, allowCrossRecord: false }), []);
		// Any opening draw is equivalent to this one by relabelling teams. Test all its 16 outcomes.
		const possible = history.length
			? matchings(teams, records, previousOpponents)
			: [
					[
						[teams[0], teams[1]],
						[teams[2], teams[3]],
						[teams[4], teams[5]],
						[teams[6], teams[7]],
					],
				];
		assert.ok(possible.length > 0);
		for (const pairs of possible) {
			assert.deepEqual(rules.validateSwissRoundPlan({ teams, pairs, byeTeam: null, records, previousOpponents, allowCrossRecord: false }), []);
			for (let mask = 0; mask < 1 << pairs.length; mask++) visit([...history, playedRound(pairs, records, mask, history.length + 1)]);
		}
	}
	visit([]);
	assert.ok(stats.completedHistories > 10000);
	assert.ok(stats.placementConflicts > 0, "The fourth-round no-rematch guarantee is mathematically impossible for every result path");
	t.diagnostic(JSON.stringify(stats));
	t.diagnostic(
		`Counterexample: ${JSON.stringify(conflictingHistory.map((round) => round.pairings.map((pair) => `${pair.teamAKey}-${pair.teamBKey}: winner ${pair.winnerTeamKey}`)))}`
	);
});

test("the real draw service blocks a conflicting placement decider without explicit rematch approval", async () => {
	const conflictingHistory = [];
	for (const results of [
		[
			[1, 2, 2],
			[3, 4, 4],
			[5, 6, 6],
			[7, 8, 8],
		],
		[
			[1, 3, 1],
			[2, 4, 4],
			[5, 7, 7],
			[6, 8, 8],
		],
		[
			[1, 6, 6],
			[2, 7, 7],
			[3, 5, 5],
			[4, 8, 8],
		],
	]) {
		const records = rules.computeSwissRecords(teams, conflictingHistory);
		const pairs = results.map(([a, b]) => [teams[a - 1], teams[b - 1]]);
		const mask = results.reduce((value, [a, , winner], index) => value | (a === winner ? 1 << index : 0), 0);
		conflictingHistory.push(playedRound(pairs, records, mask, conflictingHistory.length + 1));
	}
	const require = createRequire(import.meta.url);
	let writes = 0;
	const document = { _id: "audit", tournamentId: "audit", rounds: conflictingHistory, updatedAt: "2026-11-13T00:00:00Z" };
	const db = {
		collection: () => ({
			findOne: async () => structuredClone(document),
			updateOne: async () => {
				writes++;
			},
			insertOne: async () => {
				writes++;
			},
		}),
	};
	const source = readFileSync(new URL("../src/lib/tournament-swiss.ts", import.meta.url), "utf8");
	const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const compiled = { exports: {} };
	const mocks = {
		"@/lib/mongo": { getDb: async () => db },
		"@/lib/tournament-swiss-rules": rules,
		"@/lib/tournament-series": series,
		"@/lib/swiss-pot-draw": potDraw,
		"@/lib/swiss-live-pot": livePot,
	};
	new Function("require", "exports", output)((name) => mocks[name] ?? require(name), compiled.exports);
	const options = { tournamentId: "audit", maximumRounds: 4, teams, pairByRecord: true, placementSwiss: true, requireCompletedRound: true, persistMatches: false };
	for (const allowCrossRecord of [false, true]) {
		await assert.rejects(
			() => compiled.exports.drawNextSwissMatchup({ ...options, allowCrossRecord }),
			(error) => {
				assert.equal(error.code, "rematch-required");
				assert.ok(error.rematchPairs.length > 0);
				return true;
			}
		);
	}
	assert.equal(writes, 0, "No pairing or audit entry was persisted for a rejected draw");
});
