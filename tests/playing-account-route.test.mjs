import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as identity from "../src/lib/tournament-playing-account.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/api/tournament/playing-account/route.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness() {
	const state = { actor: "admin", duplicate: false, blacklist: false, stale: false, riotFailure: false, claims: 0, lookups: 0, writes: [], removed: [], audit: [] };
	const app = { id: "app", discordId: "kami", displayName: "kami", riotId: "Kami#MUNDO", riotPuuid: "main", currentRankAuto: "DIAMOND I (4 LP)" };
	class RiotError extends Error {
		status = 503;
	}
	const modules = {
		"next/server": { NextResponse: Response },
		"@/lib/auth": { auth: async () => ({ user: { discordId: state.actor } }) },
		"@/lib/admin-version": {
			getAdminVersion: async () => 0,
			claimAdminVersion: async () => {
				state.claims++;
				return state.stale ? { ok: false, conflict: { code: "ADMIN_VERSION_CONFLICT" } } : { ok: true, version: 1 };
			},
		},
		"@/lib/riot": {
			RiotApiError: RiotError,
			getAccountByRiotId: async () => {
				state.lookups++;
				if (state.riotFailure) throw new RiotError();
				return { gameName: "Pavadon", tagLine: "EUW", puuid: "alternate" };
			},
			getSummonerByPuuid: async () => ({ summonerLevel: 50 }),
		},
		"@/lib/tournament-storage": {
			TOURNAMENT_OWNER_DISCORD_IDS: new Set(["admin"]),
			findApplication: async (id) => (id === "app" ? app : null),
			findBlacklistMatch: async () => state.blacklist,
		},
		"@/lib/tournament-settings": { getTournamentSettings: async () => ({ activeTournament: { id: "cup", name: "Cup" } }) },
		"@/lib/tournament-playing-account": identity,
		"@/lib/tournament-playing-account-store": {
			readPlayingAccounts: async () => new Map(),
			playingAccountConflict: async () => state.duplicate,
			writePlayingAccount: async (a) => state.writes.push(a),
			removePlayingAccount: async (...args) => state.removed.push(args),
		},
		"@/lib/tournament-audit": { writeAuditLog: async (a) => state.audit.push(a) },
	};
	const compiled = { exports: {} };
	new Function("require", "exports", output)((name) => modules[name] ?? require(name), compiled.exports);
	const input = { applicationId: "app", tournamentId: "cup", expectedVersion: 0, riotId: "Pavadon#EUW", reason: "Main nicht verfügbar", confirmed: true };
	const request = (body = input) =>
		new Request("https://tournament.example/api/tournament/playing-account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
	return { state, app, handlers: compiled.exports, input, request };
}

test("only owners may read, approve or reset playing accounts", async () => {
	const h = harness();
	h.state.actor = "participant";
	for (const method of ["GET", "POST", "DELETE"]) assert.equal((await h.handlers[method](h.request())).status, 403);
	assert.equal(h.state.lookups, 0);
	assert.equal(h.state.claims, 0);
	assert.equal(h.state.writes.length, 0);
});

test("approval resolves Riot's PUUID, preserves the main rank/account and writes an audit entry", async () => {
	const h = harness();
	const before = structuredClone(h.app);
	assert.equal((await h.handlers.POST(h.request())).status, 200);
	assert.deepEqual(h.app, before);
	assert.equal(h.state.writes[0].puuid, "alternate");
	assert.equal(h.state.writes[0].scoutRiotId, "Kami#MUNDO");
	assert.equal(h.state.writes[0].approvedBy, "admin");
	assert.equal(h.state.audit[0].action, "playing-account.approve");
	assert.equal(h.state.audit[0].metadata.balancingRankUnchanged, true);
});

test("rejects wrong tournament, duplicate accounts, blacklist and failed Riot lookups without writes", async () => {
	for (const [flag, expected] of [
		["duplicate", 409],
		["blacklist", 403],
		["riotFailure", 502],
	]) {
		const h = harness();
		h.state[flag] = true;
		assert.equal((await h.handlers.POST(h.request())).status, expected);
		assert.equal(h.state.claims, 0);
		assert.equal(h.state.writes.length, 0);
	}
	const h = harness();
	assert.equal((await h.handlers.POST(h.request({ ...h.input, tournamentId: "old-cup" }))).status, 409);
	assert.equal(h.state.lookups, 0);
});

test("stale admins cannot overwrite approvals and unconfirmed inputs never reach Riot", async () => {
	const h = harness();
	h.state.stale = true;
	assert.equal((await h.handlers.POST(h.request())).status, 409);
	assert.equal(h.state.writes.length, 0);
	assert.equal(h.state.audit.length, 0);
	const h2 = harness();
	assert.equal((await h2.handlers.POST(h2.request({ ...h2.input, confirmed: false }))).status, 400);
	assert.equal(h2.state.lookups, 0);
});

test("reset removes only this tournament's approval, without re-linking or Riot requests", async () => {
	const h = harness();
	const response = await h.handlers.DELETE(h.request({ applicationId: "app", tournamentId: "cup", expectedVersion: 0 }));
	assert.equal(response.status, 200);
	assert.deepEqual(h.state.removed, [["cup", "kami"]]);
	assert.equal(h.state.lookups, 0);
	assert.equal(h.state.audit[0].action, "playing-account.reset");
	assert.equal((await response.json()).approval, null);
});
