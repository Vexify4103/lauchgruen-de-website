import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as bracketEngine from "../src/lib/bracket-engine.ts";
import * as standings from "../src/lib/tournament-standings.ts";
import * as structure from "../src/lib/tournament-structure.ts";
import * as series from "../src/lib/tournament-series.ts";
import { getDefaultRuleSections, getDefaultRulesMarkdown } from "../src/lib/tournament-rulebook.ts";
import { DEFAULT_STRUCTURE_OPTIONS, SIDE_SELECTION_LABELS, describeSideSelection, describeStructurePlan, sideSelectionForStage } from "../src/lib/tournament-structure.ts";
import { automaticStageBlueSide, sideChooser } from "../src/lib/tournament-series.ts";

const settings = {
	activeTournament: { id: "fearless-test", kind: "fearless" },
	structure: {
		...DEFAULT_STRUCTURE_OPTIONS,
		teamCount: 8,
		playersPerTeam: 5,
		dayOneFormat: "swiss",
		groupCount: 1,
		groupRoundRobinLegs: 1,
		swissRounds: 4,
		advanceTeamCount: 8,
		format: "double-elimination",
	},
	fearless: { scope: "tournament", variant: "match", lockOpponentChampions: false },
};
const sections = getDefaultRuleSections(settings);
const text = (number) => JSON.stringify(sections[number - 1]);

test("preserves numbering and every excluded rule verbatim", () => {
	assert.equal(sections.length, 22);
	// Captured before the rules update; rule 16 changes only its phase-specific side-selection description.
	const protectedRules = {
		1: "cd5ca6b8d855b28d828b061ccbfce1e571870df1482b3ddabe9f4c4d46c8cef7",
		2: "cfe440bbb617205e2ff84240cefc89115b052a2cb6eed3439ac851ce9475d41f",
		3: "6fd2ac8b25a54c98331f686255530e916de8c702d2d4bc5039f1474dfe4fbc8c",
		5: "a76913f87c72f9c1622e85b5fbacd220f27b15095aa78e3d77878eeab8f6041a",
		6: "9981a4af868629354b8a93263e36d74eb8766b02e37000ad28da354b81aef424",
		7: "ea9ff4a03b8410e29d3ef32acdd0b9ab182b62e9286bdf9047a6968f75bb656f",
		9: "8debf329e5781bed43c8c77b695dabdb50c1b98a9b085ad2946acbd02fd5c3d6",
		19: "58ac280cf92ed2c013b2101753edda2a98ae8015b030ec5ebf357d4a1f45cee9",
		20: "b768344c17ce5ff5d7ed71cbff8a9f32bce096b9fdee0b591d4c80a773e57cb7",
		21: "a6aacf08ddf05cd38703288c4780443d010c796ec4283058e681f0c32b322da1",
		22: "9482a6c9999255863e1af92ccb06fa8d00f2a0b4fd0635c577ddb927ef7fe9a7",
	};
	for (const [number, hash] of Object.entries(protectedRules))
		assert.equal(
			createHash("sha256")
				.update(text(Number(number)))
				.digest("hex"),
			hash,
			`Rule ${number}`
		);
	assert.equal(sections[16].title, "Ergebnismeldung");
	assert.equal(sections[17].title, "Bracket und Seeding");
});

test("states the approved conduct, evidence and spectator clarifications", () => {
	assert.match(text(4), /diskriminierenden/);
	assert.match(text(4), /Bugs.*gefälschten/);
	assert.match(text(10), /technischer Pausen/);
	assert.match(text(10), /weder ansehen noch anhören/);
	assert.match(text(10), /Freigabe durch die Orga/);
});

test("readiness starts with the confirmed match time, not a rolling estimate", () => {
	assert.match(text(12), /10 Minuten/);
	assert.match(text(12), /bestätigten Matchbeginn/);
	assert.match(text(12), /fünf zugelassene Spieler/);
	assert.match(text(12), /Schätzungen/);
});

test("forfeits are organizer decisions and never need fabricated game evidence", () => {
	assert.match(text(13), /nicht selbst erklären/);
	assert.match(text(13), /fiktive Spielzeit/);
	assert.match(text(17), /Forfeits trägt ausschließlich die Orga ein/);
});

test("pauses have a per-team game budget and require readiness before resuming", () => {
	assert.match(text(14), /pro Spiel insgesamt 10 Minuten/);
	assert.match(text(14), /nicht 10 Minuten pro Spieler/);
	assert.match(text(14), /beide Captains/);
	assert.match(text(14), /Kein Team erzwingt eigenmächtig/);
});

