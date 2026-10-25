"use client";

import type { AzReaction } from "./az-reactions";
import { CountUp, Portrait, type CssVars } from "./AzPieces";

export function ReactionScene({ reaction }: { reaction: AzReaction }) {
	switch (reaction.kind) {
		case "win":
			return <WinScene reaction={reaction} />;
		case "loss":
			return <LossScene reaction={reaction} />;
		case "letter":
			return <LetterScene reaction={reaction} />;
		case "milestone":
			return <MilestoneScene reaction={reaction} />;
		case "streak":
			return <StreakScene reaction={reaction} />;
	}
}

function Sparks({ count = 14, tone = "gold" }: { count?: number; tone?: "gold" | "win" }) {
	return (
		<div aria-hidden className={`azf-sparks is-${tone}`}>
			{Array.from({ length: count }, (_, index) => (
				<i key={index} style={{ "--a": `${index * (360 / count)}deg`, "--t": `${(index % 4) * 120}ms` } as CssVars} />
			))}
		</div>
	);
}

function WinScene({ reaction }: { reaction: Extract<AzReaction, { kind: "win" }> }) {
	const { done, next } = reaction;
	return (
		<div className="azf-celebrate">
			<div aria-hidden className="azf-rays" />
			<Sparks tone="win" />
			<div className="azf-pop">
				<Portrait champion={done.champion} size={100} tone="win" badge="✓" d={0} />
			</div>
			<div className="azf-main">
				<div className="azf-shout">Geschafft!</div>
				<div className="azf-name azf-rise" style={{ "--d": 3 } as CssVars}>
					{done.champion.name}
				</div>
				<div className="azf-sub azf-rise" style={{ "--d": 4 } as CssVars}>
					{done.tries === 1 ? "Gleich im ersten Versuch" : `Nach ${done.tries} Versuchen`}
					{done.winGame ? ` · ${done.winGame.kda}` : ""}
				</div>
				{next ? (
					<div className="azf-up azf-rise" style={{ "--d": 6 } as CssVars}>
						<span>Weiter mit</span>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={next.iconUrl} alt={next.name} />
						<b>{next.name}</b>
					</div>
				) : null}
			</div>
		</div>
	);
}

function LossScene({ reaction }: { reaction: Extract<AzReaction, { kind: "loss" }> }) {
	const losses = reaction.to - 1;
	return (
		<div className="azf-loss">
			<div aria-hidden className="azf-loss-flash" />
			<Portrait champion={reaction.champion} size={96} tone="loss" badge="✕" d={0} />
			<div className="azf-main">
				<div className="azf-kicker is-loss azf-rise" style={{ "--d": 1 } as CssVars}>
					Niederlage · {reaction.champion.name}
				</div>
				<div className="azf-flip-row azf-rise" style={{ "--d": 2 } as CssVars}>
					<span className="azf-flip-label">Versuch</span>
					<span className="azf-flip">
						<span className="azf-flip-old">#{reaction.from}</span>
						<span className="azf-flip-new">#{reaction.to}</span>
					</span>
				</div>
				<div className="azf-sub azf-rise" style={{ "--d": 5 } as CssVars}>
					{reaction.recordBroken ? (
						<span className="azf-record-line">
							Neuer Rekord: {losses} {losses === 1 ? "Niederlage" : "Niederlagen"}
							{reaction.recordTries ? ` (alt: ${reaction.recordTries} Versuche)` : ""}
						</span>
					) : (
						`${reaction.champion.name} bleibt das Ziel. Weiter geht's!`
					)}
				</div>
			</div>
		</div>
	);
}

function LetterScene({ reaction }: { reaction: Extract<AzReaction, { kind: "letter" }> }) {
	return (
		<div className="azf-letterdone">
			<Sparks />
			<div className="azf-card">
				<div className="azf-card-inner">
					<div className="azf-card-face">{reaction.from}</div>
					<div className="azf-card-face is-back">{reaction.to ?? "✓"}</div>
				</div>
			</div>
			<div className="azf-main">
				<div className="azf-shout">Buchstabe {reaction.from}!</div>
				<div className="azf-sub azf-rise" style={{ "--d": 4 } as CssVars}>
					Alle {reaction.count} {reaction.from}-Champions abgehakt
				</div>
				{reaction.next ? (
					<div className="azf-up azf-rise" style={{ "--d": 7 } as CssVars}>
						<span>Weiter mit {reaction.to}</span>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={reaction.next.iconUrl} alt={reaction.next.name} />
						<b>{reaction.next.name}</b>
					</div>
				) : null}
			</div>
		</div>
	);
}

function MilestoneScene({ reaction }: { reaction: Extract<AzReaction, { kind: "milestone" }> }) {
	const radius = 52;
	const circumference = 2 * Math.PI * radius;
	return (
		<div className="azf-milestone">
			<Sparks />
			<div className="azf-ring-chart">
				<svg viewBox="0 0 128 128" aria-hidden>
					<circle cx="64" cy="64" r={radius} className="azf-ring-track" />
					<circle
						cx="64"
						cy="64"
						r={radius}
						className="azf-ring-fill"
						style={{ strokeDasharray: circumference, "--ring-from": circumference, "--ring-to": circumference * (1 - reaction.percent / 100) } as CssVars}
					/>
				</svg>
				<b>
					<CountUp value={reaction.percent} suffix="%" />
				</b>
			</div>
			<div className="azf-main">
				<div className="azf-shout">Meilenstein!</div>
				<div className="azf-name azf-rise" style={{ "--d": 3 } as CssVars}>
					{reaction.percent}% der Challenge
				</div>
				<div className="azf-sub azf-rise" style={{ "--d": 4 } as CssVars}>
					{reaction.completed} von {reaction.total} Champions geschafft
				</div>
			</div>
		</div>
	);
}

function StreakScene({ reaction }: { reaction: Extract<AzReaction, { kind: "streak" }> }) {
	return (
		<div className="azf-streak">
			<div className="azf-main">
				<div className="azf-shout">First-Try-Serie ×{reaction.count}</div>
				<div className="azf-sub azf-rise" style={{ "--d": 3 } as CssVars}>
					{reaction.count} Champions hintereinander im ersten Versuch
				</div>
			</div>
			<div className="azf-streak-icons">
				{reaction.champions
					.slice()
					.reverse()
					.map((champion, index) => (
						<div key={champion.id} className="azf-streak-icon" style={{ "--d": index } as CssVars}>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={champion.iconUrl} alt={champion.name} />
							<span>1×</span>
						</div>
					))}
			</div>
		</div>
	);
}
