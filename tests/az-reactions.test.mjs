import assert from "node:assert/strict";
import test from "node:test";
import { demoAzReactions, detectAzReactions } from "../src/components/obs/az-challenge/az-reactions.ts";

const champ = (id, name) => ({ id, name, letter: name.charAt(0), iconUrl: "", splashUrl: "" });
const amumu = champ(32, "Amumu");
const anivia = champ(34, "Anivia");
const bard = champ(432, "Bard");

function snapshot(overrides = {}) {
	return {
		syncing: false,
		updatedAt: "2026-10-25T18:00:00.000Z",
		completedCount: 6,
		totalChampions: 20,
		percent: 30,
		current: { champion: amumu, position: 7, tryNumber: 8, losses: 7, attempts: [], mastery: null },
		upcoming: [anivia, bard],
		lastCompleted: null,
		recentCompleted: [],
		letters: [
			{ letter: "A", total: 8, done: 6, current: true },
			{ letter: "B", total: 1, done: 0, current: false },
		],
		insights: { firstTryStreak: 0, record: { champion: amumu, tries: 5, state: "broken" } },
		...overrides,
	};
}

test("a new loss on the same target flips the try counter", () => {
	const prev = snapshot({ current: { ...snapshot().current, tryNumber: 8 } });
	const next = snapshot({ current: { ...snapshot().current, tryNumber: 9, losses: 8 }, updatedAt: "later" });
	const [reaction] = detectAzReactions(prev, next);
	assert.equal(reaction.kind, "loss");
	assert.deepEqual([reaction.from, reaction.to], [8, 9]);
	assert.equal(reaction.recordBroken, false); // record was already broken before
});

test("finishing the last champion of a letter plays win, letter and milestone in order", () => {
	const done = { champion: champ(8, "Azir"), tries: 1, manual: false, winGame: null, completedAt: "x" };
	const prev = snapshot({ current: { ...snapshot().current, champion: champ(8, "Azir") }, percent: 24 });
	const next = snapshot({
		completedCount: 7,
		percent: 25,
		current: { ...snapshot().current, champion: bard, tryNumber: 1 },
		lastCompleted: done,
		recentCompleted: [done, done],
		insights: { firstTryStreak: 2, record: null },
	});
	const kinds = detectAzReactions(prev, next).map((reaction) => reaction.kind);
	assert.deepEqual(kinds, ["win", "letter", "milestone", "streak"]);
});

test("no reactions while the history backfill is running", () => {
	const prev = snapshot({ syncing: true, completedCount: 0 });
	const next = snapshot({ completedCount: 6, lastCompleted: { champion: amumu, tries: 1 } });
	assert.deepEqual(detectAzReactions(prev, next), []);
});

test("demo builds every reaction kind from live data", () => {
	const data = snapshot({
		lastCompleted: { champion: anivia, tries: 2, manual: false, winGame: null, completedAt: "x" },
		recentCompleted: [{ champion: anivia, tries: 1 }],
	});
	assert.deepEqual(
		demoAzReactions(data, "all").map((reaction) => reaction.kind),
		["win", "letter", "milestone", "streak", "loss"]
	);
	assert.equal(demoAzReactions(data, "milestone")[0].percent, 50);
});
