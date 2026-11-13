import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/api/tournament/discord-control/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function fixture(discordId = "owner") {
	const jobs = [];
	const mocks = {
		"next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
		"@/lib/auth": { auth: async () => ({ user: { discordId } }) },
		"@/lib/discord": { listDiscordGuildMembers: async () => ({ ok: true, members: [] }) },
		"@/lib/discord-job-queue": {
			enqueueDiscordJob: async (job) => {
				jobs.push(job);
				return { id: "job" };
			},
		},
		"@/lib/mongo": {
			getDb: async () => ({
				collection: () => ({
					findOne: async () => ({ teams: { alpha: { name: "Alpha", roleId: "alpha-role", textChannelId: "alpha-text", voiceChannelId: "alpha-voice", players: [] } } }),
				}),
			}),
		},
		"@/lib/tournament-audit": { writeAuditLog: async () => {} },
		"@/lib/tournament-settings": { getTournamentSettings: async () => ({ structure: {} }) },
		"@/lib/tournament-storage": { TOURNAMENT_OWNER_DISCORD_IDS: new Set(["owner"]) },
	};
	const exports = {};
	new Function("require", "exports", "process", compiled)((id) => mocks[id] ?? require(id), exports, { env: { DISCORD_TOURNAMENT_ROLE_ID: "tournament-role" } });
	return { api: exports, jobs };
}

test("admin repair queues team channels even without staff or category configuration", async () => {
	const { api, jobs } = fixture();
	const response = await api.POST(new Request("https://example.test/api/tournament/discord-control", { method: "POST", body: JSON.stringify({ action: "repair" }) }));
	assert.equal(response.status, 200);
	assert.equal(jobs.length, 1);
	assert.deepEqual(
		jobs[0].operations.map(({ kind, teamKey, textChannelId, voiceChannelId }) => ({ kind, teamKey, textChannelId, voiceChannelId })),
		[{ kind: "team-channels-repair", teamKey: "alpha", textChannelId: "alpha-text", voiceChannelId: "alpha-voice" }]
	);
});

test("non-owners cannot queue channel permission repairs", async () => {
	const { api, jobs } = fixture("participant");
	const response = await api.POST(new Request("https://example.test/api/tournament/discord-control", { method: "POST", body: JSON.stringify({ action: "repair" }) }));
	assert.equal(response.status, 403);
	assert.equal(jobs.length, 0);
});
