/**
 * Decides when the A-Z overlay may ask Riot again.
 *
 * The overlay polls every 10 s. Without a pause after failures, one 429 led to a retry
 * on every poll, which kept the streamer's key blocked. Every attempt, failed or not,
 * now sets the earliest time for the next one.
 */
export type AzSyncOutcome = "synced" | "backfilling" | "rate-limited" | "error";

export type AzSyncGate = {
	/** No Riot call before this time (ms). */
	nextAt: number;
	/** 429s in a row. Resets after a successful sync. */
	rateLimits: number;
	/** The last attempt failed (429 or other error), so the overlay keeps its "not reachable" hint. */
	failing: boolean;
};

export const AZ_SYNC_SYNCED_MS = 45_000;
export const AZ_SYNC_BACKFILL_MS = 20_000;
export const AZ_SYNC_ERROR_MS = 20_000;
export const AZ_RATE_LIMIT_MIN_MS = 60_000;
export const AZ_RATE_LIMIT_MAX_MS = 5 * 60_000;

export const OPEN_AZ_SYNC_GATE: AzSyncGate = { nextAt: 0, rateLimits: 0, failing: false };

/** 60 s after the first 429, doubling on each further 429 in a row, at most 5 min. */
export function azRateLimitBackoffMs(rateLimits: number): number {
	return Math.min(AZ_RATE_LIMIT_MAX_MS, AZ_RATE_LIMIT_MIN_MS * 2 ** Math.max(0, rateLimits - 1));
}

export function azSyncGateAfter(gate: AzSyncGate, outcome: AzSyncOutcome, now: number): AzSyncGate {
	if (outcome === "rate-limited") {
		const rateLimits = gate.rateLimits + 1;
		return { nextAt: now + azRateLimitBackoffMs(rateLimits), rateLimits, failing: true };
	}
	if (outcome === "error") return { nextAt: now + AZ_SYNC_ERROR_MS, rateLimits: gate.rateLimits, failing: true };
	return { nextAt: now + (outcome === "synced" ? AZ_SYNC_SYNCED_MS : AZ_SYNC_BACKFILL_MS), rateLimits: 0, failing: false };
}

export function azSyncAllowed(gate: AzSyncGate, now: number): boolean {
	return now >= gate.nextAt;
}
