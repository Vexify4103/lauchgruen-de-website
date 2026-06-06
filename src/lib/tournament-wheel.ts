import { getDb } from "@/lib/mongo";
import { azLetterPools } from "@/lib/tournament-data";
import {
  remainingPoolsForTeam,
  type TournamentWheelState,
  type WheelMatchAssignment,
} from "@/lib/tournament-wheel-shared";

export {
  compactPoolLabel,
  groupChampionsByPool,
  poolForChampion,
  remainingPoolsForTeam,
  type TournamentWheelState,
  type WheelMatchAssignment,
} from "@/lib/tournament-wheel-shared";

const COLLECTION = "tournament_wheel";
const DOC_ID = "az-2026";

type WheelDoc = Partial<TournamentWheelState> & {
  _id: string;
  // Legacy fields from the old global-wheel version. Kept only for safe reads.
  currentPool?: string | null;
  usedPools?: string[];
};

function defaultWheelState(): TournamentWheelState {
  return {
    id: DOC_ID,
    currentAssignment: null,
    usedPoolsByTeam: {},
    completedMatchIds: [],
    history: [],
    updatedAt: new Date().toISOString(),
  };
}

function sanitizePool(pool: unknown): string | null {
  const value = String(pool ?? "");
  return azLetterPools.includes(value) ? value : null;
}

function sanitizePools(pools: unknown): string[] {
  if (!Array.isArray(pools)) return [];
  return [...new Set(pools.map(sanitizePool).filter((pool): pool is string => !!pool))];
}

function sanitizeAssignment(value: unknown): WheelMatchAssignment | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<WheelMatchAssignment>;
  const teamAPool = sanitizePool(raw.teamAPool);
  const teamBPool = sanitizePool(raw.teamBPool);
  if (!raw.matchId || !raw.teamAName || !raw.teamBName || !teamAPool || !teamBPool || !raw.spunAt) {
    return null;
  }
  return {
    matchId: raw.matchId,
    teamAName: raw.teamAName,
    teamBName: raw.teamBName,
    teamAPool,
    teamBPool,
    spunAt: raw.spunAt,
    spunBy: raw.spunBy,
  };
}

function stripMongoId(doc: WheelDoc): TournamentWheelState {
  const usedPoolsByTeam = Object.fromEntries(
    Object.entries(doc.usedPoolsByTeam ?? {}).map(([teamName, pools]) => [
      teamName,
      sanitizePools(pools),
    ]),
  );

  const currentAssignment = sanitizeAssignment(doc.currentAssignment);
  const history = Array.isArray(doc.history)
    ? doc.history
        .map(sanitizeAssignment)
        .filter((entry): entry is WheelMatchAssignment => !!entry)
    : [];

  return {
    id: DOC_ID,
    currentAssignment,
    usedPoolsByTeam,
    completedMatchIds: Array.isArray(doc.completedMatchIds)
      ? [...new Set(doc.completedMatchIds.map((id) => String(id)).filter(Boolean))]
      : [],
    history,
    updatedAt: doc.updatedAt ?? new Date().toISOString(),
  };
}

export async function getTournamentWheelState(): Promise<TournamentWheelState> {
  const db = await getDb();
  const doc = await db.collection<WheelDoc>(COLLECTION).findOne({ _id: DOC_ID });
  return doc ? stripMongoId(doc) : defaultWheelState();
}

function pickRandom(options: string[]): string {
  return options[Math.floor(Math.random() * options.length)];
}

export async function spinTournamentWheelForMatch(input: {
  matchId: string;
  teamAName: string;
  teamBName: string;
  spunBy?: string;
}): Promise<TournamentWheelState> {
  const current = await getTournamentWheelState();
  if (
    current.currentAssignment
    && !current.completedMatchIds.includes(current.currentAssignment.matchId)
    && current.currentAssignment.matchId !== input.matchId
  ) {
    throw new Error(
      `Für ${current.currentAssignment.matchId} ist noch ein Pool offen. Speichere dieses Match zuerst als Finished.`,
    );
  }
  if (current.completedMatchIds.includes(input.matchId)) {
    throw new Error("Für dieses Match wurde bereits ein Pool gespielt.");
  }
  if (current.currentAssignment?.matchId === input.matchId) {
    throw new Error("Für dieses Match wurde bereits ein Pool gezogen.");
  }

  const teamARemaining = remainingPoolsForTeam(current, input.teamAName);
  const teamBRemaining = remainingPoolsForTeam(current, input.teamBName);

  if (teamARemaining.length === 0) {
    throw new Error(`${input.teamAName} hat keine ungespielten Pools mehr.`);
  }
  if (teamBRemaining.length === 0) {
    throw new Error(`${input.teamBName} hat keine ungespielten Pools mehr.`);
  }

  const teamAPool = pickRandom(teamARemaining);
  const teamBOptions =
    teamBRemaining.length > 1
      ? teamBRemaining.filter((pool) => pool !== teamAPool)
      : teamBRemaining;
  const teamBPool = pickRandom(teamBOptions);
  const now = new Date().toISOString();

  const assignment: WheelMatchAssignment = {
    matchId: input.matchId,
    teamAName: input.teamAName,
    teamBName: input.teamBName,
    teamAPool,
    teamBPool,
    spunAt: now,
    spunBy: input.spunBy,
  };

  const next: TournamentWheelState = {
    id: DOC_ID,
    currentAssignment: assignment,
    usedPoolsByTeam: current.usedPoolsByTeam,
    completedMatchIds: current.completedMatchIds,
    history: [assignment, ...current.history].slice(0, 40),
    updatedAt: now,
  };

  const db = await getDb();
  await db
    .collection<WheelDoc>(COLLECTION)
    .updateOne({ _id: DOC_ID }, { $set: next }, { upsert: true });
  return next;
}

export async function commitWheelAssignmentForMatch(
  matchId: string,
): Promise<TournamentWheelState> {
  const current = await getTournamentWheelState();
  if (current.completedMatchIds.includes(matchId)) return current;

  const assignment =
    current.currentAssignment?.matchId === matchId
      ? current.currentAssignment
      : current.history.find((entry) => entry.matchId === matchId);

  if (!assignment) return current;

  const now = new Date().toISOString();
  const usedPoolsByTeam = {
    ...current.usedPoolsByTeam,
    [assignment.teamAName]: [
      ...new Set([...(current.usedPoolsByTeam[assignment.teamAName] ?? []), assignment.teamAPool]),
    ],
    [assignment.teamBName]: [
      ...new Set([...(current.usedPoolsByTeam[assignment.teamBName] ?? []), assignment.teamBPool]),
    ],
  };

  const next: TournamentWheelState = {
    id: DOC_ID,
    currentAssignment:
      current.currentAssignment?.matchId === matchId ? null : current.currentAssignment,
    usedPoolsByTeam,
    completedMatchIds: [...new Set([...current.completedMatchIds, matchId])],
    history: current.history,
    updatedAt: now,
  };

  const db = await getDb();
  await db
    .collection<WheelDoc>(COLLECTION)
    .updateOne({ _id: DOC_ID }, { $set: next }, { upsert: true });
  return next;
}

export async function resetTournamentWheel(): Promise<TournamentWheelState> {
  const next = defaultWheelState();
  const db = await getDb();
  await db
    .collection<WheelDoc>(COLLECTION)
    .updateOne({ _id: DOC_ID }, { $set: next }, { upsert: true });
  return next;
}
