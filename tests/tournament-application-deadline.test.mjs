import assert from "node:assert/strict";
import test from "node:test";

import { areTournamentApplicationsOpen, tournamentApplicationWindow } from "../src/lib/tournament-application-deadline.ts";

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

test("after the deadline an enabled signup becomes a late substitute list before the event", () => {
	for (const mode of ["teaser", "registration", "preparation"]) assert.equal(tournamentApplicationWindow(true, mode, now, false, deadline, openAt), "late");
});

test("late signups close once the tournament is running or finished", () => {
	for (const mode of ["live", "paused", "finished"]) assert.equal(tournamentApplicationWindow(true, mode, now, false, deadline, openAt), "closed");
});

test("signup window stays regular before the deadline and closed when disabled", () => {
	const before = new Date("2026-09-01T12:00:00+02:00");
	assert.equal(tournamentApplicationWindow(true, "registration", before, false, deadline, openAt), "open");
	assert.equal(tournamentApplicationWindow(true, "registration", now, true, deadline, openAt), "open");
	assert.equal(tournamentApplicationWindow(false, "registration", now, false, deadline, openAt), "closed");
	assert.equal(tournamentApplicationWindow(true, "registration", new Date("2026-07-01T12:00:00+02:00"), false, deadline, openAt), "closed");
});
