import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/ThemedDateTimePicker.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});

function harness() {
	const states = [];
	let cursor = 0;
	const effects = [];
	const listeners = new Map();
	const changes = [];
	const document = { body: {}, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {} };
	const window = { addEventListener() {}, removeEventListener() {} };
	const compiled = { exports: {} };
	new Function("require", "exports", "document", "window", "requestAnimationFrame", outputText)((name) => {
		if (name === "react-dom") return { createPortal: (node, target) => ({ node, target }) };
		if (name !== "react") return require(name);
		return {
			useId: () => "date-picker",
			useRef: () => ({ current: null }),
			useEffect: (effect) => effects.push(effect),
			useState(initial) {
				const index = cursor++;
				if (!(index in states)) states[index] = index === 0 ? true : typeof initial === "function" ? initial() : initial;
				return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
			},
		};
	}, compiled.exports, document, window, () => {});
	const render = () => {
		cursor = 0;
		return compiled.exports.ThemedDateTimePicker({ value: "2026-11-06T18:00", ariaLabel: "Bewerbungsfrist", onChange: (value) => changes.push(value) });
	};
	return { render, effects, listeners, changes, document };
}

function descendants(node) {
	if (!node || typeof node !== "object") return [];
	const children = [node.props?.children].flat(Infinity);
	return [node, ...children.flatMap(descendants)];
}

test("calendar portal stacks above the admin backdrop without card clipping", () => {
	const h = harness();
	const portal = h.render().props.children[2];
	assert.equal(portal.target, h.document.body);
	const pickerLayer = Number(/z-\[(\d+)\]/.exec(portal.node.props.className)[1]);
	const css = readFileSync(new URL("../src/app/admin-system.css", import.meta.url), "utf8");
	const modalLayer = Number(/\.admin-modal-backdrop\s*\{[^}]*z-index:\s*(\d+)/.exec(css)[1]);
	assert.ok(pickerLayer > modalLayer, `Calendar ${pickerLayer} must be above admin modal ${modalLayer}`);
});

test("Escape dismisses the calendar and stops propagation to the admin panel", () => {
	const h = harness();
	h.render();
	h.effects[0]();
	let prevented = false;
	let stopped = false;
	h.listeners.get("keydown")({ key: "Escape", preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
	assert.ok(prevented);
	assert.ok(stopped);
	assert.equal(h.render().props.children[2], null);
});

test("selecting a day and applying still updates the date with its time", () => {
	const h = harness();
	let calendar = h.render().props.children[2].node;
	descendants(calendar).find((node) => node.props?.["data-day"] === "2026-10-14").props.onClick();
	calendar = h.render().props.children[2].node;
	descendants(calendar).find((node) => node.props?.children === "Übernehmen").props.onClick();
	assert.deepEqual(h.changes, ["2026-11-14T18:00"]);
	assert.equal(h.render().props.children[2], null);
});
