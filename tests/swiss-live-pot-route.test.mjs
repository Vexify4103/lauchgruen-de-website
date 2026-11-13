import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/api/tournament/swiss/route.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function harness() {
	const teams = Array.from({ length: 8 }, (_, index) => ({ key: `team-${index}`, name: `Team ${index}` }));
	const state = {
		actor: "owner",
		calls: [],
		audit: [],
		completeSeeds: true,
		failure: null,
		stage: { tournamentId: "cup", rounds: [], updatedAt: new Date(0).toISOString() },
		config: { dayOneFormat: "swiss", teamCount: 8, advanceTeamCount: 8, swissRounds: 4, playInTeamCount: 0, swissRoundOneSeeding: "random", bestOf: { dayOne: 1 } },
	};
	class Conflict extends Error {
		code = "draw-conflict";
	}
	class Cross extends Error {
		code = "cross-record-required";
		round = 4;
		crossRecordPairs = [];
	}
	class Rematch extends Error {
		code = "rematch-required";
		round = 4;
		rematchPairs = [{ teamA: "A", teamB: "B", record: "2-1" }];
	}
	const swiss = {
		SwissDrawConflict: Conflict,
		SwissCrossRecordError: Cross,
		SwissPlacementRematchError: Rematch,
		getSwissStageState: async () => state.stage,
		listSwissAudit: async () => [],
		listSwissTeams: async () => teams,
		drawNextSwissTeam: async (options) => {
			state.calls.push({ kind: "team", options });
			if (state.failure) throw state.failure;
			return { state: state.stage, drawn: { teamKey: teams[0].key, message: "Ein Team gezogen." }, pairings: [] };
		},
		drawNextSwissMatchup: async (options) => {
			state.calls.push({ kind: "legacy", options });
			return { state: state.stage, round: { round: 1, complete: false }, pairing: { id: "legacy", teamAName: "A", teamBName: "B" } };
		},
		resetSwissStage: async (...args) => {
			state.calls.push({ kind: "reset", args });
			if (state.failure) throw state.failure;
		},
		resetLatestSwissRound: async (...args) => {
			state.calls.push({ kind: "redraw", args });
			return state.stage;
		},
		setSwissPairingWinner: async () => state.stage,
	};
	const modules = {
		"next/server": { NextResponse: Response },
		"@/lib/auth": { auth: async () => (state.actor ? { user: { discordId: state.actor, discordHandle: "Organizer" } } : null) },
		"@/lib/tournament-swiss": swiss,
		"@/lib/tournament-swiss-test": { SWISS_TEST_ID: "isolated-test", buildSwissTestTeams: () => teams },
		"@/lib/tournament-settings": { getTournamentSettings: async () => ({ activeTournament: { id: "cup" }, structure: state.config }) },
		"@/lib/tournament-audit": { writeAuditLog: async (entry) => state.audit.push(entry) },
		"@/lib/tournament-storage": { TOURNAMENT_OWNER_DISCORD_IDS: new Set(["owner"]) },
		"@/lib/tournament-runtime": {
			PLAY_IN_GROUP: "play-in",
			getTournamentContext: async () => ({
				groupSetupComplete: state.completeSeeds,
				teams: teams.map((team, index) => ({ storageKey: team.key, name: team.name, seed: index + 1, group: "main" })),
			}),
		},
		"@/lib/tournament-structure": { mainEventTeamCount: (config) => config.teamCount },
	};
	const compiled = { exports: {} };
	new Function("require", "exports", output)((name) => modules[name] ?? require(name), compiled.exports);
	const post = (body = {}) =>
		compiled.exports.POST(
			new Request("https://example.test/api/tournament/swiss", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "draw", expectedUpdatedAt: state.stage.updatedAt, ...body }),
			})
		);
	return { state, post, handlers: compiled.exports, Conflict, Rematch, teams };
}

