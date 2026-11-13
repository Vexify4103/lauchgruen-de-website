import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/discord-team-resources.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const PIN = BigInt(1) << BigInt(51);
const TEXT = BigInt(1024 | 2048 | 65536) | PIN;
const VOICE = BigInt(1024 | 1048576 | 2097152);
const BROAD_PERMISSIONS = BigInt(8 | 16 | 8192);

function fixture({ team = { name: "Alpha", roleId: "role-alpha", textChannelId: "text-alpha", voiceChannelId: "voice-alpha" }, env = {}, channels = {} } = {}) {
	const calls = [];
	const db = {
		collection: () => ({
			findOne: async () => ({ teams: team ? { alpha: team } : {} }),
			updateOne: async (_filter, update) => {
				for (const [key, value] of Object.entries(update.$set)) team[key.split(".").at(-1)] = value;
			},
		}),
	};
	const fetch = async (url, init) => {
		const path = url.replace("https://discord.com/api/v10", "");
		const body = init.body ? JSON.parse(init.body) : undefined;
		calls.push({ path, method: init.method, body });
		if (init.method === "GET") {
			const channel = channels[path.split("/").at(-1)];
			assert.ok(channel, `Unexpected channel read: ${path}`);
			return Response.json(channel);
		}
		if (init.method === "POST" && path.endsWith("/channels")) return Response.json({ id: body.type === 0 ? "text-alpha" : "voice-alpha" });
		if (init.method === "PUT") {
			const [, , channelId, , roleId] = path.split("/");
			const entries = channels[channelId].permission_overwrites;
			const old = entries.find((entry) => entry.id === roleId);
			if (old) Object.assign(old, body);
			else entries.push({ id: roleId, ...body });
		}
		return new Response(null, { status: 204 });
	};
	const exports = {};
	new Function("require", "exports", "fetch", "process", "setTimeout", compiled)(
		(id) => {
			assert.equal(id, "@/lib/mongo");
			return { getDb: async () => db };
		},
		exports,
		fetch,
		{ env: { DISCORD_TOKEN: "test-only", DISCORD_GUILD_ID: "guild", ...env } },
		(callback) => queueMicrotask(callback)
	);
	return { api: exports, calls };
}

function textChannel(overwrites = [], extras = {}) {
	return { guild_id: "guild", type: 0, permission_overwrites: overwrites, ...extras };
}

test("new team text channels allow pinning, not message deletion or server management", async () => {
	const { api, calls } = fixture({ team: { name: "Alpha", roleId: "role-alpha" }, env: { TEAM_VOICE_CATEGORY_ID: "category" } });
	assert.deepEqual(await api.provisionDiscordTeamResources("alpha", "Alpha"), { ok: true });
	const text = calls.find((call) => call.body?.type === 0).body;
	const voice = calls.find((call) => call.body?.type === 2).body;
	assert.equal(text.permission_overwrites.find((entry) => entry.id === "role-alpha").allow, String(TEXT));
	assert.equal(BigInt(text.permission_overwrites.find((entry) => entry.id === "role-alpha").allow) & BROAD_PERMISSIONS, BigInt(0));
	assert.equal(voice.permission_overwrites.find((entry) => entry.id === "role-alpha").allow, String(VOICE));
	assert.deepEqual(
		text.permission_overwrites.find((entry) => entry.id === "guild"),
		{ id: "guild", type: 0, deny: "1024" }
	);
});

