/**
 * Synthetic applicants for testing the roster builder without real signups.
 *
 * Inserts paired docs into both `verified_riot_accounts` and
 * `tournament_applications`, each marked with `isTestData: true` so they can
 * be removed cleanly without touching real applicants.
 */

import { getDb } from "@/lib/mongo";
import type { Document } from "mongodb";

const TEST_FLAG = "isTestData";

const TEST_TEAMS: Array<{
	name: string;
	group: "A" | "B";
	seed: number;
	accent: string;
}> = [
	{ name: "Sprout Squad", group: "A", seed: 1, accent: "from-lime-300/24 via-emerald-400/12 to-cyan-400/10" },
	{ name: "Onion Order", group: "A", seed: 2, accent: "from-amber-300/24 via-orange-400/12 to-emerald-400/10" },
	{ name: "Garlic Guard", group: "A", seed: 3, accent: "from-yellow-200/22 via-lime-400/12 to-emerald-400/10" },
	{ name: "Pepper Patrol", group: "A", seed: 4, accent: "from-rose-300/22 via-orange-400/12 to-amber-300/10" },
	{ name: "Baron Basil", group: "B", seed: 1, accent: "from-sky-300/22 via-cyan-400/12 to-emerald-400/10" },
	{ name: "Nexus Garden", group: "B", seed: 2, accent: "from-fuchsia-300/18 via-rose-400/10 to-emerald-400/10" },
	{ name: "Radish Riot", group: "B", seed: 3, accent: "from-red-300/22 via-rose-400/12 to-fuchsia-400/10" },
	{ name: "Chili Chargers", group: "B", seed: 4, accent: "from-orange-300/22 via-red-400/12 to-rose-400/10" },
];

function teamKey(name: string): string {
	return name.trim().toLowerCase();
}

const NAMES = [
	"Sprout",
	"Onion",
	"Garlic",
	"Pepper",
	"Basil",
	"Garden",
	"Radish",
	"Chili",
	"Leek",
	"Pumpkin",
	"Carrot",
	"Tomato",
	"Mint",
	"Sage",
	"Thyme",
	"Parsley",
	"Beet",
	"Kale",
	"Spinach",
	"Cabbage",
	"Lettuce",
	"Cucumber",
	"Squash",
	"Turnip",
	"Yam",
	"Olive",
	"Caper",
	"Fennel",
	"Endive",
	"Chard",
	"Arugula",
	"Cress",
	"Mizuna",
	"Tatsoi",
	"Rapini",
	"Sorrel",
	"Lovage",
	"Dill",
	"Tarragon",
	"Cilantro",
];

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];

const TIERS = [
	"IRON IV",
	"IRON II",
	"BRONZE III",
	"SILVER IV",
	"SILVER I",
	"GOLD III",
	"GOLD I",
	"PLATINUM IV",
	"PLATINUM II",
	"EMERALD III",
	"EMERALD I",
	"DIAMOND IV",
	"DIAMOND II",
	"MASTER I",
];

function rand<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randomPreferredRoles(): string[] {
	if (Math.random() < 0.12) return ["Fill"];
	// 1–3 distinct roles, primary first.
	const pool = [...ROLES].sort(() => Math.random() - 0.5);
	const count = 1 + Math.floor(Math.random() * 3);
	return pool.slice(0, count);
}

function randomRank(): string {
	const tier = rand(TIERS);
	const lp = Math.floor(Math.random() * 100);
	return `${tier} (${lp} LP)`;
}

