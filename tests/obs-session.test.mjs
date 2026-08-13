import assert from "node:assert/strict";
import test from "node:test";
import { summarizeObsSession } from "../src/lib/obs-session.ts";

test("counts the full stream session while only exposing five recent games", () => {
	const games = [false, true, false, false, false, true, true].map((win, index) => ({ id: index, win }));
	const summary = summarizeObsSession(games);

	assert.equal(summary.wins, 3);
	assert.equal(summary.losses, 4);
	assert.equal(summary.winRate, 43);
	assert.deepEqual(
		summary.visibleGames.map((game) => game.id),
		[0, 1, 2, 3, 4]
	);
});

test("handles an empty session", () => {
	assert.deepEqual(summarizeObsSession([]), {
		wins: 0,
		losses: 0,
		winRate: 0,
		visibleGames: [],
	});
});
