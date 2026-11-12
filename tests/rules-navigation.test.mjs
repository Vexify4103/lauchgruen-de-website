import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/tournament/terms/RulesNavigation.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });

function harness({ clipboardFails = false } = {}) {
	const states = [];
	let cursor = 0;
	const effects = [];
	const listeners = new Map();
	const positions = new Map();
	const frames = new Map();
	const timers = new Map();
	const copied = [];
	let nextId = 0;
	const compiled = { exports: {} };
	const window = {
		location: { href: "https://tournament.lauchgruen.de/terms" },
		addEventListener: (name, fn) => listeners.set(name, fn),
		removeEventListener: (name) => listeners.delete(name),
		setTimeout: (fn) => {
			timers.set(++nextId, fn);
			return nextId;
		},
		clearTimeout: (id) => timers.delete(id),
	};
	const document = { documentElement: {}, getElementById: (id) => (positions.has(id) ? { getBoundingClientRect: () => ({ top: positions.get(id) }) } : null) };
	new Function("require", "exports", "window", "document", "navigator", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", outputText)(
		(name) =>
			name === "react"
				? {
						useState(initial) {
							const index = cursor++;
							if (!(index in states)) states[index] = initial;
							return [
								states[index],
								(next) => {
									states[index] = next;
								},
							];
						},
						useEffect: (effect) => effects.push(effect),
					}
				: require(name),
		compiled.exports,
		window,
		document,
		{
			clipboard: {
				writeText: async (value) => {
					if (clipboardFails) throw new Error("Clipboard unavailable");
					copied.push(value);
				},
			},
		},
		() => ({ scrollPaddingTop: "158px" }),
		(fn) => {
			frames.set(++nextId, fn);
			return nextId;
		},
		(id) => frames.delete(id)
	);
	return {
		render(name, props) {
			cursor = 0;
			effects.length = 0;
			return compiled.exports[name](props);
		},
		flush() {
			const callbacks = [...frames.values()];
			frames.clear();
			callbacks.forEach((fn) => fn());
		},
		effects,
		positions,
		listeners,
		frames,
		timers,
		copied,
	};
}
function descendants(node) {
	if (!node || typeof node !== "object") return [];
	return [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)];
}
const categories = [
	{ id: "teilnahme", title: "Teilnahme", rules: [{ id: "accounts", title: "Accounts", number: 2 }] },
	{ id: "streams", title: "Streaming", rules: [{ id: "streaming", title: "Streaming-Vorgaben", number: 20 }] },
];

test("sidebar follows scrolling and hash changes without rewriting the URL", () => {
	const h = harness();
	h.render("RulesNavigation", { categories });
	for (const [id, top] of [
		["teilnahme", -500],
		["accounts", -300],
		["streams", 100],
		["streaming", 180],
	])
		h.positions.set(id, top);
	const cleanup = h.effects[0]();
	h.flush();
	let tree = descendants(h.render("RulesNavigation", { categories }));
	assert.ok(tree.some((node) => node.props?.href === "#streaming" && node.props["aria-current"] === "location"));
	assert.ok(tree.some((node) => node.props?.href === "#streams" && node.props["aria-current"] === "location"));
	h.positions.set("streams", 500);
	h.positions.set("streaming", 600);
	h.listeners.get("hashchange")();
	h.listeners.get("scroll")();
	assert.equal(h.frames.size, 1, "Scroll work is batched into one animation frame");
	h.flush();
	tree = descendants(h.render("RulesNavigation", { categories }));
	assert.ok(tree.some((node) => node.props?.href === "#accounts" && node.props["aria-current"] === "location"));
	cleanup();
	assert.equal(h.listeners.size, 0);
	assert.equal(h.frames.size, 0);
});

test("categories expand independently, with native hash links and collapsed mobile navigation", () => {
	const h = harness();
	let tree = descendants(h.render("RulesNavigation", { categories }));
	assert.equal(tree.find((node) => node.type === "details").props.open, undefined);
	const button = tree.find((node) => node.type === "button" && node.props["aria-label"].startsWith("Streaming:"));
	assert.equal(button.props["aria-expanded"], false);
	button.props.onClick();
	tree = descendants(h.render("RulesNavigation", { categories }));
	assert.ok(tree.some((node) => node.type === "button" && node.props["aria-label"].startsWith("Streaming:") && node.props["aria-expanded"]));
	assert.ok(tree.some((node) => node.type === "a" && node.props.href === "#streaming"));
});

test("copy buttons share stable anchor URLs and announce success", async () => {
	const h = harness();
	const props = { id: "streaming", title: "Streaming-Vorgaben" };
	let tree = descendants(h.render("CopyRuleLink", props));
	await tree.find((node) => node.type === "button").props.onClick();
	assert.deepEqual(h.copied, ["https://tournament.lauchgruen.de/terms#streaming"]);
	tree = descendants(h.render("CopyRuleLink", props));
	assert.equal(tree.find((node) => node.props?.role === "status").props.children, "Link kopiert.");
	const cleanup = h.effects[0]();
	assert.equal(h.timers.size, 1);
	cleanup();
	assert.equal(h.timers.size, 0);
});

test("clipboard rejection provides a usable direct-link fallback", async () => {
	const h = harness({ clipboardFails: true });
	const props = { id: "seitenwahl", title: "Seitenwahl" };
	await descendants(h.render("CopyRuleLink", props))
		.find((node) => node.type === "button")
		.props.onClick();
	assert.ok(descendants(h.render("CopyRuleLink", props)).some((node) => node.type === "a" && node.props.href === "#seitenwahl"));
});

test("responsive navigation is sticky on desktop and non-sticky on mobile", () => {
	const css = readFileSync(new URL("../src/app/rules.css", import.meta.url), "utf8");
	assert.match(css, /\.rules-sidebar\s*\{[^}]*position: sticky/s);
	assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.rules-sidebar\s*\{[^}]*position: static/);
	assert.match(css, /\.rules-desktop-nav\s*\{\s*display: none/);
	assert.match(css, /\.rules-mobile-nav\s*\{\s*display: block/);
});
