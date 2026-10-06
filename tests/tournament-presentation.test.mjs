import assert from "node:assert/strict";
import test from "node:test";
import { buildTournamentHero } from "../src/lib/tournament-presentation.ts";
import { DEFAULT_STRUCTURE_OPTIONS } from "../src/lib/tournament-structure.ts";

const settings = {
	activeTournament: { name: "Community Cup", kind: "ultimate-bravery", mode: "registration" },
	ultimateBravery: { ...DEFAULT_STRUCTURE_OPTIONS, teamCount: 8, startAt: null, dayTwoStartAt: null, minimumSummonerLevel: 100 },
};

test("unpublished teams do not announce the configured target count", () => {
	for (const plannedCount of [4, 6, 8]) {
		const hero = buildTournamentHero({
			settings: { ...settings, ultimateBravery: { ...settings.ultimateBravery, teamCount: plannedCount } },
			teamCount: 0,
			applicationsOpen: true,
		});
		assert.equal(hero.side.value, "Teams");
		assert.equal(hero.side.unit, "nach Anmeldungen");
		assert.equal(hero.side.cta.label, "Jetzt bewerben");
	}
});

test("published teams still display their actual count", () => {
	const hero = buildTournamentHero({ settings, teamCount: 6, applicationsOpen: false });
	assert.equal(hero.side.value, "6");
	assert.equal(hero.side.unit, "Teams");
});
