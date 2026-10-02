import assert from "node:assert/strict";
import test from "node:test";
import { applyDraftLock, applyDraftTimeout, applyRoleConfirm, applyRoleOrder, applyRoleTimeout, applyUndo } from "../src/lib/tournament-draft-engine.ts";
import { DRAFT_ROLE_TOTAL_MS, DRAFT_TOTAL_MS, createDraftSequence, draftFinished, draftRoleOrder, rolePhaseActive, suggestRoleOrder } from "../src/lib/tournament-draft-shared.ts";
import { championFitsRole, championRoles } from "../src/lib/champion-roles.ts";

const start = new Date("2026-10-10T18:00:00.000Z");
const at = (ms) => new Date(start.getTime() + ms);
const readyDraft = () => ({
	matchId: "m1",
	actions: [],
	readyBy: { teamA: { readyAt: start.toISOString() }, teamB: { readyAt: start.toISOString() } },
	currentTurnStartedAt: start.toISOString(),
	updatedAt: start.toISOString(),
});
const sequence = createDraftSequence();
const turnString = (seq) => seq.map((turn) => `${turn.side === "teamA" ? "B" : "R"}${turn.kind === "ban" ? "b" : "p"}`).join(" ");

const BLUE_PICKS = ["Ornn", "Lee Sin", "Orianna", "Jinx", "Thresh"];
const RED_PICKS = ["Sejuani", "Gnar", "Ezreal", "Azir", "Nautilus"];

function playFullDraft() {
	let state = readyDraft();
	const picks = { teamA: [...BLUE_PICKS], teamB: [...RED_PICKS] };
	let ban = 0;
	for (const turn of sequence) {
		const champion = turn.kind === "pick" ? picks[turn.side].shift() : `Ban${(ban += 1)}`;
		state = applyDraftLock(state, sequence, { side: turn.side, kind: turn.kind, champion }, at(1000));
	}
	return state;
}

test("uses the tournament order with two ban phases, like drafter.lol", () => {
	assert.equal(turnString(sequence), "Bb Rb Bb Rb Bb Rb Bp Rp Rp Bp Bp Rp Rb Bb Rb Bb Rp Bp Bp Rp");
	assert.equal(turnString(createDraftSequence("teamB")), "Bb Rb Bb Rb Bb Rb Rb Bp Rp Rp Bp Bp Rp Rb Bb Rb Bb Rp Bp Bp Rp");
});

test("a ban can be skipped on purpose but a pick cannot", () => {
	const skipped = applyDraftLock(readyDraft(), sequence, { side: "teamA", kind: "ban", champion: null }, at(1000));
	assert.deepEqual({ champion: skipped.actions[0].champion, skipped: skipped.actions[0].skipped }, { champion: "", skipped: true });
	let state = skipped;
	for (const turn of sequence.slice(1, 6)) state = applyDraftLock(state, sequence, { ...turn, champion: null }, at(2000));
	assert.throws(() => applyDraftLock(state, sequence, { side: "teamA", kind: "pick", champion: null }, at(3000)), /Nur Bans/);
	// Two skipped bans never block each other as "already used".
	assert.equal(state.actions.filter((action) => action.skipped).length, 6);
});

test("timeouts lock the hover, skip a ban, or pick a random allowed champion", () => {
	const late = at(DRAFT_TOTAL_MS + 1);
	const hovered = applyDraftTimeout(
		{ ...readyDraft(), pendingSelection: { side: "teamA", kind: "ban", champion: "Zed", selectedAt: start.toISOString() } },
		sequence,
		{ allowedPicks: [] },
		late
	);
	assert.deepEqual([hovered.actions[0].champion, hovered.actions[0].auto], ["Zed", "hover"]);

	const noBan = applyDraftTimeout(readyDraft(), sequence, { allowedPicks: [] }, late);
	assert.equal(noBan.actions[0].skipped, true);
	assert.equal(noBan.resetReason, undefined);

	let state = readyDraft();
	for (const turn of sequence.slice(0, 6)) state = applyDraftLock(state, sequence, { ...turn, champion: `Ban-${turn.side}-${state.actions.length}` }, at(1000));
	const random = applyDraftTimeout(state, sequence, { allowedPicks: ["Ban-teamA-0", "Ahri", "Annie"], random: () => 0.99 }, at(1000 + DRAFT_TOTAL_MS + 1));
	assert.deepEqual([random.actions[6].champion, random.actions[6].auto], ["Annie", "random"]);

	const empty = applyDraftTimeout(state, sequence, { allowedPicks: ["Ban-teamA-0"] }, at(1000 + DRAFT_TOTAL_MS + 1));
	assert.equal(empty.actions.length, 0);
	assert.match(empty.resetReason, /keinen erlaubten Champion/);
	assert.throws(() => applyDraftTimeout(readyDraft(), sequence, { allowedPicks: [] }, at(1000)), /läuft noch/);
});

