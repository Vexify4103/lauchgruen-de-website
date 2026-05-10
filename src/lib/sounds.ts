/**
 * Synthesised sound effects via Web Audio API — no external files required.
 * All functions are safe to call server-side (they no-op when window is absent).
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_ctx || _ctx.state === "closed") {
      _ctx = new (
        window.AudioContext ??
        // Safari fallback
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
    }
    if (_ctx.state === "suspended") void _ctx.resume();
    return _ctx;
  } catch {
    return null;
  }
}

/**
 * Schedule a single oscillator note.
 * @param ctx   AudioContext
 * @param freq  Frequency in Hz
 * @param start Seconds from now to start
 * @param dur   Duration in seconds
 * @param type  Oscillator wave shape
 * @param vol   Peak gain (0–1)
 */
function note(
  ctx: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.35,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gain.gain.setValueAtTime(vol, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + start + dur,
  );
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.02);
}

/** Ascending four-note ding — plays on correct answer. */
export function playCorrect() {
  const ctx = getCtx();
  if (!ctx) return;
  note(ctx, 523,  0,    0.12); // C5
  note(ctx, 659,  0.1,  0.12); // E5
  note(ctx, 784,  0.2,  0.15); // G5
  note(ctx, 1047, 0.3,  0.45); // C6 — long ring-out
}

/** Descending sawtooth groan — plays on wrong answer. */
export function playWrong() {
  const ctx = getCtx();
  if (!ctx) return;
  note(ctx, 280, 0,    0.22, "sawtooth", 0.5);
  note(ctx, 220, 0.2,  0.22, "sawtooth", 0.45);
  note(ctx, 165, 0.38, 0.45, "sawtooth", 0.4);
}

/** Short square-wave buzz — plays when a player presses the buzz button. */
export function playBuzz() {
  const ctx = getCtx();
  if (!ctx) return;
  note(ctx, 180, 0,    0.08, "square", 0.55);
  note(ctx, 160, 0.07, 0.08, "square", 0.5);
  note(ctx, 140, 0.14, 0.14, "square", 0.45);
}