test("existing channels gain pinning without a staff role, preserving other bits and overwrites", async () => {
	const customAllow = BigInt(1) << BigInt(50);
	const customDeny = BigInt(1) << BigInt(40);
	const otherRole = { id: "role-bravo", type: 0, allow: "0", deny: "1024" };
	const channel = textChannel([
		{ id: "role-alpha", type: 0, allow: String(customAllow), deny: String(customDeny | PIN) },
		{ id: "guild", type: 0, allow: "0", deny: "1024" },
		{ ...otherRole },
	]);
	const { api, calls } = fixture({ channels: { "text-alpha": channel } });
	assert.deepEqual(await api.repairDiscordTeamChannels({ teamKey: "alpha", textChannelId: "text-alpha", voiceChannelId: "voice-alpha" }), { ok: true });
	const writes = calls.filter((call) => call.method !== "GET");
	assert.deepEqual(writes, [
		{ path: "/channels/text-alpha/permissions/role-alpha", method: "PUT", body: { type: 0, allow: String(customAllow | TEXT), deny: String(customDeny) } },
	]);
	assert.deepEqual(
		channel.permission_overwrites.find((entry) => entry.id === "role-bravo"),
		otherRole
	);
	assert.equal(BigInt(writes[0].body.allow) & BROAD_PERMISSIONS, BigInt(0));
	assert.deepEqual(await api.repairDiscordTeamChannels({ teamKey: "alpha" }), { ok: true });
	assert.equal(calls.filter((call) => call.method === "PUT").length, 1, "repeating repair does not rewrite unchanged permissions");
});

test("missing team overwrite is created only in that team's text channel", async () => {
	const { api, calls } = fixture({ channels: { "text-alpha": textChannel() } });
	assert.deepEqual(await api.repairDiscordTeamChannels({ teamKey: "alpha" }), { ok: true });
	assert.deepEqual(
		calls.filter((call) => call.method === "PUT"),
		[{ path: "/channels/text-alpha/permissions/role-alpha", method: "PUT", body: { type: 0, allow: String(TEXT), deny: "0" } }]
	);
});

test("staff repair still covers both channels and keeps pinning out of voice permissions", async () => {
	const { api, calls } = fixture({
		env: { DISCORD_STAFF_ROLE_ID: "staff", TEAM_TEXT_CATEGORY_ID: "text-category" },
		channels: { "text-alpha": textChannel(), "voice-alpha": textChannel([], { type: 2 }) },
	});
	assert.deepEqual(await api.repairDiscordTeamChannels({ teamKey: "alpha" }), { ok: true });
	assert.equal(calls.find((call) => call.path === "/channels/text-alpha/permissions/staff").body.allow, String(TEXT));
	assert.equal(calls.find((call) => call.path === "/channels/voice-alpha/permissions/staff").body.allow, String(VOICE));
	assert.deepEqual(calls.find((call) => call.method === "PATCH").body, { parent_id: "text-category", lock_permissions: false });
});

test("deleted teams and stale queued channel IDs are refused before Discord writes", async () => {
	for (const options of [{ team: null }, {}]) {
		const { api, calls } = fixture(options);
		assert.equal((await api.repairDiscordTeamChannels({ teamKey: "alpha", textChannelId: "previous-channel" })).ok, false);
		assert.equal(calls.length, 0);
	}
});

test("repair uses the current team role instead of a queued role", async () => {
	const { api, calls } = fixture({ team: { name: "Alpha", roleId: "replacement-role", textChannelId: "text-alpha" }, channels: { "text-alpha": textChannel() } });
	assert.deepEqual(await api.repairDiscordTeamChannels({ teamKey: "alpha", roleId: "previous-role" }), { ok: true });
	assert.equal(calls.find((call) => call.method === "PUT").path, "/channels/text-alpha/permissions/replacement-role");
});

test("repair refuses @everyone as the team or staff role", async () => {
	for (const options of [{ team: { name: "Alpha", roleId: "guild", textChannelId: "text-alpha" } }, { env: { DISCORD_STAFF_ROLE_ID: "guild" } }]) {
		const { api, calls } = fixture(options);
		assert.equal((await api.repairDiscordTeamChannels({ teamKey: "alpha" })).ok, false);
		assert.equal(calls.length, 0);
	}
});

test("repair refuses channels from another guild or the wrong channel type", async () => {
	for (const extras of [{ guild_id: "another-guild" }, { type: 2 }]) {
		const { api, calls } = fixture({ channels: { "text-alpha": textChannel([], extras) } });
		assert.equal((await api.repairDiscordTeamChannels({ teamKey: "alpha" })).ok, false);
		assert.equal(calls.filter((call) => call.method !== "GET").length, 0);
	}
});
