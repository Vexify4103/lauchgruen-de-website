import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWishGroupMode, wishGroupLimit, isAllowedPreferenceGroup } from "../src/lib/preference-group-settings.ts";

test("legacy settings retain five-person Wunschgruppen", () => {
	for (const value of [undefined, null, "invalid"]) {
		assert.equal(normalizeWishGroupMode(value), "team");
		assert.equal(wishGroupLimit(value), 5);
	}
});
test("disabled, duo and team modes enforce their respective limits", () => {
	assert.equal(wishGroupLimit("disabled"), 0);
	assert.equal(wishGroupLimit("duo"), 2);
	assert.equal(wishGroupLimit("team"), 5);
	assert.equal(isAllowedPreferenceGroup("disabled", 1), false);
	assert.equal(isAllowedPreferenceGroup("duo", 2), true);
	assert.equal(isAllowedPreferenceGroup("duo", 3), false);
	assert.equal(isAllowedPreferenceGroup("team", 5), true);
	assert.equal(isAllowedPreferenceGroup("team", 6), false);
	assert.equal(isAllowedPreferenceGroup("team", 0), false);
});
test("reducing or disabling groups excludes them without modifying stored members", () => {
	const groups = [{ memberDiscordIds: ["a", "b"] }, { memberDiscordIds: ["c", "d", "e"] }];
	const original = structuredClone(groups);
	assert.equal(groups.filter((group) => isAllowedPreferenceGroup("duo", group.memberDiscordIds.length)).length, 1);
	assert.equal(groups.filter((group) => isAllowedPreferenceGroup("disabled", group.memberDiscordIds.length)).length, 0);
	assert.deepEqual(groups, original);
});