test("the last pick opens role confirmation with a role guess per team", () => {
	const state = playFullDraft();
	assert.equal(rolePhaseActive(state, sequence), true);
	assert.equal(draftFinished(state, sequence), false);
	assert.deepEqual(state.roles.teamA.order, ["Ornn", "Lee Sin", "Orianna", "Jinx", "Thresh"]);
	assert.deepEqual(state.roles.teamB.order, ["Gnar", "Sejuani", "Azir", "Ezreal", "Nautilus"]);
});

test("captains reorder and confirm roles; both confirmations finish the draft", () => {
	let state = playFullDraft();
	const order = ["Lee Sin", "Ornn", "Orianna", "Jinx", "Thresh"];
	state = applyRoleOrder(state, sequence, { side: "teamA", order }, at(2000));
	assert.deepEqual(draftRoleOrder(state, "teamA"), order);
	assert.throws(() => applyRoleOrder(state, sequence, { side: "teamA", order: [...order.slice(0, 4), "Zed"] }, at(2000)), /fünf Picks/);

	state = applyRoleConfirm(state, sequence, { side: "teamA" }, at(3000));
	assert.ok(state.roles.teamA.confirmedAt);
	assert.equal(state.rolesFinalizedAt, undefined);
	assert.throws(() => applyRoleOrder(state, sequence, { side: "teamA", order }, at(3000)), /bereits bestätigt/);

	state = applyRoleConfirm(state, sequence, { side: "teamB", order: ["Gnar", "Sejuani", "Azir", "Ezreal", "Nautilus"] }, at(4000));
	assert.ok(state.rolesFinalizedAt);
	assert.equal(draftFinished(state, sequence), true);
});

test("role confirmation timeout keeps the current order", () => {
	const state = playFullDraft();
	assert.throws(() => applyRoleTimeout(state, sequence, undefined, at(2000)), /läuft noch/);
	const done = applyRoleTimeout(state, sequence, undefined, at(1000 + DRAFT_ROLE_TOTAL_MS + 1));
	assert.equal(draftFinished(done, sequence), true);
	assert.deepEqual(draftRoleOrder(done, "teamB"), state.roles.teamB.order);
});

test("undo of the last pick closes the role phase again", () => {
	const undone = applyUndo(playFullDraft(), "admin", at(5000));
	assert.equal(undone.actions.length, sequence.length - 1);
	assert.equal(undone.rolePhaseStartedAt, undefined);
	assert.equal(undone.roles, undefined);
});

test("drafts finished before role confirmation existed count as finished", () => {
	const legacy = { ...playFullDraft(), rolePhaseStartedAt: undefined, roles: undefined };
	assert.equal(draftFinished(legacy, sequence), true);
	assert.deepEqual(draftRoleOrder(legacy, "teamA"), BLUE_PICKS);
});

test("role data resolves display names and lets unknown champions fit every role", () => {
	assert.deepEqual(championRoles("Wukong"), championRoles("MonkeyKing"));
	assert.ok(championRoles("Kai'Sa")?.includes("bottom"));
	assert.equal(championFitsRole("Some New Champion", "support"), true);
	assert.equal(championFitsRole("Jinx", "top"), false);
	assert.deepEqual(
		suggestRoleOrder(["A", "B"], () => undefined),
		["A", "B"]
	);
});
