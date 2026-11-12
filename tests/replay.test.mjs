import assert from "node:assert/strict";
import test from "node:test";
import { gameIdFromReplayFileName, parseRoflMetadata, RoflParseError } from "../src/lib/rofl.ts";
import { evaluateReplay, replayFingerprint } from "../src/lib/replay-match.ts";

const LANES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const blue = ["Ornn", "Khazix", "Cassiopeia", "Jinx", "Nami"];
const red = ["Shen", "MonkeyKing", "Morgana", "Ashe", "Blitzcrank"];

function row(team, index, champion, win) {
	return {
		RIOT_ID_GAME_NAME: `${team === 100 ? "Blue" : "Red"}${index}`,
		RIOT_ID_TAG_LINE: "EUW",
		PUUID: `puuid-${team}-${index}`,
		SKIN: champion,
		TEAM: String(team),
		WIN: win ? "Win" : "Fail",
		TEAM_POSITION: LANES[index],
		CHAMPIONS_KILLED: "3",
		NUM_DEATHS: "2",
		ASSISTS: "7",
		MINIONS_KILLED: "150",
		NEUTRAL_MINIONS_KILLED: "10",
	};
}

/** Same layout as a real 16.22 replay: magic, version string, body, metadata JSON, uint32 length. */
function buildRofl({ blueWins = true } = {}) {
	const stats = [...blue.map((champion, index) => row(100, index, champion, blueWins)), ...red.map((champion, index) => row(200, index, champion, !blueWins))];
	const json = new TextEncoder().encode(JSON.stringify({ gameLength: 1834500, lastGameChunkId: 1, lastKeyFrameId: 1, statsJson: JSON.stringify(stats) }));
	const head = new Uint8Array([0x52, 0x49, 0x4f, 0x54, 0x02, 0x00, 1, 2, 3, 4, 5, 6, 7, 8, 14, ...new TextEncoder().encode("16.22.834.8910")]);
	const body = new Uint8Array(4096).fill(7);
	const length = new Uint8Array(4);
	new DataView(length.buffer).setUint32(0, json.length, true);
	const file = new Uint8Array(head.length + body.length + json.length + 4);
	file.set(head, 0);
	file.set(body, head.length);
	file.set(json, head.length + body.length);
	file.set(length, head.length + body.length + json.length);
	return file;
}

const roster = (team, name) => ({ name, players: [0, 1, 2, 3, 4].map((index) => ({ riotId: `${team === 100 ? "Blue" : "Red"}${index}#EUW`, puuid: `puuid-${team}-${index}` })) });

test("reads version, length, winner and players from a ROFL2 file", () => {
	const summary = parseRoflMetadata(buildRofl());
	assert.equal(summary.gameVersion, "16.22.834.8910");
	assert.equal(summary.durationSeconds, 1835);
	assert.equal(summary.winningTeam, 100);
	assert.equal(summary.players.length, 10);
	assert.deepEqual(summary.players[0], {
		riotIdName: "Blue0",
		riotIdTag: "EUW",
		puuid: "puuid-100-0",
		champion: "Ornn",
		team: 100,
		win: true,
		position: "TOP",
		kills: 3,
		deaths: 2,
		assists: 7,
		gold: 0,
		creepScore: 160,
		damageToChampions: 0,
		visionScore: 0,
		level: 0,
		items: [0, 0, 0, 0, 0, 0, 0],
		summonerSpells: [0, 0],
		perks: [0, 0, 0, 0, 0, 0],
		primaryStyle: 0,
		subStyle: 0,
		controlWardsPlaced: 0,
		wardsPlaced: 0,
		wardsKilled: 0,
		damageTaken: 0,
	});
});

test("rejects files that are not replays", () => {
	assert.throws(() => parseRoflMetadata(new TextEncoder().encode("hello world, not a replay")), RoflParseError);
});

test("reads the game id from the client's file name", () => {
	assert.deepEqual(gameIdFromReplayFileName("EUW1-8040261664.rofl"), { platform: "EUW1", gameId: "8040261664" });
	assert.equal(gameIdFromReplayFileName("my-replay.rofl"), null);
});

