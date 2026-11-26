import { gamesDone } from "@/lib/winchallenge/actions";
import { elapsedMs, type WinClock } from "@/lib/winchallenge/timer";
import type { WinGame, WinTeam } from "@/lib/winchallenge/types";

export type WinRankedTeam = { team: WinTeam; rank: number; done: number; elapsedMs: number };

/** 0 finished, 1 started, 2 not started yet, 3 gave up. */
function bucket(team: WinTeam): number {
	if (team.status === "finished") return 0;
	if (team.status === "running" || team.status === "paused") return 1;
	if (team.status === "gave-up") return 3;
	return 2;
}

/** When the team reached its current number of done games (latest doneAt). Infinity with none done. */
function reachedAt(team: WinTeam, games: WinGame[]): number {
	let latest = -Infinity;
	for (const game of games) {
		const doneAt = team.progress[game.id]?.doneAt;
		if (doneAt) latest = Math.max(latest, Date.parse(doneAt));
	}
	return latest === -Infinity ? Infinity : latest;
}

/**
 * Whoever finishes first wins (plan §1): finished teams by finish time (clock incl. admin correction),
 * then started teams by games done and who reached that count first, then teams that have not started,
 * then teams that gave up. Ties share a rank.
 */
export function rankTeams(teams: WinTeam[], games: WinGame[], now: number, clock: WinClock): WinRankedTeam[] {
	const rows = teams.map((team) => ({ team, done: gamesDone(team, games), elapsedMs: elapsedMs(team, now, clock), reached: reachedAt(team, games), bucket: bucket(team) }));
	const key = (row: (typeof rows)[number]) => (row.bucket === 0 ? row.elapsedMs : row.bucket === 1 ? row.reached : 0);
	rows.sort((a, b) => a.bucket - b.bucket || (a.bucket === 1 ? b.done - a.done : 0) || key(a) - key(b) || a.team.name.localeCompare(b.team.name, "de"));
	let rank = 0;
	return rows.map((row, index) => {
		const previous = rows[index - 1];
		const tied = previous && row.bucket <= 1 && previous.bucket === row.bucket && previous.done === row.done && key(previous) === key(row);
		rank = tied ? rank : index + 1;
		return { team: row.team, rank, done: row.done, elapsedMs: row.elapsedMs };
	});
}
