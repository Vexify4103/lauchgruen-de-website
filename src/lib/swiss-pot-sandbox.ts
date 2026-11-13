import { randomInt } from "node:crypto";
import { MongoClient } from "mongodb";
import { advanceSwissPotDraw, createSwissPotState, type SwissPotAction, type SwissPotState } from "@/lib/swiss-pot-draw";

export const SWISS_SANDBOX_DB = "lauchgruen_swiss_draw_sandbox";
export const SWISS_SANDBOX_COLLECTION = "swiss_pot_sessions";
type SessionDoc = { _id: string; revision: number; state: SwissPotState };
export type SwissPotSession = { revision: number; state: SwissPotState };

export function isLocalSwissSandbox(host: string | null, environment = process.env.NODE_ENV): boolean {
	if (environment !== "development" || !host) return false;
	try {
		const url = new URL(`http://${host}`);
		return (
			!url.username &&
			!url.password &&
			url.pathname === "/" &&
			!url.search &&
			!url.hash &&
			["localhost", "127.0.0.1", "[::1]", "lauchgruen.localhost", "tournament.lauchgruen.localhost"].includes(url.hostname)
		);
	} catch {
		return false;
	}
}

export function localSwissMongoUri(value = process.env.LOCAL_SWISS_MONGODB_URI || "mongodb://127.0.0.1:27027/?directConnection=true") {
	const parsed = new URL(value);
	if (parsed.protocol !== "mongodb:" || !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
		throw new Error("Der Swiss-Simulator erlaubt ausschließlich eine lokale MongoDB-Verbindung, keine Produktivdatenbank.");
	return value;
}

declare global {
	var __swissPotLocalClient: Promise<MongoClient> | undefined;
}
export async function swissSandboxDb() {
	const uri = localSwissMongoUri();
	if (!globalThis.__swissPotLocalClient) {
		globalThis.__swissPotLocalClient = new MongoClient(uri, { directConnection: true, serverSelectionTimeoutMS: 3000, maxPoolSize: 3 }).connect().catch((error) => {
			globalThis.__swissPotLocalClient = undefined;
			throw error;
		});
	}
	return (await globalThis.__swissPotLocalClient).db(SWISS_SANDBOX_DB);
}

export async function getSwissPotSession(id = "default"): Promise<SwissPotSession> {
	const collection = (await swissSandboxDb()).collection<SessionDoc>(SWISS_SANDBOX_COLLECTION);
	try {
		await collection.updateOne({ _id: id }, { $setOnInsert: { revision: 0, state: createSwissPotState() } }, { upsert: true });
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === 11000)) throw error;
	}
	const doc = await collection.findOne({ _id: id });
	if (!doc) throw new Error("Lokale Testsession konnte nicht geladen werden.");
	return { revision: doc.revision, state: doc.state };
}

export class SwissPotConflict extends Error {
	constructor() {
		super("Die Testsession wurde in einem anderen Tab geändert. Der aktuelle Stand wurde neu geladen; bitte erneut klicken.");
	}
}

export async function updateSwissPotSession(action: SwissPotAction, revision: number, id = "default"): Promise<SwissPotSession> {
	const current = await getSwissPotSession(id);
	if (current.revision !== revision) throw new SwissPotConflict();
	const state = advanceSwissPotDraw(current.state, action, (length) => randomInt(length));
	const result = await (await swissSandboxDb()).collection<SessionDoc>(SWISS_SANDBOX_COLLECTION).updateOne({ _id: id, revision }, { $set: { state }, $inc: { revision: 1 } });
	if (result.matchedCount !== 1) throw new SwissPotConflict();
	return { revision: revision + 1, state };
}
