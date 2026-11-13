import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import * as reel from "../src/lib/swiss-draw-reel.ts";
import * as drawEngine from "../src/lib/swiss-pot-draw.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/SwissTeamDrawReel.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function harness({ count = 8, reducedMotion = false } = {}) {
	const candidates = Array.from({ length: count }, (_, index) => ({ key: `t${index}`, name: `Team ${index}` }));
	let currentDraw = { id: 1, round: 1, record: "0-0", slot: 0, candidates };
	const states = [],
		eventFns = [],
		effects = [],
		timers = new Map(),
		delays = [];
	let stateIndex = 0,
		eventIndex = 0,
		nextId = 0,
		completed = 0;
	const mocks = {
		react: {
			useState(initial) {
				const index = stateIndex++;
				if (!(index in states)) states[index] = initial;
				return [
					states[index],
					(value) => {
						states[index] = value;
					},
				];
			},
			useEffect: (fn) => effects.push(fn),
			useEffectEvent(fn) {
				const index = eventIndex++;
				eventFns[index] = fn;
				return (...args) => eventFns[index](...args);
			},
		},
		"@/lib/swiss-draw-reel": reel,
		"@/lib/swiss-pot-draw": drawEngine,
	};
	const window = {
		matchMedia: () => ({ matches: reducedMotion }),
		setTimeout: (fn, delay) => {
			delays.push(delay);
			timers.set(++nextId, fn);
			return nextId;
		},
		clearTimeout: (id) => timers.delete(id),
	};
	const compiled = { exports: {} };
	new Function("require", "exports", "window", output)((name) => mocks[name] ?? require(name), compiled.exports, window);
	const api = {
		render(patch = {}) {
			currentDraw = { ...currentDraw, ...patch };
			stateIndex = 0;
			eventIndex = 0;
			return compiled.exports.SwissTeamDrawReel({
				draw: currentDraw,
				onComplete: () => {
					completed++;
				},
			});
		},
		tick() {
			const next = timers.entries().next().value;
			assert.ok(next, "Animation has a scheduled tick");
			timers.delete(next[0]);
			next[1]();
		},
		get frame() {
			return states[0];
		},
		get completed() {
			return completed;
		},
		candidates,
		delays,
		timers,
		effects,
	};
	api.render();
	return api;
}

test("reel cycles every remaining candidate, waits for the server and decelerates to exactly its winner", () => {
	const h = harness();
	h.effects[0]();
	const seen = new Set();
	for (let step = 0; step < 36; step++) {
		h.tick();
		seen.add(h.frame.key);
		assert.equal(h.frame.revealed, false);
	}
	assert.equal(seen.size, 8);
	assert.equal(h.completed, 0, "An animation never invents a winner while the server is pending");
	h.render({ winner: "t6", assignedSlot: 0 });
	for (let step = 0; !h.completed && step < 40; step++) h.tick();
	assert.equal(h.completed, 1);
	assert.equal(h.frame.key, "t6");
	assert.equal(h.frame.revealed, true);
	assert.deepEqual(h.delays.slice(-7), [...reel.DRAW_REEL_BRAKE_DELAYS]);
	assert.equal(h.timers.size, 0);
});

test("every slowdown ends on the server result for every candidate and pot size", () => {
	for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
		const candidates = Array.from({ length: count }, (_, index) => `t${index}`);
		for (const winner of candidates) {
			const frames = reel.DRAW_REEL_BRAKE_DELAYS.map((_, index) => reel.drawReelBrakeTeam(candidates, winner, index));
			assert.ok(frames.every((key) => candidates.includes(key)));
			assert.equal(frames.at(-1), winner);
		}
	}
	assert.throws(() => reel.drawReelBrakeTeam(["a", "b"], "unknown", 0));
});

test("a one-team pot reveals without pretending other teams remain", () => {
	const h = harness({ count: 1 });
	h.render({ winner: "t0" });
	h.effects[0]();
	assert.equal(h.delays[0], 650);
	h.tick();
	assert.equal(h.completed, 0);
	assert.equal(h.frame.key, "t0");
	h.tick();
	assert.equal(h.completed, 1);
});

