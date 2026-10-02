import { getDb } from "@/lib/mongo";
import {
	DRAFT_MAX_SEQUENCE_LENGTH,
	createDraftSequence,
	draftComplete,
	draftReady,
	draftTurnExpired,
	nextDraftTurn,
	rolePhaseActive,
	type DraftAction,
	type DraftActionKind,
	type DraftPendingSelection,
	type DraftReadyEntry,
	type DraftRoleAssignment,
	type DraftSide,
	type TournamentDraftState,
} from "@/lib/tournament-draft-shared";
import { applyDraftLock, applyDraftTimeout, applyRoleConfirm, applyRoleOrder, applyRoleTimeout, applyUndo, resetDraft } from "@/lib/tournament-draft-engine";

export { DraftRuleError } from "@/lib/tournament-draft-engine";
export {
	DRAFT_SEQUENCE,
	DRAFT_GRACE_SECONDS,
	DRAFT_MAX_SEQUENCE_LENGTH,
	DRAFT_TOTAL_MS,
	DRAFT_TOTAL_SECONDS,
	DRAFT_TURN_SECONDS,
	createDraftSequence,
	draftComplete,
	draftReady,
	draftTurnExpired,
	draftFinished,
	draftRoleOrder,
	nextDraftTurn,
	rolePhaseActive,
	rolePhaseExpired,
	type DraftAction,
	type DraftActionKind,
	type DraftPendingSelection,
	type DraftReadyEntry,
	type DraftRoleAssignment,
	type DraftSide,
	type DraftTurn,
	type TournamentDraftState,
} from "@/lib/tournament-draft-shared";

const COLLECTION = "tournament_drafts";

type LegacyDraftSide = {
	picks?: string[];
	bans?: string[];
};

type DraftDoc = Partial<TournamentDraftState> & {
	_id: string;
	teamA?: LegacyDraftSide;
	teamB?: LegacyDraftSide;
};

export function emptyDraftState(matchId: string): TournamentDraftState {
	return {
		matchId,
		actions: [],
		readyBy: {},
		updatedAt: new Date().toISOString(),
	};
}

function sanitizeAction(value: unknown): DraftAction | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as Partial<DraftAction>;
	if ((raw.side !== "teamA" && raw.side !== "teamB") || (raw.kind !== "pick" && raw.kind !== "ban") || !raw.lockedAt) return null;
	const skipped = raw.kind === "ban" && raw.skipped === true;
	if (!skipped && !raw.champion) return null;
	return {
		side: raw.side,
		kind: raw.kind,
		champion: skipped ? "" : String(raw.champion),
		lockedAt: String(raw.lockedAt),
		lockedBy: raw.lockedBy ? String(raw.lockedBy) : undefined,
		...(skipped ? { skipped: true } : {}),
		...(raw.auto === "hover" || raw.auto === "random" ? { auto: raw.auto } : {}),
	};
}

function sanitizeRoles(value: unknown): TournamentDraftState["roles"] {
	if (!value || typeof value !== "object") return undefined;
	const raw = value as Partial<Record<DraftSide, Partial<DraftRoleAssignment>>>;
	const roles: NonNullable<TournamentDraftState["roles"]> = {};
	for (const side of ["teamA", "teamB"] as const) {
		const entry = raw[side];
		if (!entry || !Array.isArray(entry.order)) continue;
		roles[side] = {
			order: entry.order.map(String),
			confirmedAt: entry.confirmedAt ? String(entry.confirmedAt) : undefined,
			confirmedBy: entry.confirmedBy ? String(entry.confirmedBy) : undefined,
		};
	}
	return Object.keys(roles).length ? roles : undefined;
}

function legacyActions(doc: DraftDoc): DraftAction[] {
	const now = doc.updatedAt ?? new Date().toISOString();
	const out: DraftAction[] = [];
	for (const side of ["teamA", "teamB"] as const) {
		const raw = doc[side];
		for (const champion of raw?.bans ?? []) {
			out.push({ side, kind: "ban", champion: String(champion), lockedAt: now });
		}
		for (const champion of raw?.picks ?? []) {
			out.push({ side, kind: "pick", champion: String(champion), lockedAt: now });
		}
	}
	return out.slice(0, DRAFT_MAX_SEQUENCE_LENGTH);
}

