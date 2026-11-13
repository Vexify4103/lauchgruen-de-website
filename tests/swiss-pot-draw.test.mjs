import assert from "node:assert/strict";
import test from "node:test";
import { advanceSwissPotDraw, createSwissPotState, swissPotSeeds } from "../src/lib/swiss-pot-draw.ts";
import { computeSwissRecords, placementSwissCandidates } from "../src/lib/tournament-swiss-rules.ts";

const pairKey = (a, b) => [a, b].sort().join(":");
function random(seed) {
	return (length) => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return Math.floor((seed / 4294967296) * length);
	};
}
function remainingKeys(state) {
	const last = state.rounds.at(-1);
	if (last && !last.complete) {
		const pool = last.pools.find((entry) => !entry.complete && !entry.automatic);
		return pool ? pool.teamKeys.filter((key) => !pool.drawOrder.includes(key)) : [];
	}
	const records = computeSwissRecords(state.teams, state.rounds);
	const candidates = placementSwissCandidates(state.teams, last?.pairings ?? [], state.rounds.length + 1);
	const groups = new Map();
	for (const team of candidates) {
		const r = records.get(team.key);
		const label = `${r.wins}-${r.losses}`;
		groups.set(label, [...(groups.get(label) ?? []), team.key]);
	}
	return [...groups].sort(([a], [b]) => Number(b.split("-")[0]) - Number(a.split("-")[0])).find(([, keys]) => keys.length > 2)?.[1] ?? [];
}
function drawKey(state, number) {
	const key = `fake-${number}`;
	const remaining = remainingKeys(state);
	assert.ok(remaining.includes(key));
	return advanceSwissPotDraw(state, { type: "draw" }, () => remaining.indexOf(key));
}
function historyState(roundResults) {
	const state = createSwissPotState();
	for (const results of roundResults) {
		const records = computeSwissRecords(state.teams, state.rounds);
		const round = state.rounds.length + 1;
		state.rounds.push({
			round,
			complete: true,
			pools: [],
			pairings: results.map(([a, b, winner], index) => ({
				id: `fixture-r${round}-${index}`,
				teamAKey: `fake-${a}`,
				teamBKey: `fake-${b}`,
				winnerTeamKey: `fake-${winner}`,
				bye: false,
				recordA: `${records.get(`fake-${a}`).wins}-${records.get(`fake-${a}`).losses}`,
				recordB: `${records.get(`fake-${b}`).wins}-${records.get(`fake-${b}`).losses}`,
			})),
		});
	}
	return state;
}
const firstTwo = [
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
];

test("each click draws exactly one team, without deciding or revealing the remaining pot", () => {
	let state = createSwissPotState();
	for (let index = 0; index < 8; index++) {
		const input = state;
		const before = structuredClone(state);
		state = advanceSwissPotDraw(state, { type: "draw" }, () => 0);
		assert.deepEqual(input, before, "A draw never mutates its input session");
		const pool = state.rounds[0].pools[0];
		assert.equal(pool.drawOrder.length, index + 1);
		assert.equal(pool.slots.filter(Boolean).length, index + 1);
		assert.deepEqual(
			pool.slots.filter(Boolean),
			state.teams.slice(0, index + 1).map((team) => team.key)
		);
		assert.equal(state.rounds[0].pairings.length, index === 7 ? 4 : 0);
	}
	assert.deepEqual(
		state.rounds[0].pairings.map((pair) => [pair.teamAKey, pair.teamBKey]),
		[
			["fake-1", "fake-5"],
			["fake-2", "fake-6"],
			["fake-3", "fake-7"],
			["fake-4", "fake-8"],
		]
	);
	assert.throws(() => advanceSwissPotDraw(state, { type: "draw" }, () => 0), /alle Sieger/);
});

test("an already drawn enemy moves forward, leaving the earlier opponent slot open", () => {
	let state = historyState(firstTwo);
	for (const number of [1, 6]) state = drawKey(state, number);
	const before = structuredClone(state);
	state = drawKey(state, 2);
	assert.deepEqual(before.rounds.at(-1).pools.find((pool) => pool.record === "1-1").slots, ["fake-1", "fake-6", null, null]);
	assert.deepEqual(state.rounds.at(-1).pools.find((pool) => pool.record === "1-1").slots, ["fake-1", "fake-6", null, "fake-2"]);
	assert.deepEqual([state.events.at(-1).fromSlot, state.events.at(-1).toSlot], [2, 3]);
	state = drawKey(state, 7);
	const round = state.rounds.at(-1);
	assert.deepEqual(round.pools.find((pool) => pool.record === "1-1").drawOrder, ["fake-1", "fake-6", "fake-2", "fake-7"]);
	assert.deepEqual(
		round.pairings.filter((pair) => pair.recordA === "1-1").map((pair) => [pair.teamAKey, pair.teamBKey]),
		[
			["fake-1", "fake-7"],
			["fake-6", "fake-2"],
		]
	);
	assert.equal(round.pools.filter((pool) => pool.automatic && pool.complete).length, 2);
});

