"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MyState } from "@/lib/winchallenge/me";
import { formatElapsed } from "@/lib/winchallenge/timer";
import type { WinGame, WinTeamStatus } from "@/lib/winchallenge/types";
import { winFetch } from "../win-api";

type MeResponse = ({ loggedIn: false } | ({ loggedIn: true } & MyState)) & { message?: string };
type Team = NonNullable<MyState["team"]>;

const STATUS_LABEL: Record<WinTeamStatus, string> = {
	forming: "Wartet auf Partner",
	ready: "Bereit",
	running: "Läuft",
	paused: "Pause",
	finished: "Fertig",
	"gave-up": "Aufgegeben",
};

const POLL_MS = 5000;

function countdown(ms: number): string {
	const minutes = Math.max(1, Math.ceil(ms / 60_000));
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	const rest = minutes % 60;
	return [days ? `${days} d` : "", hours ? `${hours} h` : "", `${rest} min`].filter(Boolean).join(" ");
}

export function ControlClient() {
	const [me, setMe] = useState<MeResponse | null>(null);
	const [receivedAt, setReceivedAt] = useState(0);
	const [now, setNow] = useState(() => Date.now());
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState<string | null>(null);
	const offset = useRef(0);

	const load = useCallback(async () => {
		try {
			const sentAt = Date.now();
			const data = await winFetch<MeResponse>("/api/winchallenge/me");
			const arrived = Date.now();
			if ("serverNow" in data) offset.current = data.serverNow - (sentAt + arrived) / 2;
			setMe(data);
			setReceivedAt(arrived);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Laden fehlgeschlagen.");
		}
	}, []);

	useEffect(() => {
		void load();
		const poll = window.setInterval(() => {
			if (document.visibilityState === "visible") void load();
		}, POLL_MS);
		const tick = window.setInterval(() => setNow(Date.now()), 250);
		return () => {
			window.clearInterval(poll);
			window.clearInterval(tick);
		};
	}, [load]);

	const press = useCallback(
		async (body: { action: string; gameId?: string | null }, key: string) => {
			setPending(key);
			setError(null);
			try {
				await winFetch("/api/winchallenge/control", { body });
				await load();
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.");
			} finally {
				setPending(null);
			}
		},
		[load],
	);

	if (!me) return <p className="text-sm text-[var(--muted)]">{error ?? "Lade…"}</p>;
	if (!me.loggedIn) return null;
	if (!me.challenge) return <Notice>Aktuell läuft keine Win Challenge.</Notice>;
	if (!me.participant || !me.team) {
		return (
			<Notice>
				Du bist noch in keinem Team.{" "}
				<Link href="/winchallenge/mitmachen" className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
					Zur Anmeldung
				</Link>
			</Notice>
		);
	}

	const team = me.team;
	const challenge = me.challenge;
	const serverNow = now + offset.current;
	const elapsed = team.running ? team.elapsedMs + (now - receivedAt) : team.elapsedMs;
	const untilStart = new Date(challenge.startAt).getTime() - serverNow;
	const ended = challenge.status !== "open";
	const active = team.status === "running" || team.status === "paused";
	const liveOk = team.live !== "offline";
	const busy = pending !== null;

	return (
		<div className="mx-auto grid max-w-3xl gap-4">
			<header className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p className="text-xs font-semibold text-[var(--accent)]">{challenge.name}</p>
						<h1 className="mt-1 font-display text-2xl font-semibold text-[var(--text)]">{team.name}</h1>
						<p className="mt-1 text-sm text-[var(--muted)]">{team.members.map((member) => member.name).join(" + ")}</p>
					</div>
					<LiveBadge live={team.live} />
				</div>
				<p className="mt-5 font-mono text-5xl font-semibold tabular-nums text-[var(--text)] sm:text-6xl" aria-live="off">
					{formatElapsed(elapsed)}
				</p>
				<p className="mt-2 text-sm text-[var(--muted)]">
					{STATUS_LABEL[team.status]} · {team.done}/{challenge.games.length} geschafft
				</p>

				<div className="mt-5 flex flex-wrap gap-3">
					{team.status === "forming" ? (
						<p className="text-sm text-[var(--muted)]">
							Warte auf deinen Partner. Code: <span className="font-mono text-[var(--text)]">{team.joinCode}</span>
						</p>
					) : null}
					{team.status === "ready" ? (
						<BigButton primary disabled={busy || ended || untilStart > 0 || !liveOk} onClick={() => press({ action: "start" }, "start")}>
							{untilStart > 0 ? `Start möglich in ${countdown(untilStart)}` : "Start"}
						</BigButton>
					) : null}
					{team.status === "running" ? (
						<BigButton disabled={busy || ended} onClick={() => press({ action: "pause" }, "pause")}>
							Pause
						</BigButton>
					) : null}
					{team.status === "paused" ? (
						<BigButton primary disabled={busy || ended || !liveOk} onClick={() => press({ action: "resume" }, "resume")}>
							Weiter
						</BigButton>
					) : null}
				</div>
				{!liveOk && (team.status === "ready" || active) ? <p className="mt-3 text-sm text-[var(--amber)]">Einer von euch muss auf Twitch live sein.</p> : null}
				{team.live === "twitch-down" ? <p className="mt-3 text-xs text-[var(--muted)]">Twitch ist gerade nicht erreichbar. Aktionen gehen trotzdem und werden vermerkt.</p> : null}
				<div aria-live="polite">{error ? <p className="mt-3 rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}</div>
			</header>

			<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-3 sm:p-4">
				<h2 className="px-2 pb-2 pt-1 font-display text-lg font-semibold text-[var(--text)]">Spiele</h2>
				<ul className="grid gap-2">
					{challenge.games.map((game) => (
						<GameRow
							key={game.id}
							game={game}
							team={team}
							disabled={busy || ended || !(active || team.status === "finished")}
							liveOk={liveOk}
							pending={pending}
							press={press}
						/>
					))}
				</ul>
			</section>

			<OverlayLinks slug={team.slug} />

			<div className="flex flex-wrap items-center justify-between gap-3 px-1">
				<Link href={`/winchallenge/team/${team.slug}`} className="text-sm text-[var(--muted)] underline-offset-2 hover:underline">
					Öffentliche Teamseite
				</Link>
				{active && !ended ? (
					<button
						type="button"
						className="button small danger"
						disabled={busy}
						onClick={() => {
							if (window.confirm("Wirklich aufgeben? Der Timer stoppt. Euer Einsatz bleibt fällig.")) void press({ action: "give-up" }, "give-up");
						}}
					>
						Aufgeben
					</button>
				) : null}
			</div>
		</div>
	);
}

function Notice({ children }: { children: React.ReactNode }) {
	return <section className="mx-auto max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-6 text-sm text-[var(--muted)]">{children}</section>;
}

function LiveBadge({ live }: { live: Team["live"] }) {
	const text = live === "live" ? "Live" : live === "offline" ? "Offline" : "Twitch?";
	return (
		<span className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs font-semibold text-[var(--text)]">
			<span className={`size-2 rounded-full ${live === "live" ? "bg-[var(--live)]" : "bg-[var(--muted)]"}`} aria-hidden="true" />
			{text}
		</span>
	);
}

function BigButton({ children, onClick, disabled, primary }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
	return (
		<button type="button" onClick={onClick} disabled={disabled} className={`button ${primary ? "primary" : "ghost"} min-h-12 min-w-36 text-base`}>
			{children}
		</button>
	);
}

function GameRow({
	game,
	team,
	disabled,
	liveOk,
	pending,
	press,
}: {
	game: WinGame;
	team: Team;
	disabled: boolean;
	liveOk: boolean;
	pending: string | null;
	press: (body: { action: string; gameId?: string | null }, key: string) => Promise<void>;
}) {
	const progress = team.progress[game.id] ?? { count: 0, tries: 0 };
	const done = Boolean(progress.doneAt);
	const current = team.currentGameId === game.id;
	const target = Math.max(1, game.target ?? 1);
	const key = (action: string) => `${action}:${game.id}`;
	const button = "button small min-h-10";

	return (
		<li className={`grid gap-3 rounded-xl border px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center ${current ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>
			<div className="min-w-0">
				<p className="font-semibold text-[var(--text)]">
					<span className={done ? "text-[var(--accent)]" : "text-[var(--muted)]"} aria-hidden="true">
						{done ? "✓ " : current ? "▶ " : "○ "}
					</span>
					{game.title}
				</p>
				<p className="text-sm text-[var(--muted)]">
					{game.goal}
					{game.type === "counter" ? ` · ${progress.count}/${target} · Versuch ${progress.tries + 1}` : ""}
				</p>
				{game.note ? <p className="mt-1 text-xs text-[var(--text)]">Hinweis: {game.note}</p> : null}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				{game.type === "check" ? (
					done ? (
						<button type="button" className={`${button} ghost`} disabled={disabled} onClick={() => press({ action: "undo", gameId: game.id }, key("undo"))}>
							Rückgängig
						</button>
					) : (
						<button type="button" className={`${button} primary`} disabled={disabled || !liveOk || team.status === "finished"} onClick={() => press({ action: "done", gameId: game.id }, key("done"))}>
							{pending === key("done") ? "…" : "Erledigt"}
						</button>
					)
				) : (
					<>
						<button type="button" className={`${button} ghost`} disabled={disabled || progress.count === 0} onClick={() => press({ action: "minus", gameId: game.id }, key("minus"))} aria-label={`${game.title} minus eins`}>
							−
						</button>
						<span className="min-w-12 text-center font-mono tabular-nums text-[var(--text)]">
							{progress.count}/{target}
						</span>
						<button type="button" className={`${button} primary`} disabled={disabled || !liveOk || done || team.status === "finished"} onClick={() => press({ action: "plus", gameId: game.id }, key("plus"))} aria-label={`${game.title} plus eins`}>
							+
						</button>
						<button
							type="button"
							className={`${button} ghost`}
							disabled={disabled || !liveOk || done || team.status === "finished"}
							onClick={() => {
								if (window.confirm(`${game.title}: Versuch zurücksetzen?`)) void press({ action: "reset", gameId: game.id }, key("reset"));
							}}
						>
							Reset
						</button>
					</>
				)}
				{!done && team.status !== "finished" ? (
					<button
						type="button"
						className={`${button} ghost`}
						disabled={disabled}
						aria-pressed={current}
						onClick={() => press({ action: "current", gameId: current ? null : game.id }, key("current"))}
					>
						{current ? "Spiele ich gerade ✓" : "Spiele ich gerade"}
					</button>
				) : null}
			</div>
		</li>
	);
}

function OverlayLinks({ slug }: { slug: string }) {
	const [copied, setCopied] = useState<string | null>(null);
	const [origin, setOrigin] = useState("");
	useEffect(() => setOrigin(window.location.origin), []);
	const links = [
		{ key: "main", label: "Tracker (Seitenleiste, 420 × 900)", url: `${origin}/obs/winchallenge/${slug}/main` },
		{ key: "bar", label: "Leiste (1920 × 80)", url: `${origin}/obs/winchallenge/${slug}/bar` },
	];
	async function copy(key: string, url: string) {
		await navigator.clipboard.writeText(url).catch(() => undefined);
		setCopied(key);
		window.setTimeout(() => setCopied(null), 1500);
	}
	return (
		<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5">
			<h2 className="font-display text-lg font-semibold text-[var(--text)]">Overlays für OBS</h2>
			<p className="mt-1 text-sm text-[var(--muted)]">Als Browserquelle einfügen. Die Links zeigen nur euren Fortschritt und sind ungefährlich.</p>
			<ul className="mt-4 grid gap-2">
				{links.map((link) => (
					<li key={link.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2">
						<span className="text-sm text-[var(--text)]">{link.label}</span>
						<span className="flex gap-2">
							<a href={link.url} target="_blank" rel="noreferrer" className="button small ghost">
								Vorschau
							</a>
							<button type="button" className="button small primary" onClick={() => void copy(link.key, link.url)}>
								{copied === link.key ? "Kopiert" : "Link kopieren"}
							</button>
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}
