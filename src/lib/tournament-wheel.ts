import { getDb } from "@/lib/mongo";
import { azLetterPools } from "@/lib/tournament-data";
import type { PoolHistoryScope } from "@/lib/tournament-rules";
import { remainingPoolsForTeam, type TournamentWheelState, type WheelMatchAssignment } from "@/lib/tournament-wheel-shared";

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
const HISTORY_LIMIT = 80;

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
		playoffUsedPoolsByTeam: {},
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
	return [...new Set(pools.map(sanitizePool).filter((pool): pool is string => Boolean(pool)))];
}

function sanitizeAssignment(value: unknown): WheelMatchAssignment | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as Partial<WheelMatchAssignment>;
	const teamAPool = sanitizePool(raw.teamAPool);
	const teamBPool = sanitizePool(raw.teamBPool);
	if (!raw.matchId || !raw.teamAName || !raw.teamBName || !teamAPool || !teamBPool || !raw.spunAt) return null;

	return {
		matchId: raw.matchId,
		// Old records used "groups"/"playoffs". Both belong to the fearless
		// early cycle; the new final cycle is explicitly stored as "finals".
		scope: raw.scope === "finals" ? "finals" : "early",
		teamAName: raw.teamAName,
		teamBName: raw.teamBName,
		teamAPool,
		teamBPool,
		spunAt: raw.spunAt,
		spunBy: raw.spunBy,
	};
}

function stripMongoId(doc: WheelDoc): TournamentWheelState {
	const usedPoolsByTeam = Object.fromEntries(Object.entries(doc.usedPoolsByTeam ?? {}).map(([teamName, pools]) => [teamName, sanitizePools(pools)]));
	const currentAssignment = sanitizeAssignment(doc.currentAssignment);
	const history = Array.isArray(doc.history) ? doc.history.map(sanitizeAssignment).filter((entry): entry is WheelMatchAssignment => Boolean(entry)) : [];
	// Before the rule change, every playoff pool was stored in this field. It
	// must not consume pools in the new final-only reset cycle.
	const hasFinalCycleEntry = history.some((entry) => entry.scope === "finals") || currentAssignment?.scope === "finals";
	const playoffUsedPoolsByTeam = hasFinalCycleEntry
		? Object.fromEntries(Object.entries(doc.playoffUsedPoolsByTeam ?? {}).map(([teamName, pools]) => [teamName, sanitizePools(pools)]))
		: {};

	return {
		id: DOC_ID,
		currentAssignment,
		usedPoolsByTeam,
		playoffUsedPoolsByTeam,
		completedMatchIds: Array.isArray(doc.completedMatchIds) ? [...new Set(doc.completedMatchIds.map((id) => String(id)).filter(Boolean))] : [],
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

function hasAssignmentForMatch(state: TournamentWheelState, matchId: string): boolean {
	return state.currentAssignment?.matchId === matchId || state.history.some((entry) => entry.matchId === matchId);
}

export async function spinTournamentWheelForMatch(input: {
	matchId: string;
	teamAName: string;
	teamBName: string;
	scope?: PoolHistoryScope;
	spunBy?: string;
}): Promise<TournamentWheelState> {
	const current = await getTournamentWheelState();
	const scope = input.scope ?? "early";

	if (current.completedMatchIds.includes(input.matchId)) {
		throw new Error("Für dieses Match wurde bereits ein Pool gespielt.");
	}
	if (hasAssignmentForMatch(current, input.matchId)) {
		throw new Error("Für dieses Match wurde bereits ein Pool gezogen.");
	}

	const teamARemaining = remainingPoolsForTeam(current, input.teamAName, scope);
	const teamBRemaining = remainingPoolsForTeam(current, input.teamBName, scope);

	if (teamARemaining.length === 0) {
		throw new Error(`${input.teamAName} hat keine ungespielten Pools mehr.`);
	}
	if (teamBRemaining.length === 0) {
		throw new Error(`${input.teamBName} hat keine ungespielten Pools mehr.`);
	}

	const teamAPool = pickRandom(teamARemaining);
	const teamBOptions = teamBRemaining.filter((pool) => pool !== teamAPool);
	if (teamBOptions.length === 0) {
		throw new Error("Beide Teams haben nur noch denselben Pool übrig. Bitte Orga-Reset oder manuelle Entscheidung nutzen.");
	}

	const teamBPool = pickRandom(teamBOptions);
	const now = new Date().toISOString();
	const assignment: WheelMatchAssignment = {
		matchId: input.matchId,
		scope,
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
		playoffUsedPoolsByTeam: current.playoffUsedPoolsByTeam,
		completedMatchIds: current.completedMatchIds,
		history: [assignment, ...current.history].slice(0, HISTORY_LIMIT),
		updatedAt: now,
	};

	const db = await getDb();
	await db.collection<WheelDoc>(COLLECTION).updateOne({ _id: DOC_ID }, { $set: next }, { upsert: true });
	return next;
}

export async function commitWheelAssignmentForMatch(matchId: string): Promise<TournamentWheelState> {
	const current = await getTournamentWheelState();
	if (current.completedMatchIds.includes(matchId)) return current;

	const assignment = current.currentAssignment?.matchId === matchId ? current.currentAssignment : current.history.find((entry) => entry.matchId === matchId);
	if (!assignment) return current;

	const now = new Date().toISOString();
	const scope = assignment.scope ?? "early";
	const target = scope === "finals" ? current.playoffUsedPoolsByTeam : current.usedPoolsByTeam;
	const updatedTarget = {
		...target,
		[assignment.teamAName]: [...new Set([...(target[assignment.teamAName] ?? []), assignment.teamAPool])],
		[assignment.teamBName]: [...new Set([...(target[assignment.teamBName] ?? []), assignment.teamBPool])],
	};

	const next: TournamentWheelState = {
		id: DOC_ID,
		currentAssignment: current.currentAssignment?.matchId === matchId ? null : current.currentAssignment,
		usedPoolsByTeam: scope === "early" ? updatedTarget : current.usedPoolsByTeam,
		playoffUsedPoolsByTeam: scope === "finals" ? updatedTarget : current.playoffUsedPoolsByTeam,
		completedMatchIds: [...new Set([...current.completedMatchIds, matchId])],
		history: current.history,
		updatedAt: now,
	};

	const db = await getDb();
	await db.collection<WheelDoc>(COLLECTION).updateOne({ _id: DOC_ID }, { $set: next }, { upsert: true });
	return next;
}

export async function resetTournamentWheel(): Promise<TournamentWheelState> {
	const next = defaultWheelState();
	const db = await getDb();
	await db.collection<WheelDoc>(COLLECTION).updateOne({ _id: DOC_ID }, { $set: next }, { upsert: true });
	return next;
}

export async function clearTournamentWheel(): Promise<void> {
	const db = await getDb();
	await db.collection<WheelDoc>(COLLECTION).deleteOne({ _id: DOC_ID });
}
