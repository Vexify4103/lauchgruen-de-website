import assert from "node:assert/strict";
import test from "node:test";
import { selectHomepageClips } from "../src/lib/twitch.ts";

function clip(id) {
	return { id };
}

test("fills missing recent clip slots with unique popular clips", () => {
	const result = selectHomepageClips([clip("recent"), clip("shared")], [clip("shared"), clip("classic-a"), clip("classic-b")], 4);

	assert.deepEqual(
		result.clips.map(({ id }) => id),
		["recent", "shared", "classic-a", "classic-b"]
	);
	assert.equal(result.usedPopularFallback, true);
});

test("does not add fallback clips when the homepage is already full", () => {
	const result = selectHomepageClips([clip("a"), clip("b")], [clip("classic")], 2);

	assert.deepEqual(
		result.clips.map(({ id }) => id),
		["a", "b"]
	);
	assert.equal(result.usedPopularFallback, false);
});
