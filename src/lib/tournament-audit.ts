import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongo";

export type TournamentAuditEntry = {
	id: string;
	action: string;
	targetType: string;
	targetId: string;
	summary: string;
	actorDiscordId?: string;
	actorLabel?: string;
	metadata?: Record<string, unknown>;
	createdAt: string;
};

type AuditDoc = TournamentAuditEntry & { _id: string };

const COLLECTION = "tournament_audit_log";

function stripMongoId(doc: AuditDoc): TournamentAuditEntry {
	const { _id, ...rest } = doc;
	void _id;
	return rest;
}

export async function writeAuditLog(input: {
	action: string;
	targetType: string;
	targetId: string;
	summary: string;
	actorDiscordId?: string;
	actorLabel?: string;
	metadata?: Record<string, unknown>;
}): Promise<TournamentAuditEntry> {
	const createdAt = new Date().toISOString();
	const entry: TournamentAuditEntry = {
		id: `${Date.now()}-${randomUUID()}`,
		createdAt,
		...input,
	};
	const db = await getDb();
	await db.collection<AuditDoc>(COLLECTION).insertOne({ _id: entry.id, ...entry });
	return entry;
}

export async function listAuditLog(limit = 16): Promise<TournamentAuditEntry[]> {
	const db = await getDb();
	const docs = await db
		.collection<AuditDoc>(COLLECTION)
		.find({}, { sort: { createdAt: -1 }, limit })
		.toArray();
	return docs.map(stripMongoId);
}

export async function deleteAuditLogEntry(id: string): Promise<boolean> {
	const db = await getDb();
	const result = await db.collection<AuditDoc>(COLLECTION).deleteOne({ _id: id });
	return result.deletedCount > 0;
}

export async function deleteAuditLogEntries(): Promise<number> {
	const db = await getDb();
	const result = await db.collection<AuditDoc>(COLLECTION).deleteMany({});
	return result.deletedCount;
}
