"use client";

/**
 * Win Challenge OBS overlays: team tracker (`main`), slim bar (`bar`) and the leaderboard.
 * Transparent background, polls every 2 s, timer runs locally on the server clock.
 * Query options: ?scale=1.2 ?align=left|right ?hideList=1 ?pot=1 ?limit=5
 */
import { useEffect, useRef, useState } from "react";
import { formatElapsed } from "@/lib/winchallenge/timer";
import type { WinGame } from "@/lib/winchallenge/types";
import type { PublicChallenge, PublicTeam } from "@/lib/winchallenge/view";

export type WinOverlayMode = "main" | "bar" | "leaderboard";
export type WinOverlayOptions = { scale: number; align: "left" | "right"; hideList: boolean; showPot: boolean; limit: number };

type TeamFeed = { serverNow: number; challenge: { name: string; status: string; games: WinGame[] }; team: PublicTeam; teamCount: number };
type Banner = { key: number; title: string; sub: string; big: boolean };

const POLL_MS = 2000;

const CSS = `
.wco { --bg: rgba(7, 17, 12, 0.88); --line: rgba(217, 249, 157, 0.16); --text: #effbf2; --muted: #a2bfac; --accent: #bef264; --live: #ff6b6b;
  color: var(--text); font-family: "DM Sans", "Segoe UI", Arial, sans-serif; transform-origin: top left; }
.wco * { box-sizing: border-box; }
.wco-panel { background: var(--bg); border: 1px solid var(--line); border-radius: 20px; padding: 20px; }
.wco-kicker { font-size: 13px; font-weight: 700; color: var(--accent); letter-spacing: 0.02em; }
.wco-title { margin: 4px 0 0; font-size: 26px; font-weight: 800; line-height: 1.15; }
.wco-members { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 12px; font-size: 14px; color: var(--muted); }
.wco-dot { display: inline-block; width: 8px; height: 8px; border-radius: 99px; background: #4b5d52; margin-right: 6px; vertical-align: 1px; }
.wco-dot.is-live { background: var(--live); box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.2); }
.wco-timer { margin-top: 14px; font-family: "Cascadia Code", Consolas, monospace; font-variant-numeric: tabular-nums; font-size: 54px; font-weight: 700; line-height: 1; }
.wco-timer.is-paused { color: var(--muted); }
.wco-state { margin-top: 8px; display: flex; gap: 10px; align-items: center; font-size: 15px; color: var(--muted); }
.wco-pill { padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; }
.wco-pill.pause { background: #fcd34d; color: #2a1d02; }
.wco-pill.done { background: var(--accent); color: #0a1f12; }
.wco-pill.out { background: #4b5d52; color: var(--text); }
.wco-bar-track { margin-top: 12px; height: 6px; border-radius: 99px; background: rgba(239, 251, 242, 0.1); overflow: hidden; }
.wco-bar-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.6s ease; }
.wco-current { margin-top: 16px; padding: 14px; border-radius: 14px; border: 1px solid var(--accent); background: rgba(190, 242, 100, 0.08); }
.wco-current-game { font-size: 20px; font-weight: 800; }
.wco-current-sub { margin-top: 2px; font-size: 14px; color: var(--muted); }
.wco-list { margin: 14px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.wco-list li { display: grid; grid-template-columns: 20px 1fr auto; gap: 8px; align-items: baseline; font-size: 15px; }
.wco-list .is-done { color: var(--muted); }
.wco-list .is-done .wco-mark { color: var(--accent); }
.wco-list .is-current { color: var(--accent); font-weight: 700; }
.wco-list .wco-count { font-family: "Cascadia Code", Consolas, monospace; font-size: 13px; color: var(--muted); }
.wco-foot { margin-top: 12px; font-size: 13px; color: var(--muted); }
.wco-banner { margin-top: 12px; padding: 14px 16px; border-radius: 14px; background: var(--accent); color: #0a1f12; animation: wco-in 0.45s cubic-bezier(.2,.9,.3,1.3); }
.wco-banner b { display: block; font-size: 20px; }
.wco-banner.big b { font-size: 30px; }
.wco-banner span { font-size: 14px; font-weight: 600; }
@keyframes wco-in { from { transform: translateY(10px) scale(0.96); opacity: 0; } to { transform: none; opacity: 1; } }
.wco-bar { display: flex; align-items: center; gap: 22px; height: 72px; padding: 0 24px; background: var(--bg); border: 1px solid var(--line); border-radius: 18px; white-space: nowrap; }
.wco-bar .wco-timer { margin: 0; font-size: 36px; }
.wco-bar-sep { width: 1px; height: 32px; background: var(--line); }
.wco-bar-label { font-size: 12px; font-weight: 700; color: var(--muted); }
.wco-bar-value { font-size: 20px; font-weight: 800; }
.wco-lb-row { display: grid; grid-template-columns: 34px 1fr 64px 120px; gap: 12px; align-items: center; padding: 9px 4px; border-top: 1px solid var(--line); font-size: 16px; }
.wco-lb-row:first-of-type { border-top: 0; }
.wco-lb-rank { font-weight: 800; color: var(--accent); }
.wco-lb-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wco-lb-num { font-family: "Cascadia Code", Consolas, monospace; font-variant-numeric: tabular-nums; text-align: right; }
@media (prefers-reduced-motion: reduce) { .wco-banner { animation: none; } .wco-bar-fill { transition: none; } }
`;

