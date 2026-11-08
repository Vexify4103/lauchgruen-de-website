import assert from "node:assert/strict";
import test from "node:test";
import { READY_CHECK_LEAD_MINUTES, rosterPublicationMessage, teamWelcomeMessage } from "../src/lib/roster-messages.ts";

const placement = { teamKey: "nexus garden", teamName: "Nexus Garden", role: "Mid", isCaptain: false };

test("the roster DM links the team text and voice channel", () => {
	const message = rosterPublicationMessage(placement, { textChannelId: "111", voiceChannelId: "222" });
	const field = message.embeds[0].fields.find((entry) => entry.name === "EUER TEAMCHANNEL");
	assert.ok(field);
	assert.match(field.value, /<#111>/);
	assert.match(field.value, /<#222>/);
});

test("the roster DM leaves the channel field out when the team has no channels", () => {
	const message = rosterPublicationMessage(placement);
	assert.equal(message.embeds[0].fields.some((entry) => entry.name === "EUER TEAMCHANNEL"), false);
});

test("the welcome post pings team and captain and sets the ready check 20 minutes early", () => {
	const dayOne = "2026-11-21T17:00:00.000Z";
	const message = teamWelcomeMessage({
		teamName: "Nexus Garden",
		roleId: "999",
		captainId: "337",
		voiceChannelId: "222",
		tournamentName: "Fearless Turnier",
		dayOneStartAt: dayOne,
		dayTwoStartAt: null,
	});
	assert.match(message.content, /<@&999>/);
	assert.match(message.content, /<@337>/);
	const start = Math.floor(new Date(dayOne).getTime() / 1000);
	const days = message.embeds[0].fields.find((entry) => entry.name.includes("Turniertage")).value;
	assert.match(days, new RegExp(`<t:${start}:F>`));
	assert.match(days, new RegExp(`<t:${start - READY_CHECK_LEAD_MINUTES * 60}:t>`));
	assert.match(days, /<#222>/);
	assert.match(days, /Tag 2:\*\* Termin folgt/);
	assert.ok(message.components[0].components.some((button) => button.url.endsWith("/captain")));
	for (const field of message.embeds[0].fields) assert.ok(field.value.length <= 1024, `${field.name} exceeds Discord's field limit`);
});

test("the welcome post works before a captain is chosen", () => {
	const message = teamWelcomeMessage({ teamName: "Team", tournamentName: "Turnier", dayOneStartAt: null, dayTwoStartAt: null });
	assert.doesNotMatch(message.content, /<@/);
	assert.match(message.embeds[0].fields[0].value, /wird noch bestimmt/);
});
