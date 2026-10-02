// Pure draft state transitions. The Mongo wrapper in tournament-draft.ts loads, applies and stores them.
import { championRoles } from "@/lib/champion-roles";
import {
	DRAFT_ROLE_TOTAL_MS,
	DRAFT_TOTAL_MS,
	draftPicks,
	draftReady,
	draftTurnExpired,
	isValidRoleOrder,
	nextDraftTurn,
	rolePhaseActive,
	rolePhaseExpired,
	suggestRoleOrder,
	type DraftAction,
	type DraftSide,
	type DraftTurn,
	type TournamentDraftState,
} from "@/lib/tournament-draft-shared";

export class DraftRuleError extends Error {}

function usedChampions(state: TournamentDraftState) {
	return new Set(state.actions.filter((action) => !action.skipped).map((action) => action.champion));
}

function appendAction(current: TournamentDraftState, sequence: DraftTurn[], action: DraftAction, now: string, updatedBy?: string): TournamentDraftState {
	const actions = [...current.actions, action];
	const finished = actions.length >= sequence.length;
	const next: TournamentDraftState = {
		...current,
		actions,
		pendingSelection: undefined,
		currentTurnStartedAt: finished ? undefined : now,
		resetReason: undefined,
		resetAt: undefined,
		updatedAt: now,
		updatedBy,
	};
	if (!finished) return next;
	// The last pick opens role confirmation with a best guess per team.
	const suggestion = (side: DraftSide) => ({ order: suggestRoleOrder(draftPicks({ actions }, side), championRoles) });
	return { ...next, rolePhaseStartedAt: now, roles: { teamA: suggestion("teamA"), teamB: suggestion("teamB") }, rolesFinalizedAt: undefined };
}

function assertTurn(current: TournamentDraftState, sequence: DraftTurn[], side: DraftSide, kind: DraftTurn["kind"], now: number): DraftTurn {
	const turn = nextDraftTurn(current, sequence);
	if (!turn) throw new DraftRuleError("Draft ist bereits abgeschlossen.");
	if (!draftReady(current) || !current.currentTurnStartedAt) throw new DraftRuleError("Beide Captains müssen zuerst ready sein.");
	if (draftTurnExpired(current, now, sequence)) throw new DraftRuleError("Dieser Turn ist abgelaufen.");
	if (turn.side !== side || turn.kind !== kind) throw new DraftRuleError("Das ist nicht der aktuelle Draft-Turn.");
	return turn;
}

/** Locks a champion, or skips the ban when `champion` is null. */
export function applyDraftLock(
	current: TournamentDraftState,
	sequence: DraftTurn[],
	input: { side: DraftSide; kind: DraftTurn["kind"]; champion: string | null; lockedBy?: string },
	now = new Date()
): TournamentDraftState {
	assertTurn(current, sequence, input.side, input.kind, now.getTime());
	if (input.champion === null) {
		if (input.kind !== "ban") throw new DraftRuleError("Nur Bans können ausgelassen werden.");
	} else if (usedChampions(current).has(input.champion)) {
		throw new DraftRuleError("Dieser Champion wurde bereits gepickt oder gebannt.");
	}
	const at = now.toISOString();
	return appendAction(
		current,
		sequence,
		{
			side: input.side,
			kind: input.kind,
			champion: input.champion ?? "",
			...(input.champion === null ? { skipped: true } : {}),
			lockedAt: at,
			lockedBy: input.lockedBy,
		},
		at,
		input.lockedBy
	);
}

/**
 * A turn ran out: the hovered champion is locked; otherwise a ban is skipped and a pick gets a random
 * allowed champion. Only when no champion is left for a pick does the draft reset.
 */
export function applyDraftTimeout(
	current: TournamentDraftState,
	sequence: DraftTurn[],
	input: { allowedPicks: Iterable<string>; triggeredBy?: string; random?: () => number },
	now = new Date()
): TournamentDraftState {
	const turn = nextDraftTurn(current, sequence);
	if (!turn || !current.currentTurnStartedAt || !draftReady(current)) return current;
	if (now.getTime() < new Date(current.currentTurnStartedAt).getTime() + DRAFT_TOTAL_MS) throw new DraftRuleError("Der aktuelle Turn läuft noch.");

	const used = usedChampions(current);
	const at = now.toISOString();
	const pending = current.pendingSelection;
	const base = { side: turn.side, kind: turn.kind, lockedAt: at };
	if (pending && pending.side === turn.side && pending.kind === turn.kind && !used.has(pending.champion)) {
		const lockedBy = pending.selectedBy ?? input.triggeredBy;
		return appendAction(current, sequence, { ...base, champion: pending.champion, lockedBy, auto: "hover" }, at, lockedBy);
	}
	if (turn.kind === "ban") {
		return appendAction(current, sequence, { ...base, champion: "", skipped: true, lockedBy: input.triggeredBy }, at, input.triggeredBy);
	}
	const candidates = [...new Set(input.allowedPicks)].filter((champion) => !used.has(champion));
	if (candidates.length === 0) {
		return resetDraft(
			current.matchId,
			`${turn.side === "teamA" ? "Blue Side" : "Red Side"} hatte keinen erlaubten Champion mehr. Draft wurde zurückgesetzt.`,
			at,
			input.triggeredBy
		);
	}
	const champion = candidates[Math.min(candidates.length - 1, Math.floor((input.random ?? Math.random)() * candidates.length))];
	return appendAction(current, sequence, { ...base, champion, lockedBy: input.triggeredBy, auto: "random" }, at, input.triggeredBy);
}

