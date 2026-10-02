export type DraftSide = "teamA" | "teamB";
export type DraftActionKind = "ban" | "pick";

export type DraftTurn = {
	side: DraftSide;
	kind: DraftActionKind;
};

export type DraftAction = DraftTurn & {
	/** Empty for a skipped ban ("kein Ban"). */
	champion: string;
	lockedAt: string;
	lockedBy?: string;
	skipped?: boolean;
	/** Set when the server locked on a timeout instead of the captain. */
	auto?: "hover" | "random";
};

export type DraftReadyEntry = {
	readyAt: string;
	readyBy?: string;
};

export type DraftPendingSelection = DraftTurn & {
	champion: string;
	selectedAt: string;
	selectedBy?: string;
};

export const DRAFT_ROLES = ["top", "jungle", "mid", "bottom", "support"] as const;
export type DraftRole = (typeof DRAFT_ROLES)[number];
export const DRAFT_ROLE_LABELS: Record<DraftRole, string> = { top: "Top", jungle: "Jungle", mid: "Mid", bottom: "Bot", support: "Support" };

export type DraftRoleAssignment = {
	/** Picks ordered Top, Jungle, Mid, Bot, Support. */
	order: string[];
	confirmedAt?: string;
	confirmedBy?: string;
};

export type TournamentDraftState = {
	matchId: string;
	actions: DraftAction[];
	readyBy: Partial<Record<DraftSide, DraftReadyEntry>>;
	pendingSelection?: DraftPendingSelection;
	currentTurnStartedAt?: string;
	/** Starts with the last pick; drafts finished before role confirmation existed have none. */
	rolePhaseStartedAt?: string;
	roles?: Partial<Record<DraftSide, DraftRoleAssignment>>;
	rolesFinalizedAt?: string;
	resetReason?: string;
	resetAt?: string;
	updatedAt: string;
	updatedBy?: string;
};

export const DRAFT_TURN_SECONDS = 30;
export const DRAFT_GRACE_SECONDS = 4;
export const DRAFT_TOTAL_SECONDS = DRAFT_TURN_SECONDS + DRAFT_GRACE_SECONDS;
export const DRAFT_TOTAL_MS = DRAFT_TOTAL_SECONDS * 1000;
export const DRAFT_ROLE_SECONDS = 30;
export const DRAFT_ROLE_TOTAL_MS = (DRAFT_ROLE_SECONDS + DRAFT_GRACE_SECONDS) * 1000;

const blue = (kind: DraftActionKind): DraftTurn => ({ side: "teamA", kind });
const red = (kind: DraftActionKind): DraftTurn => ({ side: "teamB", kind });

// Tournament draft as in pro play and drafter.lol: two ban phases around the first picks.
const FIRST_BAN_PHASE: DraftTurn[] = [blue("ban"), red("ban"), blue("ban"), red("ban"), blue("ban"), red("ban")];
const FIRST_PICK_PHASE: DraftTurn[] = [blue("pick"), red("pick"), red("pick"), blue("pick"), blue("pick"), red("pick")];
const SECOND_BAN_PHASE: DraftTurn[] = [red("ban"), blue("ban"), red("ban"), blue("ban")];
const SECOND_PICK_PHASE: DraftTurn[] = [red("pick"), blue("pick"), blue("pick"), red("pick")];

export const DRAFT_BANS_PER_SIDE = 5;
export const DRAFT_FIRST_PHASE_BANS = 3;

export function createDraftSequence(extraBanSide?: DraftSide | null): DraftTurn[] {
	return [...FIRST_BAN_PHASE, ...(extraBanSide ? [{ side: extraBanSide, kind: "ban" } satisfies DraftTurn] : []), ...FIRST_PICK_PHASE, ...SECOND_BAN_PHASE, ...SECOND_PICK_PHASE];
}

export const DRAFT_SEQUENCE: DraftTurn[] = createDraftSequence();
export const DRAFT_MAX_SEQUENCE_LENGTH = DRAFT_SEQUENCE.length + 1;

