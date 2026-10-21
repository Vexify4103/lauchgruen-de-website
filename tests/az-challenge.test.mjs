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

test("advances only on a win with the current target champion", () => {
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
});

test("an early win does not skip the champion before its turn", () => {
	minute = 0;
	const docs = [game("Aatrox", true), game("Akali", true), game("Ahri", false)];
	const progress = computeAzProgress(roster, docs, config);
	assert.equal(roster[progress.index].name, "Ahri");
	assert.equal(progress.attempts.length, 1);
	const later = computeAzProgress(roster, [...docs, game("Ahri", true), game("Akali", false), game("Akali", true)], config);
	assert.equal(later.completed.find((entry) => entry.champion.name === "Akali").tries, 3);
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
