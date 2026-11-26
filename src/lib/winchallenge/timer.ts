import type { WinSegment, WinTeam } from "@/lib/winchallenge/types";

const ms = (iso: string) => new Date(iso).getTime();

/** True while a segment is open. */
export function timerRunning(segments: WinSegment[]): boolean {
	const last = segments.at(-1);
	return Boolean(last && !last.end);
}

/** Running time in ms: closed segments, the open one up to `now`, plus the admin correction. Never negative. */
export function elapsedMs(team: Pick<WinTeam, "segments" | "adjustMs" | "finalMs">, now: number): number {
	if (team.finalMs !== undefined) return Math.max(0, team.finalMs);
	let total = team.adjustMs ?? 0;
	for (const segment of team.segments) {
		const end = segment.end ? ms(segment.end) : now;
		total += Math.max(0, end - ms(segment.start));
	}
	return Math.max(0, total);
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
