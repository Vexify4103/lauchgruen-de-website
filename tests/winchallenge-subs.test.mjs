import assert from "node:assert/strict";
import { test } from "node:test";
import { subChannelOf, subTargetOf } from "@/lib/winchallenge/subs.ts";

const a = { id: "a", teamId: "t1", twitchLogin: "Alpha" };
const b = { id: "b", teamId: "t1", twitchLogin: "beta" };
const solo = { id: "s", twitchLogin: "solo" };

test("default is the own channel", () => {
	assert.equal(subTargetOf(a, [a, b]), "self");
	assert.equal(subChannelOf(a, [a, b], "fallback"), "alpha");
});

test("partner choice uses the partner's channel", () => {
	const choice = { ...a, subTarget: "partner" };
	assert.equal(subChannelOf(choice, [choice, b], "fallback"), "beta");
});

test("partner choice without partner falls back to own channel", () => {
	assert.equal(subChannelOf({ ...solo, subTarget: "partner" }, [solo], "fallback"), "solo");
	assert.equal(subChannelOf({ id: "x", twitchLogin: "" }, [], "fallback"), "fallback");
});

test("legacy wishChannel maps to self or partner", () => {
	assert.equal(subTargetOf({ ...a, wishChannel: "beta" }, [a, b]), "partner");
	assert.equal(subTargetOf({ ...a, wishChannel: "alpha" }, [a, b]), "self");
	assert.equal(subTargetOf({ ...a, wishChannel: "someone_else" }, [a, b]), "self");
	assert.equal(subTargetOf({ ...a, wishChannel: "beta", subTarget: "self" }, [a, b]), "self");
});