export async function seedTestApplicants(count: number): Promise<number> {
	const db = await getDb();
	const now = new Date().toISOString();

	const docs: Array<{
		discordId: string;
		discordHandle: string;
		discordUsername: string;
		displayName: string;
		riotId: string;
		puuid: string;
		preferredRoles: string[];
		mainRole: string;
		currentRank: string;
	}> = [];

	for (let i = 0; i < count; i += 1) {
		const slot = String(i + 1).padStart(3, "0");
		const baseName = NAMES[i % NAMES.length];
		const username = `${baseName.toLowerCase()}${slot}`;
		const tag = baseName.slice(0, 3).toUpperCase();
		docs.push({
			discordId: `test-${slot}`,
			discordHandle: username,
			discordUsername: username,
			displayName: `${baseName} ${slot}`,
			riotId: `${baseName}${slot}#${tag}`,
			puuid: `test-puuid-${slot}`,
			preferredRoles: randomPreferredRoles(),
			mainRole: ROLES[i % ROLES.length],
			currentRank: randomRank(),
		});
	}

	// Insert into verified_riot_accounts
	const verifiedDocs = docs.map((d) => ({
		_id: d.discordId,
		[TEST_FLAG]: true,
		discordId: d.discordId,
		riotId: d.riotId,
		gameName: d.riotId.split("#")[0],
		tagLine: d.riotId.split("#")[1] ?? "TST",
		puuid: d.puuid,
		currentRankAuto: d.currentRank,
		verifiedAt: now,
	}));

	// Insert into tournament_applications
	const appDocs = docs.map((d) => ({
		_id: `${d.puuid}|${d.discordId}`,
		[TEST_FLAG]: true,
		id: `${d.puuid}|${d.discordId}`,
		displayName: d.displayName,
		riotId: d.riotId,
		riotPuuid: d.puuid,
		riotVerifiedAt: now,
		currentRankAuto: d.currentRank,
		discordId: d.discordId,
		discordHandle: d.discordHandle,
		discordUsername: d.discordUsername,
		mainRole: d.mainRole,
		preferredRoles: d.preferredRoles,
		availableAllDates: true as const,
		notes: "(test data)",
		acceptedRules: true as const,
		acceptedDataStorage: true as const,
		discordDmOptIn: true,
		createdAt: now,
		updatedAt: now,
	}));

	type StringIdDoc = { _id: string } & Record<string, unknown>;
	const verifiedCollection = db.collection<StringIdDoc>("verified_riot_accounts");
	const applicationCollection = db.collection<StringIdDoc>("tournament_applications");

	// Replace only explicitly marked test records. Stable IDs make this safely repeatable.
	await Promise.all([verifiedCollection.deleteMany({ [TEST_FLAG]: true }), applicationCollection.deleteMany({ [TEST_FLAG]: true })]);
	await Promise.all([
		verifiedCollection.bulkWrite(verifiedDocs.map((document) => ({ replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true } }))),
		applicationCollection.bulkWrite(appDocs.map((document) => ({ replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true } }))),
	]);

	return docs.length;
}

export async function clearTestApplicants(): Promise<{
	verified: number;
	applications: number;
}> {
	const db = await getDb();
	const [v, a] = await Promise.all([
		db.collection("verified_riot_accounts").deleteMany({ [TEST_FLAG]: true }),
		db.collection("tournament_applications").deleteMany({ [TEST_FLAG]: true }),
	]);
	return {
		verified: v.deletedCount ?? 0,
		applications: a.deletedCount ?? 0,
	};
}

const TOURNAMENT_TEAM_COUNT = 8;

/**
 * Tops the bot's team list up to 8 total. If real teams already exist, only
 * fills the remaining slots with dummies — never trampling real teams and
 * never exceeding the tournament's team count. Each dummy is marked
 * `isTestData: true` so clear-dummies removes only what we added.
 */
export async function seedTestTeams(): Promise<{
	inserted: number;
	skipped: number;
	alreadyFull: boolean;
}> {
	const db = await getDb();
	const doc = await db.collection<{ _id: string; teams?: Record<string, unknown> }>("bot_state").findOne({ _id: "default" });
	const existing = doc?.teams ?? {};
	const existingCount = Object.keys(existing).length;

	if (existingCount >= TOURNAMENT_TEAM_COUNT) {
		return { inserted: 0, skipped: 0, alreadyFull: true };
	}

	const slotsToFill = TOURNAMENT_TEAM_COUNT - existingCount;

	const setOps: Record<string, unknown> = {};
	let inserted = 0;
	let skipped = 0;
	for (const team of TEST_TEAMS) {
		if (inserted >= slotsToFill) break;
		const key = teamKey(team.name);
		if (existing[key]) {
			skipped += 1;
			continue;
		}
		setOps[`teams.${key}`] = {
			name: team.name,
			players: [],
			playedChampions: [],
			meta: {
				group: team.group,
				seed: team.seed,
				accent: team.accent,
			},
			[TEST_FLAG]: true,
		};
		inserted += 1;
	}

	if (inserted > 0) {
		await db.collection<{ _id: string }>("bot_state").updateOne({ _id: "default" }, { $set: setOps }, { upsert: true });
	}

	return { inserted, skipped, alreadyFull: false };
}

type StoredPlayerLike = {
	riotId?: string;
	puuid?: string;
	discordId?: string;
};

function isTestPlayer(p: StoredPlayerLike): boolean {
	return (typeof p.discordId === "string" && p.discordId.startsWith("test-")) || (typeof p.puuid === "string" && p.puuid.startsWith("test-puuid-"));
}

/**
 * Removes teams in bot_state.teams that carry isTestData:true AND also strips
 * any dummy players (discordId "test-*" or puuid "test-puuid-*") from real
 * teams' rosters. Returns the count of teams removed plus the count of dummy
 * players stripped from real teams.
 */
