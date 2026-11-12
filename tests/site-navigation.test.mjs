import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildTournamentSubnav } from "../src/lib/tournament-presentation.ts";
import { DEFAULT_STRUCTURE_OPTIONS } from "../src/lib/tournament-structure.ts";

const require = createRequire(import.meta.url);
let pathname = "/";
const mocks = {
	"next/navigation": { usePathname: () => pathname },
	"next/image": { default: () => null },
	"@/app/tournament/TournamentLink": { TournamentLink: (props) => createElement("a", props) },
};
const source = readFileSync(new URL("../src/components/site/SiteHeader.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const compiled = { exports: {} };
new Function("require", "exports", output)((name) => mocks[name] ?? require(name), compiled.exports);
const { SiteHeader } = compiled.exports;

function currentLinks(navItems, path) {
	pathname = path;
	const html = renderToStaticMarkup(createElement(SiteHeader, { homeHref: "/tournament", homeLabel: "Home", navItems }));
	return [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map((match) => match[1]);
}

test("Turnier stays highlighted on every tournament tab and nested route on both URL styles", () => {
	for (const kind of ["fearless", "az", "ultimate-bravery"]) {
		const subnav = buildTournamentSubnav({
			settings: { activeTournament: { kind, mode: "live" }, structure: { ...DEFAULT_STRUCTURE_OPTIONS, dayOneFormat: "swiss", format: "double-elimination" } },
			rosterPublished: true,
			isCaptain: true,
		});
		const nav = [
			{ href: "/tournament", label: "Turnier", matches: subnav.map((item) => item.href) },
			{ href: "/tournament/winners", label: "Archiv", matches: ["/tournament/archive"] },
			{ href: "/tournament/terms", label: "Regeln" },
			{ href: "/tournament/admin", label: "Admin" },
		];
		for (const item of subnav) {
			const clean = item.href.replace(/^\/tournament/, "") || "/";
			for (const path of [item.href, clean]) assert.deepEqual(currentLinks(nav, path), ["Turnier"], `${kind}: ${path}`);
			if (clean !== "/") assert.deepEqual(currentLinks(nav, `${clean}/details`), ["Turnier"]);
		}
		for (const prefix of ["", "/tournament"]) {
			assert.deepEqual(currentLinks(nav, `${prefix}/terms`), ["Regeln"]);
			assert.deepEqual(currentLinks(nav, `${prefix}/archive/fearless-2026`), ["Archiv"]);
			assert.deepEqual(currentLinks(nav, `${prefix}/winners`), ["Archiv"]);
			assert.deepEqual(currentLinks(nav, `${prefix}/admin/settings`), ["Admin"]);
			assert.deepEqual(currentLinks(nav, `${prefix}/teams-other`), []);
		}
	}
});

test("main-site Start remains exact and external links never become current", () => {
	const nav = [
		{ href: "/", label: "Start", matches: ["/landing"] },
		{ href: "/clips", label: "Clips" },
		{ href: "/overlay", label: "OBS-Tools" },
		{ href: "https://tournament.lauchgruen.de", label: "Turnier", external: true },
	];
	assert.deepEqual(currentLinks(nav, "/"), ["Start"]);
	assert.deepEqual(currentLinks(nav, "/landing"), ["Start"]);
	assert.deepEqual(currentLinks(nav, "/clips"), ["Clips"]);
	assert.deepEqual(currentLinks(nav, "/overlay/presets"), ["OBS-Tools"]);
	assert.deepEqual(currentLinks(nav, "/me"), []);
});
