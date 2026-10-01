import { getDb } from "@/lib/mongo";

const COLLECTION = "tournament_standing_overrides";

/**
 * Staff decisions for ties that no configured tiebreaker splits (usually after a tiebreaker match).
 * Keys: `group:A` for round-robin groups, `swiss` for both Swiss formats, `playoffs` for round-robin playoffs.
 */
export type StandingOverrides = Record<string, string[]>;
type OverrideDoc = { _id: string; orders: StandingOverrides; updatedAt: string; updatedBy?: string };

export async function getStandingOverrides(tournamentId: string): Promise<StandingOverrides> {
	const doc = await (await getDb()).collection<OverrideDoc>(COLLECTION).findOne({ _id: tournamentId });
	return doc?.orders ?? {};
}

export async function setStandingOverride(input: { tournamentId: string; key: string; order: string[] | null; updatedBy?: string }): Promise<StandingOverrides> {
	if (!/^(group:[A-P]|swiss|playoffs)$/.test(input.key)) throw new Error("Unbekannte Tabelle.");
	const db = await getDb();
	const update = input.order?.length
		? { $set: { [`orders.${input.key}`]: input.order, updatedAt: new Date().toISOString(), updatedBy: input.updatedBy } }
		: { $unset: { [`orders.${input.key}`]: "" as const }, $set: { updatedAt: new Date().toISOString(), updatedBy: input.updatedBy } };
	await db.collection<OverrideDoc>(COLLECTION).updateOne({ _id: input.tournamentId }, update, { upsert: true });
	return getStandingOverrides(input.tournamentId);
}

export async function listAllStandingOverrides(): Promise<Array<{ tournamentId: string; orders: StandingOverrides }>> {
	const docs = await (await getDb()).collection<OverrideDoc>(COLLECTION).find({}).toArray();
	return docs.map((doc) => ({ tournamentId: doc._id, orders: doc.orders }));
}

export async function clearStandingOverrides(tournamentId: string): Promise<void> {
	await (await getDb()).collection<OverrideDoc>(COLLECTION).deleteOne({ _id: tournamentId });
}
