import { closeSegment, elapsedMs, openSegment } from "@/lib/winchallenge/timer";
import type { WinGame, WinGameProgress, WinTeam, WinTeamStatus } from "@/lib/winchallenge/types";

export type WinTeamAction =
	| { action: "start" }
	| { action: "pause" }
	| { action: "resume" }
	| { action: "done"; gameId: string }
	| { action: "undo"; gameId: string }
	| { action: "plus"; gameId: string }
	| { action: "minus"; gameId: string }
	| { action: "reset"; gameId: string }
	| { action: "current"; gameId: string | null }
	| { action: "give-up" };

/** Actions that move the team forward. They need one member live on Twitch (plan §4). */
export const LIVE_REQUIRED_ACTIONS = new Set<WinTeamAction["action"]>(["start", "resume", "done", "plus", "reset"]);

export class WinActionError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

const ACTIVE: WinTeamStatus[] = ["running", "paused"];

export function gameProgress(team: Pick<WinTeam, "progress">, gameId: string): WinGameProgress {
	return team.progress[gameId] ?? { count: 0, tries: 0 };
}

export function gameDone(team: Pick<WinTeam, "progress">, game: WinGame): boolean {
	return Boolean(gameProgress(team, game.id).doneAt);
}

export function gamesDone(team: Pick<WinTeam, "progress">, games: WinGame[]): number {
	return games.filter((game) => gameDone(team, game)).length;
}

function withPlay(progress: WinGameProgress, previous: WinGameProgress): WinGameProgress {
	return previous.playMs ? { ...progress, playMs: previous.playMs } : progress;
}

function counterTarget(game: WinGame): number {
	return Math.max(1, game.target ?? 1);
}

/**
 * Applies one control action. Returns the new team (without version bump) or throws WinActionError.
 * `now` is the server time. Finishing happens here: the last done game stops the clock and freezes the time.
 */
export function applyTeamAction(team: WinTeam, input: WinTeamAction, ctx: { games: WinGame[]; startAt: string; now: Date }): WinTeam {
	const next = applyAction(team, input, ctx);
	return next === team ? team : settleGameTime(team, next, ctx.now.toISOString());
}

/**
 * Per-game play time. The time since `currentSince` goes to the game that was current before the action,
 * but only while the team was running (pause does not count). Then the clock restarts for the new current game.
 */
export function settleGameTime(before: WinTeam, next: WinTeam, at: string): WinTeam {
	const result: WinTeam = { ...next, progress: { ...next.progress } };
	if (before.status === "running" && before.currentGameId && before.currentSince) {
		const spent = new Date(at).getTime() - new Date(before.currentSince).getTime();
		if (spent > 0) {
			const progress = gameProgress(result, before.currentGameId);
			result.progress[before.currentGameId] = { ...progress, playMs: (progress.playMs ?? 0) + spent };
		}
	}
	if (result.status === "running" && result.currentGameId) result.currentSince = at;
	else delete result.currentSince;
	return result;
}

/** Play time of one game at `now`, including the part that is still running. */
export function gamePlayMs(team: Pick<WinTeam, "progress" | "status" | "currentGameId" | "currentSince">, gameId: string, now: number): number {
	const stored = gameProgress(team, gameId).playMs ?? 0;
	if (team.status !== "running" || team.currentGameId !== gameId || !team.currentSince) return stored;
	return stored + Math.max(0, now - new Date(team.currentSince).getTime());
}

