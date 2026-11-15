import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as api from "../src/lib/partner-api.ts";

const require = createRequire(import.meta.url);

test("keys are random, prefixed, and only their hash is kept", () => {
	const a = api.generatePartnerApiKey();
	const b = api.generatePartnerApiKey();
	assert.notEqual(a.key, b.key);
	assert.ok(a.key.startsWith("lgk_"));
	assert.ok(a.key.startsWith(a.prefix));
	assert.equal(a.keyHash, api.hashPartnerApiKey(a.key));
	assert.ok(!a.keyHash.includes(a.key.slice(4)));
	assert.equal(api.readBearerKey(`Bearer ${a.key}`), a.key);
	assert.equal(api.readBearerKey(`bearer ${a.key}`), a.key);
	assert.equal(api.readBearerKey(a.key), null);
	assert.equal(api.readBearerKey("Bearer something-else-entirely"), null);
	assert.equal(api.readBearerKey(null), null);
});

test("the public entry never carries the internal reason or creator", () => {
	const entry = {
		id: "1|x",
		discordId: "123456789012345678",
		riotId: "toxic#euw",
		reason: "intern: hat im Voice beleidigt",
		createdBy: "admin",
		createdAt: "2026-11-15T00:00:00.000Z",
		shared: true,
		publicReason: "Unsportlich",
	};
	const shown = api.toPublicBlacklistEntry(entry);
	assert.deepEqual(Object.keys(shown).sort(), ["discordId", "reason", "riotId", "since"]);
	assert.equal(shown.reason, "Unsportlich");
	assert.ok(!JSON.stringify(shown).includes("intern"));
	assert.equal(api.toPublicBlacklistEntry({ ...entry, publicReason: undefined }).reason, "Gesperrt");
});

test("report input is validated and normalized like admin input", () => {
	const ok = api.partnerReportSchema.safeParse({ riotId: " Toxic#EUW ", reason: "Mehrfach nicht erschienen" });
	assert.ok(ok.success);
	assert.equal(ok.data.riotId, "toxic#euw");
	assert.equal(api.partnerReportSchema.safeParse({ reason: "Mehrfach nicht erschienen" }).success, false);
	assert.equal(api.partnerReportSchema.safeParse({ discordId: "abc", reason: "Mehrfach nicht erschienen" }).success, false);
	assert.equal(api.partnerReportSchema.safeParse({ riotId: "NoTag", reason: "Mehrfach nicht erschienen" }).success, false);
	assert.equal(api.partnerReportSchema.safeParse({ riotId: "Toxic#EUW", reason: "kurz" }).success, false);
	assert.equal(api.partnerReportSchema.safeParse({ riotId: "Toxic#EUW", reason: "Mehrfach nicht erschienen", status: "accepted" }).success, false);
});

test("rate limiter blocks after the limit and resets with the window", () => {
	const hit = api.createRateLimiter(2, 1000);
	assert.equal(hit("k", 0), 0);
	assert.equal(hit("k", 10), 0);
	assert.ok(hit("k", 20) > 0);
	assert.equal(hit("other", 20), 0);
	assert.equal(hit("k", 1000), 0);
});

test("accepting a report merges into an existing ban instead of replacing it", () => {
	const existing = { id: "1|-", discordId: "123456789012345678", reason: "Intern: Cheating", createdAt: "2026-01-01T00:00:00.000Z", shared: true, publicReason: "Cheating" };
	const merged = api.mergeReportIntoEntry(existing, { riotId: "cheat#euw", partnerName: "Creator Cup" });
	assert.equal(merged.id, existing.id);
	assert.equal(merged.shared, true);
	assert.equal(merged.publicReason, "Cheating");
	assert.equal(merged.riotId, "cheat#euw");
	assert.ok(merged.reason.startsWith("Intern: Cheating"));
	assert.equal(api.mergeReportIntoEntry(merged, { partnerName: "Creator Cup" }).reason, merged.reason);
});

function loadRoute(path, modules) {
	const source = readFileSync(new URL(path, import.meta.url), "utf8");
	const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
	const compiled = { exports: {} };
	new Function("require", "exports", output)((name) => modules[name] ?? require(name), compiled.exports);
	return compiled.exports;
}

function partnerModules(state) {
	const json = (body, init = {}) => Response.json(body, { status: init.status ?? 200, headers: init.headers });
	return {
		"@/lib/partner-api": api,
		"@/lib/partner-api-auth": {
			partnerJson: json,
			partnerError: (status, code, message) => json({ error: { code, message } }, { status }),
			authenticatePartner: async (request) =>
				request.headers.get("authorization") === "Bearer lgk_valid_key_for_tests"
					? { partner: { id: "p1", partnerName: "Creator Cup" } }
					: { response: json({ error: { code: "unauthorized" } }, { status: 401 }) },
		},
		"@/lib/tournament-storage": {
			listSharedBlacklistEntries: async () => state.entries.filter((entry) => entry.shared),
			findBlacklistMatch: async (input) => {
				state.lookups.push(input);
				return state.entries.find((entry) => (!input.sharedOnly || entry.shared) && entry.riotId === input.riotId) ?? null;
			},
		},
	};
}

const entries = [
	{ id: "a", riotId: "shared#euw", reason: "intern A", createdAt: "2026-11-01T00:00:00.000Z", shared: true, publicReason: "No-show" },
	{ id: "b", riotId: "private#euw", reason: "intern B", createdAt: "2026-11-02T00:00:00.000Z" },
];
const authed = (url) => new Request(url, { headers: { authorization: "Bearer lgk_valid_key_for_tests" } });

test("GET /api/v1/blacklist needs a key and lists only shared entries in the public shape", async () => {
	const state = { entries, lookups: [] };
	const route = loadRoute("../src/app/api/v1/blacklist/route.ts", partnerModules(state));
	assert.equal((await route.GET(new Request("https://t.example/api/v1/blacklist"))).status, 401);
	const body = await (await route.GET(authed("https://t.example/api/v1/blacklist"))).json();
	assert.equal(body.count, 1);
	assert.deepEqual(body.entries, [{ riotId: "shared#euw", discordId: null, reason: "No-show", since: "2026-11-01T00:00:00.000Z" }]);
	assert.ok(!JSON.stringify(body).includes("intern"));
});

test("GET /api/v1/blacklist/check cannot reveal private bans", async () => {
	const state = { entries, lookups: [] };
	const route = loadRoute("../src/app/api/v1/blacklist/check/route.ts", partnerModules(state));
	const priv = await (await route.GET(authed("https://t.example/api/v1/blacklist/check?riotId=Private%23EUW"))).json();
	assert.equal(priv.banned, false);
	assert.equal(state.lookups[0].sharedOnly, true);
	assert.equal(state.lookups[0].riotId, "private#euw");
	const shared = await (await route.GET(authed("https://t.example/api/v1/blacklist/check?riotId=shared%23EUW"))).json();
	assert.equal(shared.banned, true);
	assert.equal(shared.entry.reason, "No-show");
	assert.equal((await route.GET(authed("https://t.example/api/v1/blacklist/check"))).status, 400);
});
