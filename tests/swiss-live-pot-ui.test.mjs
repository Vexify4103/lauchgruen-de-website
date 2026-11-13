import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, Fragment } from "react";
import ts from "typescript";
import * as draw from "../src/lib/swiss-pot-draw.ts";
import * as adapter from "../src/lib/swiss-live-pot.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/tournament/admin/live/LiveSwissPotControl.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function stage(pot) {
	return {
		tournamentId: "fixture",
		updatedAt: new Date(0).toISOString(),
		drawEvents: pot.events,
		rounds: pot.rounds.map((round) => ({
			...round,
			drawPools: round.pools,
			drawnAt: new Date(0).toISOString(),
			pairings: round.pairings.map((pair) => ({
				...pair,
				teamAName: pot.teams.find((team) => team.key === pair.teamAKey).name,
				teamBName: pot.teams.find((team) => team.key === pair.teamBKey).name,
			})),
		})),
	};
}
function render(pot, { reveal = null, busy = false, testMode = false, seededOrder, notice = "" } = {}) {
	const state = stage(pot);
	let index = 0;
	const compiled = { exports: {} };
	const mocks = {
		react: {
			Fragment,
			useEffect() {},
			useEffectEvent: (callback) => callback,
			useRef: (value) => ({ current: value }),
			useState: (initial) => {
				const slot = index++;
				return [slot === 0 ? state : slot === 1 ? busy : slot === 3 ? notice : slot === 4 ? reveal : initial, () => {}];
			},
		},
		"next/navigation": { useRouter: () => ({ refresh() {} }) },
		"@/components/ConfirmDialog": { ConfirmDialog: () => null },
		"@/components/SwissTeamDrawReel": { SwissTeamDrawReel: ({ draw }) => createElement("span", { "data-reel": draw.id }, "Ziehung") },
		"@/lib/swiss-pot-draw": draw,
		"@/lib/swiss-live-pot": adapter,
		"../../TournamentLink": { TournamentLink: ({ children, ...props }) => createElement("a", props, children) },
	};
	new Function("require", "exports", output)((name) => mocks[name] ?? require(name), compiled.exports);
	return renderToStaticMarkup(createElement(compiled.exports.LiveSwissPotControl, { initialState: state, teams: pot.teams, testMode, seededOrder, onReset() {} }));
}

test("live control starts with eight empty slots and a one-team draw button", () => {
	const html = render(draw.createSwissPotState());
	assert.match(html, /R1 · 0-0 · Slot A ziehen/);
	assert.equal((html.match(/data-draw-slot=/g) ?? []).length, 8);
	assert.equal((html.match(/Noch nicht gezogen/g) ?? []).length, 8);
});

test("each matchup has a visible vs separator between its paired slots", () => {
	const html = render(draw.createSwissPotState());
	assert.equal((html.match(/>vs<\/span>/g) ?? []).length, 4);
	for (const [left, right] of [
		["A", "E"],
		["B", "F"],
		["C", "G"],
		["D", "H"],
	]) {
		assert.match(html, new RegExp(`aria-label="Slot ${left} gegen Slot ${right}"`));
		const row = html.slice(html.indexOf(`aria-label="Slot ${left} gegen Slot ${right}"`));
		assert.ok(row.indexOf(`data-draw-slot="${left}"`) < row.indexOf(">vs</span>"));
		assert.ok(row.indexOf(">vs</span>") < row.indexOf(`data-draw-slot="${right}"`));
	}
});

test("a saved single draw survives rendering without revealing future teams or creating match links", () => {
	const pot = draw.advanceSwissPotDraw(draw.createSwissPotState(), { type: "draw" }, () => 0);
	const html = render(pot);
	assert.match(html, /R1 · 0-0 · Slot B ziehen/);
	assert.equal((html.match(/Noch nicht gezogen/g) ?? []).length, 7);
	assert.doesNotMatch(html, /Matchkontrolle/);
});

test("the real admin animates exactly one name in the active slot", () => {
	const pot = draw.createSwissPotState();
	const html = render(pot, { busy: true, reveal: { id: 1, round: 1, record: "0-0", slot: 0, candidates: pot.teams } });
	assert.equal((html.match(/data-reel=/g) ?? []).length, 1);
	assert.equal((html.match(/Noch nicht gezogen/g) ?? []).length, 7);
	assert.ok(html.indexOf('data-draw-slot="A"') < html.indexOf('data-reel="1"'));
	assert.ok(html.indexOf('data-reel="1"') < html.indexOf('data-draw-slot="E"'));
});

test("the server result message cannot spoil the winner before the slot reveal completes", () => {
	const pot = draw.createSwissPotState();
	const notice = "Team Ahorn gewonnen, geheime Ergebnisnachricht";
	const html = render(pot, { notice, busy: true, reveal: { id: 1, round: 1, record: "0-0", slot: 0, candidates: pot.teams, winner: pot.teams[0].key } });
	assert.doesNotMatch(html, /geheime Ergebnisnachricht/);
	assert.match(render(pot, { notice }), /geheime Ergebnisnachricht/);
});

test("completed draws retain normal match-control links and require results before continuing", () => {
	let pot = draw.createSwissPotState();
	for (let i = 0; i < 8; i++) pot = draw.advanceSwissPotDraw(pot, { type: "draw" }, () => 0);
	const html = render(pot);
	assert.match(html, /Ergebnisse fehlen/);
	assert.equal((html.match(/Matchkontrolle/g) ?? []).length, 4);
	assert.doesNotMatch(html, /gewinnt/);
	const testHtml = render(pot, { testMode: true });
	assert.equal((testHtml.match(/gewinnt/g) ?? []).length, 8);
	assert.doesNotMatch(testHtml, /Matchkontrolle/);
});

test("a new round previews only its record-specific slots and candidate pot", () => {
	let pot = draw.createSwissPotState();
	for (let i = 0; i < 8; i++) pot = draw.advanceSwissPotDraw(pot, { type: "draw" }, () => 0);
	for (const pair of pot.rounds[0].pairings) pot = draw.advanceSwissPotDraw(pot, { type: "result", pairingId: pair.id, winnerTeamKey: pair.teamAKey }, () => 0);
	const next = draw.nextSwissPot(pot);
	assert.equal(next.record, "1-0");
	const html = render(pot, { busy: true, reveal: { ...next, id: 2, candidates: pot.teams.filter((team) => next.remaining.includes(team.key)) } });
	assert.match(html, /Runde 2 · Vorschau/);
	assert.equal((html.match(/data-draw-slot=/g) ?? []).length, 8);
	assert.equal((html.match(/data-reel=/g) ?? []).length, 1);
});

test("seeded openings are labelled honestly rather than showing a fake random reel", () => {
	const pot = draw.createSwissPotState();
	const html = render(pot, { seededOrder: pot.teams.map((team) => team.key) });
	assert.match(html, /veröffentlichten Setzliste/);
	assert.match(html, /Bekannte Paarungen übernehmen/);
	assert.doesNotMatch(html, /data-reel=/);
});
