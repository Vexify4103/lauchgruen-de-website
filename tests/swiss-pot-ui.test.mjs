import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ts from "typescript";
import * as draw from "../src/lib/swiss-pot-draw.ts";
import * as rules from "../src/lib/tournament-swiss-rules.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/swiss-draw-test/SwissPotSimulator.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function render(state, { busy = false, reveal = null } = {}) {
	let index = 0;
	const compiled = { exports: {} };
	const mocks = {
		react: {
			useEffect() {},
			useState: (initial) => {
				const slot = index++;
				return [slot === 0 ? { revision: 0, state } : slot === 2 ? busy : slot === 5 ? reveal : initial, () => {}];
			},
			useRef: (value) => ({ current: value }),
		},
		"@/components/ConfirmDialog": { ConfirmDialog: () => null },
		"@/components/SwissTeamDrawReel": { SwissTeamDrawReel: ({ draw }) => createElement("span", { "data-reel": draw.id }, "Ziehung") },
		"@/lib/swiss-pot-draw": draw,
		"@/lib/tournament-swiss-rules": rules,
	};
	new Function("require", "exports", output)((name) => mocks[name] ?? require(name), compiled.exports);
	return renderToStaticMarkup(compiled.exports.SwissPotSimulator());
}

test("the ready simulator presents fake teams and exactly one-team draw controls", () => {
	const html = render(draw.createSwissPotState());
	assert.match(html, /Nur lokal/);
	assert.match(html, /Runde 1: Ein Team ziehen/);
	assert.match(html, /lauchgruen_swiss_draw_sandbox/);
	assert.match(html, /lg:grid-cols-\[minmax\(0,1fr\)_300px\]/);
	assert.match(html, /Der erste Klick zieht nur das Team für Slot A/);
});

test("one draw displays one occupied slot and seven placeholders, not a secretly revealed full round", () => {
	const state = draw.advanceSwissPotDraw(draw.createSwissPotState(), { type: "draw" }, () => 0);
	const html = render(state);
	assert.equal((html.match(/Noch nicht gezogen/g) ?? []).length, 7);
	assert.match(html, /1\/8 Teams gezogen/);
	assert.match(html, /Gerade gezogen/);
	assert.doesNotMatch(html, /Team Ahorn gewinnt/);
});

test("a fully drawn round shows winner controls and prevents opening the next round early", () => {
	let state = draw.createSwissPotState();
	for (let index = 0; index < 8; index++) state = draw.advanceSwissPotDraw(state, { type: "draw" }, () => 0);
	const html = render(state);
	assert.match(html, /Zuerst alle Sieger eintragen/);
	assert.match(html, /Team Ahorn gewinnt/);
	assert.match(html, /Team Kastanie gewinnt/);
	assert.equal((html.match(/Noch nicht gezogen/g) ?? []).length, 0);
});

test("the first draw animates only slot A, not a separate panel above the board", () => {
	const state = draw.createSwissPotState();
	const reveal = { id: 1, round: 1, record: "0-0", slot: 0, candidates: state.teams };
	const html = render(state, { busy: true, reveal });
	assert.equal((html.match(/data-reel=/g) ?? []).length, 1);
	assert.equal((html.match(/data-draw-slot=/g) ?? []).length, 8);
	assert.equal((html.match(/Noch nicht gezogen/g) ?? []).length, 7);
	assert.ok(html.indexOf('data-draw-slot="A"') < html.indexOf('data-reel="1"'));
	assert.ok(html.indexOf('data-reel="1"') < html.indexOf('data-draw-slot="E"'));
});

test("a new round previews its slots before revealing the server-selected name", () => {
	let state = draw.createSwissPotState();
	for (let index = 0; index < 8; index++) state = draw.advanceSwissPotDraw(state, { type: "draw" }, () => 0);
	for (const pair of state.rounds[0].pairings) state = draw.advanceSwissPotDraw(state, { type: "result", pairingId: pair.id, winnerTeamKey: pair.teamAKey }, () => 0);
	const reveal = { id: 2, round: 2, record: "1-0", slot: 0, candidates: state.teams.slice(0, 4) };
	const html = render(state, { busy: true, reveal });
	assert.match(html, /Runde 2 von 4/);
	assert.equal((html.match(/data-reel=/g) ?? []).length, 1);
	assert.equal((html.match(/data-draw-slot=/g) ?? []).length, 8);
});
