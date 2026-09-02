import assert from "node:assert/strict";
import test from "node:test";
import { resolveBracketFocusMatchId, resolveGroupFocusMatchId, resolveSwissFocusRound } from "../src/lib/tournament-stage-focus.ts";

test("focuses the first unfinished Swiss round and then the next round", () => {
	assert.equal(
		resolveSwissFocusRound(
			[
				{ round: 1, pairings: [{ bye: false, winnerTeamKey: "alpha" }] },
				{ round: 2, pairings: [{ bye: false }] },
			],
			4
		),
		2
	);
	assert.equal(resolveSwissFocusRound([{ round: 1, pairings: [{ bye: false, winnerTeamKey: "alpha" }] }], 4), 2);
	assert.equal(resolveSwissFocusRound([], 4), 1);
});

test("prioritizes live and pending bracket matches over the next resolved match", () => {
	const matches = [
		{ id: "ub-r1-1", status: "Scheduled", teamAName: "A", teamBName: "B" },
		{ id: "ub-r2-1", status: "Pending", teamAName: "C", teamBName: "D" },
		{ id: "gf", status: "Locked", teamAName: null, teamBName: null },
	];
	assert.equal(resolveBracketFocusMatchId(matches), "ub-r2-1");
	matches[1].status = "Live";
	assert.equal(resolveBracketFocusMatchId(matches), "ub-r2-1");
});

test("group stages only auto-focus an actually active match", () => {
	assert.equal(resolveGroupFocusMatchId([{ id: "a-r1-1", status: "Scheduled" }]), null);
	assert.equal(
		resolveGroupFocusMatchId([
			{ id: "a-r1-1", status: "Pending" },
			{ id: "b-r1-1", status: "Live" },
		]),
		"b-r1-1"
	);
});