export async function clearTestTeams(): Promise<{
	teamsRemoved: number;
	playersStripped: number;
	teamKeysRemoved: string[];
}> {
	const db = await getDb();
	const doc = await db
		.collection<{
			_id: string;
			teams?: Record<
				string,
				{
					isTestData?: boolean;
					players?: StoredPlayerLike[];
					meta?: { captain?: { discordId?: string; puuid?: string } };
				}
			>;
		}>("bot_state")
		.findOne({ _id: "default" });
	const teamsObj = doc?.teams ?? {};

	const setOps: Record<string, unknown> = {};
	const unsetOps: Record<string, ""> = {};
	let teamsRemoved = 0;
	let playersStripped = 0;
	const teamKeysRemoved: string[] = [];

	for (const [key, team] of Object.entries(teamsObj)) {
		if (team?.isTestData === true) {
			unsetOps[`teams.${key}`] = "";
			teamsRemoved += 1;
			teamKeysRemoved.push(key);
			continue;
		}
		// Real team — filter out any dummy players from its roster
		const players = team?.players ?? [];
		const cleaned = players.filter((p) => !isTestPlayer(p));
		if (cleaned.length !== players.length) {
			setOps[`teams.${key}.players`] = cleaned;
			playersStripped += players.length - cleaned.length;
		}
		// Also clear a captain whose discordId/puuid is a dummy
		const captain = team?.meta?.captain;
		if (
			captain &&
			((typeof captain.discordId === "string" && captain.discordId.startsWith("test-")) || (typeof captain.puuid === "string" && captain.puuid.startsWith("test-puuid-")))
		) {
			unsetOps[`teams.${key}.meta.captain`] = "";
		}
	}

	const update: Record<string, unknown> = {};
	if (Object.keys(setOps).length > 0) update.$set = setOps;
	if (Object.keys(unsetOps).length > 0) update.$unset = unsetOps;

	if (Object.keys(update).length > 0) {
		await db.collection<{ _id: string }>("bot_state").updateOne({ _id: "default" }, update);
	}

	return { teamsRemoved, playersStripped, teamKeysRemoved };
}

const TEST_STATE_COLLECTION = "tournament_test_state";
const TEST_ROSTER_STATE_ID = "roster-builder";

type TestStoredPlayer = StoredPlayerLike & {
	[key: string]: unknown;
};

type TestStoredTeam = {
	name?: string;
	players?: TestStoredPlayer[];
	playedChampions?: string[];
	meta?: {
		captain?: { discordId?: string; puuid?: string; [key: string]: unknown };
		[key: string]: unknown;
	};
	isTestData?: boolean;
	[key: string]: unknown;
};

type TestRosterState = {
	_id: string;
	teams: Record<string, TestStoredTeam>;
	operationalData?: Record<string, Document[]>;
	activatedAt: string;
};

const TEST_MODE_COLLECTIONS = [
	"tournament_matches",
	"tournament_drafts",
	"tournament_swiss_stages",
	"ultimate_bravery_rolls",
	"tournament_captain_checkins",
	"tournament_match_reports",
] as const;

async function readOperationalData(): Promise<Record<string, Document[]>> {
	const db = await getDb();
	return Object.fromEntries(
		await Promise.all(TEST_MODE_COLLECTIONS.map(async (collectionName) => [collectionName, await db.collection(collectionName).find({}).toArray()] as const))
	);
}

async function clearOperationalData() {
	const db = await getDb();
	await Promise.all(TEST_MODE_COLLECTIONS.map((collectionName) => db.collection(collectionName).deleteMany({})));
}

async function restoreOperationalData(data: Record<string, Document[]>) {
	const db = await getDb();
	for (const collectionName of TEST_MODE_COLLECTIONS) {
		const collection = db.collection(collectionName);
		await collection.deleteMany({});
		const documents = data[collectionName] ?? [];
		if (documents.length > 0) await collection.insertMany(documents);
	}
}

function testIdentity(index: number) {
	const slot = String(index + 1).padStart(3, "0");
	const baseName = NAMES[index % NAMES.length];
	const username = `${baseName.toLowerCase()}${slot}`;
	const tag = baseName.slice(0, 3).toUpperCase();
	return {
		discordId: `test-${slot}`,
		discordUsername: username,
		displayName: `${baseName} ${slot}`,
		riotId: `${baseName}${slot}#${tag}`,
		puuid: `test-puuid-${slot}`,
	};
}

