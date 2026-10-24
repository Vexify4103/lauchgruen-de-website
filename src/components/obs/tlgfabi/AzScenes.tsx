"use client";

import type { AzChallengeSnapshot, AzCompleted } from "@/lib/az-challenge";
import { AttemptPip, CountUp, Portrait, Stat, compactNumber, duration, hoursLabel, monthLabel, relativeTime, type CssVars } from "./AzPieces";

/* ------------------------------------------------------------------ header */

export function Header({
	data,
	dots,
	activeDot,
	dotKey,
	dotDurationMs,
}: {
	data: AzChallengeSnapshot;
	dots: string[];
	activeDot: string | null;
	dotKey: string;
	dotDurationMs: number;
}) {
	return (
		<header className="azf-header">
			<div className="azf-brand">
				<div className="azf-mark">
					A<span>›</span>Z
				</div>
				<div>
					<div className="azf-kicker">A–Z Challenge</div>
					<div className="azf-title">
						{data.displayName}
						<span className="azf-day">Tag {data.dayNumber}</span>
						<LiveChip data={data} />
						{data.syncing ? <span className="azf-sync">Lade Historie…</span> : null}
					</div>
				</div>
			</div>
			<div className="azf-score">
				<div className="azf-count">
					<b>{data.completedCount}</b>
					<span>/{data.totalChampions}</span>
				</div>
				<div className="azf-dots">
					{dots.map((dot) => (
						<span key={dot} className={dot === activeDot ? "is-active" : ""}>
							{dot === activeDot ? <i key={dotKey} style={{ animationDuration: `${dotDurationMs}ms` }} /> : null}
						</span>
					))}
					<em>{data.percent.toLocaleString("de-DE")}%</em>
				</div>
			</div>
		</header>
	);
}

export function LiveChip({ data }: { data: AzChallengeSnapshot }) {
	const live = data.live;
	if (!live) return null;
	if (live.onTarget) {
		return (
			<span className="azf-live">
				<i /> Live · Versuch #{live.tryNumber ?? data.current?.tryNumber}
			</span>
		);
	}
	return (
		<span className="azf-live is-off">
			<i /> Live · Ausweich-Pick
		</span>
	);
}

/* ------------------------------------------------------------------ scenes */

export function HuntScene({ data }: { data: AzChallengeSnapshot }) {
	const current = data.current;
	if (!current) {
		return (
			<div className="azf-finale azf-rise">
				<div className="azf-finale-title">A bis Z geschafft!</div>
				<div className="azf-sub">
					{data.totalChampions} Champions · {data.stats.games} Games · {data.stats.winRate}% WR
				</div>
			</div>
		);
	}
	const next = data.upcoming[0];
	const hidden = Math.max(0, current.tryNumber - 1 - current.attempts.length);
	const record = data.insights.record;

	return (
		<div className="azf-hunt">
			<div aria-hidden className="azf-splash" style={{ backgroundImage: `url(${current.champion.splashUrl})` }} />
			<Portrait champion={current.champion} size={104} tone="gold" badge={current.champion.letter} d={0} />
			<div className="azf-main">
				<div className="azf-kicker azf-rise" style={{ "--d": 1 } as CssVars}>
					Aktuelles Ziel · Champion {current.position} von {data.totalChampions}
				</div>
				<div className="azf-name azf-rise" style={{ "--d": 2 } as CssVars}>
					{current.champion.name}
				</div>
				<div className="azf-chips azf-rise" style={{ "--d": 3 } as CssVars}>
					<span className="azf-chip is-gold">Versuch #{current.tryNumber}</span>
					{record && record.state === "broken" ? (
						<span className="azf-chip is-record">Neuer Rekord!</span>
					) : record && record.state === "close" ? (
						<span className="azf-chip is-warn">Rekord droht ({record.tries})</span>
					) : (
						<span className="azf-chip">{current.losses ? `${current.losses} ${current.losses === 1 ? "Niederlage" : "Niederlagen"}` : "Erster Versuch"}</span>
					)}
					{current.mastery ? (
						<span className="azf-chip is-dim">
							M{current.mastery.level} · {compactNumber(current.mastery.points)}
						</span>
					) : null}
				</div>
				<div className="azf-pips azf-rise" style={{ "--d": 4 } as CssVars}>
					{hidden ? <span className="azf-pip is-more">+{hidden}</span> : null}
					{current.attempts.map((attempt) => (
						<AttemptPip key={attempt.matchId} attempt={attempt} />
					))}
					<span className="azf-pip is-next">?</span>
				</div>
			</div>
			{next ? (
				<div className="azf-next azf-rise" style={{ "--d": 5 } as CssVars}>
					<div className="azf-kicker">Danach</div>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={next.iconUrl} alt={next.name} />
					<div className="azf-next-name">{next.name}</div>
				</div>
			) : null}
		</div>
	);
}

