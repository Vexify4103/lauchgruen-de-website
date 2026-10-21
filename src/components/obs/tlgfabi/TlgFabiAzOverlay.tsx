"use client";

import { useEffect, useRef, useState } from "react";
import type { AzAttempt, AzChallengeSnapshot, AzChampion, AzCompleted } from "@/lib/az-challenge";

const POLL_INTERVAL_MS = 20_000;
const LEAVE_MS = 460;

type SceneId = "hunt" | "last" | "road" | "alphabet" | "celebrate";

const SCENE_DURATION_MS: Record<SceneId, number> = {
	hunt: 16_000,
	last: 11_000,
	road: 11_000,
	alphabet: 11_000,
	celebrate: 20_000,
};

const ROTATION: SceneId[] = ["hunt", "last", "road", "alphabet"];

function nextScene(current: SceneId, hasLast: boolean): SceneId {
	const order = hasLast ? ROTATION : ROTATION.filter((scene) => scene !== "last");
	const index = order.indexOf(current);
	return order[(index + 1) % order.length] ?? "hunt";
}

export function TlgFabiAzOverlay({
	initial,
	endpoint,
	forceVisible = false,
	scale = 1,
	demoCelebration = false,
}: {
	initial: AzChallengeSnapshot | null;
	endpoint: string;
	forceVisible?: boolean;
	scale?: number;
	/** Test helper: start with the win celebration of the last completed champion. */
	demoCelebration?: boolean;
}) {
	const [data, setData] = useState(initial);
	const [scene, setScene] = useState<SceneId>("hunt");
	const [leaving, setLeaving] = useState(false);
	const [celebration, setCelebration] = useState<AzCompleted | null>(demoCelebration ? (initial?.lastCompleted ?? null) : null);
	const previous = useRef<{ count: number; syncing: boolean } | null>(initial ? { count: initial.completedCount, syncing: initial.syncing } : null);

	useEffect(() => {
		let cancelled = false;
		const refresh = async () => {
			try {
				const response = await fetch(endpoint, { cache: "no-store" });
				if (!response.ok) return;
				const next = (await response.json()) as AzChallengeSnapshot;
				if (cancelled || typeof next.completedCount !== "number") return;
				const before = previous.current;
				// Celebrate only real progress, not counts jumping during the history backfill.
				if (before && !before.syncing && !next.syncing && next.completedCount > before.count && next.lastCompleted) {
					setCelebration(next.lastCompleted);
				}
				previous.current = { count: next.completedCount, syncing: next.syncing };
				setData(next);
			} catch {
				// OBS keeps polling; transient errors must not flash the source.
			}
		};
		const first = window.setTimeout(refresh, initial ? POLL_INTERVAL_MS : 0);
		const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			window.clearTimeout(first);
			window.clearInterval(timer);
		};
	}, [endpoint, initial]);

	const hasLast = Boolean(data?.lastCompleted);
	const activeScene: SceneId = celebration ? "celebrate" : scene;

	useEffect(() => {
		let leaveTimer: number | undefined;
		const showTimer = window.setTimeout(() => {
			setLeaving(true);
			leaveTimer = window.setTimeout(() => {
				if (celebration) {
					setCelebration(null);
					setScene("hunt");
				} else {
					setScene((current) => nextScene(current, hasLast));
				}
				setLeaving(false);
			}, LEAVE_MS);
		}, SCENE_DURATION_MS[activeScene]);
		return () => {
			window.clearTimeout(showTimer);
			if (leaveTimer) window.clearTimeout(leaveTimer);
		};
	}, [activeScene, celebration, hasLast]);

	if (!data) return null;
	if (!forceVisible && !data.leagueLive) return null;

	const sceneKey = activeScene === "celebrate" ? `celebrate-${celebration?.champion.id}` : activeScene;
	const currentLetter = data.current?.champion.letter ?? "Z";
	const dots = hasLast ? ROTATION : ROTATION.filter((entry) => entry !== "last");

	return (
		<div className="azf-root" style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}>
			<section className="azf-panel">
				<div aria-hidden className="azf-watermark" key={`wm-${currentLetter}`}>
					{currentLetter}
				</div>
				<div aria-hidden className="azf-sweep" key={`sweep-${sceneKey}`} />

				<Header data={data} activeScene={activeScene} dots={dots} sceneKey={sceneKey} />

				<div className="azf-stage">
					<div key={sceneKey} className={`azf-scene ${leaving ? "azf-leave" : ""}`}>
						{activeScene === "celebrate" && celebration ? (
							<CelebrateScene done={celebration} next={data.current?.champion ?? null} />
						) : activeScene === "last" && data.lastCompleted ? (
							<LastScene done={data.lastCompleted} />
						) : activeScene === "road" ? (
							<RoadScene data={data} />
						) : activeScene === "alphabet" ? (
							<AlphabetScene data={data} />
						) : (
							<HuntScene data={data} />
						)}
					</div>
				</div>

				<AlphabetBar data={data} />
			</section>
			<style>{OVERLAY_CSS}</style>
		</div>
	);
}

