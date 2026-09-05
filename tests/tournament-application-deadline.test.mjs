import assert from "node:assert/strict";
import test from "node:test";

import { areTournamentApplicationsOpen } from "../src/lib/tournament-application-deadline.ts";

const now = new Date("2026-09-05T18:30:00+02:00");
const openAt = "2026-08-01T18:00:00+02:00";
const deadline = "2026-09-04T20:00:00+02:00";

test("deadline override reopens applications after the deadline", () => {
	assert.equal(areTournamentApplicationsOpen(true, now, true, deadline, openAt), true);
});

test("deadline override does not bypass a disabled application switch", () => {
	assert.equal(areTournamentApplicationsOpen(false, now, true, deadline, openAt), false);
});

test("applications remain closed after the deadline without an override", () => {
	assert.equal(areTournamentApplicationsOpen(true, now, false, deadline, openAt), false);
});