test("restarts use Game of Record, preserve the draft and never reset Fearless", () => {
	assert.match(text(15), /Game of Record/);
	assert.match(text(15), /02:00/);
	assert.match(text(15), /erste dieser Zeitpunkte/);
	assert.match(text(15), /Disconnects.*Pausenregel/);
	assert.match(text(15), /Fearless-Sperren werden weder gelöscht/);
	assert.match(text(15), /Serverabbruch/);
	assert.doesNotMatch(text(8) + text(15), /Vor Minute 3|ersten 3 Minuten/);
	assert.match(text(8), /Auch nach verbindlichem Spielbeginn/);
});

test("result reporting matches either-captain replay upload with organizer confirmation", () => {
	assert.match(text(17), /\.rofl/);
	assert.match(text(17), /Captain-Portal/);
	assert.match(text(17), /gegnerische Captain/);
	assert.match(text(17), /Ergebnisbestätigung durch die Orga/);
	assert.match(text(17), /Original-Replay/);
	assert.match(text(17), /nicht automatisch.*Niederlage/);
	assert.doesNotMatch(text(17), /offiziellen Turnier-Channel|Screenshot des Endbildschirms beifügen/);
	assert.match(text(18), /erste Setzliste ist nicht automatisch die Playoff-Reihenfolge/);
	assert.match(text(18), /nachvollziehbarer Begründung/);
});

test("Swiss tosses for choice, playoffs use seeding, and both public rules agree", () => {
	assert.equal(sideSelectionForStage(settings.structure, "day-one"), "coin-flip");
	assert.equal(sideSelectionForStage(settings.structure, "playoffs"), "higher-seed");
	assert.equal(sideSelectionForStage(settings.structure, "finals"), "higher-seed");
	assert.equal(sideChooser({ rule: sideSelectionForStage(settings.structure, "day-one"), games: [], higherSeedSide: "teamA" }), null);
	assert.equal(sideChooser({ rule: sideSelectionForStage(settings.structure, "playoffs"), games: [], higherSeedSide: "teamB" }), "teamB");
	assert.equal(automaticStageBlueSide({ config: settings.structure, stage: "day-one", games: [] }), null);
	assert.equal(automaticStageBlueSide({ config: settings.structure, stage: "playoffs", games: [] }), null);
	const description = describeSideSelection(settings.structure);
	assert.ok(sections[10].text.includes(description));
	assert.ok(sections[15].text.includes(description));
	assert.match(description, /welcher Captain Blue oder Red Side wählen darf/);
	assert.match(description, /nicht automatisch Blue Side/);
	assert.match(description, /Playoffs: Höher gesetztes Team wählt/);
});