export function nextDraftTurn(state: TournamentDraftState, sequence: DraftTurn[] = DRAFT_SEQUENCE): DraftTurn | null {
	return sequence[state.actions.length] ?? null;
}

/** All bans and picks are locked. Role confirmation may still be running. */
export function draftComplete(state: TournamentDraftState, sequence: DraftTurn[] = DRAFT_SEQUENCE): boolean {
	return state.actions.length >= sequence.length;
}

export function draftReady(state: TournamentDraftState): boolean {
	return Boolean(state.readyBy.teamA && state.readyBy.teamB);
}

export function draftTurnExpired(state: TournamentDraftState, now = Date.now(), sequence: DraftTurn[] = DRAFT_SEQUENCE): boolean {
	if (!draftReady(state) || draftComplete(state, sequence) || !state.currentTurnStartedAt) return false;
	return now >= new Date(state.currentTurnStartedAt).getTime() + DRAFT_TOTAL_MS;
}

export function rolePhaseActive(state: TournamentDraftState, sequence: DraftTurn[] = DRAFT_SEQUENCE): boolean {
	return draftComplete(state, sequence) && Boolean(state.rolePhaseStartedAt) && !state.rolesFinalizedAt;
}

export function rolePhaseExpired(state: TournamentDraftState, now = Date.now(), sequence: DraftTurn[] = DRAFT_SEQUENCE): boolean {
	if (!rolePhaseActive(state, sequence) || !state.rolePhaseStartedAt) return false;
	return now >= new Date(state.rolePhaseStartedAt).getTime() + DRAFT_ROLE_TOTAL_MS;
}

/** Picks, bans and role confirmation are done. */
export function draftFinished(state: TournamentDraftState, sequence: DraftTurn[] = DRAFT_SEQUENCE): boolean {
	return draftComplete(state, sequence) && !rolePhaseActive(state, sequence);
}

export function draftPicks(state: Pick<TournamentDraftState, "actions">, side: DraftSide): string[] {
	return state.actions.filter((action) => action.side === side && action.kind === "pick").map((action) => action.champion);
}

export function draftBans(state: Pick<TournamentDraftState, "actions">, side: DraftSide): DraftAction[] {
	return state.actions.filter((action) => action.side === side && action.kind === "ban");
}

export function isValidRoleOrder(order: readonly string[], picks: readonly string[]): boolean {
	return order.length === picks.length && new Set(order).size === order.length && order.every((champion) => picks.includes(champion));
}

/** Picks in role order (Top → Support) once a valid order exists, else in pick order. */
export function draftRoleOrder(state: Pick<TournamentDraftState, "actions" | "roles">, side: DraftSide): string[] {
	const picks = draftPicks(state, side);
	const order = state.roles?.[side]?.order;
	return order && isValidRoleOrder(order, picks) ? order : picks;
}

/** Roles are shown once captains had the chance to set them. */
export function draftHasRoles(state: Pick<TournamentDraftState, "rolePhaseStartedAt">): boolean {
	return Boolean(state.rolePhaseStartedAt);
}

export function swapRoleOrder(order: readonly string[], from: number, to: number): string[] {
	const next = [...order];
	if (from === to || !next[from] || !next[to]) return next;
	[next[from], next[to]] = [next[to], next[from]];
	return next;
}

/** First guess for the role order: give every role the pick that fits it, in pick order. */
export function suggestRoleOrder(picks: readonly string[], positionsOf: (champion: string) => readonly DraftRole[] | undefined): string[] {
	const remaining = [...picks];
	const slots: Array<string | undefined> = DRAFT_ROLES.map(() => undefined);
	for (let pass = 1; pass <= 5; pass += 1) {
		DRAFT_ROLES.forEach((role, index) => {
			if (slots[index]) return;
			const match = remaining.find((champion) => {
				const positions = positionsOf(champion);
				return positions?.length === pass && positions.includes(role);
			});
			if (!match) return;
			slots[index] = match;
			remaining.splice(remaining.indexOf(match), 1);
		});
	}
	return slots.map((champion) => champion ?? remaining.shift()).filter((champion): champion is string => Boolean(champion));
}
