import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as broadcast from "../src/lib/tournament-broadcast.ts";
import { demoBroadcastSnapshot } from "../src/lib/tournament-broadcast-demo.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/obs/broadcast/BroadcastSetup.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function render(initialTeam) {
	const data = demoBroadcastSnapshot();
	data.teams[0] = { ...data.teams[0], id: "gank-mich-doch", key: "die wegwerf-mains", name: "Gank mich doch" };
	data.matches[0] = { ...data.matches[0], teamA: data.teams[0] };
	let index = 0;
	const modules = {
		react: {
			useEffect() {},
			useState: (initial) => {
				const slot = index++;
				return [slot === 0 ? data : slot === 4 ? "http://localhost:3000" : initial, () => {}];
			},
		},
		"@/lib/tournament-broadcast": broadcast,
		"next/link": { __esModule: true, default: ({ href, className, children }) => createElement("a", { href, className }, children) },
		"next/image": { __esModule: true, default: ({ src, alt, width, height }) => createElement("img", { src, alt, width, height }) },
	};
	const compiled = { exports: {} };
	new Function("require", "exports", output)((name) => modules[name] ?? require(name), compiled.exports);
	return renderToStaticMarkup(createElement(compiled.exports.BroadcastSetup, { initialTeam }));
}

test("builder emits the existing overlay team ID, not the historical storage name", () => {
	const html = render("gank-mich-doch");
	for (const scene of ["match-bar", "tournament-waiting", "champ-select"]) assert.match(html, new RegExp(`/obs/${scene}\\?team=gank-mich-doch`));
	assert.doesNotMatch(html, /die\+wegwerf|die wegwerf/);
	assert.match(html, /value="gank-mich-doch" selected=""/);
});

test("opening the builder with an early internal-key URL canonicalizes copied source links", () => {
	const html = render("die wegwerf-mains");
	assert.match(html, /\/obs\/match-bar\?team=gank-mich-doch/);
	assert.doesNotMatch(html, /team=die/);
});

test("setup copy explains the OBS sources without promotional slogans", () => {
	const html = render("");
	assert.match(html, /<h1>Turnier-Overlays<\/h1>/);
	assert.match(html, /Wähle dein Team und füge den Link/);
	assert.doesNotMatch(html, /Für die große Bühne|Euer Turnier\.|Deine Szene\.|Die Draft-Bühne|Dein Match\. Auf einen Blick\./);
});

test("the compact team overlay is offered on the same setup page", () => {
	const html = render("gank-mich-doch");
	assert.ok(html.includes("Team-Overlay (kompakt)"));
	assert.ok(html.includes("/obs/tournament?team=gank-mich-doch"));
});
