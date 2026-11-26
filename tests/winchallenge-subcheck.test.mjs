import assert from "node:assert/strict";
import test from "node:test";
import { matchGifts } from "../src/lib/winchallenge/subs.ts";

const payout = (id, payerId, channel, status = "open") => ({ id, payerId, channel, status });
const ids = new Map([
	["p1", new Set(["tw1"])],
	["p2", new Set(["tw2", "tw2-old"])],
]);
const gift = (gifter, user) => ({ user_id: user, gifter_id: gifter, is_gift: true });

test("matchGifts confirms a payout gifted by the payer on its channel", () => {
	const subs = new Map([["winner", [gift("tw1", "viewer1")]]]);
	assert.deepEqual(matchGifts([payout("a", "p1", "Winner")], ids, subs), ["a"]);
});

test("matchGifts accepts the payer's older Twitch id", () => {
	const subs = new Map([["winner", [gift("tw2-old", "viewer1")]]]);
	assert.deepEqual(matchGifts([payout("a", "p2", "winner")], ids, subs), ["a"]);
});

test("matchGifts ignores anonymous gifts, own subs, other channels and confirmed payouts", () => {
	const subs = new Map([
		["winner", [{ user_id: "x", gifter_id: "", is_gift: true }, { user_id: "tw1", gifter_id: "", is_gift: false }]],
		["other", [gift("tw1", "viewer2")]],
	]);
	assert.deepEqual(matchGifts([payout("a", "p1", "winner")], ids, subs), []);
	assert.deepEqual(matchGifts([payout("b", "p1", "other", "confirmed")], ids, subs), []);
});

test("matchGifts counts one gifted sub for one payout only", () => {
	const subs = new Map([["winner", [gift("tw1", "viewer1")]]]);
	const both = [payout("a", "p1", "winner"), payout("b", "p1", "winner")];
	assert.deepEqual(matchGifts(both, ids, subs), ["a"]);
	subs.get("winner").push(gift("tw1", "viewer2"));
	assert.deepEqual(matchGifts(both, ids, subs), ["a", "b"]);
});

test("matchGifts skips channels that were not read", () => {
	assert.deepEqual(matchGifts([payout("a", "p1", "winner")], ids, new Map()), []);
});
