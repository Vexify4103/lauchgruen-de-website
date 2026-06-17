import { getDb } from "@/lib/mongo";
import {
	DRAFT_MAX_SEQUENCE_LENGTH,
	DRAFT_TOTAL_MS,
	createDraftSequence,
	draftComplete,
	draftReady,
	draftTurnExpired,
	nextDraftTurn,
	type DraftAction,
	type DraftActionKind,
	type DraftPendingSelection,
	type DraftReadyEntry,
	type DraftSide,
	type TournamentDraftState,
} from "@/lib/tournament-draft-shared";

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
	nextDraftTurn,
	type DraftAction,
	type DraftActionKind,
	type DraftPendingSelection,
	type DraftReadyEntry,
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
	if ((raw.side !== "teamA" && raw.side !== "teamB") || (raw.kind !== "pick" && raw.kind !== "ban") || !raw.champion || !raw.lockedAt) {
		return null;
	}
	return {
		side: raw.side,
		kind: raw.kind,
		champion: String(raw.champion),
		lockedAt: String(raw.lockedAt),
		lockedBy: raw.lockedBy ? String(raw.lockedBy) : undefined,
	};
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

export async function undoLastDraftAction(input: { matchId: string; updatedBy?: string }): Promise<TournamentDraftState> {
	const current = await getDraftState(input.matchId);
	if (current.actions.length === 0) {
		throw new Error("Es gibt keinen Draft-Lock zum Zurücknehmen.");
	}

	const now = new Date().toISOString();
	const next: TournamentDraftState = {
		...current,
		actions: current.actions.slice(0, -1),
		pendingSelection: undefined,
		currentTurnStartedAt: now,
		updatedAt: now,
		updatedBy: input.updatedBy,
	};

	const db = await getDb();
	await db.collection<DraftDoc>(COLLECTION).replaceOne({ _id: input.matchId }, next, { upsert: true });
	return next;
}

export async function lockDraftAction(input: {
	matchId: string;
	side: DraftSide;
	kind: DraftActionKind;
	champion: string;
	lockedBy?: string;
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
		matchId: input.matchId,
		actions: [
			...current.actions,
			{
				side: input.side,
				kind: input.kind,
				champion: input.champion,
				lockedAt: now,
				lockedBy: input.lockedBy,
			},
		],
		readyBy: current.readyBy,
		pendingSelection: undefined,
		currentTurnStartedAt: current.actions.length + 1 >= sequence.length ? undefined : now,
		updatedAt: now,
		updatedBy: input.lockedBy,
	};

	const db = await getDb();
	await db.collection<DraftDoc>(COLLECTION).replaceOne({ _id: input.matchId }, next, { upsert: true });
	return next;
}

export async function resetDraftState(input: { matchId: string; resetBy?: string; reason: string }): Promise<TournamentDraftState> {
	const now = new Date().toISOString();
	const next: TournamentDraftState = {
		matchId: input.matchId,
		actions: [],
		readyBy: {},
		pendingSelection: undefined,
		resetReason: input.reason,
		resetAt: now,
		updatedAt: now,
		updatedBy: input.resetBy,
	};

	const db = await getDb();
	await db.collection<DraftDoc>(COLLECTION).replaceOne({ _id: input.matchId }, next, { upsert: true });
	return next;
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

export async function handleDraftTimeout(input: { matchId: string; triggeredBy?: string; extraBanSide?: DraftSide | null }): Promise<TournamentDraftState> {
	const current = await getDraftState(input.matchId);
	const sequence = createDraftSequence(input.extraBanSide);
	const turn = nextDraftTurn(current, sequence);
	if (!turn || !current.currentTurnStartedAt || !draftReady(current)) return current;

	const deadline = new Date(current.currentTurnStartedAt).getTime() + DRAFT_TOTAL_MS;
	if (Date.now() < deadline) {
		throw new Error("Der aktuelle Turn läuft noch.");
	}

	const pending = current.pendingSelection;
	const alreadyUsed = new Set(current.actions.map((action) => action.champion));
	if (pending && pending.side === turn.side && pending.kind === turn.kind && !alreadyUsed.has(pending.champion)) {
		const now = new Date().toISOString();
		const next: TournamentDraftState = {
			...current,
			actions: [
				...current.actions,
				{
					side: turn.side,
					kind: turn.kind,
					champion: pending.champion,
					lockedAt: now,
					lockedBy: pending.selectedBy ?? input.triggeredBy,
				},
			],
			pendingSelection: undefined,
			currentTurnStartedAt: current.actions.length + 1 >= sequence.length ? undefined : now,
			resetReason: undefined,
			resetAt: undefined,
			updatedAt: now,
			updatedBy: pending.selectedBy ?? input.triggeredBy,
		};

		const db = await getDb();
		await db.collection<DraftDoc>(COLLECTION).replaceOne({ _id: input.matchId }, next, { upsert: true });
		return next;
	}

	return resetDraftState({
		matchId: input.matchId,
		resetBy: input.triggeredBy,
		reason: `${turn.side === "teamA" ? "Blue Side" : "Red Side"} hat keinen Champion gelockt. Draft wurde zurückgesetzt.`,
	});
}
