"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatElapsed } from "@/lib/winchallenge/timer";
import type { WinChallenge, WinGame, WinParticipant, WinPayout, WinTeam, WinTeamStatus } from "@/lib/winchallenge/types";
import { formatDateTime, fromLocalInput, toLocalInput, winFetch } from "../win-api";

type AdminTeam = WinTeam & { elapsedMs: number };
type AdminEvent = { id: string; at: string; actor: string; kind: string; teamId?: string; gameId?: string; reason?: string; liveCheck?: string };
type AdminState = {
	serverNow: number;
	challenge: WinChallenge | null;
	teams: AdminTeam[];
	participants: WinParticipant[];
	payouts: WinPayout[];
	events: AdminEvent[];
	fallbackChannel: string;
};

const STATUS_LABEL: Record<WinTeamStatus, string> = {
	forming: "sucht Partner",
	ready: "bereit",
	running: "läuft",
	paused: "pausiert",
	finished: "fertig",
	"gave-up": "aufgegeben",
};

const CHALLENGE_STATUS: Record<WinChallenge["status"], string> = { draft: "Entwurf", open: "offen", ended: "beendet", archived: "archiviert" };

const EVENT_LABEL: Record<string, string> = {
	signup: "Anmeldung",
	"team-create": "Team erstellt",
	"team-join": "Team beigetreten",
	"team-leave": "Team verlassen",
	start: "Start",
	pause: "Pause",
	resume: "Weiter",
	done: "Geschafft",
	undo: "Rückgängig",
	plus: "+1",
	minus: "−1",
	reset: "Zurückgesetzt",
	current: "Aktuelles Spiel",
	"give-up": "Aufgegeben",
	"game-done": "Spiel geschafft",
	"team-finished": "Team fertig",
	admin: "Admin-Korrektur",
	"challenge-ended": "Challenge beendet",
	payout: "Sub-Status",
};

const input = "w-full rounded-lg border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const label = "grid gap-1.5 text-xs font-medium text-[var(--muted)]";

