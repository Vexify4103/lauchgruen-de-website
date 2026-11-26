/**
 * Win Challenge: duo teams race through a fixed list of games. Only running time counts.
 * Plan: docs/winchallenge-plan.md. Everything in this folder except `store.ts` is pure and tested.
 */

export type WinGameType = "check" | "counter";

export type WinGame = {
	id: string;
	title: string;
	goal: string;
	type: WinGameType;
	/** Counter games: count needed to finish, e.g. 3 for "3 wins in a row". */
	target?: number;
	icon?: string;
	/** Extra info for players (map code, rules). Shown on the site, never in the overlays. */
	note?: string;
};

export type WinChallengeStatus = "draft" | "open" | "ended" | "archived";

export type WinChallenge = {
	id: string;
	slug: string;
	name: string;
	startAt: string;
	status: WinChallengeStatus;
	signupOpen: boolean;
	/** Percent of the pot for places 1, 2 and 3. */
	split: [number, number, number];
	games: WinGame[];
	endedAt?: string;
	/** Team ids in final order, frozen when the challenge ends. */
	finalRanking?: string[];
	createdAt: string;
	updatedAt: string;
};

export type WinTeamStatus = "forming" | "ready" | "running" | "paused" | "finished" | "gave-up";

export type WinSegment = { start: string; end?: string };

export type WinGameProgress = { count: number; tries: number; doneAt?: string };

export type WinTeam = {
	id: string;
	challengeId: string;
	slug: string;
	name: string;
	joinCode: string;
	/** Participant ids, at most two. */
	memberIds: string[];
	status: WinTeamStatus;
	segments: WinSegment[];
	/** Admin correction of the running time, may be negative. */
	adjustMs: number;
	finishedAt?: string;
	finalMs?: number;
	/** Status before giving up, so an admin can undo it. */
	statusBeforeGiveUp?: WinTeamStatus;
	currentGameId?: string;
	progress: Record<string, WinGameProgress>;
	version: number;
	createdAt: string;
	updatedAt: string;
};

export type WinParticipant = {
	id: string;
	challengeId: string;
	discordId: string;
	discordName: string;
	twitchId: string;
	twitchLogin: string;
	/** Who gets this participant's gifted subs: their own channel or their partner's. Unset means "self". */
	subTarget?: WinSubTarget;
	/** Legacy free-text channel from early sign-ups; read only through `subTargetOf`. */
	wishChannel?: string;
	teamId?: string;
	acceptedRulesAt: string;
	createdAt: string;
};

export type WinSubTarget = "self" | "partner";

export type WinPayoutStatus = "open" | "paid" | "confirmed";

export type WinPayout = {
	id: string;
	challengeId: string;
	payerId: string;
	recipientId: string;
	place: 1 | 2 | 3;
	channel: string;
	status: WinPayoutStatus;
	paidAt?: string;
	confirmedAt?: string;
	confirmedBy?: string;
};
