"use client";

import { useEffect, useState } from "react";
import type { AzAttempt, AzChallengeSnapshot, AzChampion } from "@/lib/az-challenge";

export type CssVars = React.CSSProperties & Record<`--${string}`, string | number>;

export function Portrait({ champion, size, tone, badge, d }: { champion: AzChampion; size: number; tone: "gold" | "win" | "loss"; badge: string; d: number }) {
	return (
		<div className={`azf-portrait is-${tone} azf-rise`} style={{ width: size, height: size, "--d": d } as CssVars}>
			<div aria-hidden className="azf-ring" />
			<div className="azf-portrait-img">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={champion.iconUrl} alt={champion.name} />
			</div>
			<span className="azf-portrait-badge">{badge}</span>
		</div>
	);
}

export function Stat({ label, value, sub, accent = false, d }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean; d?: number }) {
	return (
		<div className={`azf-stat ${d !== undefined ? "azf-rise" : ""}`} style={d !== undefined ? ({ "--d": d } as CssVars) : undefined}>
			<div className="azf-stat-label">{label}</div>
			<div className={`azf-stat-value ${accent ? "is-accent" : ""}`}>{value}</div>
			{sub ? <div className="azf-stat-sub">{sub}</div> : null}
		</div>
	);
}

export function AttemptPip({ attempt }: { attempt: AzAttempt }) {
	return (
		<span className={`azf-pip ${attempt.win ? "is-win" : "is-loss"}`} title={attempt.kda}>
			<b>{attempt.win ? "W" : "L"}</b>
			<small>{attempt.deaths}†</small>
		</span>
	);
}

export function AlphabetBar({ data, className = "azf-bar" }: { data: AzChallengeSnapshot; className?: string }) {
	return (
		<footer className={className}>
			{data.letters.map((entry) => {
				const fill = entry.total ? entry.done / entry.total : 0;
				return (
					<div
						key={entry.letter}
						className={`azf-seg ${entry.current ? "is-current" : ""} ${entry.total && entry.done === entry.total ? "is-done" : ""}`}
						style={{ flexGrow: Math.max(1, entry.total) }}
					>
						<div className="azf-seg-track">
							<i style={{ transform: `scaleX(${fill})` }} />
						</div>
						<span>{entry.letter}</span>
					</div>
				);
			})}
		</footer>
	);
}

/**
 * Eases a number from 0 to its target whenever the target changes.
 * Uses elapsed time on an interval (not requestAnimationFrame), so it still
 * reaches the target when OBS or the browser pauses frames for a hidden source.
 */
export function useCountUp(target: number, durationMs = 1100, delayMs = 150) {
	const [value, setValue] = useState(0);
	useEffect(() => {
		const start = Date.now() + delayMs;
		const timer = window.setInterval(() => {
			const progress = Math.min(1, Math.max(0, (Date.now() - start) / durationMs));
			setValue(target * (1 - Math.pow(1 - progress, 3)));
			if (progress >= 1) window.clearInterval(timer);
		}, 16);
		return () => window.clearInterval(timer);
	}, [target, durationMs, delayMs]);
	return value;
}

export function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
	const shown = useCountUp(value);
	return (
		<>
			{shown.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
			{suffix}
		</>
	);
}

export function compactNumber(value: number) {
	if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}M`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
	return String(value);
}

export function duration(seconds: number) {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function hoursLabel(seconds: number) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return hours ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

export function relativeTime(iso: string) {
	const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
	if (minutes < 60) return `vor ${minutes} Min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `vor ${hours} Std`;
	const days = Math.round(hours / 24);
	return days === 1 ? "gestern" : `vor ${days} Tagen`;
}

export function monthLabel(iso: string) {
	return new Date(iso).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "Europe/Berlin" });
}
