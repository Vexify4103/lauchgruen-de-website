import assert from "node:assert/strict";
import test from "node:test";
import {
	publicBroadcastMatch,
	publicBroadcastDraft,
	selectBroadcastMatch,
	broadcastDrawReveals,
	maskedBroadcastPool,
	broadcastHistoryContinues,
	resolveBroadcastTeam,
} from "../src/lib/tournament-broadcast.ts";
import { demoBroadcastSnapshot } from "../src/lib/tournament-broadcast-demo.ts";

test("public match projection never leaks control notes, roster identities or stored match documents", () => {
	const demo = demoBroadcastSnapshot();
	const input = {
		id: "one",
		phase: "groups",
		round: "Swiss Runde 1",
		time: "18:00",
		teamAName: demo.teams[0].name,
		teamBName: demo.teams[1].name,
		teamALabel: demo.teams[0].name,
		teamBLabel: demo.teams[1].name,
		status: "Live",
		blueSide: "teamB",
		bestOf: 1,
		adminNote: "secret",
		poolAssignment: { secret: "hidden" },
		games: [{ private: true }],
		discordId: "private-person",
	};
	const match = publicBroadcastMatch(input, demo.teams);
	assert.equal(match.blueSide, "teamB");
	assert.equal(match.teamA.key, demo.teams[0].key);
	assert.doesNotMatch(JSON.stringify(match), /secret|private|adminNote|poolAssignment|games|discord/);
});

test("draft projection exposes only locked picks and bans, never hovers or identity metadata", () => {
	const draft = {
		actions: [
			{ side: "teamA", kind: "pick", champion: "Ahri", lockedAt: "now", lockedBy: "secret-person" },
			{ side: "teamB", kind: "ban", champion: "Zed", lockedAt: "now" },
			{ side: "teamA", kind: "ban", champion: "", skipped: true, lockedAt: "now" },
			{ side: "teamB", kind: "pick", champion: "NotLocked", lockedAt: "" },
		],
		readyBy: { teamA: { readyBy: "private" } },
		pendingSelection: { champion: "SecretHover" },
		roles: { teamA: { order: ["private-role-plan"] } },
		updatedBy: "private",
	};
	const projected = publicBroadcastDraft(draft, [{ id: "Ahri", name: "Ahri", image: null }]);
	assert.deepEqual(
		projected.picksA.map((pick) => pick.id),
		["Ahri"]
	);
	assert.deepEqual(
		projected.bansB.map((pick) => pick.id),
		["Zed"]
	);
	assert.deepEqual(projected.picksB, []);
	assert.deepEqual(projected.bansA, []);
	assert.equal(projected.readyA, true);
	assert.doesNotMatch(JSON.stringify(projected), /SecretHover|NotLocked|private|secret-person|updatedBy|roles|lockedBy/);
});

test("team-following never switches to someone else's live match and survives display-name changes", () => {
	const demo = demoBroadcastSnapshot();
	const team = demo.teams[3];
	const renamed = { ...team, name: "New display name" };
	assert.equal(selectBroadcastMatch(demo.matches, renamed).id, "demo-match-4");
	assert.equal(selectBroadcastMatch(demo.matches, renamed, "demo-match-1"), null);
	const next = { ...demo.matches[3], id: "next-round", status: "Scheduled" };
	const matches = [...demo.matches.map((match) => (match.id === "demo-match-4" ? { ...match, status: "Finished" } : match)), next];
	assert.equal(selectBroadcastMatch(matches, renamed).id, "next-round");
});

test("host auto-selection prefers the explicitly cast match, including a draft over unrelated live games", () => {
	const demo = demoBroadcastSnapshot();
	const matches = demo.matches.map((match, index) => ({ ...match, casted: index === 1 }));
	assert.equal(selectBroadcastMatch(matches, null).id, "demo-match-2");
	assert.equal(selectBroadcastMatch(matches, null, "demo-match-4").id, "demo-match-4");
	assert.equal(selectBroadcastMatch(matches, null, "missing"), null);
});

