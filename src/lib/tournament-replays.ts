/**
 * Replay uploads per match game. A captain uploads the .rofl after a game; the browser reads its
 * metadata and the server re-checks it against the match rosters before anything is stored.
 * Results are never written from here: staff review an upload and apply it in the match control room.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongo";
import type { ReplayEvaluation } from "@/lib/replay-match";
import type { ReplaySummary } from "@/lib/rofl";

const COLLECTION = "tournament_match_replays";

export type ReplayStatus = "pending" | "applied" | "rejected";

export type TournamentReplay = {
	id: string;
	matchId: string;
	/** Game of the series the replay was uploaded for (1 for a Bo1). */
	gameNumber: number;
	uploadedBy: string;
	uploaderLabel: string;
	fileName: string;
	gameId?: string;
	platform?: string;
	sha256: string;
	fingerprint: string;
	summary: ReplaySummary;
	evaluation: ReplayEvaluation;
	status: ReplayStatus;
	createdAt: string;
	reviewedAt?: string;
	reviewedBy?: string;
};

// `active` is dropped on rejection, so a wrongly placed replay can be uploaded again for the right match.
type ReplayDoc = Omit<TournamentReplay, "id"> & { _id: string; active?: true };

let indexesReady: Promise<unknown> | null = null;

async function collection() {
	const db = await getDb();
	const replays = db.collection<ReplayDoc>(COLLECTION);
	// The same file, or the same game re-saved as another file, may only be uploaded once.
	indexesReady ??= Promise.all([
		replays.createIndex({ sha256: 1 }, { unique: true, name: "replay_sha256_active", partialFilterExpression: { active: true } }),
		replays.createIndex({ fingerprint: 1 }, { unique: true, name: "replay_fingerprint_active", partialFilterExpression: { active: true } }),
		replays.createIndex({ matchId: 1, createdAt: -1 }, { name: "replay_match" }),
	]).catch((error) => {
		indexesReady = null;
		throw error;
	});
	await indexesReady;
	return replays;
}

function fromDoc(doc: ReplayDoc): TournamentReplay {
	const { _id, ...rest } = doc;
	delete rest.active;
	return { id: _id, ...rest };
}

export class DuplicateReplayError extends Error {}

export async function createReplay(input: Omit<TournamentReplay, "id" | "createdAt" | "status">): Promise<TournamentReplay> {
	const replays = await collection();
	const existing = await replays.findOne({ active: true, $or: [{ sha256: input.sha256 }, { fingerprint: input.fingerprint }] });
	if (existing) {
		throw new DuplicateReplayError(
			existing.matchId === input.matchId ? "Diese Replay wurde für dieses Match bereits hochgeladen." : "Diese Replay wurde schon für ein anderes Match hochgeladen."
		);
	}
	const doc: ReplayDoc = { ...input, _id: randomUUID(), status: "pending", active: true, createdAt: new Date().toISOString() };
	try {
		await replays.insertOne(doc);
	} catch (error) {
		if ((error as { code?: number }).code === 11000) throw new DuplicateReplayError("Diese Replay wurde bereits hochgeladen.");
		throw error;
	}
	return fromDoc(doc);
}

export async function listReplays(matchId: string): Promise<TournamentReplay[]> {
	const docs = await (await collection()).find({ matchId }).sort({ createdAt: -1 }).toArray();
	return docs.map(fromDoc);
}

export async function setReplayStatus(id: string, status: Exclude<ReplayStatus, "pending">, reviewedBy: string): Promise<TournamentReplay | null> {
	const replays = await collection();
	// Only an open upload can be reviewed, so a repeated click never writes twice.
	const updated = await replays.findOneAndUpdate(
		{ _id: id, status: "pending" },
		status === "rejected"
			? { $set: { status, reviewedBy, reviewedAt: new Date().toISOString() }, $unset: { active: "" } }
			: { $set: { status, reviewedBy, reviewedAt: new Date().toISOString() } },
		{ returnDocument: "after" }
	);
	return updated ? fromDoc(updated) : null;
}