export function resetDraft(matchId: string, reason: string, at: string, resetBy?: string): TournamentDraftState {
	return { matchId, actions: [], readyBy: {}, resetReason: reason, resetAt: at, updatedAt: at, updatedBy: resetBy };
}

function assertRolePhase(current: TournamentDraftState, sequence: DraftTurn[], side: DraftSide, now: number) {
	if (!rolePhaseActive(current, sequence)) throw new DraftRuleError("Die Rollenwahl ist nicht aktiv.");
	if (rolePhaseExpired(current, now, sequence)) throw new DraftRuleError("Die Zeit für die Rollenwahl ist abgelaufen.");
	if (current.roles?.[side]?.confirmedAt) throw new DraftRuleError("Die Rollen sind bereits bestätigt.");
}

export function applyRoleOrder(
	current: TournamentDraftState,
	sequence: DraftTurn[],
	input: { side: DraftSide; order: string[]; updatedBy?: string },
	now = new Date()
): TournamentDraftState {
	assertRolePhase(current, sequence, input.side, now.getTime());
	if (!isValidRoleOrder(input.order, draftPicks(current, input.side))) throw new DraftRuleError("Die Rollen müssen genau die fünf Picks des Teams enthalten.");
	const at = now.toISOString();
	return { ...current, roles: { ...current.roles, [input.side]: { order: input.order } }, updatedAt: at, updatedBy: input.updatedBy };
}

export function applyRoleConfirm(
	current: TournamentDraftState,
	sequence: DraftTurn[],
	input: { side: DraftSide; order?: string[]; confirmedBy?: string },
	now = new Date()
): TournamentDraftState {
	const withOrder = input.order ? applyRoleOrder(current, sequence, { side: input.side, order: input.order, updatedBy: input.confirmedBy }, now) : current;
	assertRolePhase(withOrder, sequence, input.side, now.getTime());
	const at = now.toISOString();
	const order = withOrder.roles?.[input.side]?.order ?? draftPicks(withOrder, input.side);
	const roles = { ...withOrder.roles, [input.side]: { order, confirmedAt: at, confirmedBy: input.confirmedBy } };
	const bothConfirmed = Boolean(roles.teamA?.confirmedAt && roles.teamB?.confirmedAt);
	return { ...withOrder, roles, rolesFinalizedAt: bothConfirmed ? at : undefined, updatedAt: at, updatedBy: input.confirmedBy };
}

/** Role confirmation ran out: the current order of each team becomes final. */
export function applyRoleTimeout(current: TournamentDraftState, sequence: DraftTurn[], triggeredBy?: string, now = new Date()): TournamentDraftState {
	if (!rolePhaseActive(current, sequence) || !current.rolePhaseStartedAt) return current;
	if (now.getTime() < new Date(current.rolePhaseStartedAt).getTime() + DRAFT_ROLE_TOTAL_MS) throw new DraftRuleError("Die Rollenwahl läuft noch.");
	const at = now.toISOString();
	return { ...current, rolesFinalizedAt: at, updatedAt: at, updatedBy: triggeredBy };
}

/** Admin undo: drop the last lock and with it any role confirmation that the last pick started. */
export function applyUndo(current: TournamentDraftState, updatedBy?: string, now = new Date()): TournamentDraftState {
	if (current.actions.length === 0) throw new DraftRuleError("Es gibt keinen Draft-Lock zum Zurücknehmen.");
	const at = now.toISOString();
	return {
		...current,
		actions: current.actions.slice(0, -1),
		pendingSelection: undefined,
		currentTurnStartedAt: at,
		rolePhaseStartedAt: undefined,
		roles: undefined,
		rolesFinalizedAt: undefined,
		updatedAt: at,
		updatedBy,
	};
}