test("a replay of the scheduled match passes and maps sides, winner and lanes", () => {
	const replay = parseRoflMetadata(buildRofl({ blueWins: false }));
	// Team A played red here; the champ select stored display names ("Wukong").
	const evaluation = evaluateReplay({
		replay,
		teamA: roster(200, "Red Team"),
		teamB: roster(100, "Blue Team"),
		blueSide: "teamB",
		draft: { teamA: ["Shen", "Wukong", "Morgana", "Ashe", "Blitzcrank"], teamB: blue },
	});
	assert.equal(evaluation.verdict, "ok");
	assert.equal(evaluation.winner, "teamA");
	assert.equal(evaluation.blueTeam, "teamB");
	assert.equal(evaluation.matchedPlayers, 10);
	assert.equal(evaluation.championsMatchDraft, true);
	assert.deepEqual(evaluation.champions.teamA, red);
});

test("a replay of another lobby is rejected", () => {
	const replay = parseRoflMetadata(buildRofl());
	const strangers = (name) => ({ name, players: [{ riotId: "Someone#EUW", puuid: "other" }] });
	const evaluation = evaluateReplay({ replay, teamA: strangers("A"), teamB: strangers("B"), blueSide: "teamA", draft: { teamA: [], teamB: [] } });
	assert.equal(evaluation.verdict, "reject");
	assert.equal(evaluation.winner, null);
});

test("one substitute outside the roster, wrong side or other champions go to review", () => {
	const replay = parseRoflMetadata(buildRofl());
	const teamA = roster(100, "Blue Team");
	teamA.players[4] = { riotId: "Sub#EUW", puuid: "puuid-sub" };
	const evaluation = evaluateReplay({
		replay,
		teamA,
		teamB: roster(200, "Red Team"),
		blueSide: "teamB",
		draft: { teamA: blue, teamB: ["Shen", "Sylas", "Morgana", "Ashe", "Blitzcrank"] },
	});
	assert.equal(evaluation.verdict, "review");
	assert.equal(evaluation.matchedPlayers, 9);
	assert.equal(evaluation.championsMatchDraft, false);
	assert.ok(evaluation.problems.some((problem) => problem.includes("Blau")));
	assert.ok(evaluation.unknownPlayers.includes("Blue4#EUW"));
});

test("players are matched by Riot ID when the PUUID is unknown", () => {
	const replay = parseRoflMetadata(buildRofl());
	const withoutPuuid = (team, name) => ({ name, players: roster(team, name).players.map(({ riotId }) => ({ riotId: riotId.toUpperCase() })) });
	const evaluation = evaluateReplay({ replay, teamA: withoutPuuid(100, "A"), teamB: withoutPuuid(200, "B"), blueSide: "teamA", draft: { teamA: [], teamB: [] } });
	assert.equal(evaluation.verdict, "ok");
	assert.equal(evaluation.championsMatchDraft, null);
});

test("in a series a late replay of an already recorded game is rejected", () => {
	const replay = parseRoflMetadata(buildRofl());
	const evaluation = evaluateReplay({
		replay,
		teamA: roster(100, "Blue Team"),
		teamB: roster(200, "Red Team"),
		blueSide: "teamA",
		draft: { teamA: [], teamB: [] },
		previousGames: [{ teamA: blue, teamB: ["Shen", "Wukong", "Morgana", "Ashe", "Blitzcrank"] }],
	});
	assert.equal(evaluation.verdict, "reject");
	assert.match(evaluation.problems[0], /Spiel 1/);
});

test("in a series a replay without a stored champ select goes to review", () => {
	const replay = parseRoflMetadata(buildRofl());
	const evaluation = evaluateReplay({
		replay,
		teamA: roster(100, "Blue Team"),
		teamB: roster(200, "Red Team"),
		blueSide: "teamA",
		draft: { teamA: [], teamB: [] },
		previousGames: [{ teamA: ["Garen", "Vi", "Lux", "Ezreal", "Leona"], teamB: ["Darius", "Lee Sin", "Ahri", "Kaisa", "Thresh"] }],
	});
	assert.equal(evaluation.verdict, "review");
});

test("the fingerprint is the same for the same game and differs for another", () => {
	const first = parseRoflMetadata(buildRofl());
	assert.equal(replayFingerprint(first), replayFingerprint(parseRoflMetadata(buildRofl({ blueWins: false }))));
	assert.notEqual(replayFingerprint(first), replayFingerprint({ ...first, durationSeconds: first.durationSeconds + 60 }));
});
