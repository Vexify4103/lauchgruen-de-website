import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/RoleIcon.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
const compiled = { exports: {} };
new Function("require", "exports", outputText)(require, compiled.exports);
const render = (role, className) => renderToStaticMarkup(createElement(compiled.exports.RoleIcon, { role, className }));
const path = (role) => /<path d="([^"]+)"/.exec(render(role))?.[1];

test("keeps the existing top, mid and bottom silhouettes unchanged", () => {
	assert.equal(path("Top"), "M4 4h12v2.5H6.5V16H4V4Zm5 5h7v7H9V9Z");
	assert.equal(path("Mid"), "M4 13.5 13.5 4H16v2.5L6.5 16H4v-2.5ZM4 4h5v2H6v3H4V4Zm12 12h-5v-2h3v-3h2v5Z");
	assert.equal(path("ADC"), "M16 16H4v-2.5h9.5V4H16v12ZM4 4h7v7H4V4Z");
});

test("jungle and support aliases use the new multi-part role silhouettes", () => {
	assert.equal(path(" JGL "), path("Jungle"));
	assert.equal(path("SUP"), path("Support"));
	assert.equal(path("Utility"), path("Support"));
	assert.equal((path("Jungle").match(/M/g) ?? []).length, 3);
	assert.equal((path("Support").match(/M/g) ?? []).length, 4);
	assert.notEqual(path("Jungle"), path("Support"));
});

test("substitutes have a dedicated swap icon instead of the unknown-role dot", () => {
	for (const alias of ["Sub", "substitute", "Ersatz", "Ersatzspieler", "bench"]) {
		assert.equal(path(alias), path("Sub"));
		assert.doesNotMatch(render(alias), /<circle/);
	}
	assert.equal((path("Sub").match(/M/g) ?? []).length, 2);
	assert.match(render("Unknown"), /<circle/);
});

test("preserves sizing, accessible labels and inherited role colours", () => {
	const html = render("Support", "size-5");
	assert.match(html, /viewBox="0 0 20 20"/);
	assert.match(html, /class="size-5"/);
	assert.match(html, /role="img" aria-label="Support"/);
	assert.match(html, /<title>Support<\/title>/);
	assert.match(html, /fill="currentColor"/);
});