function useFeed<T extends { serverNow: number }>(url: string) {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [received, setReceived] = useState(0);
	useEffect(() => {
		if (!url) return;
		let stopped = false;
		async function poll() {
			try {
				const response = await fetch(url, { cache: "no-store" });
				const body = await response.json();
				if (stopped) return;
				if (!response.ok) setError(body?.message ?? "Nicht gefunden");
				else {
					setData(body);
					setReceived(Date.now());
					setError(null);
				}
			} catch {
				// Keep the last state on network hiccups.
			}
		}
		void poll();
		const timer = window.setInterval(poll, POLL_MS);
		return () => {
			stopped = true;
			window.clearInterval(timer);
		};
	}, [url]);
	return { data, error, received };
}

function useNow() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 250);
		return () => window.clearInterval(timer);
	}, []);
	return now;
}

function liveElapsed(team: PublicTeam, received: number, now: number) {
	return team.running ? team.elapsedMs + Math.max(0, now - received) : team.elapsedMs;
}

function Frame({ options, children }: { options: WinOverlayOptions; children: React.ReactNode }) {
	return (
		<div style={{ display: "flex", justifyContent: options.align === "right" ? "flex-end" : "flex-start", padding: 12 }}>
			<style>{CSS}</style>
			<div className="wco" style={{ transform: `scale(${options.scale})`, transformOrigin: options.align === "right" ? "top right" : "top left" }}>
				{children}
			</div>
		</div>
	);
}

function stateLabel(team: PublicTeam) {
	if (team.status === "finished") return <span className="wco-pill done">FERTIG</span>;
	if (team.status === "gave-up") return <span className="wco-pill out">AUFGEGEBEN</span>;
	if (team.status === "paused") return <span className="wco-pill pause">PAUSE</span>;
	if (team.status === "forming" || team.status === "ready") return <span className="wco-pill out">NOCH NICHT GESTARTET</span>;
	return null;
}

function counterText(game: WinGame, state: PublicTeam["games"][number] | undefined) {
	if (game.type !== "counter") return "";
	return `${state?.count ?? 0}/${Math.max(1, game.target ?? 1)} · Versuch ${(state?.tries ?? 0) + 1}`;
}

/** Shows a short banner when a game gets done, a bigger one at the finish. */
function useBanners(team: PublicTeam | undefined, games: WinGame[]) {
	const previous = useRef<Map<string, boolean> | null>(null);
	const previousStatus = useRef<string | null>(null);
	const [banner, setBanner] = useState<Banner | null>(null);
	useEffect(() => {
		if (!team) return;
		const done = new Map(team.games.map((game) => [game.id, Boolean(game.doneAt)]));
		if (previous.current) {
			if (team.status === "finished" && previousStatus.current !== "finished") {
				setBanner({ key: Date.now(), title: "FERTIG!", sub: `Alle ${games.length} Spiele geschafft`, big: true });
			} else {
				const fresh = games.find((game) => done.get(game.id) && !previous.current?.get(game.id));
				if (fresh) setBanner({ key: Date.now(), title: `${fresh.title} geschafft`, sub: fresh.goal, big: false });
			}
		}
		previous.current = done;
		previousStatus.current = team.status;
	}, [team, games]);
	useEffect(() => {
		if (!banner) return;
		const timer = window.setTimeout(() => setBanner(null), banner.big ? 12_000 : 6000);
		return () => window.clearTimeout(timer);
	}, [banner]);
	return banner;
}

