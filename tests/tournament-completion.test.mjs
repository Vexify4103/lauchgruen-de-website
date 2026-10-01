import assert from "node:assert/strict";
import test from "node:test";
import { resolveTournamentCompletion } from "../src/lib/tournament-completion.ts";

test("resolves the champion from a completed 1:0 Grand Final", () => {
	assert.deepEqual(
		resolveTournamentCompletion([{ id: "gf", status: "Finished", teamAName: "Team Alpha", teamBName: "Team Bravo", scoreA: 1, scoreB: 0, winner: "Team Alpha" }]),
		{
			championTeamName: "Team Alpha",
			finalistTeamName: "Team Bravo",
			teamAName: "Team Alpha",
			teamBName: "Team Bravo",
			scoreA: 1,
			scoreB: 0,
		}
	);
});

test("rejects an unfinished or invalid Grand Final", () => {
	assert.equal(resolveTournamentCompletion([{ id: "gf", status: "Live", teamAName: "A", teamBName: "B", scoreA: 1, scoreB: 0 }]), null);
	assert.equal(resolveTournamentCompletion([{ id: "gf", status: "Finished", teamAName: "A", teamBName: "B", scoreA: 2, scoreB: 1 }]), null);
	assert.equal(resolveTournamentCompletion([{ id: "ub-f", status: "Finished", teamAName: "A", teamBName: "B", scoreA: 1, scoreB: 0 }]), null);
});

test("accepts a decided Bo3 or Bo5 final and prefers a played bracket reset", () => {
	assert.equal(resolveTournamentCompletion([{ id: "gf", status: "Finished", teamAName: "A", teamBName: "B", scoreA: 1, scoreB: 2, bestOf: 3 }]).championTeamName, "B");
	assert.equal(resolveTournamentCompletion([{ id: "gf", status: "Finished", teamAName: "A", teamBName: "B", scoreA: 1, scoreB: 1, bestOf: 3 }]), null);
	assert.equal(resolveTournamentCompletion([{ id: "gf", status: "Finished", teamAName: "A", teamBName: "B", scoreA: 3, scoreB: 2, bestOf: 5 }]).championTeamName, "A");
	const withReset = [
		{ id: "gf", status: "Finished", teamAName: "Upper", teamBName: "Lower", scoreA: 0, scoreB: 1 },
		{ id: "gf-2", status: "Scheduled", teamAName: "Upper", teamBName: "Lower" },
	];
	assert.equal(resolveTournamentCompletion(withReset), null);
	withReset[1] = { ...withReset[1], status: "Finished", scoreA: 1, scoreB: 0 };
	assert.equal(resolveTournamentCompletion(withReset).championTeamName, "Upper");
});