function sanitizeReady(value: unknown): Partial<Record<DraftSide, DraftReadyEntry>> {
	if (!value || typeof value !== "object") return {};
	const raw = value as Partial<Record<DraftSide, Partial<DraftReadyEntry>>>;
	const readyBy: Partial<Record<DraftSide, DraftReadyEntry>> = {};
	for (const side of ["teamA", "teamB"] as const) {
		const entry = raw[side];
		if (!entry?.readyAt) continue;
		readyBy[side] = {
			readyAt: String(entry.readyAt),
			readyBy: entry.readyBy ? String(entry.readyBy) : undefined,
		};
	}
	return readyBy;
}

function sanitizePendingSelection(value: unknown): DraftPendingSelection | undefined {
	if (!value || typeof value !== "object") return undefined;
	const raw = value as Partial<DraftPendingSelection>;
	if ((raw.side !== "teamA" && raw.side !== "teamB") || (raw.kind !== "pick" && raw.kind !== "ban") || !raw.champion || !raw.selectedAt) {
		return undefined;
	}
	return {
		side: raw.side,
		kind: raw.kind,
		champion: String(raw.champion),
		selectedAt: String(raw.selectedAt),
		selectedBy: raw.selectedBy ? String(raw.selectedBy) : undefined,
	};
}

function strip(doc: DraftDoc): TournamentDraftState {
	const actions = Array.isArray(doc.actions) ? doc.actions.map(sanitizeAction).filter((action): action is DraftAction => !!action) : legacyActions(doc);
	const readyBy = sanitizeReady(doc.readyBy);
	return {
		matchId: doc.matchId ?? doc._id,
		actions: actions.slice(0, DRAFT_MAX_SEQUENCE_LENGTH),
		readyBy,
		pendingSelection: sanitizePendingSelection(doc.pendingSelection),
		currentTurnStartedAt: doc.currentTurnStartedAt ? String(doc.currentTurnStartedAt) : undefined,
		rolePhaseStartedAt: doc.rolePhaseStartedAt ? String(doc.rolePhaseStartedAt) : undefined,
		roles: sanitizeRoles(doc.roles),
		rolesFinalizedAt: doc.rolesFinalizedAt ? String(doc.rolesFinalizedAt) : undefined,
		resetReason: doc.resetReason ? String(doc.resetReason) : undefined,
		resetAt: doc.resetAt ? String(doc.resetAt) : undefined,
		updatedAt: doc.updatedAt ?? new Date().toISOString(),
		updatedBy: doc.updatedBy,
	};
}

export async function getDraftState(matchId: string): Promise<TournamentDraftState> {
	const db = await getDb();
	const doc = await db.collection<DraftDoc>(COLLECTION).findOne({ _id: matchId });
	return doc ? strip(doc) : emptyDraftState(matchId);
}

export async function listDraftStates(): Promise<TournamentDraftState[]> {
	const db = await getDb();
	const docs = await db.collection<DraftDoc>(COLLECTION).find({}).toArray();
	return docs.map(strip);
}

export async function clearDraftStates(): Promise<void> {
	const db = await getDb();
	await db.collection<DraftDoc>(COLLECTION).deleteMany({});
}

export async function markDraftReady(input: { matchId: string; side: DraftSide; readyBy?: string }): Promise<TournamentDraftState> {
	const current = await getDraftState(input.matchId);
	if (draftComplete(current)) {
		throw new Error("Draft ist bereits abgeschlossen.");
	}

	const now = new Date().toISOString();
	const readyBy = {
		...current.readyBy,
		[input.side]: {
			readyAt: now,
			readyBy: input.readyBy,
		},
	};
	const next: TournamentDraftState = {
		...current,
		readyBy,
		currentTurnStartedAt: readyBy.teamA && readyBy.teamB && !current.currentTurnStartedAt ? now : current.currentTurnStartedAt,
		resetReason: undefined,
		resetAt: undefined,
		updatedAt: now,
		updatedBy: input.readyBy,
	};

	const db = await getDb();
	await db.collection<DraftDoc>(COLLECTION).replaceOne({ _id: input.matchId }, next, { upsert: true });
	return next;
}

export async function forceDraftReady(input: { matchId: string; readyBy?: string }): Promise<TournamentDraftState> {
	const current = await getDraftState(input.matchId);
	if (draftComplete(current)) {
		throw new Error("Draft ist bereits abgeschlossen.");
	}

	const now = new Date().toISOString();
	const next: TournamentDraftState = {
		...current,
		readyBy: {
			teamA: current.readyBy.teamA ?? { readyAt: now, readyBy: input.readyBy },
			teamB: current.readyBy.teamB ?? { readyAt: now, readyBy: input.readyBy },
		},
		currentTurnStartedAt: current.currentTurnStartedAt ?? now,
		resetReason: undefined,
		resetAt: undefined,
		updatedAt: now,
		updatedBy: input.readyBy,
	};

	const db = await getDb();
	await db.collection<DraftDoc>(COLLECTION).replaceOne({ _id: input.matchId }, next, { upsert: true });
	return next;
}