function applyAction(team: WinTeam, input: WinTeamAction, ctx: { games: WinGame[]; startAt: string; now: Date }): WinTeam {
	const at = ctx.now.toISOString();
	const next: WinTeam = { ...team, progress: { ...team.progress }, segments: [...team.segments], updatedAt: at };

	switch (input.action) {
		case "start": {
			if (team.status === "forming") throw new WinActionError("needs-partner", "Ihr braucht zuerst einen Partner im Team.");
			if (team.status !== "ready") throw new WinActionError("already-started", "Euer Timer wurde schon gestartet.");
			if (ctx.now.getTime() < new Date(ctx.startAt).getTime()) throw new WinActionError("too-early", "Start ist erst ab dem offiziellen Startzeitpunkt möglich.");
			next.segments = openSegment(team.segments, at);
			next.status = "running";
			return next;
		}
		case "pause": {
			if (team.status !== "running") return team;
			next.segments = closeSegment(team.segments, at);
			next.status = "paused";
			return next;
		}
		case "resume": {
			if (team.status !== "paused") return team;
			next.segments = openSegment(team.segments, at);
			next.status = "running";
			return next;
		}
		case "give-up": {
			if (team.status === "gave-up") return team;
			if (team.status === "finished") throw new WinActionError("finished", "Ihr seid schon fertig.");
			next.segments = closeSegment(team.segments, at);
			next.statusBeforeGiveUp = team.status;
			next.status = "gave-up";
			return next;
		}
		case "current": {
			if (input.gameId !== null && !ctx.games.some((game) => game.id === input.gameId)) throw new WinActionError("unknown-game", "Unbekanntes Spiel.");
			next.currentGameId = input.gameId ?? undefined;
			return next;
		}
	}

	const game = ctx.games.find((entry) => entry.id === input.gameId);
	if (!game) throw new WinActionError("unknown-game", "Unbekanntes Spiel.");
	const correcting = input.action === "undo" || input.action === "minus";
	// Corrections also work after finishing; they reopen the team (paused).
	if (!ACTIVE.includes(team.status) && !(correcting && team.status === "finished")) {
		throw new WinActionError("not-running", team.status === "gave-up" ? "Euer Team hat aufgegeben." : "Startet zuerst euren Timer.");
	}
	const current = gameProgress(team, game.id);
	let progress: WinGameProgress = { ...current };
	// Pressing a game's buttons makes it the current game, so play time is tracked without extra clicks.
	if (input.action === "done" || input.action === "plus" || input.action === "reset") next.currentGameId = game.id;

	if (game.type === "check") {
		if (input.action === "done") progress = current.doneAt ? current : { ...current, count: 1, doneAt: at };
		else if (input.action === "undo") progress = withPlay({ count: 0, tries: current.tries }, current);
		else throw new WinActionError("wrong-type", "Dieses Spiel hat keinen Zähler.");
	} else {
		const target = counterTarget(game);
		if (input.action === "plus") {
			const count = Math.min(target, current.count + 1);
			progress = { ...current, count, ...(count >= target && !current.doneAt ? { doneAt: at } : {}) };
		} else if (input.action === "minus" || input.action === "undo") {
			const count = input.action === "undo" ? Math.min(current.count, target - 1) : Math.max(0, current.count - 1);
			progress = withPlay({ count, tries: current.tries }, current);
		} else if (input.action === "reset") {
			if (current.doneAt) throw new WinActionError("already-done", "Das Spiel ist schon geschafft. Erst mit − korrigieren.");
			progress = withPlay({ count: 0, tries: current.count > 0 ? current.tries + 1 : current.tries }, current);
		} else {
			progress = current.doneAt ? current : { ...current, count: target, doneAt: at };
		}
	}
	if (progress.doneAt === undefined) delete progress.doneAt;
	next.progress[game.id] = progress;
	if (progress.doneAt && next.currentGameId === game.id) delete next.currentGameId;
	return settleFinish(next, team, ctx.games, at, ctx.startAt);
}

/** Stops the clock when every game is done, and reopens a finished team when one is undone. */
export function settleFinish(next: WinTeam, previous: WinTeam, games: WinGame[], at: string, startAt: string): WinTeam {
	const allDone = games.length > 0 && games.every((game) => gameDone(next, game));
	if (allDone && previous.status !== "finished") {
		const segments = closeSegment(next.segments, at);
		const finished: WinTeam = { ...next, segments, status: "finished", finishedAt: at };
		delete finished.finalMs;
		finished.finalMs = elapsedMs(finished, new Date(at).getTime(), { startAt });
		return finished;
	}
	if (!allDone && previous.status === "finished") {
		const reopened: WinTeam = { ...next, status: "paused" };
		delete reopened.finishedAt;
		delete reopened.finalMs;
		return reopened;
	}
	return next;
}