function Panel({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
	return (
		<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-display text-lg font-semibold text-[var(--text)]">{title}</h2>
					{description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
				</div>
				{actions}
			</div>
			<div className="mt-5">{children}</div>
		</section>
	);
}

export function WinAdminClient() {
	const [state, setState] = useState<AdminState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setState(await winFetch<AdminState>("/api/winchallenge/admin"));
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Laden fehlgeschlagen.");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const run = useCallback(
		async (body: Record<string, unknown>, success: string) => {
			setNotice(null);
			try {
				await winFetch("/api/winchallenge/admin", { body });
				setNotice(success);
				setError(null);
				await load();
				return true;
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen.");
				return false;
			}
		},
		[load],
	);

	if (!state) {
		return <p className="text-sm text-[var(--muted)]">{error ?? "Lade Admin-Daten…"}</p>;
	}

	return (
		<div className="grid gap-6">
			<header>
				<p className="text-xs font-semibold text-[var(--accent)]">Win Challenge</p>
				<h1 className="mt-1 font-display text-3xl font-semibold text-[var(--text)]">Admin</h1>
				<p className="mt-2 text-sm text-[var(--muted)]">
					{state.challenge ? `${state.challenge.name} · ${CHALLENGE_STATUS[state.challenge.status]} · Start ${formatDateTime(state.challenge.startAt)}` : "Noch keine Challenge angelegt."}
				</p>
			</header>
			<div aria-live="polite" className="grid gap-2">
				{error ? <p className="rounded-lg border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
				{notice ? <p className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--accent)]">{notice}</p> : null}
			</div>
			<SetupPanel challenge={state.challenge} hasTeams={state.teams.some((team) => team.segments.length > 0)} onSave={(body) => run({ action: "save-challenge", ...body }, "Challenge gespeichert.")} />
			{state.challenge ? (
				<>
					<TeamsPanel state={state} run={run} />
					<ParticipantsPanel state={state} run={run} />
					<EndPanel state={state} run={run} />
					<EventsPanel state={state} />
				</>
			) : null}
		</div>
	);
}

/* ------------------------------------------------------------------ setup */

function emptyGame(index: number): WinGame {
	return { id: `spiel-${index + 1}`, title: "", goal: "", type: "check" };
}

function SetupPanel({ challenge, hasTeams, onSave }: { challenge: WinChallenge | null; hasTeams: boolean; onSave: (body: Record<string, unknown>) => Promise<boolean> }) {
	const [name, setName] = useState(challenge?.name ?? "Win Challenge");
	const [startAt, setStartAt] = useState(toLocalInput(challenge?.startAt));
	const [signupOpen, setSignupOpen] = useState(challenge?.signupOpen ?? true);
	const [split, setSplit] = useState<[number, number, number]>(challenge?.split ?? [50, 30, 20]);
	const [games, setGames] = useState<WinGame[]>(challenge?.games.length ? challenge.games : [emptyGame(0)]);
	const [saving, setSaving] = useState(false);
	const locked = challenge !== null && challenge.status !== "draft" && challenge.status !== "open";
	const splitSum = split[0] + split[1] + split[2];

	function updateGame(index: number, patch: Partial<WinGame>) {
		setGames((current) => current.map((game, position) => (position === index ? { ...game, ...patch } : game)));
	}
	function moveGame(index: number, delta: number) {
		setGames((current) => {
			const target = index + delta;
			if (target < 0 || target >= current.length) return current;
			const next = [...current];
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	}

	async function save(status?: "draft" | "open") {
		if (!startAt) return;
		setSaving(true);
		await onSave({
			name,
			startAt: fromLocalInput(startAt),
			signupOpen,
			split,
			status,
			games: games.map((game) => ({
				id: game.id.trim(),
				title: game.title.trim(),
				goal: game.goal.trim(),
				type: game.type,
				...(game.type === "counter" ? { target: game.target ?? 1 } : {}),
				...(game.icon?.trim() ? { icon: game.icon.trim() } : {}),
				...(game.note?.trim() ? { note: game.note.trim() } : {}),
			})),
		});
		setSaving(false);
	}

	return (
		<Panel
			title="Einrichtung"
			description="Name, Startzeit, Spieleliste und Aufteilung des Einsatzes. Vor dem Start ist der Timer gesperrt. Die Reihenfolge der Spiele ist nur für die Anzeige."
		>
			{hasTeams ? <p className="mb-4 rounded-lg border border-[var(--amber)] px-3 py-2 text-sm text-[var(--amber)]">Teams spielen schon. Änderungen an der Spieleliste wirken sofort auf alle Overlays.</p> : null}
			<fieldset disabled={locked || saving} className="grid gap-5">
				<div className="grid gap-4 sm:grid-cols-2">
					<label className={label}>
						Name
						<input className={input} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
					</label>
					<label className={label}>
						Start (deutsche Zeit)
						<input className={input} type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
					</label>
					<label className="flex items-center gap-2 text-sm text-[var(--text)]">
						<input type="checkbox" checked={signupOpen} onChange={(event) => setSignupOpen(event.target.checked)} />
						Anmeldung offen
					</label>
					<div className={label}>
						Aufteilung Platz 1 / 2 / 3 in %{splitSum !== 100 ? <span className="text-[var(--danger)]"> (Summe {splitSum}, muss 100 sein)</span> : null}
						<div className="flex gap-2">
							{split.map((value, index) => (
								<input
									key={index}
									aria-label={`Platz ${index + 1} in Prozent`}
									className={input}
									type="number"
									min={0}
									max={100}
									value={value}
									onChange={(event) => setSplit((current) => current.map((entry, position) => (position === index ? Number(event.target.value) : entry)) as [number, number, number])}
								/>
							))}
						</div>
					</div>
				</div>

				<div className="grid gap-3">
					<h3 className="text-sm font-semibold text-[var(--text)]">Spiele ({games.length})</h3>
					{games.map((game, index) => (
						<div key={index} className="grid gap-3 rounded-xl border border-[var(--line)] p-3 md:grid-cols-[120px_1fr_1.4fr_120px_90px_auto]">
							<label className={label}>
								ID
								<input className={input} value={game.id} onChange={(event) => updateGame(index, { id: event.target.value.toLowerCase() })} />
							</label>
							<label className={label}>
								Spiel
								<input className={input} value={game.title} onChange={(event) => updateGame(index, { title: event.target.value })} placeholder="z. B. Mario Kart" />
							</label>
							<label className={label}>
								Ziel
								<input className={input} value={game.goal} onChange={(event) => updateGame(index, { goal: event.target.value })} placeholder="z. B. 150cc Cup gewinnen" />
							</label>
							<label className={label}>
								Art
								<select className={input} value={game.type} onChange={(event) => updateGame(index, { type: event.target.value as WinGame["type"] })}>
									<option value="check">Abhaken</option>
									<option value="counter">Zähler</option>
								</select>
							</label>
							<label className={label}>
								Ziel-Zahl
								<input
									className={input}
									type="number"
									min={1}
									disabled={game.type !== "counter"}
									value={game.type === "counter" ? (game.target ?? 1) : ""}
									onChange={(event) => updateGame(index, { target: Number(event.target.value) })}
								/>
							</label>
							<label className={`${label} md:col-span-5`}>
								Hinweis für Spieler (optional, nicht im Overlay)
								<input className={input} value={game.note ?? ""} onChange={(event) => updateGame(index, { note: event.target.value })} maxLength={300} placeholder="z. B. Map-Code 1234-5678-9012" />
							</label>
							<div className="flex items-end gap-1 md:col-start-6 md:row-start-1">
								<button type="button" className="button small ghost" onClick={() => moveGame(index, -1)} aria-label={`${game.title || game.id} nach oben`}>
									↑
								</button>
								<button type="button" className="button small ghost" onClick={() => moveGame(index, 1)} aria-label={`${game.title || game.id} nach unten`}>
									↓
								</button>
								<button type="button" className="button small ghost" onClick={() => setGames((current) => current.filter((_, position) => position !== index))} aria-label={`${game.title || game.id} entfernen`}>
									✕
								</button>
							</div>
						</div>
					))}
					<button type="button" className="button small ghost justify-self-start" onClick={() => setGames((current) => [...current, emptyGame(current.length)])}>
						Spiel hinzufügen
					</button>
				</div>

				<div className="flex flex-wrap gap-3">
					<button type="button" className="button primary" disabled={!startAt || splitSum !== 100} onClick={() => save()}>
						{saving ? "Speichere…" : "Speichern"}
					</button>
					{!challenge || challenge.status === "draft" ? (
						<button type="button" className="button ghost" disabled={!startAt || splitSum !== 100} onClick={() => save("open")}>
							Speichern und veröffentlichen
						</button>
					) : null}
				</div>
				{!challenge || challenge.status === "draft" ? <p className="text-xs text-[var(--muted)]">Ein Entwurf ist öffentlich noch nicht sichtbar.</p> : null}
			</fieldset>
		</Panel>
	);
}

/* ------------------------------------------------------------------ teams */

type Run = (body: Record<string, unknown>, success: string) => Promise<boolean>;

function TeamsPanel({ state, run }: { state: AdminState; run: Run }) {
	const [openId, setOpenId] = useState<string | null>(null);
	const names = useMemo(() => new Map(state.participants.map((entry) => [entry.id, entry])), [state.participants]);
	const games = state.challenge?.games ?? [];

	return (
		<Panel title={`Teams (${state.teams.length})`} description="Zeit, Status und Fortschritt korrigieren. Jede Korrektur braucht einen Grund und landet im Protokoll.">
			{state.teams.length === 0 ? <p className="text-sm text-[var(--muted)]">Noch keine Teams.</p> : null}
			<ul className="grid gap-2">
				{state.teams.map((team) => {
					const done = games.filter((game) => team.progress[game.id]?.doneAt).length;
					return (
						<li key={team.id} className="rounded-xl border border-[var(--line)]">
							<button
								type="button"
								className="grid w-full gap-1 px-4 py-3 text-left sm:grid-cols-[1.4fr_1.6fr_110px_90px_110px] sm:items-center"
								aria-expanded={openId === team.id}
								onClick={() => setOpenId((current) => (current === team.id ? null : team.id))}
							>
								<span className="font-semibold text-[var(--text)]">{team.name}</span>
								<span className="text-sm text-[var(--muted)]">{team.memberIds.map((id) => names.get(id)?.discordName ?? "?").join(" + ")}</span>
								<span className="text-sm text-[var(--muted)]">{STATUS_LABEL[team.status]}</span>
								<span className="text-sm tabular-nums text-[var(--text)]">
									{done}/{games.length}
								</span>
								<span className="font-mono text-sm tabular-nums text-[var(--text)]">{formatElapsed(team.elapsedMs)}</span>
							</button>
							{openId === team.id ? <TeamCorrectionForm team={team} games={games} run={run} /> : null}
						</li>
					);
				})}
			</ul>
		</Panel>
	);
}

function TeamCorrectionForm({ team, games, run }: { team: AdminTeam; games: WinGame[]; run: Run }) {
	const [reason, setReason] = useState("");
	const [minutes, setMinutes] = useState("");
	const [status, setStatus] = useState<WinTeamStatus>(team.status);
	const [name, setName] = useState(team.name);
	const [progress, setProgress] = useState(() =>
		Object.fromEntries(games.map((game) => [game.id, { count: team.progress[game.id]?.count ?? 0, tries: team.progress[game.id]?.tries ?? 0, done: Boolean(team.progress[game.id]?.doneAt) }])),
	);
	const [busy, setBusy] = useState(false);

	async function submit() {
		const delta = Number(minutes.replace(",", "."));
		const changedProgress = Object.fromEntries(
			Object.entries(progress).filter(([gameId, value]) => {
				const before = team.progress[gameId];
				return value.count !== (before?.count ?? 0) || value.tries !== (before?.tries ?? 0) || value.done !== Boolean(before?.doneAt);
			}),
		);
		setBusy(true);
		const ok = await run(
			{
				action: "team-correct",
				teamId: team.id,
				reason,
				...(minutes.trim() && Number.isFinite(delta) && delta !== 0 ? { adjustMs: team.adjustMs + Math.round(delta * 60_000) } : {}),
				...(status !== team.status ? { status } : {}),
				...(name.trim() !== team.name ? { name: name.trim() } : {}),
				...(Object.keys(changedProgress).length ? { progress: changedProgress } : {}),
			},
			`${team.name} korrigiert.`,
		);
		setBusy(false);
		if (ok) {
			setMinutes("");
			setReason("");
		}
	}

	return (
		<div className="grid gap-4 border-t border-[var(--line)] px-4 py-4">
			<p className="text-xs text-[var(--muted)]">
				Beitrittscode: <span className="font-mono text-[var(--text)]">{team.joinCode}</span> · Korrektur bisher: {Math.round(team.adjustMs / 60_000)} min · Overlay-Slug: {team.slug}
			</p>
			<div className="grid gap-4 sm:grid-cols-3">
				<label className={label}>
					Zeit korrigieren um (Minuten, z. B. -480)
					<input className={input} inputMode="decimal" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
				</label>
				<label className={label}>
					Status
					<select className={input} value={status} onChange={(event) => setStatus(event.target.value as WinTeamStatus)}>
						{Object.entries(STATUS_LABEL).map(([value, text]) => (
							<option key={value} value={value}>
								{text}
							</option>
						))}
					</select>
				</label>
				<label className={label}>
					Teamname
					<input className={input} value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
				</label>
			</div>
			<div className="grid gap-2">
				{games.map((game) => (
					<div key={game.id} className="grid grid-cols-[1fr_80px_80px_auto] items-center gap-2 text-sm">
						<span className="text-[var(--text)]">{game.title || game.id}</span>
						<input
							aria-label={`${game.title} Zähler`}
							className={input}
							type="number"
							min={0}
							value={progress[game.id]?.count ?? 0}
							onChange={(event) => setProgress((current) => ({ ...current, [game.id]: { ...current[game.id], count: Number(event.target.value) } }))}
						/>
						<input
							aria-label={`${game.title} Versuche`}
							className={input}
							type="number"
							min={0}
							value={progress[game.id]?.tries ?? 0}
							onChange={(event) => setProgress((current) => ({ ...current, [game.id]: { ...current[game.id], tries: Number(event.target.value) } }))}
						/>
						<label className="flex items-center gap-1 text-xs text-[var(--muted)]">
							<input
								type="checkbox"
								checked={progress[game.id]?.done ?? false}
								onChange={(event) => setProgress((current) => ({ ...current, [game.id]: { ...current[game.id], done: event.target.checked } }))}
							/>
							geschafft
						</label>
					</div>
				))}
				<p className="text-xs text-[var(--muted)]">Spalten: Zähler, Versuche, geschafft.</p>
			</div>
			<label className={label}>
				Grund (Pflicht)
				<input className={input} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="z. B. Timer über Nacht weitergelaufen" maxLength={300} />
			</label>
			<div className="flex flex-wrap gap-3">
				<button type="button" className="button primary" disabled={busy || reason.trim().length < 3} onClick={submit}>
					Korrektur speichern
				</button>
				<button
					type="button"
					className="button danger"
					disabled={busy || reason.trim().length < 3}
					onClick={() => {
						if (window.confirm(`Team "${team.name}" wirklich entfernen? Die Spieler bleiben angemeldet.`)) void run({ action: "team-remove", teamId: team.id, reason }, `${team.name} entfernt.`);
					}}
				>
					Team entfernen
				</button>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ participants */

function ParticipantsPanel({ state, run }: { state: AdminState; run: Run }) {
	const teams = useMemo(() => new Map(state.teams.map((team) => [team.id, team.name])), [state.teams]);
	return (
		<Panel title={`Spieler (${state.participants.length})`} description="Alle Anmeldungen. Entfernen nimmt den Spieler auch aus seinem Team.">
			{state.participants.length === 0 ? <p className="text-sm text-[var(--muted)]">Noch keine Anmeldungen.</p> : null}
			<ul className="grid gap-1">
				{state.participants.map((participant) => (
					<li key={participant.id} className="grid gap-1 rounded-lg px-3 py-2 text-sm odd:bg-[var(--bg)] sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto] sm:items-center">
						<span className="text-[var(--text)]">{participant.discordName}</span>
						<a className="text-[var(--muted)] underline-offset-2 hover:underline" href={`https://twitch.tv/${participant.twitchLogin}`} target="_blank" rel="noreferrer">
							twitch.tv/{participant.twitchLogin}
						</a>
						<span className="text-[var(--muted)]">{participant.teamId ? teams.get(participant.teamId) ?? "?" : "ohne Team"}</span>
						<span className="text-[var(--muted)]">Sub auf: {participant.wishChannel ?? `${state.fallbackChannel} (Standard)`}</span>
						<button
							type="button"
							className="button small ghost"
							onClick={() => {
								const reason = window.prompt(`Grund für das Entfernen von ${participant.discordName}:`);
								if (reason && reason.trim().length >= 3) void run({ action: "participant-remove", participantId: participant.id, reason }, `${participant.discordName} entfernt.`);
							}}
						>
							Entfernen
						</button>
					</li>
				))}
			</ul>
		</Panel>
	);
}

/* ------------------------------------------------------------------ end and payout */

function EndPanel({ state, run }: { state: AdminState; run: Run }) {
	const [confirm, setConfirm] = useState("");
	const challenge = state.challenge!;
	const names = useMemo(() => new Map(state.participants.map((entry) => [entry.id, entry])), [state.participants]);
	const confirmed = state.payouts.filter((payout) => payout.status === "confirmed").length;

	return (
		<Panel
			title="Ende und Einsatz"
			description="Beenden stoppt alle Timer, friert die Platzierung ein und verteilt die Subs. Jeder Spieler schenkt einem Spieler aus den Top 3 einen Sub, nie dem eigenen Team."
		>
			{challenge.status === "open" ? (
				<div className="flex flex-wrap items-end gap-3">
					<label className={label}>
						Zum Bestätigen BEENDEN eingeben
						<input className={input} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
					</label>
					<button type="button" className="button danger" disabled={confirm !== "BEENDEN"} onClick={() => run({ action: "end", confirm }, "Challenge beendet, Subs verteilt.")}>
						Challenge beenden
					</button>
				</div>
			) : null}
			{state.payouts.length ? (
				<>
					<p className="mb-3 text-sm text-[var(--muted)]">
						{confirmed} von {state.payouts.length} Subs bestätigt.
					</p>
					<ul className="grid gap-1">
						{state.payouts.map((payout) => (
							<li key={payout.id} className="grid gap-2 rounded-lg px-3 py-2 text-sm odd:bg-[var(--bg)] sm:grid-cols-[1fr_1fr_60px_1fr_130px_150px] sm:items-center">
								<span className="text-[var(--text)]">{names.get(payout.payerId)?.discordName ?? "?"}</span>
								<span className="text-[var(--text)]">an {names.get(payout.recipientId)?.discordName ?? "?"}</span>
								<span className="text-[var(--muted)]">Platz {payout.place}</span>
								<span className="text-[var(--muted)]">Kanal {payout.channel}</span>
								<select
									aria-label="Status"
									className={input}
									value={payout.status}
									onChange={(event) => run({ action: "payout-set", payoutId: payout.id, status: event.target.value }, "Status gespeichert.")}
								>
									<option value="open">offen</option>
									<option value="paid">verschenkt</option>
									<option value="confirmed">bestätigt</option>
								</select>
								<select
									aria-label="Empfänger ändern"
									className={input}
									value=""
									onChange={(event) => {
										const recipient = names.get(event.target.value);
										if (recipient && window.confirm(`Sub von ${names.get(payout.payerId)?.discordName ?? "?"} neu an ${recipient.discordName} geben?`)) {
											void run({ action: "payout-reassign", payoutId: payout.id, recipientId: recipient.id, channel: recipient.wishChannel || state.fallbackChannel }, "Sub neu zugeteilt.");
										}
									}}
								>
									<option value="">Neu zuteilen…</option>
									{state.participants
										.filter((entry) => entry.id !== payout.recipientId && entry.teamId !== names.get(payout.payerId)?.teamId)
										.map((entry) => (
											<option key={entry.id} value={entry.id}>
												{entry.discordName}
											</option>
										))}
								</select>
							</li>
						))}
					</ul>
				</>
			) : challenge.status !== "open" ? (
				<p className="text-sm text-[var(--muted)]">Keine Subs zu verteilen.</p>
			) : null}
		</Panel>
	);
}

/* ------------------------------------------------------------------ events */

function EventsPanel({ state }: { state: AdminState }) {
	const teams = useMemo(() => new Map(state.teams.map((team) => [team.id, team.name])), [state.teams]);
	return (
		<Panel title="Protokoll" description="Die letzten 200 Aktionen, neueste zuerst.">
			<ol className="grid max-h-[480px] gap-1 overflow-y-auto pr-1">
				{state.events.map((event) => (
					<li key={event.id} className="grid gap-1 rounded-lg px-3 py-1.5 text-xs odd:bg-[var(--bg)] sm:grid-cols-[150px_120px_1fr_1fr_1.5fr]">
						<span className="tabular-nums text-[var(--muted)]">{formatDateTime(event.at)}</span>
						<span className="text-[var(--text)]">{EVENT_LABEL[event.kind] ?? event.kind}</span>
						<span className="text-[var(--muted)]">{event.teamId ? teams.get(event.teamId) ?? "gelöschtes Team" : "–"}</span>
						<span className="text-[var(--muted)]">{event.actor}</span>
						<span className="text-[var(--muted)]">
							{[event.gameId, event.reason, event.liveCheck === "twitch-down" ? "Twitch nicht erreichbar" : null].filter(Boolean).join(" · ")}
						</span>
					</li>
				))}
			</ol>
		</Panel>
	);
}
