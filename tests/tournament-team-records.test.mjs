import assert from "node:assert/strict";
import test from "node:test";
import { teamMatchRecord } from "../src/lib/tournament-team-records.ts";

test("counts finished matches, including faulty Swiss pairings, without counting ongoing games or duplicates", () => {
	const won = { id: "swiss-r3-m4", teamAName: "Trust", teamBName: "Crit", status: "Finished", scoreA: 1, scoreB: 0 };
	const lost = { id: "swiss-r4-m1", teamAName: "Born", teamBName: "Trust", status: "Finished", scoreA: 1, scoreB: 0 };
	const live = { ...won, id: "ub-r1-2", status: "Live" };
	const tied = { ...won, id: "draft", scoreB: 1 };
	assert.equal(teamMatchRecord("Trust", [won, lost, live, tied, won]), "1-1");
	assert.equal(teamMatchRecord("Crit", [won, lost]), "0-1");
	assert.equal(teamMatchRecord("Unplayed", [won, lost]), "0-0");
});
