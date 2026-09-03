import assert from "node:assert/strict";
import test from "node:test";
import { resolveUltimateBraveryActionTarget } from "../src/lib/ultimate-bravery-access.ts";
import { getUltimateBraveryDraftStatus } from "../src/lib/ultimate-bravery-state.ts";
import { computeUltimateBraveryGroupSeeds, computeUltimateBraverySwissSeeds, resolveUltimateBraveryPlayoffMatches } from "../src/lib/ultimate-bravery-playoffs.ts";

function players(count = 10) {
	return Array.from({ length: count }, (_, index) => ({
		discordId: `player-${index + 1}`,
		name: `Player ${index + 1}`,
		riotId: `Player${index + 1}#TEST`,
		role: ["Top", "Jungle", "Mid", "Bot", "Support"][index % 5],
		teamName: index < 5 ? "Team Alpha" : "Team Bravo",
	}));
}

function rolls(count = 10) {
	return Array.from({ length: count }, (_, index) => ({
		discordId: `player-${index + 1}`,
		status: "locked",
	}));
}

test("requires all ten claimed participants and all ten confirmed rolls", () => {
	assert.deepEqual(getUltimateBraveryDraftStatus(players(), rolls()), {
		allLocked: true,
		claimedCount: 10,
		lockedCount: 10,
		rerollRequestCount: 0,
		totalPlayers: 10,
	});

	const incompletePlayers = players();
	delete incompletePlayers[9].discordId;
	const incomplete = getUltimateBraveryDraftStatus(incompletePlayers, rolls(9));
	assert.equal(incomplete.allLocked, false);
	assert.equal(incomplete.claimedCount, 9);
	assert.equal(incomplete.lockedCount, 9);
});

test("keeps the opponent hidden while an exception reroll is open", () => {
	const requestedRolls = rolls();
	requestedRolls[4].rerollRequestedAt = "2026-09-02T12:00:00.000Z";
	const status = getUltimateBraveryDraftStatus(players(), requestedRolls);

	assert.equal(status.allLocked, false);
	assert.equal(status.lockedCount, 9);
	assert.equal(status.rerollRequestCount, 1);
});

test("binds participant actions to the logged-in Discord account", () => {
	assert.equal(
		resolveUltimateBraveryActionTarget({
			actorDiscordId: "player-1",
			requestedPlayerDiscordId: "player-2",
			adminAction: false,
			isOwner: false,
		}),
		"player-1"
	);
});

test("allows only an owner to target another player for an admin reroll", () => {
	assert.equal(resolveUltimateBraveryActionTarget({ actorDiscordId: "admin", requestedPlayerDiscordId: "player-4", adminAction: true, isOwner: true }), "player-4");
	assert.equal(resolveUltimateBraveryActionTarget({ actorDiscordId: "viewer", requestedPlayerDiscordId: "player-4", adminAction: true, isOwner: false }), null);
});

function swissRound(round, matches) {
	return {
		round,
		complete: true,
		drawnAt: `2026-09-0${round}T12:00:00.000Z`,
		pairings: matches.map(([first, second, winnerKey], index) => ({
			id: `swiss-r${round}-m${index + 1}`,
			round,
			slot: index + 1,
			teamAKey: first,
			teamAName: `Team ${first}`,
			teamBKey: second,
			teamBName: `Team ${second}`,
			bye: false,
			winnerTeamKey: winnerKey,
		})),
	};
}

const swissTeams = Array.from({ length: 8 }, (_, index) => ({ id: String(index + 1), name: `Team ${index + 1}` }));
const completeSwiss = {
	tournamentId: "ultimate-bravery",
	updatedAt: "2026-09-02T12:00:00.000Z",
	rounds: [
		swissRound(1, [
			["1", "8", "1"],
			["4", "5", "4"],
			["2", "7", "2"],
			["3", "6", "3"],
		]),
		swissRound(2, [
			["1", "4", "1"],
			["8", "5", "8"],
			["2", "3", "2"],
			["7", "6", "7"],
		]),
		swissRound(3, [
			["1", "2", "1"],
			["4", "8", "4"],
			["3", "7", "3"],
			["5", "6", "5"],
		]),
		swissRound(4, [
			["3", "1", "3"],
			["2", "4", "2"],
			["8", "6", "8"],
			["7", "5", "7"],
		]),
	],
};

test("turns a completed eight-team Swiss stage into #1-vs-#8 seeded playoffs", () => {
	const seeds = computeUltimateBraverySwissSeeds(completeSwiss, swissTeams, 4);
	assert.deepEqual(new Set(Object.values(seeds)), new Set(swissTeams.map((team) => team.name)));

	const matches = resolveUltimateBraveryPlayoffMatches({
		format: "double-elimination",
		swiss: completeSwiss,
		teams: swissTeams,
		requiredRounds: 4,
		stored: {},
	});
	assert.deepEqual(
		matches.slice(0, 4).map((match) => [match.teamAName, match.teamBName]),
		[
			[seeds[1], seeds[8]],
			[seeds[4], seeds[5]],
			[seeds[2], seeds[7]],
			[seeds[3], seeds[6]],
		]
	);
	assert.equal(matches[0].status, "Scheduled");
	assert.equal(matches[4].status, "Locked");
	assert.equal(
		matches.some((match) => match.id === "gf-reset"),
		false
	);
	assert.equal(matches.filter((match) => match.bracket === "Grand").length, 1);
});