export function LastScene({ done }: { done: AzCompleted }) {
	const win = done.winGame;
	const champWinRate = done.tries ? Math.round(100 / done.tries) : 100;
	return (
		<div className="azf-last">
			<Portrait champion={done.champion} size={96} tone="win" badge="✓" d={0} />
			<div className="azf-main">
				<div className="azf-kicker azf-rise" style={{ "--d": 1 } as CssVars}>
					Zuletzt geschafft
					{done.completedAt ? <span suppressHydrationWarning> · {relativeTime(done.completedAt)}</span> : null}
				</div>
				<div className="azf-name azf-rise" style={{ "--d": 2 } as CssVars}>
					{done.champion.name}
					{done.tries === 1 ? <span className="azf-tag is-gold">First Try</span> : done.tries >= 5 ? <span className="azf-tag">Endlich!</span> : null}
				</div>
				<div className="azf-stats azf-rise" style={{ "--d": 3 } as CssVars}>
					<Stat label="Versuche" value={String(done.tries)} accent />
					<Stat label="Champ-WR" value={`${champWinRate}%`} />
					<Stat label="Sieg-KDA" value={win?.kda ?? "–"} />
					<Stat label="Dauer" value={win ? duration(win.durationSeconds) : "–"} />
					<Stat label="CS" value={win ? String(win.creepScore) : "–"} />
				</div>
			</div>
		</div>
	);
}

export function RoadScene({ data }: { data: AzChallengeSnapshot }) {
	const past = data.recentCompleted.slice(0, 4).reverse();
	const upcoming = data.upcoming.slice(0, 5);
	let d = 0;
	return (
		<div className="azf-road">
			<div className="azf-kicker azf-rise">Der Weg durchs Alphabet</div>
			<div className="azf-trail">
				{past.map((entry) => (
					<div key={entry.champion.id} className="azf-stop is-done azf-rise" style={{ "--d": d++ } as CssVars}>
						<div className="azf-stop-icon">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={entry.champion.iconUrl} alt={entry.champion.name} />
							<span className="azf-stop-badge">{entry.tries}×</span>
						</div>
						<div className="azf-stop-name">{entry.champion.name}</div>
					</div>
				))}
				{data.current ? (
					<div className="azf-stop is-current azf-rise" style={{ "--d": d++ } as CssVars}>
						<div className="azf-stop-icon">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={data.current.champion.iconUrl} alt={data.current.champion.name} />
							<span className="azf-stop-badge">#{data.current.tryNumber}</span>
						</div>
						<div className="azf-stop-name">{data.current.champion.name}</div>
					</div>
				) : null}
				{upcoming.map((champion, index) => (
					<div key={champion.id} className="azf-stop is-next azf-rise" style={{ "--d": d++, opacity: 1 - index * 0.14 } as CssVars}>
						<div className="azf-stop-icon">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={champion.iconUrl} alt={champion.name} />
						</div>
						<div className="azf-stop-name">{champion.name}</div>
					</div>
				))}
			</div>
			<div className="azf-road-foot azf-rise" style={{ "--d": d } as CssVars}>
				{data.stats.hardest ? (
					<span>
						Härtester Brocken: <b>{data.stats.hardest.champion.name}</b> ({data.stats.hardest.tries} Versuche)
					</span>
				) : (
					<span>Noch kein Champion abgehakt</span>
				)}
				<span>
					First-Try-Siege: <b>{data.stats.firstTryCount}</b>
				</span>
			</div>
		</div>
	);
}

