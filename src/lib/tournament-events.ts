import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongo";

export type TournamentEvent = {
	id: string;
	type: string;
	targetType: string;
	targetId: string;
	payload?: Record<string, unknown>;
	createdAt: string;
	createdBy?: string;
};

type EventDoc = TournamentEvent & { _id: string };

const COLLECTION = "tournament_events";

function stripMongoId(doc: EventDoc): TournamentEvent {
	const { _id, ...rest } = doc;
	void _id;
	return rest;
}

export async function writeTournamentEvent(input: {
	type: string;
	targetType: string;
	targetId: string;
	payload?: Record<string, unknown>;
	createdBy?: string;
}): Promise<TournamentEvent> {
	const event: TournamentEvent = {
		id: `${Date.now()}-${randomUUID()}`,
		createdAt: new Date().toISOString(),
		...input,
	};
	const db = await getDb();
	await db.collection<EventDoc>(COLLECTION).insertOne({ _id: event.id, ...event });
	return event;
}

export async function listTournamentEvents(input?: { after?: string; limit?: number }): Promise<TournamentEvent[]> {
	const db = await getDb();
	const limit = Math.max(1, Math.min(input?.limit ?? 50, 200));
	const query = input?.after ? { createdAt: { $gt: input.after } } : {};
	const docs = await db
		.collection<EventDoc>(COLLECTION)
		.find(query, { sort: { createdAt: 1 }, limit })
		.toArray();
	return docs.map(stripMongoId);
}
