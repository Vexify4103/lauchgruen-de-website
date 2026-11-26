import assert from "node:assert/strict";
import test from "node:test";
import { applyTeamAction, gamesDone, WinActionError } from "../src/lib/winchallenge/actions.ts";
import { generateJoinCode, JOIN_CODE_ALPHABET, normalizeJoinCode } from "../src/lib/winchallenge/join-code.ts";
import { assignPayouts, splitByPercent } from "../src/lib/winchallenge/payout.ts";
import { rankTeams } from "../src/lib/winchallenge/ranking.ts";
import { elapsedMs, formatElapsed } from "../src/lib/winchallenge/timer.ts";

const games = [
	{ id: "lol", title: "LoL Duo", goal: "3 Siege in Folge", type: "counter", target: 3 },
	{ id: "mc", title: "Minecraft Hardcore", goal: "Enderdrache", type: "check" },
];
const startAt = "2026-12-01T18:00:00.000Z";
const at = (minutes) => new Date(Date.parse(startAt) + minutes * 60_000);

function team(overrides = {}) {
	return {
		id: "t1",
		challengeId: "c",
		slug: "t1",
		name: "Team 1",
		joinCode: "ABCDEF",
		memberIds: ["p1", "p2"],
		status: "ready",
		segments: [],
		adjustMs: 0,
		progress: {},
		version: 0,
		createdAt: startAt,
		updatedAt: startAt,
		...overrides,
	};
}
const act = (t, input, minutes) => applyTeamAction(t, input, { games, startAt, now: at(minutes) });

test("start is locked before the start time and needs a full team", () => {
	assert.throws(() => act(team(), { action: "start" }, -1), (error) => error instanceof WinActionError && error.code === "too-early");
	assert.throws(() => act(team({ status: "forming", memberIds: ["p1"] }), { action: "start" }, 5), (error) => error.code === "needs-partner");
	assert.equal(act(team(), { action: "start" }, 0).status, "running");
});

test("only running time counts; pause twice changes nothing", () => {
	let t = act(team(), { action: "start" }, 0);
	t = act(t, { action: "pause" }, 60);
	assert.equal(act(t, { action: "pause" }, 70), t);
	t = act(t, { action: "resume" }, 12 * 60);
	assert.equal(elapsedMs(t, at(12 * 60 + 30).getTime()), 90 * 60_000);
	assert.equal(elapsedMs({ ...t, adjustMs: -10 * 3600_000 }, at(12 * 60 + 30).getTime()), 0);
	assert.equal(formatElapsed(41 * 3600_000 + 23 * 60_000 + 7_000), "41:23:07");
});

test("counter counts tries on reset and finishes at the target", () => {
	let t = act(team(), { action: "start" }, 0);
	t = act(t, { action: "plus", gameId: "lol" }, 10);
	t = act(t, { action: "plus", gameId: "lol" }, 20);
	t = act(t, { action: "reset", gameId: "lol" }, 30);
	assert.deepEqual(t.progress.lol, { count: 0, tries: 1 });
	t = act(t, { action: "plus", gameId: "lol" }, 40);
	t = act(t, { action: "plus", gameId: "lol" }, 50);
	t = act(t, { action: "plus", gameId: "lol" }, 60);
	assert.equal(t.progress.lol.count, 3);
	assert.ok(t.progress.lol.doneAt);
	assert.equal(act(t, { action: "plus", gameId: "lol" }, 61).progress.lol.count, 3);
	assert.equal(gamesDone(t, games), 1);
});

test("last game freezes the time; undo reopens the team paused", () => {
	let t = act(team(), { action: "start" }, 0);
	t = act(t, { action: "done", gameId: "mc" }, 30);
	t = act(t, { action: "done", gameId: "lol" }, 90);
	assert.equal(t.status, "finished");
	assert.equal(t.finalMs, 90 * 60_000);
	assert.equal(elapsedMs(t, at(500).getTime()), 90 * 60_000);
	const reopened = act(t, { action: "undo", gameId: "mc" }, 100);
	assert.equal(reopened.status, "paused");
	assert.equal(reopened.finalMs, undefined);
	assert.equal(elapsedMs(reopened, at(500).getTime()), 90 * 60_000);
	assert.throws(() => act(t, { action: "plus", gameId: "lol" }, 101), (error) => error.code === "not-running");
});

test("give up stops the clock and blocks progress", () => {
	let t = act(team(), { action: "start" }, 0);
	t = act(t, { action: "give-up" }, 30);
	assert.equal(t.status, "gave-up");
	assert.equal(t.statusBeforeGiveUp, "running");
	assert.equal(elapsedMs(t, at(300).getTime()), 30 * 60_000);
	assert.throws(() => act(t, { action: "done", gameId: "mc" }, 31), (error) => error.code === "not-running");
});

