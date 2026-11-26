import { gamesDone } from "@/lib/winchallenge/actions";
import { elapsedMs } from "@/lib/winchallenge/timer";
import type { WinGame, WinTeam } from "@/lib/winchallenge/types";

export type WinRankedTeam = { team: WinTeam; rank: number; done: number; elapsedMs: number };

/** 0 finished, 1 started, 2 not started yet, 3 gave up. */
function bucket(team: WinTeam): number {
	if (team.status === "finished") return 0;
	if (team.status === "running" || team.status === "paused") return 1;
	if (team.status === "gave-up") return 3;
	return 2;
}

/**
 * Finished teams by final time, then started teams by games done and running time,
 * then teams that have not started, then teams that gave up. Ties share a rank.
 */
export function rankTeams(teams: WinTeam[], games: WinGame[], now: number): WinRankedTeam[] {
	const rows = teams.map((team) => ({ team, done: gamesDone(team, games), elapsedMs: elapsedMs(team, now), bucket: bucket(team) }));
	rows.sort(
		(a, b) =>
			a.bucket - b.bucket ||
			(a.bucket === 0 ? 0 : b.done - a.done) ||
			(a.bucket <= 1 ? a.elapsedMs - b.elapsedMs : 0) ||
			a.team.name.localeCompare(b.team.name, "de")
	);
	let rank = 0;
	return rows.map((row, index) => {
		const previous = rows[index - 1];
		const tied = previous && previous.bucket === row.bucket && previous.done === row.done && previous.elapsedMs === row.elapsedMs && row.bucket <= 1;
		rank = tied ? rank : index + 1;
		return { team: row.team, rank, done: row.done, elapsedMs: row.elapsedMs };
	});
}