test("the server-selected team is visibly held before completion can replace the reel", () => {
	const h = harness();
	h.render({ winner: "t3", assignedSlot: 0 });
	h.effects[0]();
	for (let step = 0; !h.frame.revealed && step < 80; step++) h.tick();
	assert.equal(h.frame.key, "t3");
	assert.equal(h.frame.revealed, true);
	assert.equal(h.completed, 0, "Do not unmount the reel in the same tick that sets the winning name");
	assert.ok(h.delays.at(-1) >= 700, "The actual server result needs a visible settling hold");
	assert.match(renderToStaticMarkup(h.render()), /<strong>Team 3<\/strong>/);
	const settled = { ...h.frame };
	h.tick();
	assert.equal(h.completed, 1);
	assert.deepEqual(h.frame, settled, "Completion does not swap to another name");
});

test("reduced motion skips rapid spinning but still waits for the server result", () => {
	const h = harness({ reducedMotion: true });
	h.effects[0]();
	h.tick();
	assert.equal(h.frame.step, 0);
	assert.equal(h.completed, 0);
	h.render({ winner: "t4" });
	h.tick();
	assert.equal(h.completed, 0);
	assert.equal(h.frame.key, "t4");
	h.tick();
	assert.equal(h.completed, 1);
});

test("reduced motion shows no team name before the server result", () => {
	const h = harness({ reducedMotion: true });
	h.effects[0]();
	h.tick();
	const waiting = renderToStaticMarkup(h.render());
	assert.doesNotMatch(waiting, /Team \d/, "No candidate may look like the winner while the server is still drawing");
	h.render({ winner: "t4" });
	h.tick();
	assert.match(renderToStaticMarkup(h.render({ winner: "t4" })), /<strong>Team 4<\/strong>/);
});

test("unmount cancels outstanding reel timers and never completes a stale reveal", () => {
	const h = harness();
	const cleanup = h.effects[0]();
	assert.equal(h.timers.size, 1);
	cleanup();
	assert.equal(h.timers.size, 0);
	assert.equal(h.completed, 0);
});

test("visual names are hidden from live announcements while the reel is spinning", () => {
	const h = harness();
	const html = renderToStaticMarkup(h.render());
	assert.match(html, /class="team-draw-reel-window" aria-hidden="true"/);
	assert.match(html, /role="status"/);
	assert.match(html, /Die Lostrommel läuft/);
	assert.equal((html.match(/<strong>/g) ?? []).length, 1, "Only one team name is rendered at a time");
	assert.doesNotMatch(html, /team-draw-ghost/);
});

test("next-pot preview excludes drawn teams and previews only the next record pool", () => {
	let state = drawEngine.createSwissPotState();
	assert.equal(drawEngine.nextSwissPot(state).remaining.length, 8);
	state = drawEngine.advanceSwissPotDraw(state, { type: "draw" }, () => 0);
	assert.equal(drawEngine.nextSwissPot(state).remaining.length, 7);
	assert.ok(!drawEngine.nextSwissPot(state).remaining.includes("fake-1"));
	for (let index = 1; index < 8; index++) state = drawEngine.advanceSwissPotDraw(state, { type: "draw" }, () => 0);
	assert.equal(drawEngine.nextSwissPot(state), null, "No eligible pot while results are missing");
	for (const pair of state.rounds[0].pairings) state = drawEngine.advanceSwissPotDraw(state, { type: "result", pairingId: pair.id, winnerTeamKey: pair.teamAKey }, () => 0);
	const before = structuredClone(state);
	assert.deepEqual(drawEngine.nextSwissPot(state), { round: 2, record: "1-0", slot: 0, remaining: ["fake-1", "fake-2", "fake-3", "fake-4"] });
	assert.deepEqual(state, before, "Preview must not draw, persist or open the next round");
	for (let index = 0; index < 4; index++) state = drawEngine.advanceSwissPotDraw(state, { type: "draw" }, () => 0);
	assert.deepEqual(drawEngine.nextSwissPot(state).remaining, ["fake-5", "fake-6", "fake-7", "fake-8"]);
	assert.equal(drawEngine.nextSwissPot(state).record, "0-1");
});