export function WinTeamOverlay({ slug, mode, options }: { slug: string; mode: "main" | "bar"; options: WinOverlayOptions }) {
	const { data, error, received } = useFeed<TeamFeed>(`/api/obs/winchallenge/${encodeURIComponent(slug)}`);
	const pot = useFeed<PublicChallenge>(options.showPot ? "/api/obs/winchallenge/leaderboard?limit=1" : "");
	const now = useNow();
	const banner = useBanners(data?.team, data?.challenge.games ?? []);

	if (!data) return error ? <Frame options={options}><div className="wco-panel" style={{ fontSize: 14 }}>Win Challenge: {error}</div></Frame> : null;
	const { team, challenge } = data;
	const games = challenge.games;
	const stateById = new Map(team.games.map((game) => [game.id, game]));
	const current = games.find((game) => game.id === team.currentGameId);
	const elapsed = liveElapsed(team, received, now);
	const timerClass = `wco-timer${team.running ? "" : " is-paused"}`;

	if (mode === "bar") {
		return (
			<Frame options={options}>
				<div className="wco-bar">
					<span className={timerClass}>{formatElapsed(elapsed)}</span>
					{stateLabel(team)}
					<span className="wco-bar-sep" />
					<span>
						<div className="wco-bar-label">{current ? "Aktuell" : team.name}</div>
						<div className="wco-bar-value">{current ? `${current.title}${current.type === "counter" ? ` · ${counterText(current, stateById.get(current.id))}` : ""}` : "Win Challenge"}</div>
					</span>
					<span className="wco-bar-sep" />
					<span>
						<div className="wco-bar-label">Geschafft</div>
						<div className="wco-bar-value">
							{team.done}/{team.total}
						</div>
					</span>
					<span className="wco-bar-sep" />
					<span>
						<div className="wco-bar-label">Platz</div>
						<div className="wco-bar-value">
							{team.rank} / {data.teamCount}
						</div>
					</span>
				</div>
			</Frame>
		);
	}

	return (
		<Frame options={options}>
			<div className="wco-panel" style={{ width: 420 }}>
				<div className="wco-kicker">{challenge.name}</div>
				<h1 className="wco-title">{team.name}</h1>
				<div className="wco-members">
					{team.members.map((member) => (
						<span key={member.twitch}>
							<i className={`wco-dot${member.live ? " is-live" : ""}`} />
							{member.name}
						</span>
					))}
				</div>
				<div className={timerClass}>{formatElapsed(elapsed)}</div>
				<div className="wco-state">
					{stateLabel(team)}
					<span>
						{team.done} / {team.total} geschafft · Platz {team.rank}
					</span>
				</div>
				<div className="wco-bar-track">
					<div className="wco-bar-fill" style={{ width: `${team.total ? (team.done / team.total) * 100 : 0}%` }} />
				</div>
				{banner ? (
					<div key={banner.key} className={`wco-banner${banner.big ? " big" : ""}`}>
						<b>{banner.big ? `${banner.title} ${formatElapsed(elapsed)}` : banner.title}</b>
						<span>{banner.sub}</span>
					</div>
				) : current ? (
					<div className="wco-current">
						<div className="wco-current-game">▶ {current.title}</div>
						<div className="wco-current-sub">
							{current.goal}
							{current.type === "counter" ? ` · ${counterText(current, stateById.get(current.id))}` : ""}
						</div>
					</div>
				) : null}
				{options.hideList ? null : (
					<ul className="wco-list">
						{games.map((game) => {
							const state = stateById.get(game.id);
							const done = Boolean(state?.doneAt);
							const isCurrent = game.id === team.currentGameId;
							return (
								<li key={game.id} className={done ? "is-done" : isCurrent ? "is-current" : ""}>
									<span className="wco-mark">{done ? "✓" : isCurrent ? "▶" : "○"}</span>
									<span>{game.title}</span>
									<span className="wco-count">{game.type === "counter" && !done ? `${state?.count ?? 0}/${Math.max(1, game.target ?? 1)}` : ""}</span>
								</li>
							);
						})}
					</ul>
				)}
				{options.showPot && pot.data ? <div className="wco-foot">Pot: {pot.data.pot} Subs</div> : null}
			</div>
		</Frame>
	);
}

export function WinLeaderboardOverlay({ options }: { options: WinOverlayOptions }) {
	const { data, received } = useFeed<PublicChallenge>(`/api/obs/winchallenge/leaderboard?limit=${options.limit}`);
	const now = useNow();
	if (!data?.challenge) return null;
	return (
		<Frame options={options}>
			<div className="wco-panel" style={{ width: 460 }}>
				<div className="wco-kicker">{data.challenge.name}</div>
				<h1 className="wco-title" style={{ fontSize: 22 }}>
					Rangliste
				</h1>
				<div style={{ marginTop: 10 }}>
					{data.teams.length === 0 ? <div className="wco-foot">Noch keine Teams</div> : null}
					{data.teams.map((team) => (
						<div key={team.slug} className="wco-lb-row">
							<span className="wco-lb-rank">{team.rank}</span>
							<span className="wco-lb-name">
								<i className={`wco-dot${team.members.some((member) => member.live) ? " is-live" : ""}`} />
								{team.name}
							</span>
							<span className="wco-lb-num">
								{team.done}/{team.total}
							</span>
							<span className="wco-lb-num">{team.status === "gave-up" ? "aufgeg." : formatElapsed(liveElapsed(team, received, now))}</span>
						</div>
					))}
				</div>
				{options.showPot ? <div className="wco-foot">Pot: {data.pot} Subs</div> : null}
			</div>
		</Frame>
	);
}