test("all 24 draw orders of a four-team 1-1 pool finish without rematches", () => {
	function permutations(values) {
		return values.length ? values.flatMap((value) => permutations(values.filter((other) => other !== value)).map((rest) => [value, ...rest])) : [[]];
	}
	for (const order of permutations([1, 2, 6, 7])) {
		let state = historyState(firstTwo);
		for (const team of order) state = drawKey(state, team);
		const previous = new Set(state.rounds.slice(0, 2).flatMap((round) => round.pairings.map((pair) => pairKey(pair.teamAKey, pair.teamBKey))));
		assert.equal(state.rounds[2].complete, true);
		for (const pair of state.rounds[2].pairings) {
			assert.equal(pair.recordA, pair.recordB);
			assert.ok(!previous.has(pairKey(pair.teamAKey, pair.teamBKey)));
		}
	}
});

test("placement conflicts are blocked, never cross records, and require explicit approval", () => {
	let state = historyState([
		...firstTwo,
		[
			[1, 6, 6],
			[2, 7, 7],
			[3, 5, 5],
			[4, 8, 8],
		],
	]);
	state = advanceSwissPotDraw(state, { type: "draw" }, () => {
		throw new Error("Two-team pots must not draw randomly");
	});
	const round = state.rounds[3];
	const blocked = round.pools.find((pool) => pool.blockedRematches.length);
	assert.ok(blocked);
	assert.equal(round.complete, false);
	assert.ok(!round.pairings.some((pair) => pair.recordA === blocked.record));
	state = advanceSwissPotDraw(state, { type: "approve-rematch", record: blocked.record }, () => 0);
	assert.equal(state.rounds[3].pools.find((pool) => pool.record === blocked.record).rematchApproved, true);
	assert.equal(state.rounds[3].complete, true);
	for (const pair of state.rounds[3].pairings) assert.equal(pair.recordA, pair.recordB);
	assert.throws(() => advanceSwissPotDraw(state, { type: "result", pairingId: state.rounds[0].pairings[0].id, winnerTeamKey: "fake-1" }, () => 0), /aktuellen Testmatch/);
});

test("400 complete simulated tournaments keep the first three rounds clean and generate eight unique seeds", () => {
	for (let seed = 1; seed <= 400; seed++) {
		const rng = random(seed);
		let state = createSwissPotState();
		const seen = new Set();
		for (let number = 1; number <= 4; number++) {
			do {
				state = advanceSwissPotDraw(state, { type: "draw" }, rng);
				const last = state.rounds.at(-1);
				for (const pool of last.pools.filter((entry) => !entry.complete && entry.blockedRematches.length))
					state = advanceSwissPotDraw(state, { type: "approve-rematch", record: pool.record }, rng);
			} while (!state.rounds.at(-1).complete);
			const round = state.rounds.at(-1);
			const used = new Set();
			for (const pair of round.pairings) {
				assert.equal(pair.recordA, pair.recordB);
				const key = pairKey(pair.teamAKey, pair.teamBKey);
				if (number <= 3) assert.ok(!seen.has(key));
				seen.add(key);
				for (const key of [pair.teamAKey, pair.teamBKey]) {
					assert.ok(!used.has(key));
					used.add(key);
				}
			}
			assert.equal(used.size, number === 4 ? 4 : 8);
			for (const pair of round.pairings)
				state = advanceSwissPotDraw(state, { type: "result", pairingId: pair.id, winnerTeamKey: rng(2) ? pair.teamAKey : pair.teamBKey }, rng);
		}
		const seeds = swissPotSeeds(state);
		assert.deepEqual(
			seeds.map((entry) => entry.seed),
			[1, 2, 3, 4, 5, 6, 7, 8]
		);
		assert.equal(new Set(seeds.map((entry) => entry.teamKey)).size, 8);
		assert.equal(state.events.filter((event) => event.teamKey).length, 20);
		assert.deepEqual(advanceSwissPotDraw(state, { type: "reset" }, rng), createSwissPotState());
	}
});
