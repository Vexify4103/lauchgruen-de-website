"use client";

let audioContext: AudioContext | null = null;

function getAudioContext() {
	if (typeof window === "undefined") return null;
	const AudioContextClass = window.AudioContext;
	if (!AudioContextClass) return null;
	audioContext ??= new AudioContextClass();
	return audioContext;
}

export async function unlockTournamentAudio() {
	const context = getAudioContext();
	if (!context) return;
	if (context.state === "suspended") await context.resume().catch(() => undefined);
}

function tone(frequency: number, start: number, duration: number, volume: number, type: OscillatorType = "sine") {
	const context = getAudioContext();
	if (!context || context.state !== "running") return;
	const oscillator = context.createOscillator();
	const gain = context.createGain();
	oscillator.type = type;
	oscillator.frequency.setValueAtTime(frequency, start);
	gain.gain.setValueAtTime(0.0001, start);
	gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
	gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
	oscillator.connect(gain).connect(context.destination);
	oscillator.start(start);
	oscillator.stop(start + duration + 0.03);
}

export function playRerollSound() {
	const context = getAudioContext();
	if (!context || context.state !== "running") return;
	const now = context.currentTime;
	tone(280, now, 0.12, 0.055, "triangle");
	tone(430, now + 0.08, 0.16, 0.05, "triangle");
	tone(650, now + 0.17, 0.2, 0.045, "sine");
}

export function playDraftStartSound() {
	const context = getAudioContext();
	if (!context || context.state !== "running") return;
	const now = context.currentTime;
	tone(440, now, 0.18, 0.075, "square");
	tone(440, now + 0.25, 0.18, 0.075, "square");
	tone(740, now + 0.5, 0.42, 0.09, "triangle");
}

export function playDraftCompleteSound() {
	const context = getAudioContext();
	if (!context || context.state !== "running") return;
	const now = context.currentTime;
	[523.25, 659.25, 783.99].forEach((frequency, index) => tone(frequency, now + index * 0.09, 0.55, 0.055, "sine"));
}
