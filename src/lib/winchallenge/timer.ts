import type { WinSegment, WinTeam } from "@/lib/winchallenge/types";

const ms = (iso: string) => new Date(iso).getTime();

/** True while a segment is open. */
export function timerRunning(segments: WinSegment[]): boolean {
	const last = segments.at(-1);
	return Boolean(last && !last.end);
}

/** Official start and (once ended) end of the challenge. The clock of every team runs between them. */
export type WinClock = { startAt: string; endedAt?: string };

/**
 * Time since the official start (the winner is whoever finishes first, so pauses do not stop the clock).
 * Frozen at the finish, at giving up and at the end of the challenge. 0 before the team started.
 * Includes the admin correction. Never negative.
 */
export function elapsedMs(team: Pick<WinTeam, "segments" | "adjustMs" | "finalMs" | "status">, now: number, clock: WinClock): number {
	if (team.finalMs !== undefined) return Math.max(0, team.finalMs);
	if (team.segments.length === 0) return 0;
	let stop = clock.endedAt ? Math.min(now, ms(clock.endedAt)) : now;
	if (team.status === "gave-up") stop = Math.min(stop, ms(team.segments.at(-1)?.end ?? new Date(stop).toISOString()));
	return Math.max(0, stop - ms(clock.startAt) + (team.adjustMs ?? 0));
}

/** True while the team's clock moves: started, not done, not given up, challenge still open. Pause does not stop it. */
export function clockRunning(team: Pick<WinTeam, "status" | "segments" | "finalMs">, clock: WinClock): boolean {
	return !clock.endedAt && team.finalMs === undefined && team.segments.length > 0 && (team.status === "running" || team.status === "paused");
}

/** Opens a new segment. No-op while one is open. */
export function openSegment(segments: WinSegment[], at: string): WinSegment[] {
	return timerRunning(segments) ? segments : [...segments, { start: at }];
}

/** Closes the open segment. No-op while paused. */
export function closeSegment(segments: WinSegment[], at: string): WinSegment[] {
	if (!timerRunning(segments)) return segments;
	const last = segments.at(-1)!;
	// Never end before the start, even with slightly different clocks.
	const end = ms(at) < ms(last.start) ? last.start : at;
	return [...segments.slice(0, -1), { start: last.start, end }];
}

/** "41:23:07" for any duration, hours not capped at 24. */
export function formatElapsed(totalMs: number): string {
	const seconds = Math.floor(Math.max(0, totalMs) / 1000);
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