async function saveDraft(next: TournamentDraftState): Promise<TournamentDraftState> {
	const db = await getDb();
	await db.collection<DraftDoc>(COLLECTION).replaceOne({ _id: next.matchId }, next, { upsert: true });
	return next;
}

export async function undoLastDraftAction(input: { matchId: string; updatedBy?: string }): Promise<TournamentDraftState> {
	return saveDraft(applyUndo(await getDraftState(input.matchId), input.updatedBy));
}

/** `champion: null` skips a ban ("kein Ban"). */
export async function lockDraftAction(input: {
	matchId: string;
	side: DraftSide;
	kind: DraftActionKind;
	champion: string | null;
	lockedBy?: string;
	extraBanSide?: DraftSide | null;
}): Promise<TournamentDraftState> {
	const current = await getDraftState(input.matchId);
	return saveDraft(applyDraftLock(current, createDraftSequence(input.extraBanSide), input));
}

export async function resetDraftState(input: { matchId: string; resetBy?: string; reason: string }): Promise<TournamentDraftState> {
	return saveDraft(resetDraft(input.matchId, input.reason, new Date().toISOString(), input.resetBy));
}

export async function setDraftPendingSelection(input: {
	matchId: string;
	side: DraftSide;
	kind: DraftActionKind;
	champion: string;
	selectedBy?: string;
	extraBanSide?: DraftSide | null;
}): Promise<TournamentDraftState> {
	const current = await getDraftState(input.matchId);
	const sequence = createDraftSequence(input.extraBanSide);
	const turn = nextDraftTurn(current, sequence);
	if (!turn) throw new Error("Draft ist bereits abgeschlossen.");
	if (!draftReady(current) || !current.currentTurnStartedAt) {
		throw new Error("Beide Captains müssen zuerst ready sein.");
	}
	if (draftTurnExpired(current, Date.now(), sequence)) {
		throw new Error("Dieser Turn ist abgelaufen.");
	}
	if (turn.side !== input.side || turn.kind !== input.kind) {
		throw new Error("Das ist nicht der aktuelle Draft-Turn.");
	}

	const alreadyUsed = new Set(current.actions.map((action) => action.champion));
	if (alreadyUsed.has(input.champion)) {
		throw new Error("Dieser Champion wurde bereits gepickt oder gebannt.");
	}

	const now = new Date().toISOString();
	const next: TournamentDraftState = {
		...current,
		pendingSelection: {
			side: input.side,
			kind: input.kind,
			champion: input.champion,
			selectedAt: now,
			selectedBy: input.selectedBy,
		},
		updatedAt: now,
		updatedBy: input.selectedBy,
	};

	const db = await getDb();
	await db.collection<DraftDoc>(COLLECTION).replaceOne({ _id: input.matchId }, next, { upsert: true });
	return next;
}

/** Turn or role-confirmation timer ran out; `allowedPicks` feeds the random pick. */
export async function handleDraftTimeout(input: {
	matchId: string;
	triggeredBy?: string;
	extraBanSide?: DraftSide | null;
	allowedPicks?: Iterable<string>;
}): Promise<TournamentDraftState> {
	const current = await getDraftState(input.matchId);
	const sequence = createDraftSequence(input.extraBanSide);
	const next = rolePhaseActive(current, sequence)
		? applyRoleTimeout(current, sequence, input.triggeredBy)
		: applyDraftTimeout(current, sequence, { allowedPicks: input.allowedPicks ?? [], triggeredBy: input.triggeredBy });
	return next === current ? current : saveDraft(next);
}

export async function setDraftRoleOrder(input: {
	matchId: string;
	side: DraftSide;
	order: string[];
	updatedBy?: string;
	extraBanSide?: DraftSide | null;
}): Promise<TournamentDraftState> {
	const current = await getDraftState(input.matchId);
	return saveDraft(applyRoleOrder(current, createDraftSequence(input.extraBanSide), input));
}

export async function confirmDraftRoles(input: {
	matchId: string;
	side: DraftSide;
	order?: string[];
	confirmedBy?: string;
	extraBanSide?: DraftSide | null;
}): Promise<TournamentDraftState> {
	const current = await getDraftState(input.matchId);
	return saveDraft(applyRoleConfirm(current, createDraftSequence(input.extraBanSide), input));
}
