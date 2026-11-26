import assert from "node:assert/strict";
import test from "node:test";
import { publicReplay } from "../src/lib/tournament-next.ts";

const replay = {
	id: "r1",
	matchId: "gf",
	gameNumber: 1,
	uploadedBy: "123456789012345678",
	uploaderLabel: "captain",
	fileName: "EUW1-1.rofl",
	sha256: "abc",
	fingerprint: "def",
	status: "applied",
	createdAt: "2026-11-15T20:00:00.000Z",
	evaluation: { blueTeam: "teamB" },
	summary: {
		gameVersion: "15.22.1.1",
		durationSeconds: 1550,
		winningTeam: 100,
		players: [{ riotIdName: "Player", riotIdTag: "EUW", puuid: "secret-puuid", champion: "Ahri", team: 100, win: true, position: "MIDDLE", kills: 5, deaths: 1, assists: 7 }],
	},
};

test("archived replays keep the scoreboard and drop uploader, hashes and PUUIDs", () => {
	const archived = publicReplay(replay);
	assert.deepEqual(Object.keys(archived).sort(), ["blueTeam", "gameNumber", "matchId", "summary"]);
	assert.equal(archived.blueTeam, "teamB");
	assert.equal(archived.summary.durationSeconds, 1550);
	assert.equal(archived.summary.players[0].champion, "Ahri");
	assert.equal("puuid" in archived.summary.players[0], false);
});
