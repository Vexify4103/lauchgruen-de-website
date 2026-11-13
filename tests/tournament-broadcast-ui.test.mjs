import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ts from "typescript";
import * as broadcast from "../src/lib/tournament-broadcast.ts";
import * as draw from "../src/lib/swiss-pot-draw.ts";
import { demoBroadcastSnapshot } from "../src/lib/tournament-broadcast-demo.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/obs/broadcast/BroadcastPlayer.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function render(scene, snapshot = demoBroadcastSnapshot(), reveals = []) {
	let index = 0;
	const compiled = { exports: {} };
	const modules = {
		react: { useEffect() {}, useState: (initial) => [index++ === 0 ? { snapshot, reveals, error: false } : initial, () => {}] },
		"@/lib/tournament-broadcast": broadcast,
		"@/lib/swiss-pot-draw": draw,
		"@/components/SwissTeamDrawReel": { SwissTeamDrawReel: () => createElement("span", { "data-reel": true }, "Auslosung") },
	};
	new Function("require", "exports", output)((name) => modules[name] ?? require(name), compiled.exports);
	return renderToStaticMarkup(createElement(compiled.exports.BroadcastPlayer, { scene, query: "demo=1" }));
}

test("all five OBS scenes render as dedicated broadcast surfaces without admin controls", () => {
	for (const scene of broadcast.BROADCAST_SCENES) {
		const fixture = demoBroadcastSnapshot();
		fixture.selectedMatch = fixture.matches[0];
		const html = render(scene, fixture);
		assert.match(html, new RegExp(`broadcast-${scene}`));
		assert.match(html, /VORSCHAU/);
		assert.doesNotMatch(html, /<button|SWISS ZURÜCKSETZEN|Admin-Cockpit|CreatorCredit|<nav/);
	}
});

test("draw reveal is only inside the selected slot and cannot leak upcoming team names", () => {
	const before = demoBroadcastSnapshot(0),
		after = demoBroadcastSnapshot(3);
	const reveals = broadcast.broadcastDrawReveals(before, after);
	const html = render("swiss-draw", after, reveals);
	assert.equal((html.match(/data-reel=/g) ?? []).length, 1);
	for (const reveal of reveals) assert.doesNotMatch(html, new RegExp(reveal.candidates.find((team) => team.key === reveal.winner).name));
	assert.equal((html.match(/Noch im Lostopf/g) ?? []).length, 7);
	assert.match(html, /Ziehung läuft/);
});

test("draft team names follow actual blue-side selection while picks stay on draft blue/red sides", () => {
	const fixture = demoBroadcastSnapshot();
	fixture.selectedMatch = { ...fixture.matches[0], blueSide: "teamB" };
	const html = render("champ-select", fixture);
	const blue = html.slice(html.indexOf("broadcast-draft-team is-blue"), html.indexOf("broadcast-draft-team is-red"));
	assert.match(blue, new RegExp(fixture.matches[0].teamB.name));
	assert.match(blue, /Ahri/);
	assert.doesNotMatch(blue, /Jinx/);
});

test("unpublished rosters show no teams and paused drafts show no picks", () => {
	const fixture = demoBroadcastSnapshot();
	fixture.published = false;
	fixture.teams = [];
	fixture.matches = [];
	fixture.draw = null;
	assert.match(render("tournament-board", fixture), /Die Teams folgen/);
	fixture.published = true;
	fixture.draftEnabled = false;
	assert.match(render("champ-select", fixture), /Champ Select ist pausiert/);
	assert.doesNotMatch(render("champ-select", fixture), /Ahri|Jinx|LOCKED IN/);
});

test("canvas is fixed full-HD with scoped styles and retains reduced-motion support", () => {
	const css = readFileSync(new URL("../src/app/obs/broadcast.css", import.meta.url), "utf8");
	assert.match(css, /width: 1920px/);
	assert.match(css, /height: 1080px/);
	assert.match(css, /transform-origin: top left/);
	assert.match(css, /prefers-reduced-motion: reduce/);
	assert.doesNotMatch(css, /(?:^|\n)html|(?:^|\n)body/);
});

test("full-screen scenes fill the canvas instead of sitting inside an inset rounded card", () => {
	const css = readFileSync(new URL("../src/app/obs/broadcast.css", import.meta.url), "utf8");
	const stage = css.match(/\.broadcast-stage\s*\{([^}]+)\}/)[1];
	assert.match(stage, /inset:\s*0;/);
	assert.match(stage, /border-radius:\s*0;/);
	assert.doesNotMatch(stage, /62px 100px|box-shadow/);
	const pot = css.match(/\.broadcast-pots\.pots-1\s*\{([^}]+)\}/)[1];
	assert.match(pot, /width:\s*100%;/);
	assert.doesNotMatch(pot, /max-width/);
	const bar = render("match-bar");
	assert.doesNotMatch(bar, /class="broadcast-stage"/);
	assert.match(bar, /class="broadcast-matchbar"/);
});
