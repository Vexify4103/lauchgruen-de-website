/**
 * Estimates how far the browser clock is from the server clock.
 *
 * Timers compare server timestamps (turn start, phase end) with the local time. A PC clock that runs
 * a few seconds fast would show 0 while the server still counts. Each poll gives one sample:
 * the server time, taken roughly halfway between sending and receiving. The sample with the shortest
 * round trip among the most recent ones is the most exact, so that one wins.
 */
export type ClockSample = { offsetMs: number; roundTripMs: number };

export const CLOCK_SYNC_WINDOW = 10;

export function clockSample(sentAt: number, receivedAt: number, serverNow: number): ClockSample | null {
	if (!Number.isFinite(serverNow) || !Number.isFinite(sentAt) || !Number.isFinite(receivedAt) || receivedAt < sentAt) return null;
	return { offsetMs: serverNow - (sentAt + receivedAt) / 2, roundTripMs: receivedAt - sentAt };
}

export function createClockSync(size = CLOCK_SYNC_WINDOW) {
	let samples: ClockSample[] = [];
	return {
		add(sample: ClockSample | null) {
			if (!sample) return;
			samples = [...samples, sample].slice(-size);
		},
		/** Milliseconds to add to `Date.now()` to get server time. 0 until the first sample. */
		offset(): number {
			if (samples.length === 0) return 0;
			return samples.reduce((best, sample) => (sample.roundTripMs < best.roundTripMs ? sample : best)).offsetMs;
		},
	};
}
