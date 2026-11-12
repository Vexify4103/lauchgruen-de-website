import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as identity from "../src/lib/tournament-playing-account.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/lib/tournament-playing-account-store.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(documents = []) {
	const calls = [];
	const rows = {};
	const db = {
		collection: (name) => ({
			find: (query) => {
				calls.push(["find", name, query]);
				return { toArray: async () => documents };
			},
			findOne: async (query) => {
				calls.push(["findOne", name, query]);
				return rows[name] ?? null;
			},
			createIndex: async (...args) => calls.push(["index", name, ...args]),
			replaceOne: async (...args) => calls.push(["replace", name, ...args]),
			deleteOne: async (...args) => calls.push(["delete", name, ...args]),
		}),
	};
	const compiled = { exports: {} };
	new Function("require", "exports", output)(
		(name) => (name === "@/lib/mongo" ? { getDb: async () => db } : name === "@/lib/tournament-playing-account" ? identity : require(name)),
		compiled.exports
	);
	return { ...compiled.exports, calls, rows };
}

test("storage scopes reads and resets by tournament, and enforces the unique PUUID index before saving", async () => {
	const approval = { tournamentId: "cup", discordId: "player", puuid: "puuid", riotId: "Alt#EUW" };
	const h = harness([approval, { ...approval, tournamentId: "old", discordId: "old-player" }]);
	assert.deepEqual(
		[...(await h.readPlayingAccounts("cup"))].map(([id]) => id),
		["player"]
	);
	await h.writePlayingAccount(approval);
	await h.removePlayingAccount("cup", "player");
	assert.deepEqual(h.calls[0], ["find", "tournament_playing_accounts", { tournamentId: "cup" }]);
	assert.deepEqual(h.calls[1].slice(0, 3), ["index", "tournament_playing_accounts", { tournamentId: 1, puuid: 1 }]);
	assert.equal(h.calls[1][3].unique, true);
	assert.deepEqual(h.calls[2].slice(2), [{ _id: JSON.stringify(["cup", "player"]) }, approval, { upsert: true }]);
	assert.deepEqual(h.calls[3], ["delete", "tournament_playing_accounts", { tournamentId: "cup", discordId: "player" }]);
});

test("conflicts include linked mains, applications, other approvals and manual draft/published players", async () => {
	for (const name of ["verified_riot_accounts", "tournament_applications", "bot_state", "tournament_roster_drafts"]) {
		const h = harness();
		h.rows[name] = name.startsWith("bot") || name.includes("draft") ? { teams: { team: { players: [{ discordId: "other", puuid: "taken" }] } } } : { discordId: "other" };
		assert.equal(await h.playingAccountConflict("taken", "self", "cup"), true, name);
	}
	const h = harness([{ tournamentId: "cup", discordId: "other", puuid: "taken" }]);
	assert.equal(await h.playingAccountConflict("taken", "self", "cup"), true);
	assert.equal(await h.playingAccountConflict("taken", "other", "cup"), false);
	assert.equal(await h.playingAccountConflict("taken", "self", "new-cup"), false);
});