function buildFullTestTeams(now: string): Record<string, TestStoredTeam> {
	return Object.fromEntries(
		TEST_TEAMS.map((team, teamIndex) => {
			const players = ROLES.map((role, roleIndex) => ({
				...testIdentity(teamIndex * ROLES.length + roleIndex),
				role,
				verificationStatus: "verified",
			}));
			const captain = players[0];
			return [
				teamKey(team.name),
				{
					name: team.name,
					players,
					playedChampions: [],
					meta: {
						group: team.group,
						seed: team.seed,
						accent: team.accent,
						captain: {
							discordId: captain.discordId,
							discordUsername: captain.discordUsername,
							riotId: captain.riotId,
							puuid: captain.puuid,
							assignedAt: now,
						},
					},
					[TEST_FLAG]: true,
				},
			];
		})
	);
}

function withoutLegacyTestData(teams: Record<string, TestStoredTeam>): Record<string, TestStoredTeam> {
	const cleanTeams: Record<string, TestStoredTeam> = {};
	for (const [key, team] of Object.entries(teams)) {
		if (team.isTestData === true) continue;
		const players = (team.players ?? []).filter((player) => !isTestPlayer(player));
		const meta = team.meta ? { ...team.meta } : undefined;
		if (meta?.captain && isTestPlayer(meta.captain)) delete meta.captain;
		cleanTeams[key] = { ...team, players, ...(meta ? { meta } : {}) };
	}
	return cleanTeams;
}

export async function isTestRosterModeActive(): Promise<boolean> {
	const db = await getDb();
	return Boolean(await db.collection<TestRosterState>(TEST_STATE_COLLECTION).findOne({ _id: TEST_ROSTER_STATE_ID }, { projection: { _id: 1 } }));
}

/** Saves the real roster once, then replaces it with eight complete dummy teams. */
export async function startTestRosterMode(): Promise<{
	teamsInserted: number;
	playersInserted: number;
	originalTeamsSaved: number;
	alreadyActive: boolean;
}> {
	const db = await getDb();
	const botCollection = db.collection<{ _id: string; teams?: Record<string, TestStoredTeam> }>("bot_state");
	const stateCollection = db.collection<TestRosterState>(TEST_STATE_COLLECTION);
	const [botState, existingState] = await Promise.all([botCollection.findOne({ _id: "default" }), stateCollection.findOne({ _id: TEST_ROSTER_STATE_ID })]);
	const originalTeams = existingState?.teams ?? withoutLegacyTestData(botState?.teams ?? {});
	const operationalData = existingState?.operationalData ?? (await readOperationalData());

	await stateCollection.updateOne(
		{ _id: TEST_ROSTER_STATE_ID },
		{ $setOnInsert: { teams: originalTeams, operationalData, activatedAt: new Date().toISOString() } },
		{ upsert: true }
	);
	await clearOperationalData();
	await botCollection.updateOne({ _id: "default" }, { $set: { teams: buildFullTestTeams(new Date().toISOString()) } }, { upsert: true });

	return {
		teamsInserted: TEST_TEAMS.length,
		playersInserted: TEST_TEAMS.length * ROLES.length,
		originalTeamsSaved: Object.keys(originalTeams).length,
		alreadyActive: Boolean(existingState),
	};
}

/** Restores the exact team map saved before test mode was enabled. */
export async function stopTestRosterMode(): Promise<{
	teamsRemoved: number;
	playersStripped: number;
	teamKeysRemoved: string[];
	restored: boolean;
	restoredTeams: number;
}> {
	const db = await getDb();
	const stateCollection = db.collection<TestRosterState>(TEST_STATE_COLLECTION);
	const backup = await stateCollection.findOne({ _id: TEST_ROSTER_STATE_ID });
	if (!backup) {
		const legacy = await clearTestTeams();
		return { ...legacy, restored: false, restoredTeams: 0 };
	}

	const botCollection = db.collection<{ _id: string; teams?: Record<string, TestStoredTeam> }>("bot_state");
	const current = await botCollection.findOne({ _id: "default" });
	const teamKeysRemoved = Object.entries(current?.teams ?? {})
		.filter(([, team]) => team.isTestData === true)
		.map(([key]) => key);

	await botCollection.updateOne({ _id: "default" }, { $set: { teams: backup.teams } }, { upsert: true });
	if (backup.operationalData) await restoreOperationalData(backup.operationalData);
	await stateCollection.deleteOne({ _id: TEST_ROSTER_STATE_ID });
	return {
		teamsRemoved: teamKeysRemoved.length,
		playersStripped: 0,
		teamKeysRemoved,
		restored: true,
		restoredTeams: Object.keys(backup.teams).length,
	};
}
