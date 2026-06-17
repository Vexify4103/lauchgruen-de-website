import { getDb } from "@/lib/mongo";

const COLLECTION = "tournament_admin_versions";

type AdminVersionDoc = {
	_id: string;
	version: number;
	updatedAt: string;
	updatedBy?: string;
};

export type AdminVersionConflict = {
	code: "ADMIN_VERSION_CONFLICT";
	message: string;
	resource: string;
	currentVersion: number;
};

export async function getAdminVersion(resource: string): Promise<number> {
	const db = await getDb();
	const doc = await db.collection<AdminVersionDoc>(COLLECTION).findOne({ _id: resource });
	return doc?.version ?? 0;
}

export async function getAdminVersions(resources: string[]): Promise<Record<string, number>> {
	const unique = [...new Set(resources)];
	if (unique.length === 0) return {};

	const db = await getDb();
	const docs = await db
		.collection<AdminVersionDoc>(COLLECTION)
		.find({ _id: { $in: unique } })
		.toArray();
	const byResource = new Map(docs.map((doc) => [doc._id, doc.version]));
	return Object.fromEntries(unique.map((resource) => [resource, byResource.get(resource) ?? 0]));
}

/**
 * Atomically reserves the next version before a mutation is applied.
 * A failed business mutation can therefore consume a version, but stale
 * clients can never overwrite a newer successful save.
 */
export async function claimAdminVersion(input: {
	resource: string;
	expectedVersion: number;
	updatedBy?: string;
}): Promise<{ ok: true; version: number } | { ok: false; conflict: AdminVersionConflict }> {
	const db = await getDb();
	const collection = db.collection<AdminVersionDoc>(COLLECTION);
	const now = new Date().toISOString();

	try {
		await collection.updateOne(
			{ _id: input.resource },
			{
				$setOnInsert: {
					version: 0,
					updatedAt: now,
				},
			},
			{ upsert: true }
		);
	} catch (error) {
		const duplicateKey = typeof error === "object" && error !== null && "code" in error && error.code === 11000;
		if (!duplicateKey) throw error;
	}

	const result = await collection.findOneAndUpdate(
		{
			_id: input.resource,
			version: input.expectedVersion,
		},
		{
			$inc: { version: 1 },
			$set: {
				updatedAt: now,
				...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
			},
		},
		{ returnDocument: "after" }
	);

	if (result) {
		return { ok: true, version: result.version };
	}

	const currentVersion = await getAdminVersion(input.resource);
	return {
		ok: false,
		conflict: {
			code: "ADMIN_VERSION_CONFLICT",
			message: "Diese Daten wurden inzwischen von einer anderen Admin-Person geändert.",
			resource: input.resource,
			currentVersion,
		},
	};
}
