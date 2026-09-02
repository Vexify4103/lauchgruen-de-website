import { getDb } from "@/lib/mongo";

export const ULTIMATE_BRAVERY_TEST_MATCH_ID = "ub-test";

const COLLECTION = "ultimate_bravery_test_slots";
const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
const TEAMS = ["Team Alpha", "Team Bravo"] as const;

export type UltimateBraveryTestSlot = {
	slotId: string;
	teamName: (typeof TEAMS)[number];
	role: (typeof ROLES)[number];
	discordId?: string;
	displayName?: string;
	claimedAt?: string;
};

type SlotDoc = UltimateBraveryTestSlot & { _id: string; order: number };

const SLOT_DEFINITIONS: Array<Omit<SlotDoc, "_id"> & { _id: string }> = TEAMS.flatMap((teamName, teamIndex) =>
	ROLES.map((role, roleIndex) => {
		const slotId = `${teamIndex === 0 ? "alpha" : "bravo"}-${role.toLowerCase()}`;
		return { _id: slotId, slotId, teamName, role, order: teamIndex * ROLES.length + roleIndex };
	})
);

let indexesEnsured = false;

async function slotsCollection() {
	const collection = (await getDb()).collection<SlotDoc>(COLLECTION);
	if (!indexesEnsured) {
		indexesEnsured = true;
		await collection.createIndex({ discordId: 1 }, { unique: true, sparse: true }).catch((error) => {
			indexesEnsured = false;
			throw error;
		});
	}
	await collection.bulkWrite(
		SLOT_DEFINITIONS.map((slot) => ({
			updateOne: {
				filter: { _id: slot._id },
				update: { $setOnInsert: slot },
				upsert: true,
			},
		})),
		{ ordered: false }
	);
	return collection;
}

function stripSlot({ _id, order, ...slot }: SlotDoc): UltimateBraveryTestSlot {
	void _id;
	void order;
	return slot;
}

export async function listUltimateBraveryTestSlots(): Promise<UltimateBraveryTestSlot[]> {
	return (await slotsCollection())
		.find({}, { sort: { order: 1 } })
		.toArray()
		.then((slots) => slots.map(stripSlot));
}

export async function claimUltimateBraveryTestSlot(input: { slotId: string; discordId: string; displayName: string }): Promise<UltimateBraveryTestSlot> {
	const collection = await slotsCollection();
	const existing = await collection.findOne({ discordId: input.discordId });
	if (existing) {
		if (existing.slotId === input.slotId) return stripSlot(existing);
		throw new Error("Du hast bereits einen anderen Testplatz belegt. Gib ihn zuerst frei.");
	}

	try {
		const claimed = await collection.findOneAndUpdate(
			{ _id: input.slotId, discordId: { $exists: false } },
			{ $set: { discordId: input.discordId, displayName: input.displayName, claimedAt: new Date().toISOString() } },
			{ returnDocument: "after" }
		);
		if (!claimed) throw new Error("Dieser Testplatz wurde gerade von jemand anderem belegt.");
		return stripSlot(claimed);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === 11000) {
			throw new Error("Dein Discord-Account belegt bereits einen Testplatz.");
		}
		throw error;
	}
}

export async function releaseUltimateBraveryTestSlot(discordId: string): Promise<string | null> {
	const collection = await slotsCollection();
	const slot = await collection.findOne({ discordId });
	if (!slot) return null;
	await collection.updateOne({ _id: slot._id, discordId }, { $unset: { discordId: "", displayName: "", claimedAt: "" } });
	return slot.slotId;
}

export async function releaseUltimateBraveryTestSlotById(slotId: string): Promise<string | null> {
	const collection = await slotsCollection();
	const slot = await collection.findOne({ _id: slotId });
	if (!slot?.discordId) return null;
	await collection.updateOne({ _id: slotId }, { $unset: { discordId: "", displayName: "", claimedAt: "" } });
	return slot.discordId;
}

export async function resetUltimateBraveryTestSlots(): Promise<void> {
	const collection = await slotsCollection();
	await collection.updateMany({}, { $unset: { discordId: "", displayName: "", claimedAt: "" } });
}

export async function fillUltimateBraveryTestSlotsWithDummies(): Promise<void> {
	const collection = await slotsCollection();
	await collection.updateMany({}, { $unset: { discordId: "", displayName: "", claimedAt: "" } });
	const claimedAt = new Date().toISOString();
	await collection.bulkWrite(
		SLOT_DEFINITIONS.map((slot) => ({
			updateOne: {
				filter: { _id: slot._id },
				update: {
					$set: {
						discordId: `ub-test-dummy-${slot.slotId}`,
						displayName: `${slot.teamName === "Team Alpha" ? "Alpha" : "Bravo"} ${slot.role}`,
						claimedAt,
					},
				},
			},
		})),
		{ ordered: true }
	);
}
