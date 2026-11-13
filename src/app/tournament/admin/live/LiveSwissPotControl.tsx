"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SwissTeamDrawReel, type TeamDrawReveal } from "@/components/SwissTeamDrawReel";
import { nextSwissPot, previewSwissPotRound, slotLetter } from "@/lib/swiss-pot-draw";
import { swissStageToPotState } from "@/lib/swiss-live-pot";
import type { SwissStageState, SwissTeam } from "@/lib/tournament-swiss";
import { TournamentLink } from "../../TournamentLink";

type Reply = { state?: SwissStageState; message?: string; code?: string; drawn?: { teamKey?: string; toSlot?: number; message: string } };

export function LiveSwissPotControl({
	initialState,
	teams,
	testMode = false,
	seededOrder,
	onReset,
}: {
	initialState: SwissStageState;
	teams: SwissTeam[];
	testMode?: boolean;
	seededOrder?: string[];
	onReset: (state: SwissStageState) => void;
}) {
	const router = useRouter();
	const [state, setState] = useState(initialState);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [reveal, setReveal] = useState<TeamDrawReveal | null>(null);
	const [dialog, setDialog] = useState<{ action: "reset" | "redraw" | "rematch"; revision: string; message?: string } | null>(null);
	const locked = useRef(false);
	const pending = useRef<SwissStageState | null>(null);
	const mounted = useRef(true);
	const sequence = useRef(0);
	const pot = swissStageToPotState(state, teams, seededOrder);
	const next = nextSwissPot(pot);
	const preview = previewSwissPotRound(pot);
	const board = preview ?? pot.rounds.at(-1);
	const last = state.rounds.at(-1);
	const finished = state.rounds.length === 4 && last?.complete;
	const waiting = Boolean(last?.complete && last.pairings.some((pair) => !pair.winnerTeamKey));
	const name = (key: string | null) => teams.find((team) => team.key === key)?.name ?? "Noch nicht gezogen";

	async function refresh() {
		if (locked.current) return;
		const request = ++sequence.current;
		try {
			const response = await fetch(`/api/tournament/swiss${testMode ? "?test=1" : ""}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
			const reply = (await response.json()) as Reply;
			if (mounted.current && !locked.current && sequence.current === request && response.ok && reply.state) setState(reply.state);
		} catch {
			/* Keep the last confirmed board during a temporary connection failure. */
		}
	}
	const poll = useEffectEvent(() => void refresh());
	useEffect(() => {
		mounted.current = true;
		const timer = window.setInterval(() => poll(), 10000);
		return () => {
			mounted.current = false;
			window.clearInterval(timer);
		};
	}, []);

	function finishReveal() {
		if (!pending.current) return;
		const saved = pending.current;
		pending.current = null;
		setState(saved);
		setReveal(null);
		setBusy(false);
		locked.current = false;
		if (saved.rounds.at(-1)?.complete) router.refresh();
	}

	async function act(action: "draw" | "reset" | "redraw" | "result", extra: Record<string, unknown> = {}) {
		if (locked.current) return;
		locked.current = true;
		sequence.current++;
		setBusy(true);
		setError("");
		setNotice("");
		setDialog(null);
		let draw: TeamDrawReveal | null = null;
		if (action === "draw" && next) {
			draw = { id: sequence.current, round: next.round, record: next.record, slot: next.slot, candidates: next.remaining.map((key) => ({ key, name: name(key) })) };
			setReveal(draw);
		}
		try {
			const response = await fetch("/api/tournament/swiss", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action, test: testMode, expectedUpdatedAt: state.updatedAt, ...extra }),
				signal: AbortSignal.timeout(30000),
			});
			const reply = (await response.json()) as Reply;
			if (!mounted.current) return;
			if (reply.code === "rematch-required") {
				setDialog({ action: "rematch", revision: state.updatedAt, message: reply.message });
				return;
			}
			if (!response.ok || !reply.state) {
				if (reply.state) setState(reply.state);
				throw new Error(reply.message ?? "Die Swiss-Aktion konnte nicht gespeichert werden.");
			}
			if (draw) {
				if (!reply.drawn?.teamKey || !draw.candidates.some((team) => team.key === reply.drawn!.teamKey)) {
					setState(reply.state);
					throw new Error("Der gespeicherte Stand hat sich verändert. Bitte vor der nächsten Ziehung prüfen.");
				}
				pending.current = reply.state;
				setNotice(reply.drawn.message);
				setReveal({ ...draw, winner: reply.drawn.teamKey, assignedSlot: reply.drawn.toSlot });
				return;
			}
			setState(reply.state);
			if (action === "reset" || action === "redraw") onReset(reply.state);
			setNotice(action === "draw" ? "Bekannte Paarungen gespeichert. Die Matches bleiben für die normale Matchkontrolle vorgemerkt." : "Swiss-Stand gespeichert.");
			router.refresh();
		} catch (failure) {
			if (mounted.current) setError(failure instanceof Error ? failure.message : "Verbindung fehlgeschlagen. Stand vor dem nächsten Klick aktualisieren.");
		} finally {
			if (!pending.current && mounted.current) {
				setReveal(null);
				setBusy(false);
				locked.current = false;
				void refresh();
			}
		}
	}

	return (
		<section className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)]">
			<header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] p-4">
				<div>
					<h2 className="text-sm font-semibold">{testMode ? "Swiss-Simulation" : "Swiss-Auslosung"} · Teamziehung</h2>
					<p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">
						Ein Klick, ein Team. Obere gegen untere Topfhälfte: A–E, B–F, C–G, D–H. Vierer-Töpfe: A–C, B–D. Zweier-Töpfe werden automatisch gepaart.
					</p>
					{seededOrder?.length ? <p className="mt-1 text-xs text-[var(--amber)]">Runde 1 folgt der veröffentlichten Setzliste; danach zufällige Teamziehung.</p> : null}
				</div>
				<div className="flex flex-wrap gap-2">
					<button type="button" className="button primary small" disabled={busy || finished || waiting || teams.length !== 8} onClick={() => void act("draw")}>
						{busy
							? "Ziehung läuft…"
							: finished
								? "Alle Runden gezogen"
								: waiting
									? "Ergebnisse fehlen"
									: next
										? `R${next.round} · ${next.record} · Slot ${slotLetter(next.slot)} ziehen`
										: "Bekannte Paarungen übernehmen"}
					</button>
					<button type="button" className="button ghost small" disabled={busy} onClick={() => void refresh()}>
						Aktualisieren
					</button>
					{last ? (
						<>
							<button type="button" className="button ghost small" disabled={busy} onClick={() => setDialog({ action: "redraw", revision: state.updatedAt })}>
								Aktuelle Runde neu
							</button>
							<button type="button" className="button ghost small" disabled={busy} onClick={() => setDialog({ action: "reset", revision: state.updatedAt })}>
								Zurücksetzen
							</button>
						</>
					) : null}
				</div>
			</header>
			{board ? (
				<div className="p-4">
					<h3 className="mb-3 text-sm font-semibold">
						Runde {board.round}
						{preview && preview.round > (last?.round ?? 0) ? " · Vorschau" : ""}
					</h3>
					<div className="grid gap-4 lg:grid-cols-2">
						{board.pools.length ? (
							board.pools.map((pool) => (
								<section key={pool.record} className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-3">
									<div className="mb-3 flex justify-between gap-2">
										<strong className="font-mono text-[var(--accent)]">{pool.record}</strong>
										<span className="text-xs text-[var(--muted)]">
											{pool.automatic ? "Automatische Paarung" : `${pool.drawOrder.length}/${pool.teamKeys.length} gezogen`}
										</span>
									</div>
									<div className="grid gap-2">
										{Array.from({ length: pool.slots.length / 2 }, (_, row) => (
											<div key={row} className="grid grid-cols-2 gap-2">
												{[row, row + pool.slots.length / 2].map((slot) => {
													const active = reveal?.round === board.round && reveal.record === pool.record && reveal.slot === slot;
													return (
														<div
															key={slot}
															data-draw-slot={slotLetter(slot)}
															className={`swiss-draw-slot min-w-0 rounded-lg border border-[var(--line)] p-2${active ? " is-drawing" : ""}`}
														>
															<span className="mb-1 block font-mono text-xs text-[var(--muted)]">{slotLetter(slot)}</span>
															{active ? (
																<SwissTeamDrawReel draw={reveal!} onComplete={finishReveal} />
															) : (
																<strong className="block break-words text-sm">{name(pool.slots[slot])}</strong>
															)}
														</div>
													);
												})}
											</div>
										))}
									</div>
									{pool.blockedRematches.length && !pool.complete ? (
										<p className="mt-3 text-xs text-[var(--amber)]">Bekannte Gegner: ausdrückliche Rematch-Freigabe nötig.</p>
									) : null}
									{reveal?.record === pool.record ? (
										<p className="mt-3 text-xs text-[var(--muted)]">Im Lostopf: {reveal.candidates.map((team) => team.name).join(" · ")}</p>
									) : null}
								</section>
							))
						) : (
							<p className="text-xs text-[var(--muted)]">Bestehende Match-Ziehung. Die nächste Runde verwendet die neuen Team-Slots.</p>
						)}
					</div>
				</div>
			) : null}
			{error || (!reveal && notice) ? (
				<p role="status" className={`px-4 pb-4 text-sm ${error ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>
					{error || notice}
				</p>
			) : null}
			{state.rounds.length ? (
				<div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
					{state.rounds.map((round) => (
						<section key={round.round} className="rounded-lg border border-[var(--line)] p-3">
							<h3 className="mb-2 text-xs font-semibold text-[var(--muted)]">
								Runde {round.round} · {round.complete ? "gezogen" : "Ziehung läuft"}
							</h3>
							{round.pairings.map((pair) => (
								<div key={pair.id} className="border-t border-[var(--line)] py-2 text-sm">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span>
											{pair.teamAName} <span className="text-[var(--muted)]">vs</span> {pair.teamBName}
										</span>
										{!testMode ? (
											<TournamentLink className="text-xs text-[var(--accent)]" href={`/tournament/admin/matches/${pair.id}`}>
												Matchkontrolle
											</TournamentLink>
										) : null}
									</div>
									{pair.winnerTeamKey ? <p className="mt-1 text-xs text-[var(--accent)]">Sieger: {name(pair.winnerTeamKey)}</p> : null}
									{testMode && round.complete && round.round === last?.round ? (
										<div className="mt-2 flex flex-wrap gap-2">
											{[pair.teamAKey, pair.teamBKey!].map((key) => (
												<button
													key={key}
													type="button"
													className="button ghost small"
													disabled={busy}
													onClick={() => void act("result", { pairingId: pair.id, winnerTeamKey: key })}
												>
													{name(key)} gewinnt
												</button>
											))}
										</div>
									) : null}
								</div>
							))}
						</section>
					))}
				</div>
			) : null}
			{state.drawEvents?.length ? (
				<details className="mx-4 mb-4 rounded-lg border border-[var(--line)] p-3">
					<summary className="cursor-pointer text-xs font-semibold">Ziehungsprotokoll</summary>
					<ol className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs text-[var(--muted)]">
						{state.drawEvents.map((event, index) => (
							<li key={index}>
								R{event.round} · {event.record} · {event.message}
							</li>
						))}
					</ol>
				</details>
			) : null}
			<ConfirmDialog
				open={Boolean(dialog)}
				title={
					dialog?.action === "rematch"
						? "Platzierungs-Rematch freigeben?"
						: dialog?.action === "redraw"
							? "Aktuelle Runde neu auslosen?"
							: "Swiss vollständig zurücksetzen?"
				}
				description={
					dialog?.message ??
					(dialog?.action === "redraw"
						? "Nur eine noch nicht gestartete Runde ohne Ergebnisse oder Draft-Vorbereitung darf entfernt werden."
						: "Alle Swiss-Paarungen und zugehörigen Matches werden entfernt. Diese Aktion ist nicht rückgängig zu machen.")
				}
				tone="danger"
				confirmLabel={dialog?.action === "rematch" ? "Rematch ausdrücklich freigeben" : "Bestätigen"}
				onCancel={() => setDialog(null)}
				onConfirm={() => {
					if (dialog)
						void act(dialog.action === "rematch" ? "draw" : dialog.action, {
							expectedUpdatedAt: dialog.revision,
							...(dialog.action === "rematch" ? { allowRematch: true } : { confirmation: dialog.action === "reset" ? "SWISS ZURÜCKSETZEN" : "RUNDE NEU AUSLOSEN" }),
						});
				}}
			/>
		</section>
	);
}