export function AlphabetScene({ data }: { data: AzChallengeSnapshot }) {
	return (
		<div className="azf-alpha">
			<div className="azf-letters">
				{data.letters.map((entry, index) => {
					const fill = entry.total ? entry.done / entry.total : 0;
					const state = entry.current ? "is-current" : entry.total && entry.done === entry.total ? "is-done" : !entry.total ? "is-empty" : "";
					return (
						<div key={entry.letter} className={`azf-letter azf-rise ${state}`} style={{ "--d": index * 0.35, "--fill": fill } as CssVars}>
							<i />
							<b>{entry.letter}</b>
							<small>
								{entry.done}/{entry.total}
							</small>
						</div>
					);
				})}
			</div>
			<div className="azf-grid-stats">
				<Stat label="Games" value={String(data.stats.games)} d={2} />
				<Stat label="Bilanz" value={`${data.stats.wins}W ${data.stats.losses}L`} d={3} />
				<Stat label="Win-Rate" value={`${data.stats.winRate}%`} d={4} accent />
				<Stat label="Ø Versuche" value={data.stats.averageTries ? data.stats.averageTries.toLocaleString("de-DE") : "–"} d={5} />
			</div>
		</div>
	);
}

/** Pace forecast, time and deaths, and today's (or this stream's) results. */
export function NumbersScene({ data }: { data: AzChallengeSnapshot }) {
	const { pace, playSeconds, currentPlaySeconds, deaths, currentDeaths, today } = data.insights;
	const currentName = data.current?.champion.name;
	return (
		<div className="azf-numbers">
			<div className="azf-kicker azf-rise">Zahlen zur Challenge</div>
			<div className="azf-num-grid">
				<Stat label="Tempo" value={<CountUp value={pace.perDay} decimals={1} suffix=" / Tag" />} sub="Champions" accent d={1} />
				<Stat
					label="Ziel Z"
					value={pace.etaDays !== null ? <CountUp value={pace.etaDays} suffix=" Tage" /> : "–"}
					sub={pace.etaDate ? <span suppressHydrationWarning>ca. {monthLabel(pace.etaDate)}</span> : "Hochrechnung"}
					d={2}
				/>
				<Stat label="Spielzeit" value={hoursLabel(playSeconds)} sub={currentName ? `${currentName}: ${hoursLabel(currentPlaySeconds)}` : undefined} d={3} />
				<Stat label="Tode" value={<CountUp value={deaths} />} sub={currentName ? `${currentName}: ${currentDeaths}` : undefined} d={4} />
			</div>
			<div className="azf-today azf-rise" style={{ "--d": 5 } as CssVars}>
				<span className="azf-today-label">{today.label === "Stream" ? "Dieser Stream" : "Heute"}</span>
				<span>
					<b>{today.wins}W</b> {today.losses}L
				</span>
				<span className="azf-today-done">
					{today.completed.length ? (
						<>
							{today.completed.length} {today.completed.length === 1 ? "Champion" : "Champions"} abgehakt
							{today.completed.slice(-5).map((champion) => (
								// eslint-disable-next-line @next/next/no-img-element
								<img key={champion.id} src={champion.iconUrl} alt={champion.name} />
							))}
						</>
					) : today.games ? (
						"Noch kein Champion abgehakt"
					) : (
						"Noch keine Games"
					)}
				</span>
			</div>
		</div>
	);
}