/* ------------------------------------------------------------------ header */

function Header({ data, activeScene, dots, sceneKey }: { data: AzChallengeSnapshot; activeScene: SceneId; dots: SceneId[]; sceneKey: string }) {
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
						{data.challengeGameLive && data.current ? (
							<span className="azf-live">
								<i /> Versuch #{data.current.tryNumber} läuft
							</span>
						) : null}
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
						<span key={dot} className={dot === activeScene ? "is-active" : ""}>
							{dot === activeScene ? <i key={sceneKey} style={{ animationDuration: `${SCENE_DURATION_MS[dot]}ms` }} /> : null}
						</span>
					))}
					<em>{data.percent.toLocaleString("de-DE")}%</em>
				</div>
			</div>
		</header>
	);
}

/* ------------------------------------------------------------------ scenes */

function HuntScene({ data }: { data: AzChallengeSnapshot }) {
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

	return (
		<div className="azf-hunt">
			<div aria-hidden className="azf-splash" style={{ backgroundImage: `url(${current.champion.splashUrl})` }} />
			<Portrait champion={current.champion} size={104} tone="gold" badge={current.champion.letter} d={0} />
			<div className="azf-main">
				<div className="azf-kicker azf-rise" style={{ "--d": 1 } as React.CSSProperties}>
					Aktuelles Ziel · Champion {current.position} von {data.totalChampions}
				</div>
				<div className="azf-name azf-rise" style={{ "--d": 2 } as React.CSSProperties}>
					{current.champion.name}
				</div>
				<div className="azf-chips azf-rise" style={{ "--d": 3 } as React.CSSProperties}>
					<span className="azf-chip is-gold">Versuch #{current.tryNumber}</span>
					<span className="azf-chip">{current.losses ? `${current.losses} ${current.losses === 1 ? "Niederlage" : "Niederlagen"}` : "Erster Versuch"}</span>
					{current.mastery ? (
						<span className="azf-chip is-dim">
							M{current.mastery.level} · {compactNumber(current.mastery.points)}
						</span>
					) : null}
				</div>
				<div className="azf-pips azf-rise" style={{ "--d": 4 } as React.CSSProperties}>
					{hidden ? <span className="azf-pip is-more">+{hidden}</span> : null}
					{current.attempts.map((attempt) => (
						<AttemptPip key={attempt.matchId} attempt={attempt} />
					))}
					<span className="azf-pip is-next">?</span>
				</div>
			</div>
			{next ? (
				<div className="azf-next azf-rise" style={{ "--d": 5 } as React.CSSProperties}>
					<div className="azf-kicker">Danach</div>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={next.iconUrl} alt={next.name} />
					<div className="azf-next-name">{next.name}</div>
				</div>
			) : null}
		</div>
	);
}

function AttemptPip({ attempt }: { attempt: AzAttempt }) {
	return (
		<span className={`azf-pip ${attempt.win ? "is-win" : "is-loss"}`} title={attempt.kda}>
			<b>{attempt.win ? "W" : "L"}</b>
			<small>{attempt.deaths}†</small>
		</span>
	);
}

