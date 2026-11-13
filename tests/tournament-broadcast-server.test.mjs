import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as publicData from "../src/lib/tournament-broadcast.ts";
import * as potAdapter from "../src/lib/swiss-live-pot.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/lib/tournament-broadcast-server.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function harness() {
	const state = {
		published: true,
		loads: 0,
		drafts: 0,
		settings: 0,
		gate: null,
		control: {
			teams: [
				{
					id: "slug",
					storageKey: "stable",
					name: "Public team",
					seed: 1,
					discordRoleId: "secret-role",
					captainRef: { discordId: "private-captain" },
					players: [{ puuid: "private-player" }],
				},
			],
			matches: [],
			stages: null,
		},
	};
	const modules = {
		"@/lib/tournament-settings": {
			getTournamentSettings: async () => {
				state.settings++;
				return { activeTournament: { id: "cup", name: "Cup", mode: "live" }, draftEnabled: true };
			},
		},
		"@/lib/roster": { getRosterPublicationStatus: async () => ({ published: state.published }) },
		"@/lib/match-control": {
			getMatchControlContext: async () => {
				state.loads++;
				if (state.gate) await state.gate;
				return state.control;
			},
		},
		"@/lib/tournament-draft": {
			getDraftState: async () => {
				state.drafts++;
				return { actions: [], readyBy: {}, pendingSelection: { champion: "secret-hover" } };
			},
		},
		"@/lib/champion-pools": { getAllChampions: async () => [] },
		"@/lib/swiss-live-pot": potAdapter,
		"@/lib/tournament-broadcast": publicData,
	};
	const compiled = { exports: {} };
	new Function("require", "exports", output)((name) => modules[name] ?? require(name), compiled.exports);
	return { state, handlers: compiled.exports };
}

test("unpublished broadcasts never load roster, match control or drafts", async () => {
	const h = harness();
	h.state.published = false;
	const payload = await h.handlers.loadTournamentBroadcast();
	assert.equal(payload.published, false);
	assert.deepEqual(payload.teams, []);
	assert.deepEqual(payload.matches, []);
	assert.equal(h.state.loads, 0);
	assert.equal(h.state.drafts, 0);
});

test("public server payload strips player, captain and Discord metadata and keeps stable team keys", async () => {
	const h = harness();
	const payload = await h.handlers.loadTournamentBroadcast();
	assert.equal(payload.teams[0].key, "stable");
	assert.equal(payload.teams[0].id, "slug");
	assert.doesNotMatch(JSON.stringify(payload), /secret-role|private-captain|private-player|puuid|captainRef|discordRoleId/);
});

test("many browser sources coalesce even when the backend takes longer than the normal cache TTL", async () => {
	const h = harness();
	let release;
	h.state.gate = new Promise((resolve) => {
		release = resolve;
	});
	const now = Date.now;
	let clock = now();
	Date.now = () => clock;
	try {
		const first = h.handlers.loadTournamentBroadcast();
		await Promise.resolve();
		await Promise.resolve();
		clock += 10000;
		const second = h.handlers.loadTournamentBroadcast();
		assert.equal(second, first);
		release();
		await first;
		assert.equal(h.state.loads, 1);
		assert.equal(h.state.settings, 1);
		await h.handlers.loadTournamentBroadcast();
		assert.equal(h.state.loads, 1);
		clock += 2000;
		await h.handlers.loadTournamentBroadcast();
		assert.equal(h.state.loads, 2);
	} finally {
		Date.now = now;
		release();
	}
});

test("draft caches coalesce viewers and never forward secret hovers", async () => {
	const h = harness();
	const values = await Promise.all(Array.from({ length: 12 }, () => h.handlers.loadBroadcastDraft("public-match")));
	assert.equal(h.state.drafts, 1);
	assert.doesNotMatch(JSON.stringify(values), /secret-hover|pendingSelection/);
});

test("completed placement Swiss shows the official seed order, not a misleading sort by total wins", async () => {
	const h = harness();
	h.state.control.stages = {
		champion: null,
		dayOne: {
			complete: true,
			seeds: { 1: "Two wins", 2: "Three wins" },
			swiss: null,
			groups: [],
			swissStandings: {
				rows: [
					{ name: "Three wins", rank: 1, wins: 3, losses: 1 },
					{ name: "Two wins", rank: 2, wins: 2, losses: 1 },
				],
			},
		},
	};
	const payload = await h.handlers.loadTournamentBroadcast();
	assert.equal(payload.standingsFinal, true);
	assert.deepEqual(
		payload.standings.map((row) => [row.rank, row.name, row.wins]),
		[
			[1, "Two wins", 2],
			[2, "Three wins", 3],
		]
	);
});
