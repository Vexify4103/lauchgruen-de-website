/**
 * One-shot migration: copy data/tournament-state.json into MongoDB.
 *
 * Idempotent — uses _id-based upserts so re-running is safe.
 * Run with: pnpm tsx scripts/migrate-json-to-mongo.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";

type Application = { id: string; createdAt: string; [k: string]: unknown };
type Match = { id: string; [k: string]: unknown };
type State = {
	applications?: Application[];
	matches?: Record<string, Match>;
};

async function main() {
	const uri = process.env.MONGODB_URI;
	if (!uri) throw new Error("MONGODB_URI is required");
	const dbName = process.env.MONGODB_DB ?? "lauchgruen";

	const jsonPath = path.join(process.cwd(), "data", "tournament-state.json");
	let raw: string;
	try {
		raw = await readFile(jsonPath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			console.log(`No JSON file at ${jsonPath}. Nothing to migrate.`);
			return;
		}
		throw error;
	}

	const state = JSON.parse(raw) as State;
	const apps = state.applications ?? [];
	const matches = Object.values(state.matches ?? {});

	console.log(`Migrating ${apps.length} application(s), ${matches.length} match(es)…`);

	const client = await new MongoClient(uri).connect();
	try {
		const db = client.db(dbName);

		if (apps.length > 0) {
			const col = db.collection<Application & { _id: string }>("tournament_applications");
			for (const app of apps) {
				await col.replaceOne({ _id: app.id }, { ...app, _id: app.id }, { upsert: true });
			}
		}

		if (matches.length > 0) {
			const col = db.collection<Match & { _id: string }>("tournament_matches");
			for (const match of matches) {
				await col.replaceOne({ _id: match.id }, { ...match, _id: match.id }, { upsert: true });
			}
		}

		console.log("Migration complete.");
	} finally {
		await client.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