test("all live Swiss mutations and test access remain owner-only", async () => {
	for (const actor of [null, "participant"]) {
		const h = harness();
		h.state.actor = actor;
		for (const action of ["draw", "reset", "redraw", "result"]) assert.equal((await h.post({ action })).status, 403);
		assert.equal((await h.handlers.GET(new Request("https://example.test/api/tournament/swiss?test=1"))).status, 403);
		assert.deepEqual(h.state.calls, []);
	}
});

test("real eight-team draws use the team service, optimistic version and live match persistence", async () => {
	const h = harness();
	assert.equal((await h.post()).status, 200);
	assert.equal(h.state.calls.length, 1);
	const { kind, options } = h.state.calls[0];
	assert.equal(kind, "team");
	assert.equal(options.persistMatches, true);
	assert.equal(options.syncMatchResults, true);
	assert.equal(options.tournamentId, "cup");
	assert.equal(options.expectedUpdatedAt, h.state.stage.updatedAt);
	assert.deepEqual(options.teams, h.teams);
	assert.equal(h.state.audit[0].action, "swiss.team_drawn");
	assert.equal((await h.post({ expectedUpdatedAt: undefined })).status, 409);
	assert.equal(h.state.calls.length, 1);
});

test("existing partial legacy draws and other Swiss formats retain their compatible service", async () => {
	for (const mode of ["legacy", "elimination", "three-rounds"]) {
		const h = harness();
		if (mode === "legacy") h.state.stage.rounds = [{ round: 1, complete: false, pairings: [] }];
		if (mode === "elimination") h.state.config.dayOneFormat = "swiss-elimination";
		if (mode === "three-rounds") h.state.config.swissRounds = 3;
		assert.equal((await h.post()).status, 200);
		assert.equal(h.state.calls[0].kind, "legacy");
	}
});

test("seeded openings still require the published seeds and forward the exact order", async () => {
	const h = harness();
	h.state.config.swissRoundOneSeeding = "seeded";
	h.state.completeSeeds = false;
	assert.equal((await h.post()).status, 409);
	assert.equal(h.state.calls.length, 0);
	h.state.completeSeeds = true;
	assert.equal((await h.post()).status, 200);
	assert.deepEqual(
		h.state.calls[0].options.roundOneOrder,
		h.teams.map((team) => team.key)
	);
});

test("test team draws cannot persist live matches or write the main audit", async () => {
	const h = harness();
	assert.equal((await h.post({ test: true })).status, 200);
	assert.equal(h.state.calls[0].options.tournamentId, "isolated-test");
	assert.equal(h.state.calls[0].options.persistMatches, false);
	assert.equal(h.state.calls[0].options.syncMatchResults, false);
	assert.equal(h.state.audit.length, 0);
});

test("stale draws return conflict state and rematches require a fresh explicit request", async () => {
	const h = harness();
	h.state.failure = new h.Conflict("Stale");
	let response = await h.post();
	assert.equal(response.status, 409);
	assert.equal((await response.json()).code, "draw-conflict");
	h.state.failure = new h.Rematch("Approval needed");
	response = await h.post();
	assert.equal(response.status, 409);
	assert.equal((await response.json()).code, "rematch-required");
	assert.equal(h.state.calls.at(-1).options.allowPlacementRematch, false);
	h.state.failure = null;
	assert.equal((await h.post({ allowRematch: true })).status, 200);
	assert.equal(h.state.calls.at(-1).options.allowPlacementRematch, true);
});

test("reset confirmations and their captured state version reach the safe reset services", async () => {
	const h = harness();
	assert.equal((await h.post({ action: "reset" })).status, 400);
	assert.equal((await h.post({ action: "reset", confirmation: "SWISS ZURÜCKSETZEN" })).status, 200);
	assert.deepEqual(h.state.calls[0].args, ["cup", "swiss", h.state.stage.updatedAt]);
	assert.equal((await h.post({ action: "redraw", confirmation: "RUNDE NEU AUSLOSEN" })).status, 200);
	assert.deepEqual(h.state.calls[1].args, ["cup", h.state.stage.updatedAt]);
});
