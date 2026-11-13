import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as broadcast from "../src/lib/tournament-broadcast.ts";
import * as demo from "../src/lib/tournament-broadcast-demo.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/api/obs/tournament-broadcast/route.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function harness() {
	const state = { calls: 0, drafts: [], sandbox: 0, fail: false, local: false, snapshot: { ...demo.demoBroadcastSnapshot(), source: "live", draft: null } };
	const modules = {
		"next/server": { NextResponse: Response },
		"@/lib/tournament-broadcast": broadcast,
		"@/lib/tournament-broadcast-demo": demo,
		"@/lib/tournament-broadcast-server": {
			loadTournamentBroadcast: async () => {
				state.calls++;
				if (state.fail) throw new Error("mongodb://SECRET");
				return state.snapshot;
			},
			loadBroadcastDraft: async (id) => {
				state.drafts.push(id);
				return demo.demoBroadcastSnapshot().draft;
			},
		},
		"@/lib/swiss-pot-sandbox": {
			isLocalSwissSandbox: () => state.local,
			getSwissPotSession: async () => {
				state.sandbox++;
				return { revision: 2, state: demo.demoBroadcastSnapshot(2).draw };
			},
		},
	};
	const compiled = { exports: {} };
	new Function("require", "exports", output)((name) => modules[name] ?? require(name), compiled.exports);
	return {
		state,
		handlers: compiled.exports,
		get: (query = "") => compiled.exports.GET(new Request(`https://example.test/api/obs/tournament-broadcast${query}`, { headers: { host: "example.test" } })),
	};
}

test("all broadcast scenes are publicly readable, no-store, and expose no mutation handlers", async () => {
	const h = harness();
	for (const scene of broadcast.BROADCAST_SCENES) {
		const response = await h.get(`?scene=${scene}`);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("cache-control"), "no-store");
	}
	for (const method of ["POST", "PATCH", "DELETE"]) assert.equal(h.handlers[method], undefined);
});

test("demo previews never access live tournament or sandbox storage", async () => {
	const h = harness();
	for (const scene of broadcast.BROADCAST_SCENES) assert.equal((await h.get(`?demo=1&scene=${scene}`)).status, 200);
	assert.equal(h.state.calls, 0);
	assert.equal(h.state.sandbox, 0);
	assert.deepEqual(h.state.drafts, []);
});

test("local draw mirroring is denied on production even with demo flags", async () => {
	const h = harness();
	assert.equal((await h.get("?source=sandbox&demo=1")).status, 404);
	assert.equal(h.state.sandbox, 0);
	assert.equal(h.state.calls, 0);
	h.state.local = true;
	const response = await h.get("?source=sandbox&scene=swiss-draw");
	assert.equal(response.status, 200);
	assert.equal((await response.json()).source, "sandbox");
	assert.equal(h.state.sandbox, 1);
	assert.equal(h.state.calls, 0);
});

test("team and match selectors reject missing or mismatched selections instead of silently showing other players", async () => {
	const h = harness();
	assert.equal((await h.get("?team=missing")).status, 404);
	assert.equal((await h.get("?team=fake-4&match=demo-match-1")).status, 404);
	const response = await h.get("?team=fake-4");
	assert.equal((await response.json()).selectedMatch.id, "demo-match-4");
	assert.equal((await h.get("?scene=bogus")).status, 400);
});

test("draft data is loaded only for the selected public match and respects the draft pause", async () => {
	const h = harness();
	await h.get("?scene=swiss-draw");
	assert.deepEqual(h.state.drafts, []);
	await h.get("?scene=champ-select&team=fake-4");
	assert.deepEqual(h.state.drafts, ["demo-match-4"]);
	h.state.snapshot = { ...h.state.snapshot, draftEnabled: false };
	const response = await h.get("?scene=champ-select");
	assert.equal((await response.json()).draft, null);
	assert.equal(h.state.drafts.length, 1);
});

test("the existing overlay ID and early storage-key links resolve the same renamed team", async () => {
	const h = harness();
	const original = h.state.snapshot.teams[3];
	const renamed = { ...original, id: "gank-mich-doch", key: "die wegwerf-mains", name: "Gank mich doch" };
	h.state.snapshot.teams[3] = renamed;
	h.state.snapshot.matches[3] = { ...h.state.snapshot.matches[3], teamA: renamed };
	for (const selector of [renamed.id, renamed.key]) {
		const response = await h.get(`?team=${encodeURIComponent(selector)}`);
		assert.equal(response.status, 200);
		const payload = await response.json();
		assert.equal(payload.selectedTeam.id, "gank-mich-doch");
		assert.equal(payload.selectedMatch.id, "demo-match-4");
	}
});

test("backend failures return a retryable sanitized error, never database details", async () => {
	const h = harness();
	h.state.fail = true;
	const response = await h.get();
	assert.equal(response.status, 503);
	assert.doesNotMatch(await response.text(), /SECRET|mongodb/);
});
