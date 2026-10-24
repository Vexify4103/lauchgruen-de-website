"use client";

import type { AzChallengeSnapshot } from "@/lib/az-challenge";
import { AlphabetBar } from "./AzPieces";

/** Slim in-game layout: who he plays, which try, and overall progress. */
export function AzCompactBar({ data }: { data: AzChallengeSnapshot }) {
	const target = data.current?.champion ?? null;
	const live = data.live;
	const offPick = Boolean(live && live.champion && !live.onTarget);
	const shown = offPick && live?.champion ? live.champion : target;
	const record = data.insights.record;

	let kicker: React.ReactNode = "A–Z Challenge · Aktuelles Ziel";
	let title = shown?.name ?? "A bis Z geschafft!";
	let sub: React.ReactNode = data.current ? `${data.current.losses} ${data.current.losses === 1 ? "Niederlage" : "Niederlagen"} bisher` : null;

	if (live && !offPick && data.current) {
		kicker = (
			<>
				<i className="azf-dot" /> Live · Versuch #{data.current.tryNumber}
			</>
		);
		sub =
			record?.state === "broken" ? (
				<span className="azf-record-line">Rekord-Jagd: {data.current.losses} Niederlagen</span>
			) : data.current.losses ? (
				`${data.current.losses} ${data.current.losses === 1 ? "Niederlage" : "Niederlagen"} bisher`
			) : (
				"Erster Versuch"
			);
	} else if (offPick && live?.champion) {
		kicker = (
			<>
				<i className="azf-dot is-off" /> Live · Ausweich-Pick
			</>
		);
		title = live.champion.name;
		sub = live.tryNumber ? `Zählt für später: ${live.champion.name} Versuch #${live.tryNumber}` : `Ziel bleibt ${target?.name ?? "–"}`;
	}

	return (
		<section className={`azf-compact ${offPick ? "is-off" : ""}`}>
			<div className="azf-compact-icon">
				<div aria-hidden className="azf-ring" />
				{shown ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={shown.iconUrl} alt={shown.name} />
				) : null}
				{offPick && target ? (
					<span className="azf-compact-target" title={`Ziel: ${target.name}`}>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={target.iconUrl} alt={target.name} />
					</span>
				) : shown ? (
					<span className="azf-compact-letter">{shown.letter}</span>
				) : null}
			</div>
			<div className="azf-compact-main">
				<div className="azf-compact-kicker">{kicker}</div>
				<div className="azf-compact-title">
					{title}
					{offPick && target ? <em>Ziel: {target.name}</em> : null}
				</div>
				<div className="azf-compact-sub">{sub}</div>
			</div>
			<div className="azf-compact-side">
				<div className="azf-count">
					<b>{data.completedCount}</b>
					<span>/{data.totalChampions}</span>
				</div>
				<div className="azf-compact-pct">{data.percent.toLocaleString("de-DE")}%</div>
			</div>
			<AlphabetBar data={data} className="azf-bar azf-compact-bar" />
		</section>
	);
}
