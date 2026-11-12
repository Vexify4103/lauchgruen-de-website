import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { withPlayingAccount } from "../src/lib/tournament-playing-account.ts";

const require = createRequire(import.meta.url);
const approval = { tournamentId: "cup", discordId: "kami", riotId: "Pavadon#EUW", puuid: "playing-puuid", scoutRiotId: "Kami#MUNDO" };
const accounts = new Map([["kami", approval]]);

function compile(file, exports, mocks) {
	const source = readFileSync(new URL(file, import.meta.url), "utf8");
	const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
	const compiled = { exports: {} };
	new Function("require", "exports", `${output}\nObject.assign(exports, {${exports}});`)(
		(name) => mocks[name] ?? (name.startsWith("@/") || name === "next/server" ? {} : require(name)),
		compiled.exports
	);
	return compiled.exports;
}

test("public roster keeps the familiar name while playing account, scouting URLs and captain access remain distinct", () => {
	const { buildPlayer, resolveCaptainRef } = compile("../src/lib/tournament-runtime.ts", "buildPlayer, resolveCaptainRef", {});
	const main = { discordId: "kami", riotId: "Kami#MUNDO", puuid: "main-puuid", role: "Top", verificationStatus: "verified" };
	const playing = withPlayingAccount(main, accounts);
	const publicPlayer = buildPlayer(playing);
	assert.equal(publicPlayer.name, "Kami");
	assert.equal(publicPlayer.riotId, "Pavadon#EUW");
	assert.ok(publicPlayer.opggUrl.endsWith("Kami-MUNDO"));
	assert.ok(publicPlayer.dpmUrl.endsWith("Kami-MUNDO"));
	assert.equal(publicPlayer.playingAccountApproved, true);
	assert.equal(publicPlayer.verified, false);
	const captain = { discordId: "kami", riotId: "Kami#MUNDO", puuid: "main-puuid", assignedAt: "earlier" };
	const resolved = resolveCaptainRef({ players: [playing], meta: { captain } });
	assert.equal(resolved.discordId, captain.discordId);
	assert.equal(resolved.assignedAt, captain.assignedAt);
	assert.equal(resolved.riotId, "Pavadon#EUW");
	assert.equal(resolved.puuid, "playing-puuid");
	assert.equal(captain.riotId, "Kami#MUNDO");
});

test("a registered display name is retained and ordinary player names do not change", () => {
	const { buildPlayer } = compile("../src/lib/tournament-runtime.ts", "buildPlayer", {});
	const main = { discordId: "kami", displayName: "kami", riotId: "Kami#MUNDO", puuid: "main" };
	assert.equal(buildPlayer(withPlayingAccount(main, accounts)).name, "kami");
	assert.equal(buildPlayer({ discordId: "other", displayName: "Someone", riotId: "Other#EUW" }).name, "Other");
});

test("public team and captain pages explain the playing account without an organizer approval badge", () => {
	for (const file of ["../src/app/tournament/teams/page.tsx", "../src/app/tournament/captain/page.tsx"]) {
		const source = readFileSync(new URL(file, import.meta.url), "utf8");
		assert.ok(!source.includes("Orga-Freigabe"));
		assert.ok(source.includes('player.playingAccountApproved ? "Spielaccount: "'));
		assert.ok(source.includes("player.verified === false && !player.playingAccountApproved"));
	}
});

test("the actual replay upload route derives the same approved PUUID from the published roster", async () => {
	const { rostersFor } = compile("../src/app/api/tournament/matches/replay/route.ts", "rostersFor", {
		"@/lib/mongo": {
			getDb: async () => ({
				collection: () => ({
					findOne: async () => ({
						teams: {
							a: { name: "Team A", players: [{ discordId: "kami", riotId: "Kami#MUNDO", puuid: "main-puuid" }] },
							b: { name: "Team B", players: [{ discordId: "other", riotId: "Other#EUW", puuid: "other-puuid" }] },
						},
					}),
				}),
			}),
		},
		"@/lib/tournament-settings": { getTournamentSettings: async () => ({ activeTournament: { id: "cup" } }) },
		"@/lib/tournament-playing-account": { withPlayingAccount },
		"@/lib/tournament-playing-account-store": {
			readPlayingAccounts: async (id) => {
				assert.equal(id, "cup");
				return accounts;
			},
		},
	});
	const rosters = await rostersFor("Team A", "Team B");
	assert.equal(rosters.teamA.players[0].puuid, "playing-puuid");
	assert.equal(rosters.teamA.players[0].riotId, "Pavadon#EUW");
	assert.equal(rosters.teamB.players[0].puuid, "other-puuid");
});