test("builds double-elimination light with top-seed byes and bottom seeds in lower", () => {
	const seeds = computeUltimateBraverySwissSeeds(completeSwiss, swissTeams, 4);
	const matches = resolveUltimateBraveryPlayoffMatches({
		format: "double-elimination-light",
		swiss: completeSwiss,
		teams: swissTeams,
		requiredRounds: 4,
		stored: {},
	});
	const byId = new Map(matches.map((match) => [match.id, match]));

	assert.deepEqual(
		matches.slice(0, 2).map((match) => [match.teamAName, match.teamBName]),
		[
			[seeds[3], seeds[6]],
			[seeds[4], seeds[5]],
		]
	);
	assert.equal(byId.get("ub-r2-1")?.teamAName, seeds[2]);
	assert.equal(byId.get("ub-r2-2")?.teamAName, seeds[1]);
	assert.equal(byId.get("lb-r1-1")?.teamBName, seeds[7]);
	assert.equal(byId.get("lb-r1-2")?.teamBName, seeds[8]);
	assert.equal(byId.get("ub-r2-1")?.status, "Locked");
	assert.equal(byId.get("lb-r1-1")?.status, "Locked");
	assert.equal(
		matches.some((match) => match.id === "gf-reset"),
		false
	);
	assert.equal(matches.filter((match) => match.bracket === "Grand").length, 1);
});

test("keeps playoff seeds locked until every configured Swiss result exists", () => {
	const incomplete = { ...completeSwiss, rounds: completeSwiss.rounds.slice(0, 3) };
	const seeds = computeUltimateBraverySwissSeeds(incomplete, swissTeams, 4);
	assert.equal(
		Object.values(seeds).every((value) => value === null),
		true
	);
});

test("builds the six-team light bracket with seeds five and six entering lower", () => {
	const teams = Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), name: `Team ${index + 1}` }));
	const seedNames = Object.fromEntries(teams.map((team, index) => [index + 1, team.name]));
	const matches = resolveUltimateBraveryPlayoffMatches({
		format: "double-elimination-light",
		teams,
		stored: {},
		seedNames,
		playoffTeamCount: 6,
		seedSourceLabel: "Gruppenphasen-Seed",
	});
	const byId = new Map(matches.map((match) => [match.id, match]));

	assert.deepEqual(
		matches.slice(0, 2).map((match) => [match.teamAName, match.teamBName]),
		[
			["Team 1", "Team 4"],
			["Team 2", "Team 3"],
		]
	);
	assert.equal(byId.get("lb-r1-1")?.teamBName, "Team 5");
	assert.equal(byId.get("lb-r1-2")?.teamBName, "Team 6");
	assert.equal(byId.get("ub-r2-1")?.sideSelectionTeamName, "Team 1");
	assert.equal(byId.get("ub-r2-1")?.sideSelectionSeed, 1);
	assert.equal(
		matches.some((match) => match.id === "gf-reset"),
		false
	);
	assert.equal(matches.filter((match) => match.bracket === "Grand").length, 1);
});

test("turns a completed one-group table into six playoff seeds", () => {
	const teams = Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), name: `Team ${index + 1}` }));
	const standings = {
		A: teams.map((team, index) => ({ team, played: 5, rank: index + 1, tiebreakerRequired: false })),
		B: [],
	};
	const groupMatches = [];
	for (let first = 0; first < teams.length; first += 1) {
		for (let second = first + 1; second < teams.length; second += 1) {
			groupMatches.push({ group: "A", teamA: teams[first].name, teamB: teams[second].name });
		}
	}
	const seeds = computeUltimateBraveryGroupSeeds(standings, groupMatches, 6);

	assert.equal(groupMatches.length, 15);
	assert.deepEqual(
		Object.values(seeds),
		teams.map((team) => team.name)
	);
});

test("builds standard double elimination for four teams", () => {
	const teams = Array.from({ length: 4 }, (_, index) => ({ id: String(index + 1), name: `Team ${index + 1}` }));
	const matches = resolveUltimateBraveryPlayoffMatches({
		format: "double-elimination",
		teams,
		stored: {},
		seedNames: Object.fromEntries(teams.map((team, index) => [index + 1, team.name])),
		playoffTeamCount: 4,
	});

	assert.deepEqual(
		matches.slice(0, 2).map((match) => [match.teamAName, match.teamBName]),
		[
			["Team 1", "Team 4"],
			["Team 2", "Team 3"],
		]
	);
	assert.equal(
		matches.some((match) => match.id === "lb-r1"),
		true
	);
	assert.equal(matches.filter((match) => match.bracket === "Grand").length, 1);
});

test("ignores a stored playoff result after its pairing identity changed", () => {
	const teams = Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), name: `Team ${index + 1}` }));
	const matches = resolveUltimateBraveryPlayoffMatches({
		format: "double-elimination-light",
		teams,
		stored: {
			"ub-r2-1": {
				id: "ub-r2-1",
				teamAName: "Former Team 1",
				teamBName: "Former Team 4",
				status: "Finished",
				scoreA: 1,
				scoreB: 0,
			},
		},
		seedNames: Object.fromEntries(teams.map((team, index) => [index + 1, team.name])),
		playoffTeamCount: 6,
	});
	const match = matches.find((entry) => entry.id === "ub-r2-1");

	assert.equal(match?.teamAName, "Team 1");
	assert.equal(match?.teamBName, "Team 4");
	assert.equal(match?.status, "Scheduled");
	assert.equal(match?.scoreA, undefined);
	assert.equal(match?.winner, undefined);
});
