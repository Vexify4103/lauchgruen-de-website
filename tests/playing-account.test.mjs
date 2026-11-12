import assert from "node:assert/strict";
import test from "node:test";
import { activePlayingAccounts, findParticipantTeam, playingAccountApprovalSchema, withPlayingAccount } from "../src/lib/tournament-playing-account.ts";
import { evaluateReplay } from "../src/lib/replay-match.ts";

const approval = {
	tournamentId: "cup-1",
	discordId: "kami",
	riotId: "Pavadon#EUW",
	puuid: "alternate-kami",
	scoutRiotId: "Kami#MUNDO",
	reason: "Orga-Ausnahme",
	approvedBy: "admin",
	approvedAt: "2026-11-12T10:00:00Z",
};
const accounts = activePlayingAccounts([approval], "cup-1");

test("non-captains still find their team and match on /me after switching playing accounts", () => {
	const team = { players: [{ discordId: "kami", riotId: "Pavadon#EUW" }] };
	assert.equal(findParticipantTeam([team], "kami", "Kami#MUNDO"), team);
	assert.equal(findParticipantTeam([team], "unrelated", "Pavadon#EUW"), undefined);
	const legacy = { players: [{ riotId: "Main#EUW" }] };
	assert.equal(findParticipantTeam([legacy], "legacy-user", "main#euw"), legacy);
});

test("approval changes playing identity but preserves main account, rank, role and Discord permissions", () => {
	const main = { applicationId: "main-kami|kami", discordId: "kami", riotId: "Kami#MUNDO", puuid: "main-kami", currentRank: "DIAMOND I (4 LP)", manualRankOverride: null, role: "Top", verified: true };
	const before = structuredClone(main);
	const playing = withPlayingAccount(main, accounts);
	assert.deepEqual(main, before);
	assert.equal(playing.riotId, "Pavadon#EUW");
	assert.equal(playing.puuid, "alternate-kami");
	assert.equal(playing.scoutRiotId, "Kami#MUNDO");
	assert.equal(playing.currentRank, main.currentRank);
	assert.equal(playing.manualRankOverride, main.manualRankOverride);
	assert.equal(playing.applicationId, main.applicationId);
	assert.equal(playing.discordId, main.discordId);
	assert.equal(playing.role, main.role);
	assert.equal(playing.playingAccountApproved, true);
});

test("approvals expire with the tournament and resetting restores the canonical identity", () => {
	const main = { discordId: "kami", riotId: "Kami#MUNDO", puuid: "main-kami" };
	assert.equal(withPlayingAccount(main, activePlayingAccounts([approval], "cup-2")), main);
	assert.equal(withPlayingAccount(main, new Map()), main);
	assert.equal(withPlayingAccount({ ...main, discordId: "someone-else" }, accounts).riotId, main.riotId);
});

test("existing scouting override takes precedence and applying the same approval is idempotent", () => {
	const main = { discordId: "kami", riotId: "Main#EUW", scoutRiotId: "OtherMain#EUW", puuid: "main" };
	const playing = withPlayingAccount(main, accounts);
	assert.equal(playing.scoutRiotId, "OtherMain#EUW");
	assert.deepEqual(withPlayingAccount(playing, accounts), playing);
});

test("normal profile/rank refresh and roster save cannot replace a separately stored approval", () => {
	const refreshed = { discordId: "kami", riotId: "RenamedMain#EUW", puuid: "main-kami", currentRank: "MASTER I (50 LP)", scoutRiotId: "RenamedMain#EUW" };
	const playing = withPlayingAccount(refreshed, accounts);
	assert.equal(playing.riotId, approval.riotId);
	assert.equal(playing.puuid, approval.puuid);
	assert.equal(playing.currentRank, refreshed.currentRank);
	assert.equal(playing.scoutRiotId, refreshed.scoutRiotId);
});

test("approval requires explicit attestation and a valid Riot ID and reason", () => {
	const input = { applicationId: "app", tournamentId: "cup-1", expectedVersion: 0, riotId: "Pavadon#EUW", reason: "Orga-Ausnahme", confirmed: true };
	assert.equal(playingAccountApprovalSchema.safeParse(input).success, true);
	for (const patch of [{ confirmed: false }, { reason: "" }, { riotId: "https://evil.invalid" }, { puuid: "client-supplied" }, { expectedVersion: -1 }]) {
		assert.equal(playingAccountApprovalSchema.safeParse({ ...input, ...patch }).success, false);
	}
});

test("existing replay validator recognizes approved accounts without admitting unrelated players", () => {
	const teamA = {
		name: "A",
		players: Array.from({ length: 5 }, (_, i) => ({
			discordId: i === 0 ? "kami" : `a-${i}`,
			riotId: i === 0 ? "Kami#MUNDO" : `A${i}#EUW`,
			puuid: i === 0 ? "main-kami" : `a-${i}`,
		})),
	};
	const teamB = { name: "B", players: Array.from({ length: 5 }, (_, i) => ({ riotId: `B${i}#EUW`, puuid: `b-${i}` })) };
	const replay = {
		players: [...teamA.players, ...teamB.players].map((p, i) => ({
			riotIdName: i === 0 ? "Pavadon" : p.riotId.split("#")[0],
			riotIdTag: "EUW",
			puuid: i === 0 ? "alternate-kami" : p.puuid,
			champion: i % 2 ? "Ahri" : "Garen",
			position: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5],
			team: i < 5 ? 100 : 200,
		})),
		winningTeam: 100,
	};
	const before = evaluateReplay({ replay, teamA, teamB, blueSide: "teamA", draft: { teamA: [], teamB: [] } });
	assert.equal(before.verdict, "review");
	assert.equal(before.matchedPlayers, 9);
	const after = evaluateReplay({
		replay,
		teamA: { ...teamA, players: teamA.players.map((p) => withPlayingAccount(p, accounts)) },
		teamB,
		blueSide: "teamA",
		draft: { teamA: [], teamB: [] },
	});
	assert.equal(after.verdict, "ok");
	assert.equal(after.matchedPlayers, 10);
	assert.deepEqual(after.unknownPlayers, []);
	assert.equal(before.matchedPlayers, 9); // Stored historical evaluations are never rewritten.
	replay.players[0] = { ...replay.players[0], riotIdName: "Stranger", puuid: "unapproved" };
	assert.equal(
		evaluateReplay({
			replay,
			teamA: { ...teamA, players: teamA.players.map((p) => withPlayingAccount(p, accounts)) },
			teamB,
			blueSide: "teamA",
			draft: { teamA: [], teamB: [] },
		}).verdict,
		"review"
	);
});
