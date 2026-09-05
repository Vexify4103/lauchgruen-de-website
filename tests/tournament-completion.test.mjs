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
