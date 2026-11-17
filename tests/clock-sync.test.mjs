import assert from "node:assert/strict";
import test from "node:test";
import { clockSample, createClockSync } from "../src/lib/clock-sync.ts";

test("sample takes server time at the middle of the round trip", () => {
	// Browser clock 5 s fast: sent at 10_000, received at 10_200, server said 5_100.
	assert.deepEqual(clockSample(10_000, 10_200, 5_100), { offsetMs: -5_000, roundTripMs: 200 });
});

test("invalid samples are ignored", () => {
	assert.equal(clockSample(10_000, 9_000, 5_000), null);
	assert.equal(clockSample(10_000, 10_100, Number.NaN), null);
	const sync = createClockSync();
	sync.add(null);
	assert.equal(sync.offset(), 0);
});

test("offset is 0 before the first sample", () => {
	assert.equal(createClockSync().offset(), 0);
});

test("fastest round trip wins, old samples drop out", () => {
	const sync = createClockSync(3);
	sync.add({ offsetMs: -4_000, roundTripMs: 20 });
	sync.add({ offsetMs: -4_300, roundTripMs: 600 });
	sync.add({ offsetMs: -4_100, roundTripMs: 90 });
	assert.equal(sync.offset(), -4_000);
	sync.add({ offsetMs: -4_150, roundTripMs: 300 });
	// The 20 ms sample is out of the window of 3 now.
	assert.equal(sync.offset(), -4_100);
});
