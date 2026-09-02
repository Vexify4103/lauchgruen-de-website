import assert from "node:assert/strict";
import test from "node:test";
import { sendDiscordChannelMessage } from "../src/lib/discord.ts";
import { buildMatchReadyDiscordOperations } from "../src/lib/tournament-match-ready.ts";

function team(id, name, roleId, channelId) {
	return {
		id,
		name,
		seed: 1,
		record: "0-0",
		group: "A",
		captain: "Captain",
		discordRoleId: roleId,
		discordTextChannelId: channelId,
		accent: "from-lime-300",
		players: [],
	};
}

test("builds one private match-ready message per fully configured team", () => {
	const result = buildMatchReadyDiscordOperations({
		teamA: team("alpha", "Team Alpha", "role-a", "channel-a"),
		teamB: team("bravo", "Team Bravo", "role-b", "channel-b"),
		matchId: "swiss-r1-m1",
		round: "Swiss Runde 1",
		time: "Rolling Schedule",
		dedupeScope: "ultimate-bravery:2026-09-04",
		tournamentUrl: "https://tournament.example/",
	});

	assert.equal(result.missingTeamCount, 0);
	assert.equal(result.operations.length, 2);
	assert.deepEqual(
		result.operations.map((operation) => [operation.kind, operation.channelId, operation.roleId, operation.payload?.content]),
		[
			["channel-message", "channel-a", "role-a", "<@&role-a>"],
			["channel-message", "channel-b", "role-b", "<@&role-b>"],
		]
	);
	assert.notEqual(result.operations[0].dedupeKey, result.operations[1].dedupeKey);
	assert.equal(result.operations[0].payload?.components?.[0]?.components[0]?.url, "https://tournament.example/matches/swiss-r1-m1");
	assert.equal(result.operations[1].payload?.embeds?.[0]?.fields?.[1]?.value, "**Team Alpha**");
});

test("skips only the team whose Discord role or private channel is missing", () => {
	const result = buildMatchReadyDiscordOperations({
		teamA: team("alpha", "Team Alpha", "role-a", "channel-a"),
		teamB: team("bravo", "Team Bravo", "", "channel-b"),
		matchId: "swiss-r1-m1",
		round: "Swiss Runde 1",
		time: "Rolling Schedule",
		dedupeScope: "ultimate-bravery:2026-09-04",
	});

	assert.equal(result.missingTeamCount, 1);
	assert.equal(result.operations.length, 1);
	assert.equal(result.operations[0].channelId, "channel-a");
});

test("allows Discord to mention only the intended team role", { concurrency: false }, async () => {
	const previousToken = process.env.DISCORD_TOKEN;
	const previousGuildId = process.env.DISCORD_GUILD_ID;
	const previousFetch = globalThis.fetch;
	const requests = [];
	process.env.DISCORD_TOKEN = "test-token";
	process.env.DISCORD_GUILD_ID = "guild-a";
	globalThis.fetch = async (url, init) => {
		requests.push({ url, init });
		return new Response(null, { status: 204 });
	};

	try {
		const result = await sendDiscordChannelMessage({
			channelId: "channel-a",
			roleId: "role-a",
			payload: { content: "<@&role-a>" },
		});
		assert.deepEqual(result, { ok: true });
		assert.equal(requests.length, 2);
		assert.equal(requests[0].url, "https://discord.com/api/v10/guilds/guild-a/roles/role-a");
		assert.deepEqual(JSON.parse(requests[0].init.body), { mentionable: true });
		assert.equal(requests[1].url, "https://discord.com/api/v10/channels/channel-a/messages");
		const body = JSON.parse(requests[1].init.body);
		assert.deepEqual(body.allowed_mentions, { parse: [], roles: ["role-a"] });
	} finally {
		globalThis.fetch = previousFetch;
		if (previousToken === undefined) delete process.env.DISCORD_TOKEN;
		else process.env.DISCORD_TOKEN = previousToken;
		if (previousGuildId === undefined) delete process.env.DISCORD_GUILD_ID;
		else process.env.DISCORD_GUILD_ID = previousGuildId;
	}
});
