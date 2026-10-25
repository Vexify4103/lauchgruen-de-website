import assert from "node:assert/strict";
import test from "node:test";
import { computeAzProgress } from "../src/lib/az-challenge.ts";

const roster = ["Aatrox", "Ahri", "Akali", "Akshan", "Alistar", "Ambessa", "Amumu", "Anivia", "Bard", "Zyra"].map((name, index) => ({
	id: index + 1,
	name,
	letter: name.charAt(0),
	iconUrl: "",
	splashUrl: "",
}));
const idOf = (name) => roster.find((champion) => champion.name === name).id;

let minute = 0;
function game(name, win, extra = {}) {
	minute += 40;
	const endedAt = new Date(Date.UTC(2026, 9, 15, 12, minute)).toISOString();
	return {
		_id: `m${minute}`,
		slug: "tlgfabi",
		matchId: `EUW1_${minute}`,
		queueId: 420,
		championId: idOf(name),
		win,
		remake: false,
		kills: 1,
		deaths: 2,
		assists: 3,
		creepScore: 100,
		durationSeconds: 1800,
		startedAt: endedAt,
		endedAt,
		createdAt: endedAt,
		...extra,
	};
}

const config = { queueIds: [420], manualDone: [], startAt: "2026-10-15T00:00:00Z" };

test("counts tries until the first win per champion", () => {
	minute = 0;
	const docs = [
		game("Aatrox", true),
		game("Ahri", true),
		game("Akali", false),
		game("Ambessa", false), // off-pick while Akali was the target
		game("Akali", true),
		game("Akshan", false),
		game("Akshan", false, { remake: true, win: true }), // remakes never count
		game("Akshan", true),
		game("Alistar", false, { queueId: 1700 }), // Arena does not count
		game("Alistar", false),
	];
	const progress = computeAzProgress(roster, docs, config);
	assert.equal(progress.index, 4);
	assert.equal(roster[progress.index].name, "Alistar");
	assert.deepEqual(
		progress.completed.map((entry) => [entry.champion.name, entry.tries]),
		[
			["Aatrox", 1],
			["Ahri", 1],
			["Akali", 2],
			["Akshan", 2],
		]
	);
	assert.equal(progress.attempts.length, 1);
	assert.equal(progress.offPicks, 0);
	assert.equal(progress.stats.firstTryCount, 2);
	assert.equal(progress.stats.games, 8);
	assert.equal(progress.stats.wins, 4);
	assert.equal(progress.stats.hardest.champion.name, "Akali");
});

test("counts games played before a champion became the target as tries", () => {
	minute = 0;
	// Real order from TLG Fabi: two Ambessa losses while Akali/Akshan were the target.
	const docs = [
		game("Aatrox", true),
		game("Ahri", true),
		game("Ambessa", false),
		game("Akali", true),
		game("Ambessa", false),
		game("Anivia", false),
		game("Akshan", true),
		game("Alistar", true),
		game("Ambessa", true),
		game("Aatrox", false), // replay of a finished champion is not a try
	];
	const progress = computeAzProgress(roster, docs, config);
	const ambessa = progress.completed.find((entry) => entry.champion.name === "Ambessa");
	assert.equal(ambessa.tries, 3);
	assert.equal(roster[progress.index].name, "Amumu");
	assert.equal(progress.offPicks, 1);
	assert.equal(progress.stats.games, 9);
	assert.equal(progress.pendingTries[idOf("Anivia")], 1); // early Anivia loss waits as try #1
	assert.equal(progress.firstTryStreak, 0);
	assert.equal(progress.deaths, 20); // 10 counted games x 2 deaths
	assert.equal(progress.playSeconds, 10 * 1800);
});

test("tracks the current first-try streak", () => {
	minute = 0;
	const progress = computeAzProgress(roster, [game("Aatrox", false), game("Aatrox", true), game("Ahri", true), game("Akali", true)], config);
	assert.equal(progress.firstTryStreak, 2);
});

test("a win out of order completes that champion (same rule as the tracking sheet)", () => {
	minute = 0;
	// Filled into another role: Zyra wins long before her turn.
	const docs = [game("Aatrox", true), game("Zyra", false), game("Zyra", true), game("Akali", true), game("Ahri", false)];
	const progress = computeAzProgress(roster, docs, config);
	assert.equal(roster[progress.index].name, "Ahri");
	assert.equal(progress.attempts.length, 1);
	assert.equal(progress.doneCount, 3);
	assert.equal(progress.completed.find((entry) => entry.champion.name === "Zyra").tries, 2);
	assert.equal(progress.letters.find((entry) => entry.letter === "Z").done, 1);

	// After Ahri, the target skips Akali (already won) and goes to Akshan.
	const later = computeAzProgress(roster, [...docs, game("Ahri", true), game("Akali", false)], config);
	assert.equal(roster[later.index].name, "Akshan");
	assert.equal(later.offPicks, 1); // Akali replay after its win is ignored
});

test("excluded matches (played outside the challenge) are ignored", () => {
	minute = 0;
	const outside = game("Zyra", true);
	const progress = computeAzProgress(roster, [game("Aatrox", true), outside], { ...config, excludedMatchIds: [outside.matchId] });
	assert.equal(progress.doneCount, 1);
	assert.equal(progress.letters.find((entry) => entry.letter === "Z").done, 0);
	assert.equal(progress.stats.games, 1);
});

test("games under five minutes count as remakes", () => {
	minute = 0;
	const progress = computeAzProgress(roster, [game("Aatrox", true, { durationSeconds: 120 }), game("Aatrox", false)], config);
	assert.equal(roster[progress.index].name, "Aatrox");
	assert.equal(progress.attempts.length, 1);
});

test("ignores games before the start and skips manual champions", () => {
	minute = 0;
	const early = game("Aatrox", true, { endedAt: "2026-10-01T10:00:00.000Z" });
	const progress = computeAzProgress(roster, [early, game("Ahri", true)], { ...config, manualDone: ["Aatrox"] });
	assert.equal(progress.completed[0].manual, true);
	assert.equal(roster[progress.index].name, "Akali");
	assert.equal(progress.stats.averageTries, 1);
});

test("builds letter progress for the alphabet bar", () => {
	minute = 0;
	const progress = computeAzProgress(roster, [game("Aatrox", true)], config);
	const a = progress.letters.find((entry) => entry.letter === "A");
	const b = progress.letters.find((entry) => entry.letter === "B");
	assert.deepEqual([a.total, a.done, a.current], [8, 1, true]);
	assert.deepEqual([b.total, b.done, b.current], [1, 0, false]);
	assert.equal(progress.letters.length, 26);
});
