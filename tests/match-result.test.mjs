import assert from "node:assert/strict";
import test from "node:test";
import { resultChangeBlocked } from "../src/lib/match-result.ts";

const base = { id: "m1", round: "Upper R1", teamAName: "A", teamBName: "B", status: "Finished", winner: "A" };
const control = (extra = []) => ({ teams: [], matches: [base, ...extra], stored: {}, stages: null });
const unlinked = { pairing: null, locked: false };

test("saving the same winner again is always allowed", () => {
	assert.equal(resultChangeBlocked({ match: base, control: control(), swiss: { pairing: { winnerTeamKey: "a", teamAKey: "a", teamBKey: "b" }, locked: true }, nextWinner: "teamA" }), null);
});

test("a locked Swiss result cannot be flipped or removed", () => {
	const swiss = { pairing: { id: "m1", winnerTeamKey: "a", teamAKey: "a", teamBKey: "b" }, locked: true };
	assert.match(resultChangeBlocked({ match: base, control: control(), swiss, nextWinner: "teamB" }), /Swiss-Runde/);
	assert.match(resultChangeBlocked({ match: base, control: control(), swiss, nextWinner: null }), /Swiss-Runde/);
});

test("a bracket match that already started with the winner blocks a change", () => {
	const next = { id: "m2", round: "Upper R2", teamAName: "A", teamBName: "C", status: "Live", sources: { teamA: "m1" } };
	assert.match(resultChangeBlocked({ match: base, control: control([next]), swiss: unlinked, nextWinner: "teamB" }), /Upper R2 läuft bereits/);
	assert.equal(resultChangeBlocked({ match: base, control: control([{ ...next, status: "Scheduled" }]), swiss: unlinked, nextWinner: "teamB" }), null);
});

test("a first result is never blocked", () => {
	assert.equal(resultChangeBlocked({ match: { ...base, status: "Live", winner: undefined }, control: control(), swiss: unlinked, nextWinner: "teamB" }), null);
});
