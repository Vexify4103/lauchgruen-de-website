/**
 * Synthetic applicants for testing the roster builder without real signups.
 *
 * Inserts paired docs into both `verified_riot_accounts` and
 * `tournament_applications`, each marked with `isTestData: true` so they can
 * be removed cleanly without touching real applicants.
 */

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongo";

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

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support", "Fill"];

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
		const baseName = rand(NAMES);
		const username = `${baseName.toLowerCase()}${slot}`;
		const tag = baseName.slice(0, 3).toUpperCase();
		docs.push({
			discordId: `test-${slot}`,
			discordHandle: username,
			discordUsername: username,
			displayName: `${baseName} ${slot}`,
			riotId: `${baseName}${slot}#${tag}`,
			puuid: `test-puuid-${randomUUID()}`,
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
		createdAt: now,
		updatedAt: now,
	}));

	type StringIdDoc = { _id: string } & Record<string, unknown>;
	await Promise.all([db.collection<StringIdDoc>("verified_riot_accounts").insertMany(verifiedDocs), db.collection<StringIdDoc>("tournament_applications").insertMany(appDocs)]);

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