function LastScene({ done }: { done: AzCompleted }) {
	const win = done.winGame;
	const champWinRate = done.tries ? Math.round(100 / done.tries) : 100;
	return (
		<div className="azf-last">
			<Portrait champion={done.champion} size={96} tone="win" badge="✓" d={0} />
			<div className="azf-main">
				<div className="azf-kicker azf-rise" style={{ "--d": 1 } as React.CSSProperties}>
					Zuletzt geschafft
					{done.completedAt ? <span suppressHydrationWarning> · {relativeTime(done.completedAt)}</span> : null}
				</div>
				<div className="azf-name azf-rise" style={{ "--d": 2 } as React.CSSProperties}>
					{done.champion.name}
					{done.tries === 1 ? <span className="azf-tag is-gold">First Try</span> : done.tries >= 5 ? <span className="azf-tag">Endlich!</span> : null}
				</div>
				<div className="azf-stats azf-rise" style={{ "--d": 3 } as React.CSSProperties}>
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

function RoadScene({ data }: { data: AzChallengeSnapshot }) {
	const past = data.recentCompleted.slice(0, 4).reverse();
	const upcoming = data.upcoming.slice(0, 5);
	let d = 0;
	return (
		<div className="azf-road">
			<div className="azf-kicker azf-rise">Der Weg durchs Alphabet</div>
			<div className="azf-trail">
				{past.map((entry) => (
					<div key={entry.champion.id} className="azf-stop is-done azf-rise" style={{ "--d": d++ } as React.CSSProperties}>
						<div className="azf-stop-icon">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={entry.champion.iconUrl} alt={entry.champion.name} />
							<span className="azf-stop-badge">{entry.tries}×</span>
						</div>
						<div className="azf-stop-name">{entry.champion.name}</div>
					</div>
				))}
				{data.current ? (
					<div className="azf-stop is-current azf-rise" style={{ "--d": d++ } as React.CSSProperties}>
						<div className="azf-stop-icon">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={data.current.champion.iconUrl} alt={data.current.champion.name} />
							<span className="azf-stop-badge">#{data.current.tryNumber}</span>
						</div>
						<div className="azf-stop-name">{data.current.champion.name}</div>
					</div>
				) : null}
				{upcoming.map((champion, index) => (
					<div key={champion.id} className="azf-stop is-next azf-rise" style={{ "--d": d++, opacity: 1 - index * 0.14 } as React.CSSProperties}>
						<div className="azf-stop-icon">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={champion.iconUrl} alt={champion.name} />
						</div>
						<div className="azf-stop-name">{champion.name}</div>
					</div>
				))}
			</div>
			<div className="azf-road-foot azf-rise" style={{ "--d": d } as React.CSSProperties}>
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

function AlphabetScene({ data }: { data: AzChallengeSnapshot }) {
	return (
		<div className="azf-alpha">
			<div className="azf-letters">
				{data.letters.map((entry, index) => {
					const fill = entry.total ? entry.done / entry.total : 0;
					const state = entry.current ? "is-current" : entry.total && entry.done === entry.total ? "is-done" : !entry.total ? "is-empty" : "";
					return (
						<div key={entry.letter} className={`azf-letter azf-rise ${state}`} style={{ "--d": index * 0.35, "--fill": fill } as React.CSSProperties}>
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

function CelebrateScene({ done, next }: { done: AzCompleted; next: AzChampion | null }) {
	return (
		<div className="azf-celebrate">
			<div aria-hidden className="azf-rays" />
			<div aria-hidden className="azf-sparks">
				{Array.from({ length: 14 }, (_, index) => (
					<i key={index} style={{ "--a": `${index * (360 / 14)}deg`, "--t": `${(index % 4) * 120}ms` } as React.CSSProperties} />
				))}
			</div>
			<div className="azf-pop">
				<Portrait champion={done.champion} size={100} tone="win" badge="✓" d={0} />
			</div>
			<div className="azf-main">
				<div className="azf-shout">Geschafft!</div>
				<div className="azf-name azf-rise" style={{ "--d": 3 } as React.CSSProperties}>
					{done.champion.name}
				</div>
				<div className="azf-sub azf-rise" style={{ "--d": 4 } as React.CSSProperties}>
					{done.tries === 1 ? "Gleich im ersten Versuch" : `Nach ${done.tries} Versuchen`}
					{done.winGame ? ` · ${done.winGame.kda}` : ""}
				</div>
				{next ? (
					<div className="azf-up azf-rise" style={{ "--d": 6 } as React.CSSProperties}>
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

/* ------------------------------------------------------------------ pieces */

function Portrait({ champion, size, tone, badge, d }: { champion: AzChampion; size: number; tone: "gold" | "win"; badge: string; d: number }) {
	return (
		<div className={`azf-portrait is-${tone} azf-rise`} style={{ width: size, height: size, "--d": d } as React.CSSProperties}>
			<div aria-hidden className="azf-ring" />
			<div className="azf-portrait-img">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={champion.iconUrl} alt={champion.name} />
			</div>
			<span className="azf-portrait-badge">{badge}</span>
		</div>
	);
}

function Stat({ label, value, accent = false, d }: { label: string; value: string; accent?: boolean; d?: number }) {
	return (
		<div className={`azf-stat ${d !== undefined ? "azf-rise" : ""}`} style={d !== undefined ? ({ "--d": d } as React.CSSProperties) : undefined}>
			<div className="azf-stat-label">{label}</div>
			<div className={`azf-stat-value ${accent ? "is-accent" : ""}`}>{value}</div>
		</div>
	);
}

function AlphabetBar({ data }: { data: AzChallengeSnapshot }) {
	return (
		<footer className="azf-bar">
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

/* ----------------------------------------------------------------- helpers */

function compactNumber(value: number) {
	if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}M`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
	return String(value);
}

function duration(seconds: number) {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function relativeTime(iso: string) {
	const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
	if (minutes < 60) return `vor ${minutes} Min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `vor ${hours} Std`;
	const days = Math.round(hours / 24);
	return days === 1 ? "gestern" : `vor ${days} Tagen`;
}

/* --------------------------------------------------------------------- css */

const OVERLAY_CSS = `
.azf-root {
	--gold: #f6c453; --gold-soft: #ffe3a1; --win: #5eead4; --loss: #fb7185;
	--ink: #f5f3ee; --muted: rgba(245,243,238,.62); --line: rgba(255,255,255,.09);
	position: relative; padding: 16px; width: 712px; transform-origin: top left;
	color: var(--ink); pointer-events: none; font-variant-numeric: tabular-nums;
}
.azf-panel {
	position: relative; width: 680px; height: 264px; overflow: hidden; border-radius: 22px;
	background:
		radial-gradient(120% 140% at 0% 0%, rgba(246,196,83,.13), transparent 52%),
		linear-gradient(140deg, rgba(17,18,28,.94), rgba(8,9,14,.9));
	border: 1px solid rgba(246,196,83,.24);
	box-shadow: 0 22px 60px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.07);
	animation: azf-panel-in 800ms cubic-bezier(.16,.84,.2,1) both;
}
.azf-panel::before {
	content: ""; position: absolute; inset: 0 0 auto 0; height: 2px;
	background: linear-gradient(90deg, transparent, var(--gold), var(--gold-soft), var(--gold), transparent);
	opacity: .85;
}
.azf-watermark {
	position: absolute; right: -18px; bottom: -64px; font-size: 300px; font-weight: 900; line-height: 1;
	color: transparent; -webkit-text-stroke: 2px rgba(246,196,83,.09); letter-spacing: -.06em;
	animation: azf-watermark-in 1.2s cubic-bezier(.16,.84,.2,1) both, azf-float 9s ease-in-out 1.2s infinite;
}
.azf-sweep {
	position: absolute; top: 0; bottom: 0; left: 0; width: 34%; z-index: 5;
	background: linear-gradient(90deg, transparent, rgba(255,227,161,.16), transparent);
	animation: azf-sweep 1.1s cubic-bezier(.4,0,.2,1) both;
}

.azf-header { position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; padding: 14px 20px 0; height: 52px; box-sizing: border-box; }
.azf-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.azf-mark {
	display: flex; gap: 1px; align-items: center; justify-content: center; width: 54px; height: 34px; border-radius: 10px;
	background: linear-gradient(135deg, var(--gold-soft), var(--gold) 55%, #c98b1c);
	color: #1b1406; font-weight: 900; font-size: 16px; letter-spacing: -.02em;
	box-shadow: 0 0 18px rgba(246,196,83,.45), inset 0 1px 0 rgba(255,255,255,.6);
}
.azf-mark span { opacity: .55; font-size: 14px; }
.azf-kicker { font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .2em; color: var(--gold); }
.azf-title { display: flex; align-items: center; gap: 8px; margin-top: 1px; font-size: 18px; font-weight: 900; letter-spacing: -.02em; white-space: nowrap; }
.azf-day { font-size: 11px; font-weight: 800; color: var(--muted); letter-spacing: .06em; text-transform: uppercase; }
.azf-live {
	display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 999px;
	background: rgba(251,113,133,.16); border: 1px solid rgba(251,113,133,.45);
	font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; color: #ffd0d8;
}
.azf-live i { width: 7px; height: 7px; border-radius: 50%; background: var(--loss); box-shadow: 0 0 10px var(--loss); animation: azf-blink 1.4s ease-in-out infinite; }
.azf-sync { font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; animation: azf-blink 1.6s ease-in-out infinite; }
.azf-score { text-align: right; }
.azf-count { font-size: 26px; font-weight: 900; line-height: 1; letter-spacing: -.04em; }
.azf-count b { color: var(--gold); text-shadow: 0 0 18px rgba(246,196,83,.45); }
.azf-count span { color: var(--muted); font-size: 16px; }
.azf-dots { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 5px; }
.azf-dots span { position: relative; width: 14px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.18); overflow: hidden; transition: width .4s ease; }
.azf-dots span.is-active { width: 26px; }
.azf-dots span i { position: absolute; inset: 0; background: var(--gold); transform-origin: left; animation: azf-timer linear both; }
.azf-dots em { font-style: normal; margin-left: 6px; font-size: 11px; font-weight: 900; color: var(--muted); }

.azf-stage { position: relative; z-index: 2; height: 160px; }
.azf-scene { position: absolute; inset: 0 20px; display: flex; align-items: center; animation: azf-scene-in 700ms cubic-bezier(.16,.84,.2,1) both; }
.azf-leave { animation: azf-leave ${LEAVE_MS}ms cubic-bezier(.6,0,.8,.2) forwards; }
.azf-rise { animation: azf-rise 640ms cubic-bezier(.16,.84,.2,1) both; animation-delay: calc(var(--d, 0) * 75ms + 140ms); }

.azf-main { min-width: 0; flex: 1; }
.azf-name { display: flex; align-items: center; gap: 10px; margin-top: 2px; font-size: 34px; font-weight: 900; line-height: 1.05; letter-spacing: -.035em; white-space: nowrap; text-shadow: 0 2px 14px rgba(0,0,0,.8); }
.azf-sub { margin-top: 6px; font-size: 14px; font-weight: 800; color: var(--muted); }
.azf-tag { padding: 3px 8px; border-radius: 7px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; background: rgba(255,255,255,.1); color: var(--ink); }
.azf-tag.is-gold { background: var(--gold); color: #1b1406; box-shadow: 0 0 14px rgba(246,196,83,.5); }

.azf-hunt, .azf-last { position: relative; display: flex; align-items: center; gap: 22px; width: 100%; }
.azf-splash {
	position: absolute; top: -60px; bottom: -40px; right: -20px; width: 62%; z-index: -1;
	background-size: cover; background-position: center 20%; opacity: .42;
	-webkit-mask-image: linear-gradient(90deg, transparent, #000 45%, #000 70%, transparent);
	mask-image: linear-gradient(90deg, transparent, #000 45%, #000 70%, transparent);
	animation: azf-ken 16s ease-out both;
}
.azf-chips { display: flex; gap: 6px; margin-top: 9px; }
.azf-chip { padding: 4px 9px; border-radius: 8px; background: rgba(255,255,255,.08); border: 1px solid var(--line); font-size: 12px; font-weight: 900; white-space: nowrap; }
.azf-chip.is-gold { background: linear-gradient(135deg, var(--gold-soft), var(--gold)); color: #1b1406; border-color: transparent; box-shadow: 0 0 16px rgba(246,196,83,.35); }
.azf-chip.is-dim { color: var(--muted); }
.azf-pips { display: flex; gap: 4px; margin-top: 10px; }
.azf-pip { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; width: 26px; height: 30px; border-radius: 6px; font-size: 11px; line-height: 1; font-weight: 900; background: rgba(255,255,255,.06); border: 1px solid var(--line); box-sizing: border-box; }
.azf-pip small { font-size: 8px; opacity: .7; }
.azf-pip.is-loss { background: rgba(251,113,133,.16); border-color: rgba(251,113,133,.5); color: #ffd0d8; }
.azf-pip.is-win { background: rgba(94,234,212,.18); border-color: rgba(94,234,212,.55); color: #c9fff5; }
.azf-pip.is-more { width: auto; padding: 0 6px; color: var(--muted); }
.azf-pip.is-next { border: 1px dashed var(--gold); color: var(--gold); animation: azf-pulse 1.8s ease-in-out infinite; }
.azf-next { flex: 0 0 92px; text-align: center; padding: 10px 8px; border-radius: 14px; background: rgba(0,0,0,.35); border: 1px solid var(--line); box-sizing: border-box; }
.azf-next img { display: block; width: 52px; height: 52px; margin: 7px auto 5px; border-radius: 12px; border: 2px solid rgba(255,255,255,.25); filter: saturate(.75); }
.azf-next-name { font-size: 11.5px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.azf-portrait { position: relative; flex: 0 0 auto; }
@property --azf-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
.azf-ring { position: absolute; inset: -4px; border-radius: 26px; background: conic-gradient(from var(--azf-angle), var(--gold), rgba(246,196,83,.08) 30%, var(--gold-soft) 50%, rgba(246,196,83,.08) 80%, var(--gold)); animation: azf-angle 5s linear infinite; box-shadow: 0 0 22px rgba(246,196,83,.28); }
.azf-portrait.is-win .azf-ring { background: conic-gradient(from var(--azf-angle), var(--win), rgba(94,234,212,.08) 30%, #d6fff7 50%, rgba(94,234,212,.08) 80%, var(--win)); box-shadow: 0 0 22px rgba(94,234,212,.3); }
.azf-portrait-img { position: absolute; inset: 0; border-radius: 22px; overflow: hidden; background: #000; box-shadow: 0 10px 28px rgba(0,0,0,.7); }
.azf-portrait-img img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.08); }
.azf-portrait-badge {
	position: absolute; right: -8px; bottom: -8px; display: grid; place-items: center; min-width: 32px; height: 32px; padding: 0 4px; box-sizing: border-box;
	border-radius: 10px; font-size: 18px; font-weight: 900; color: #1b1406; background: linear-gradient(135deg, var(--gold-soft), var(--gold));
	box-shadow: 0 4px 14px rgba(0,0,0,.6), 0 0 16px rgba(246,196,83,.5);
}
.azf-portrait.is-win .azf-portrait-badge { background: linear-gradient(135deg, #d6fff7, var(--win)); color: #032a24; box-shadow: 0 4px 14px rgba(0,0,0,.6), 0 0 16px rgba(94,234,212,.55); }

.azf-stats { display: flex; gap: 22px; margin-top: 12px; }
.azf-stat-label { font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .14em; color: var(--muted); }
.azf-stat-value { margin-top: 3px; font-size: 19px; font-weight: 900; letter-spacing: -.02em; white-space: nowrap; }
.azf-stat-value.is-accent { color: var(--gold); text-shadow: 0 0 14px rgba(246,196,83,.4); }

.azf-road { width: 100%; }
.azf-trail { display: flex; align-items: flex-end; gap: 10px; margin-top: 10px; }
.azf-stop { width: 58px; text-align: center; }
.azf-stop-icon { position: relative; width: 48px; height: 48px; margin: 0 auto; }
.azf-stop-icon img { width: 100%; height: 100%; border-radius: 12px; object-fit: cover; border: 2px solid rgba(255,255,255,.18); box-sizing: border-box; }
.azf-stop.is-done .azf-stop-icon img { border-color: rgba(94,234,212,.7); filter: saturate(.55) brightness(.85); }
.azf-stop.is-current { width: 82px; }
.azf-stop.is-current .azf-stop-icon { width: 70px; height: 70px; }
.azf-stop.is-current .azf-stop-icon img { border-color: var(--gold); animation: azf-glow 2.2s ease-in-out infinite; }
.azf-stop.is-next .azf-stop-icon img { filter: grayscale(.7) brightness(.8); }
.azf-stop-badge { position: absolute; right: -6px; bottom: -6px; padding: 2px 5px; border-radius: 6px; font-size: 10px; font-weight: 900; background: var(--win); color: #032a24; }
.azf-stop.is-current .azf-stop-badge { background: var(--gold); color: #1b1406; font-size: 12px; }
.azf-stop-name { margin-top: 7px; font-size: 10.5px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
.azf-stop.is-current .azf-stop-name { color: var(--ink); font-size: 12px; }
.azf-road-foot { display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; font-weight: 800; color: var(--muted); }
.azf-road-foot b { color: var(--ink); }

.azf-alpha { display: flex; align-items: center; gap: 22px; width: 100%; }
.azf-letters { display: grid; grid-template-columns: repeat(13, 28px); gap: 4px; }
.azf-letter { position: relative; height: 44px; border-radius: 7px; overflow: hidden; background: rgba(255,255,255,.05); border: 1px solid var(--line); text-align: center; box-sizing: border-box; }
.azf-letter i { position: absolute; left: 0; right: 0; bottom: 0; height: calc(var(--fill) * 100%); background: linear-gradient(0deg, rgba(246,196,83,.55), rgba(246,196,83,.18)); }
.azf-letter b { position: relative; display: block; margin-top: 6px; font-size: 15px; font-weight: 900; }
.azf-letter small { position: relative; display: block; font-size: 8.5px; font-weight: 800; color: var(--muted); }
.azf-letter.is-done { border-color: rgba(246,196,83,.65); }
.azf-letter.is-done b { color: #1b1406; }
.azf-letter.is-done small { color: rgba(27,20,6,.7); }
.azf-letter.is-done i { background: linear-gradient(0deg, var(--gold), var(--gold-soft)); }
.azf-letter.is-current { border-color: var(--gold); animation: azf-rise 640ms cubic-bezier(.16,.84,.2,1) both, azf-pulse 1.8s ease-in-out 1s infinite; }
.azf-letter.is-current b { color: var(--gold); }
.azf-letter.is-empty { opacity: .3; }
.azf-grid-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px 18px; flex: 1; }
.azf-grid-stats .azf-stat-label { white-space: nowrap; }

.azf-celebrate { position: relative; display: flex; align-items: center; gap: 26px; width: 100%; padding-left: 10px; }
.azf-rays {
	position: absolute; left: -90px; top: 50%; width: 360px; height: 360px; margin-top: -180px; z-index: -1; opacity: .55;
	background: repeating-conic-gradient(from 0deg, rgba(94,234,212,.35) 0deg 8deg, transparent 8deg 22deg);
	-webkit-mask-image: radial-gradient(circle, #000 18%, transparent 62%); mask-image: radial-gradient(circle, #000 18%, transparent 62%);
	animation: azf-spin 14s linear infinite;
}
.azf-sparks { position: absolute; left: 60px; top: 50%; width: 0; height: 0; }
.azf-sparks i { position: absolute; width: 4px; height: 10px; border-radius: 2px; background: var(--gold-soft); box-shadow: 0 0 8px var(--gold); animation: azf-spark 1.3s cubic-bezier(.16,.84,.2,1) both; animation-delay: calc(var(--t) + 300ms); }
.azf-pop { animation: azf-pop 800ms cubic-bezier(.2,1.4,.4,1) both; }
.azf-shout {
	font-size: 44px; font-weight: 900; line-height: 1; letter-spacing: -.04em; text-transform: uppercase;
	background: linear-gradient(100deg, var(--gold) 20%, #fff7df 40%, var(--gold) 60%); background-size: 200% 100%;
	-webkit-background-clip: text; background-clip: text; color: transparent;
	animation: azf-pop 700ms cubic-bezier(.2,1.4,.4,1) 120ms both, azf-shine 2.4s linear 900ms infinite;
	filter: drop-shadow(0 0 16px rgba(246,196,83,.45));
}
.azf-up { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; font-weight: 900; }
.azf-up span { font-size: 10.5px; text-transform: uppercase; letter-spacing: .16em; color: var(--muted); }
.azf-up img { width: 30px; height: 30px; border-radius: 8px; border: 2px solid var(--gold); }

.azf-finale { width: 100%; text-align: center; }
.azf-finale-title { font-size: 40px; font-weight: 900; color: var(--gold); text-transform: uppercase; letter-spacing: -.03em; }

.azf-bar { position: absolute; left: 20px; right: 20px; bottom: 12px; z-index: 2; display: flex; gap: 3px; }
.azf-seg { min-width: 0; text-align: center; }
.azf-seg-track { height: 6px; border-radius: 3px; overflow: hidden; background: rgba(255,255,255,.1); }
.azf-seg-track i { display: block; height: 100%; background: linear-gradient(90deg, #c98b1c, var(--gold), var(--gold-soft)); transform-origin: left; transition: transform 1.2s cubic-bezier(.16,.84,.2,1); }
.azf-seg span { display: block; margin-top: 4px; font-size: 9px; font-weight: 900; color: rgba(245,243,238,.38); }
.azf-seg.is-done span { color: var(--gold); }
.azf-seg.is-current .azf-seg-track { box-shadow: 0 0 0 1px var(--gold), 0 0 12px rgba(246,196,83,.55); animation: azf-blink 2s ease-in-out infinite; }
.azf-seg.is-current span { color: var(--ink); }

@keyframes azf-panel-in { from { opacity: 0; transform: translateY(18px) scale(.97); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes azf-scene-in { from { opacity: 0; clip-path: inset(0 100% 0 0); transform: translateX(22px); } 55% { opacity: 1; } to { opacity: 1; clip-path: inset(0 0 0 0); transform: none; } }
@keyframes azf-leave { to { opacity: 0; transform: translateX(-28px); filter: blur(7px); } }
@keyframes azf-rise { from { opacity: 0; transform: translateY(12px); filter: blur(5px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes azf-sweep { from { transform: translateX(-120%) skewX(-18deg); opacity: 0; } 30% { opacity: 1; } to { transform: translateX(330%) skewX(-18deg); opacity: 0; } }
@keyframes azf-watermark-in { from { opacity: 0; transform: translateY(40px) scale(.9); } to { opacity: 1; transform: none; } }
@keyframes azf-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes azf-spin { to { transform: rotate(360deg); } }
@keyframes azf-angle { to { --azf-angle: 360deg; } }
@keyframes azf-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(246,196,83,.55); } 50% { box-shadow: 0 0 0 6px rgba(246,196,83,0); } }
@keyframes azf-glow { 0%, 100% { box-shadow: 0 0 14px rgba(246,196,83,.4); } 50% { box-shadow: 0 0 28px rgba(246,196,83,.8); } }
@keyframes azf-blink { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
@keyframes azf-timer { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes azf-ken { from { transform: scale(1.04); } to { transform: scale(1.16) translateX(-16px); } }
@keyframes azf-pop { 0% { opacity: 0; transform: scale(.4); } 60% { opacity: 1; transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
@keyframes azf-spark { from { opacity: 1; transform: rotate(var(--a)) translateY(-40px) scaleY(1); } to { opacity: 0; transform: rotate(var(--a)) translateY(-150px) scaleY(.3); } }
@keyframes azf-shine { from { background-position: 200% 0; } to { background-position: -200% 0; } }
`;
