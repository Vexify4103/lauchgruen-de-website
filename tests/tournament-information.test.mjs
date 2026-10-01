import assert from "node:assert/strict";
import test from "node:test";
import { applyTournamentInformation, tournamentInformationSchema } from "../src/lib/tournament-information.ts";
import { getDefaultRuleSections, getDefaultRulesMarkdown } from "../src/lib/tournament-rulebook.ts";
import { DEFAULT_STRUCTURE_OPTIONS } from "../src/lib/tournament-structure.ts";

const valid = { name: "Community Cup", description: "Two evenings together.", rulesMarkdown: "## Rules\n\n- Be fair" };

test("validates and trims public tournament information", () => {
	assert.deepEqual(tournamentInformationSchema.parse({ ...valid, name: " Community Cup " }), valid);
});

test("blank content restores default rules but tournament name is required", () => {
	assert.equal(tournamentInformationSchema.safeParse({ ...valid, description: "", rulesMarkdown: "" }).success, true);
	assert.equal(tournamentInformationSchema.safeParse({ ...valid, name: "   " }).success, false);
});

test("rejects oversized content and attempts to change event identity", () => {
	for (const patch of [
		{ name: "x".repeat(161) },
		{ description: "x".repeat(8001) },
		{ rulesMarkdown: "x".repeat(30001) },
		{ id: "different-event" },
		{ mode: "live" },
		{ kind: "az" },
	]) {
		assert.equal(tournamentInformationSchema.safeParse({ ...valid, ...patch }).success, false);
	}
});

test("renaming preserves event identity, season, format and lifecycle", () => {
	const current = { id: "fearless-2026", name: "Old name", season: "2026", kind: "fearless", mode: "live" };
	assert.deepEqual(applyTournamentInformation(current, valid), { ...current, ...valid });
	assert.equal(current.name, "Old name");
});

test("default rule templates preserve mode-specific rules and current format", () => {
	const settings = {
		activeTournament: { id: "ub-2026", kind: "ultimate-bravery" },
		ultimateBravery: {
			...DEFAULT_STRUCTURE_OPTIONS,
			teamCount: 8,
			dayOneFormat: "swiss",
			groupCount: 1,
			groupRoundRobinLegs: 1,
			swissRounds: 3,
			advanceTeamCount: 8,
			format: "double-elimination-light",
		},
	};
	const rules = getDefaultRuleSections(settings);
	assert.ok(rules.some((section) => section.title === "Ultimate-Bravery-Rolls"));
	assert.ok(!rules.some((section) => section.title.startsWith("Fearless:")));
	assert.match(getDefaultRulesMarkdown(settings), /## 1\. Twitch-Streams/);
	assert.match(getDefaultRulesMarkdown(settings), /Swiss/);
	assert.match(getDefaultRulesMarkdown({ ...settings, activeTournament: { id: "fearless-2026", kind: "fearless" } }), /Fearless: gespielte Champions/);
});
