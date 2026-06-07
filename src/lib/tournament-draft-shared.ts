export type DraftSide = "teamA" | "teamB";
export type DraftActionKind = "ban" | "pick";

export type DraftTurn = {
  side: DraftSide;
  kind: DraftActionKind;
};

export type DraftAction = DraftTurn & {
  champion: string;
  lockedAt: string;
  lockedBy?: string;
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

export type TournamentDraftState = {
  matchId: string;
  actions: DraftAction[];
  readyBy: Partial<Record<DraftSide, DraftReadyEntry>>;
  pendingSelection?: DraftPendingSelection;
  currentTurnStartedAt?: string;
  resetReason?: string;
  resetAt?: string;
  updatedAt: string;
  updatedBy?: string;
};

export const DRAFT_TURN_SECONDS = 30;
export const DRAFT_GRACE_SECONDS = 4;
export const DRAFT_TOTAL_SECONDS = DRAFT_TURN_SECONDS + DRAFT_GRACE_SECONDS;
export const DRAFT_TOTAL_MS = DRAFT_TOTAL_SECONDS * 1000;

const DRAFT_BAN_WAVE: DraftTurn[] = [
  { side: "teamA", kind: "ban" },
  { side: "teamB", kind: "ban" },
  { side: "teamA", kind: "ban" },
  { side: "teamB", kind: "ban" },
  { side: "teamA", kind: "ban" },
  { side: "teamB", kind: "ban" },
];

const DRAFT_PICK_WAVE: DraftTurn[] = [
  { side: "teamA", kind: "pick" },
  { side: "teamB", kind: "pick" },
  { side: "teamB", kind: "pick" },
  { side: "teamA", kind: "pick" },
  { side: "teamA", kind: "pick" },
  { side: "teamB", kind: "pick" },
  { side: "teamB", kind: "pick" },
  { side: "teamA", kind: "pick" },
  { side: "teamA", kind: "pick" },
  { side: "teamB", kind: "pick" },
];

export function createDraftSequence(extraBanSide?: DraftSide | null): DraftTurn[] {
  return [
    ...DRAFT_BAN_WAVE,
    ...(extraBanSide ? [{ side: extraBanSide, kind: "ban" } satisfies DraftTurn] : []),
    ...DRAFT_PICK_WAVE,
  ];
}

export const DRAFT_SEQUENCE: DraftTurn[] = createDraftSequence();
export const DRAFT_MAX_SEQUENCE_LENGTH = DRAFT_SEQUENCE.length + 1;

export function nextDraftTurn(
  state: TournamentDraftState,
  sequence: DraftTurn[] = DRAFT_SEQUENCE,
): DraftTurn | null {
  return sequence[state.actions.length] ?? null;
}

export function draftComplete(
  state: TournamentDraftState,
  sequence: DraftTurn[] = DRAFT_SEQUENCE,
): boolean {
  return state.actions.length >= sequence.length;
}

export function draftReady(state: TournamentDraftState): boolean {
  return Boolean(state.readyBy.teamA && state.readyBy.teamB);
}

export function draftTurnExpired(
  state: TournamentDraftState,
  now = Date.now(),
  sequence: DraftTurn[] = DRAFT_SEQUENCE,
): boolean {
  if (!draftReady(state) || draftComplete(state, sequence) || !state.currentTurnStartedAt) return false;
  return now >= new Date(state.currentTurnStartedAt).getTime() + DRAFT_TOTAL_MS;
}
