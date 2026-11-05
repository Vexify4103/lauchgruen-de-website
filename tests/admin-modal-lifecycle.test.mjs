import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/tournament/admin/AdminModal.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});
// Isolate the render contract; browser focus/effects are not exercised here.
const compiled = { exports: {} };
new Function("require", "exports", outputText)((name) => name === "react" ? {
	useEffect() {}, useEffectEvent: (fn) => fn, useId: () => "modal-title", useRef: () => ({ current: null }),
} : require(name), compiled.exports);
const { AdminModal } = compiled.exports;
const child = require("react").createElement("progress", { value: 12, max: 29 });
const props = { kicker: "Test", title: "Refresh", onClose() {}, children: child };
const body = (tree) => tree.props.children.props.children[1].props.children;

test("persistent modal retains the same child tree through open, close, reopen", () => {
	for (const open of [true, false, true]) {
		const tree = AdminModal({ ...props, open, keepMounted: true });
		assert.equal(body(tree), child);
		assert.equal(tree.props.hidden, !open);
		assert.equal(tree.props.style?.display, open ? undefined : "none");
	}
});

test("ordinary closed admin modals still unmount their contents", () => {
	assert.equal(AdminModal({ ...props, open: false }), null);
	assert.equal(body(AdminModal({ ...props, open: true })), child);
});

test("only the Riot refresh modal opts into preservation", () => {
	const overview = readFileSync(new URL("../src/app/tournament/admin/ControlOverview.tsx", import.meta.url), "utf8");
	const persistent = overview.match(/<AdminModal\b[^>]*\bkeepMounted[^>]*>/g);
	assert.equal(persistent?.length, 1);
	assert.match(persistent[0], /modal === "riot"/);
});
