import assert from "node:assert/strict";
import test from "node:test";
import {
	AZ_SYNC_BACKFILL_MS,
	AZ_SYNC_ERROR_MS,
	AZ_SYNC_SYNCED_MS,
	OPEN_AZ_SYNC_GATE,
	azRateLimitBackoffMs,
	azSyncAllowed,
	azSyncGateAfter,
} from "../src/lib/az-sync-gate.ts";

test("open gate allows the first sync", () => {
	assert.equal(azSyncAllowed(OPEN_AZ_SYNC_GATE, 0), true);
});

test("success waits 45 s, backfill 20 s, other errors 20 s", () => {
	assert.equal(azSyncGateAfter(OPEN_AZ_SYNC_GATE, "synced", 1_000).nextAt, 1_000 + AZ_SYNC_SYNCED_MS);
	assert.equal(azSyncGateAfter(OPEN_AZ_SYNC_GATE, "backfilling", 1_000).nextAt, 1_000 + AZ_SYNC_BACKFILL_MS);
	assert.equal(azSyncGateAfter(OPEN_AZ_SYNC_GATE, "error", 1_000).nextAt, 1_000 + AZ_SYNC_ERROR_MS);
});

test("a 429 blocks polls for the first 60 s", () => {
	const gate = azSyncGateAfter(OPEN_AZ_SYNC_GATE, "rate-limited", 0);
	assert.equal(azSyncAllowed(gate, 10_000), false);
	assert.equal(azSyncAllowed(gate, 60_000), true);
});

test("rate-limit backoff doubles up to 5 min and resets after success", () => {
	assert.deepEqual([1, 2, 3, 4, 5, 9].map(azRateLimitBackoffMs), [60_000, 120_000, 240_000, 300_000, 300_000, 300_000]);
	let gate = OPEN_AZ_SYNC_GATE;
	gate = azSyncGateAfter(gate, "rate-limited", 0);
	gate = azSyncGateAfter(gate, "rate-limited", 60_000);
	assert.deepEqual(gate, { nextAt: 180_000, rateLimits: 2, failing: true });
	// Other errors keep the count and the hint, a good sync clears both.
	assert.deepEqual(azSyncGateAfter(gate, "error", 200_000), { nextAt: 200_000 + AZ_SYNC_ERROR_MS, rateLimits: 2, failing: true });
	assert.deepEqual(azSyncGateAfter(gate, "synced", 200_000), { nextAt: 200_000 + AZ_SYNC_SYNCED_MS, rateLimits: 0, failing: false });
});