test("other day-one formats retain configured side selection and rule exports stay consistent", () => {
	for (const rule of Object.keys(SIDE_SELECTION_LABELS)) {
		const config = { ...settings.structure, dayOneFormat: "groups", sideSelection: rule };
		assert.equal(sideSelectionForStage(config, "day-one"), rule);
		assert.equal(sideSelectionForStage(config, "playoffs"), rule);
		assert.ok(describeStructurePlan(config).some((line) => line.includes(SIDE_SELECTION_LABELS[rule])));
	}
	assert.equal(automaticStageBlueSide({ config: { ...settings.structure, dayOneFormat: "groups", sideSelection: "alternate" }, stage: "day-one", games: [] }), "teamA");
	assert.equal(automaticStageBlueSide({ config: settings.structure, stage: "day-one", games: [{ winner: "teamA", blueSide: "teamA" }] }), "teamB");
	const markdown = getDefaultRulesMarkdown(settings);
	assert.match(markdown, /## 17\. Ergebnismeldung/);
	assert.match(markdown, /## 22\. Admin-Entscheidungen/);
});

const require = createRequire(import.meta.url);
function compile(file, mocks, extraExports = "") {
	const source = readFileSync(new URL(file, import.meta.url), "utf8");
	const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
	const compiled = { exports: {} };
	new Function("require", "exports", output + extraExports)((name) => mocks[name] ?? (name.startsWith("@/") ? {} : require(name)), compiled.exports);
	return compiled.exports;
}

test("the real match-control builder exposes coin toss in Swiss but the higher seed in playoffs", async () => {
	const pairing = { id: "swiss-r1-1", teamAKey: "a", teamBKey: "b", teamAName: "Alpha", teamBName: "Bravo", bye: false };
	const { buildFlexibleStages, bracketToControl } = compile(
		"../src/lib/tournament-stages.ts",
		{
			"@/lib/bracket-engine": bracketEngine,
			"@/lib/tournament-standings": standings,
			"@/lib/tournament-runtime": { PLAY_IN_GROUP: "P" },
			"@/lib/tournament-series": series,
			"@/lib/tournament-structure": structure,
			"@/lib/tournament-standing-overrides": { getStandingOverrides: async () => ({}) },
			"@/lib/tournament-swiss": { getSwissStageState: async () => ({ tournamentId: "fearless-test", rounds: [{ round: 1, complete: false, pairings: [pairing] }] }) },
		},
		"\nexports.bracketToControl = bracketToControl;"
	);
	const ctx = {
		teams: [
			{ name: "Alpha", group: "A", seed: 1 },
			{ name: "Bravo", group: "A", seed: 2 },
		],
		groupMatches: [],
		groupSetupComplete: true,
	};
	const { matches } = await buildFlexibleStages({ settings, ctx, stored: {}, assignment: () => null });
	const swiss = matches.find((match) => match.id === pairing.id);
	assert.ok(swiss);
	assert.equal(swiss.sideSelectionTeamName, undefined);
	assert.equal(swiss.sideSelectionRule, "coin-flip");
	const playoff = bracketToControl(
		{ id: "ub-r1-1", stage: "playoffs", bestOf: 1, teamAName: "Alpha", teamBName: "Bravo", teamASeed: 8, teamBSeed: 1 },
		"playoffs",
		settings,
		() => null
	);
	assert.equal(playoff.sideSelectionTeamName, "Bravo");
	assert.equal(playoff.sideSelectionSeed, 1);
	assert.equal(playoff.sideSelectionRule, "higher-seed");
	for (const seeds of [{}, { teamASeed: 1 }, { teamASeed: 1, teamBSeed: 1 }]) {
		const unresolved = bracketToControl({ id: "ub-r1-1", stage: "playoffs", bestOf: 1, teamAName: "Alpha", teamBName: "Bravo", ...seeds }, "playoffs", settings, () => null);
		assert.equal(unresolved.sideSelectionTeamName, undefined);
		assert.equal(unresolved.sideSelectionRule, "higher-seed", "Missing seeds never fall back to a coin toss");
	}
	for (const [format, count] of [
		["double-elimination", 8],
		["double-elimination-light", 8],
		["double-elimination-light", 6],
	]) {
		const definitions = bracketEngine.playoffDefinitions(format, count, { grandFinalReset: false });
		const seeds = Object.fromEntries(Array.from({ length: count }, (_, index) => [index + 1, `Team ${index + 1}`]));
		const stored = {};
		let checked = 0;
		for (const definition of definitions) {
			const resolved = bracketEngine.resolveBracket({ definitions, seeds, stored, bestOf: () => 1 }).find((match) => match.id === definition.id);
			assert.ok(resolved.teamAName && resolved.teamBName, `${format}: ${definition.id} resolves`);
			const control = bracketToControl(resolved, "playoffs", settings, () => null);
			const higherSeed = Math.min(resolved.teamASeed, resolved.teamBSeed);
			assert.equal(control.sideSelectionTeamName, seeds[higherSeed], `${format}: ${definition.id}`);
			assert.equal(control.sideSelectionSeed, higherSeed);
			assert.equal(control.sideSelectionRule, "higher-seed");
			// Include upsets so lower-bracket and final choices use original playoff seeds, not bracket position.
			stored[resolved.id] = { teamAName: resolved.teamAName, teamBName: resolved.teamBName, scoreA: checked % 2, scoreB: 1 - (checked % 2) };
			checked++;
		}
		assert.equal(checked, definitions.length);
	}
});

test("the terms page renders the updated numbered rules and still respects custom markdown", async () => {
	const state = { ...settings, activeTournament: { ...settings.activeTournament, name: "Fearless Turnier" } };
	const { default: TermsPage } = compile("../src/app/tournament/terms/page.tsx", {
		"../TournamentLink": { TournamentLink: ({ href, children }) => createElement("a", { href }, children) },
		"@/lib/tournament-rulebook": { getDefaultRuleSections },
		"@/components/TournamentMarkdown": { TournamentMarkdown: ({ children }) => createElement("div", null, children) },
		"@/lib/tournament-settings": { getTournamentSettings: async () => state },
		"@/components/site/PageIntro": { PageIntro: ({ title, children }) => createElement("header", null, createElement("h1", null, title), children) },
	});
	const html = renderToStaticMarkup(await TermsPage());
	assert.match(html, /\.rofl-Replay/);
	assert.match(html, /10 Minuten technische Pausenzeit/);
	assert.match(html, /Game of Record/);
	assert.match(html, /Seitenwahl in Swiss/);
	assert.match(html, /Seitenwahl in den Playoffs/);
	assert.doesNotMatch(html, /Vor Minute 3|offiziellen Turnier-Channel/);
	assert.equal((html.match(/class="content-panel tight"/g) ?? []).length, 22);
	state.activeTournament.rulesMarkdown = "Custom rules stay untouched.";
	const custom = renderToStaticMarkup(await TermsPage());
	assert.match(custom, /Custom rules stay untouched/);
	assert.doesNotMatch(custom, /Game of Record/);
});
