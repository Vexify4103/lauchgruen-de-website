import assert from "node:assert/strict";
import test from "node:test";
import {
	applyDraftLock,
	applyDraftTimeout,
	applyRoleConfirm,
	applyRoleOrder,
	applyRoleTimeout,
	applySwapAnswer,
	applySwapCancel,
	applySwapRequest,
	applyUndo,
} from "../src/lib/tournament-draft-engine.ts";
import { draftForViewer, draftSideHasRoles } from "../src/lib/tournament-draft-shared.ts";
import {
	DRAFT_GRACE_SECONDS,
	DRAFT_ROLE_TOTAL_MS,
	rolePhaseEndsAtMs,
	DRAFT_TOTAL_MS,
	createDraftSequence,
	draftFinished,
	draftRoleOrder,
	rolePhaseActive,
	suggestRoleOrder,
} from "../src/lib/tournament-draft-shared.ts";
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

// Six bans, then Blue's first pick runs out and becomes a random Annie (action index 6).
function draftWithRandomPick() {
	let state = readyDraft();
	for (const turn of sequence.slice(0, 6)) state = applyDraftLock(state, sequence, { side: turn.side, kind: turn.kind, champion: "Ban-" + state.actions.length }, at(1000));
	state = applyDraftTimeout(state, sequence, { allowedPicks: ["Annie"], random: () => 0 }, at(1000 + DRAFT_TOTAL_MS + 1));
	assert.deepEqual([state.actions[6].champion, state.actions[6].auto], ["Annie", "random"]);
	return state;
}

test("a pick can be swapped when the opponent accepts, and asked again later", () => {
	const requested = applySwapRequest(draftWithRandomPick(), sequence, { side: "teamA", actionIndex: 6, champion: "Ahri", allowedPicks: ["Ahri", "Annie"] });
	assert.deepEqual([requested.swapRequests.teamA.from, requested.swapRequests.teamA.champion], ["Annie", "Ahri"]);
	assert.throws(() => applySwapRequest(requested, sequence, { side: "teamA", actionIndex: 6, champion: "Lux", allowedPicks: ["Lux"] }), /bereits eine Tausch-Anfrage/);

	const { state, outcome } = applySwapAnswer(requested, sequence, { side: "teamA", accept: true });
	assert.equal(outcome, "accepted");
	assert.deepEqual([state.actions[6].champion, state.actions[6].swappedFrom], ["Ahri", "Annie"]);
	assert.equal(state.swapRequests, undefined);
	const again = applySwapAnswer(applySwapRequest(state, sequence, { side: "teamA", actionIndex: 6, champion: "Lux", allowedPicks: ["Lux"] }), sequence, {
		side: "teamA",
		accept: true,
	}).state;
	assert.deepEqual([again.actions[6].champion, again.actions[6].swappedFrom], ["Lux", "Annie"]);
});

test("a declined swap keeps the pick", () => {
	const requested = applySwapRequest(draftWithRandomPick(), sequence, { side: "teamA", actionIndex: 6, champion: "Ahri", allowedPicks: ["Ahri"] });
	const { state, outcome } = applySwapAnswer(requested, sequence, { side: "teamA", accept: false });
	assert.equal(outcome, "declined");
	assert.deepEqual([state.actions[6].champion, state.actions[6].swappedFrom], ["Annie", undefined]);
});

test("swap requests only cover own picks with allowed, unused champions", () => {
	const state = draftWithRandomPick();
	assert.throws(() => applySwapRequest(state, sequence, { side: "teamB", actionIndex: 6, champion: "Ahri", allowedPicks: ["Ahri"] }), /Nur eigene Picks/);
	assert.throws(() => applySwapRequest(state, sequence, { side: "teamA", actionIndex: 0, champion: "Ahri", allowedPicks: ["Ahri"] }), /Nur eigene Picks/);
	assert.throws(() => applySwapRequest(state, sequence, { side: "teamA", actionIndex: 6, champion: "Ban-0", allowedPicks: ["Ban-0"] }), /bereits gepickt/);
	assert.throws(() => applySwapRequest(state, sequence, { side: "teamA", actionIndex: 6, champion: "Ahri", allowedPicks: ["Lux"] }), /nicht picken/);
});

test("locking the requested champion drops the request, and a cancelled request can be asked again", () => {
	const requested = applySwapRequest(draftWithRandomPick(), sequence, { side: "teamA", actionIndex: 6, champion: "Ahri", allowedPicks: ["Ahri", "Lux"] });
	const turn = sequence[7];
	const locked = applyDraftLock(requested, sequence, { side: turn.side, kind: turn.kind, champion: "Ahri" }, new Date(requested.currentTurnStartedAt));
	assert.equal(locked.swapRequests, undefined);
	assert.throws(() => applySwapAnswer(locked, sequence, { side: "teamA", accept: true }), /keine offene/);

	const cancelled = applySwapCancel(requested, sequence, { side: "teamA" });
	assert.equal(cancelled.swapRequests, undefined);
	assert.ok(applySwapRequest(cancelled, sequence, { side: "teamA", actionIndex: 6, champion: "Lux", allowedPicks: ["Lux"] }).swapRequests.teamA);
});