test("ranking: finished by time, then progress, then not started, then gave up", () => {
	const now = at(600).getTime();
	const finished = (id, minutes) => ({ ...team({ id, name: id }), status: "finished", finalMs: minutes * 60_000, progress: { lol: { count: 3, tries: 0, doneAt: startAt }, mc: { count: 1, tries: 0, doneAt: startAt } } });
	const running = (id, done, minutes) => ({ ...team({ id, name: id }), status: "paused", segments: [{ start: startAt, end: at(minutes).toISOString() }], progress: done ? { mc: { count: 1, tries: 0, doneAt: startAt } } : {} });
	const ranked = rankTeams(
		[team({ id: "gaveup", name: "gaveup", status: "gave-up" }), running("slow", 1, 300), team({ id: "new", name: "new" }), finished("b", 200), running("fast", 1, 100), running("zero", 0, 10), finished("a", 150)],
		games,
		now
	);
	assert.deepEqual(ranked.map((row) => row.team.id), ["a", "b", "fast", "slow", "zero", "new", "gaveup"]);
	assert.deepEqual(ranked.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7]);
});

test("join codes use the safe alphabet and normalize input", () => {
	const code = generateJoinCode();
	assert.equal(code.length, 6);
	assert.ok([...code].every((char) => JOIN_CODE_ALPHABET.includes(char)));
	assert.ok(!/[01OIL]/.test(JOIN_CODE_ALPHABET));
	assert.equal(normalizeJoinCode(" k7 3q-ab "), "K73QAB");
	assert.equal(normalizeJoinCode("K73QA0"), null);
	assert.equal(normalizeJoinCode("short"), null);
});

test("split by percent always sums to the pot", () => {
	assert.deepEqual(splitByPercent(20, [50, 30, 20]), [10, 6, 4]);
	assert.deepEqual(splitByPercent(7, [50, 30, 20]), [4, 2, 1]);
	for (let pot = 0; pot < 40; pot += 1) assert.equal(splitByPercent(pot, [50, 30, 20]).reduce((a, b) => a + b, 0), pot);
});

function setup(teamCount) {
	const payers = [];
	const places = [];
	for (let index = 1; index <= teamCount; index += 1) {
		const members = [`t${index}a`, `t${index}b`];
		members.forEach((id) => payers.push({ id, teamId: `t${index}` }));
		places.push({ teamId: `t${index}`, memberIds: members });
	}
	return { payers, places };
}

function checkAssignments(assignments, payers) {
	const teamOf = new Map(payers.map((payer) => [payer.id, payer.teamId]));
	for (const entry of assignments) assert.notEqual(teamOf.get(entry.payerId), teamOf.get(entry.recipientId), `${entry.payerId} pays own team`);
	assert.equal(new Set(assignments.map((entry) => entry.payerId)).size, assignments.length, "a payer pays twice");
}

test("payout: 10 teams, 50/30/20, nobody pays their own team", () => {
	const { payers, places } = setup(10);
	const result = assignPayouts(payers, places, [50, 30, 20]);
	checkAssignments(result, payers);
	assert.equal(result.length, 20);
	const perPlace = [1, 2, 3].map((place) => result.filter((entry) => entry.place === place).length);
	assert.deepEqual(perPlace, [10, 6, 4]);
	const perRecipient = (id) => result.filter((entry) => entry.recipientId === id).length;
	assert.deepEqual([perRecipient("t1a"), perRecipient("t1b")], [5, 5]);
	assert.deepEqual(assignPayouts([...payers].reverse(), places, [50, 30, 20]), result, "not deterministic");
});

test("payout: 2 teams forces the quotas, every sub still has a recipient", () => {
	const { payers, places } = setup(2);
	const result = assignPayouts(payers, places, [50, 30, 20]);
	checkAssignments(result, payers);
	assert.equal(result.length, 4);
	assert.equal(result.filter((entry) => entry.place === 1).length, 2);
});

test("payout: 3 teams, odd pot with a gave-up team paying", () => {
	const { payers, places } = setup(4);
	payers.push({ id: "solo-gaveup", teamId: "t9" });
	const result = assignPayouts(payers, places.slice(0, 3), [50, 30, 20]);
	checkAssignments(result, payers);
	assert.equal(result.length, 9);
});

test("payout: single finisher gets everything except from itself", () => {
	const { payers, places } = setup(3);
	const result = assignPayouts(payers, places.slice(0, 1), [50, 30, 20]);
	checkAssignments(result, payers);
	assert.equal(result.length, 4);
	assert.ok(result.every((entry) => entry.place === 1));
});