test("public overlay IDs take precedence over coincidentally matching internal keys", () => {
	const teams = demoBroadcastSnapshot().teams.slice(0, 2);
	teams[0] = { ...teams[0], key: "public-id", id: "different-id" };
	teams[1] = { ...teams[1], key: "internal-key", id: "public-id" };
	assert.equal(resolveBroadcastTeam(teams, "public-id"), teams[1]);
	assert.equal(resolveBroadcastTeam(teams, "internal-key"), teams[1]);
	assert.equal(resolveBroadcastTeam(teams, "missing"), null);
});

test("OBS initial connection and reconnect restore the board without replaying historical selections", () => {
	const latest = demoBroadcastSnapshot(6);
	assert.deepEqual(broadcastDrawReveals(null, latest), []);
	assert.deepEqual(broadcastDrawReveals(latest, latest), []);
	assert.deepEqual(broadcastDrawReveals(latest, demoBroadcastSnapshot(0)), []);
	assert.equal(broadcastHistoryContinues(latest, demoBroadcastSnapshot(0)), false);
	assert.deepEqual(broadcastDrawReveals(latest, { ...demoBroadcastSnapshot(7), tournament: { id: "different" } }), []);
	assert.deepEqual(broadcastDrawReveals(latest, { ...demoBroadcastSnapshot(7), source: "live" }), []);
});

test("missed selections queue in order with shrinking eligible pots, and unrevealed slots stay hidden", () => {
	const before = demoBroadcastSnapshot(0),
		after = demoBroadcastSnapshot(3);
	const reveals = broadcastDrawReveals(before, after);
	assert.equal(reveals.length, 3);
	assert.deepEqual(
		reveals.map((event) => event.candidates.length),
		[8, 7, 6]
	);
	assert.deepEqual(
		reveals.map((event) => event.slot),
		[0, 1, 2]
	);
	const pool = after.draw.rounds[0].pools[0];
	assert.equal(maskedBroadcastPool(pool, 1, reveals).slots.filter(Boolean).length, 0);
	assert.equal(maskedBroadcastPool(pool, 1, reveals.slice(1)).slots.filter(Boolean).length, 1);
	assert.equal(maskedBroadcastPool(pool, 1, []).slots.filter(Boolean).length, 3);
	assert.equal(pool.slots.filter(Boolean).length, 3, "masking must not mutate server state");
});

test("round transitions animate only the correct record pool, and repaired history cannot replay as new draws", () => {
	const before = demoBroadcastSnapshot(8),
		after = demoBroadcastSnapshot(9);
	const [reveal] = broadcastDrawReveals(before, after);
	assert.equal(reveal.round, 2);
	assert.equal(reveal.record, "1-0");
	assert.equal(reveal.candidates.length, 4);
	const corrupt = structuredClone(after);
	corrupt.draw.events[0].teamKey = "rewritten";
	assert.equal(broadcastHistoryContinues(before, corrupt), false);
	assert.deepEqual(broadcastDrawReveals(before, corrupt), []);
});

test("draft projection finds icons for champions stored by display name, not only by Data Dragon id", () => {
	const draft = {
		actions: [
			{ side: "teamA", kind: "pick", champion: "Wukong", lockedAt: "now" },
			{ side: "teamB", kind: "pick", champion: "Kai'Sa", lockedAt: "now" },
			{ side: "teamB", kind: "ban", champion: "LeeSin", lockedAt: "now" },
		],
		readyBy: {},
	};
	const champions = [
		{ id: "MonkeyKing", name: "Wukong", image: "https://ddragon/MonkeyKing.png" },
		{ id: "Kaisa", name: "Kai'Sa", image: "https://ddragon/Kaisa.png" },
		{ id: "LeeSin", name: "Lee Sin", image: "https://ddragon/LeeSin.png" },
	];
	const projected = publicBroadcastDraft(draft, champions);
	assert.equal(projected.picksA[0].image, "https://ddragon/MonkeyKing.png");
	assert.equal(projected.picksB[0].image, "https://ddragon/Kaisa.png");
	assert.equal(projected.bansB[0].image, "https://ddragon/LeeSin.png");
});