test("an accepted swap during role confirmation updates the role order; requests end with the draft", () => {
	let state = draftWithRandomPick();
	for (const [index, turn] of sequence.entries()) {
		if (index <= 6) continue;
		state = applyDraftLock(
			state,
			sequence,
			{ side: turn.side, kind: turn.kind, champion: (turn.kind === "pick" ? "Pick-" : "Ban-") + index },
			new Date(state.currentTurnStartedAt)
		);
	}
	assert.ok(rolePhaseActive(state, sequence));
	const now = new Date(state.rolePhaseStartedAt);
	const requested = applySwapRequest(state, sequence, { side: "teamA", actionIndex: 6, champion: "Ahri", allowedPicks: ["Ahri"] }, now);
	const { state: swapped } = applySwapAnswer(requested, sequence, { side: "teamA", accept: true }, now);
	assert.ok(swapped.roles.teamA.order.includes("Ahri"));
	assert.ok(!swapped.roles.teamA.order.includes("Annie"));
	// Any own pick can be swapped, not only timeout picks.
	const redPick = state.actions.findIndex((action) => action.side === "teamB" && action.kind === "pick");
	assert.equal(
		applySwapRequest(state, sequence, { side: "teamB", actionIndex: redPick, champion: "Lux", allowedPicks: ["Lux"] }, now).swapRequests.teamB.from,
		state.actions[redPick].champion
	);

	const done = applyRoleTimeout(requested, sequence, undefined, new Date(now.getTime() + DRAFT_ROLE_TOTAL_MS));
	assert.ok(draftFinished(done, sequence));
	assert.equal(done.swapRequests, undefined);
	assert.throws(() => applySwapRequest(done, sequence, { side: "teamA", actionIndex: 6, champion: "Ahri", allowedPicks: ["Ahri"] }), /abgeschlossen/);
});

test("role orders stay hidden from the opponent and public until both teams confirmed", () => {
	const full = playFullDraft();
	const now = new Date(full.rolePhaseStartedAt);
	const ordered = applyRoleConfirm(applyRoleOrder(full, sequence, { side: "teamB", order: [...RED_PICKS].reverse() }, now), sequence, { side: "teamB" }, now);

	const blueView = draftForViewer(ordered, "teamA");
	assert.deepEqual(blueView.roles.teamB.order, RED_PICKS);
	assert.equal(blueView.roles.teamB.hidden, true);
	assert.ok(blueView.roles.teamB.confirmedAt);
	assert.equal(draftSideHasRoles(blueView, "teamB"), false);
	assert.equal(draftSideHasRoles(blueView, "teamA"), true);

	assert.deepEqual(draftForViewer(ordered, "teamB").roles.teamB.order, [...RED_PICKS].reverse());
	assert.equal(draftForViewer(ordered, null).roles.teamB.hidden, true);
	assert.equal(draftForViewer(ordered, "all"), ordered);

	const done = applyRoleConfirm(ordered, sequence, { side: "teamA" }, now);
	assert.deepEqual(draftForViewer(done, null).roles.teamB.order, [...RED_PICKS].reverse());
});

test("a team that confirmed its roles cannot ask for a swap anymore", () => {
	const full = playFullDraft();
	const now = new Date(full.rolePhaseStartedAt);
	const requested = applySwapRequest(full, sequence, { side: "teamA", actionIndex: 6, champion: "Ahri", allowedPicks: ["Ahri"] }, now);
	// The own open request blocks the confirmation, so it cannot silently die.
	assert.throws(() => applyRoleConfirm(requested, sequence, { side: "teamA" }, now), /noch offen/);
	const confirmed = applyRoleConfirm(applySwapCancel(requested, sequence, { side: "teamA" }, now), sequence, { side: "teamA" }, now);
	assert.equal(confirmed.swapRequests, undefined);
	assert.throws(() => applySwapRequest(confirmed, sequence, { side: "teamA", actionIndex: 6, champion: "Ahri", allowedPicks: ["Ahri"] }, now), /bereits bestätigt/);
});

test("a late swap request extends the role phase so the opponent can answer", () => {
	const full = playFullDraft();
	const startMs = new Date(full.rolePhaseStartedAt).getTime();
	const t = (seconds) => new Date(startMs + seconds * 1000);
	const grace = DRAFT_GRACE_SECONDS * 1000;
	// Red confirms early, Blue asks 22 s into the 30 s phase (the Sturmfront case).
	const redDone = applyRoleConfirm(full, sequence, { side: "teamB" }, t(21));
	const requested = applySwapRequest(redDone, sequence, { side: "teamA", actionIndex: 6, champion: "Ahri", allowedPicks: ["Ahri"] }, t(22));
	assert.equal(rolePhaseEndsAtMs(requested), t(42).getTime());
	assert.throws(() => applyRoleTimeout(requested, sequence, undefined, new Date(t(30).getTime() + grace)), /läuft noch/);

	// Red already confirmed and can still answer; Blue then gets time to confirm.
	const { state: swapped, outcome } = applySwapAnswer(requested, sequence, { side: "teamA", accept: true }, t(40));
	assert.equal(outcome, "accepted");
	assert.equal(rolePhaseEndsAtMs(swapped), t(50).getTime());
	assert.ok(swapped.roles.teamA.order.includes("Ahri"));
	const done = applyRoleConfirm(swapped, sequence, { side: "teamA" }, t(45));
	assert.ok(done.rolesFinalizedAt);
	assert.ok(done.actions.some((action) => action.champion === "Ahri"));

	// Without an answer the extended phase still ends, at most 60 s later than normal.
	const timedOut = applyRoleTimeout(requested, sequence, undefined, new Date(t(42).getTime() + grace));
	assert.ok(timedOut.rolesFinalizedAt);
	assert.equal(timedOut.swapRequests, undefined);
	let stretched = requested;
	for (let second = 40; second <= 120; second += 10) {
		stretched = applySwapCancel(stretched, sequence, { side: "teamA" }, t(second - 1));
		if (rolePhaseEndsAtMs(stretched) + grace <= t(second).getTime()) break;
		stretched = applySwapRequest(stretched, sequence, { side: "teamA", actionIndex: 6, champion: "Ahri", allowedPicks: ["Ahri"] }, t(second));
	}
	assert.ok(rolePhaseEndsAtMs(stretched) <= t(90).getTime());
});
