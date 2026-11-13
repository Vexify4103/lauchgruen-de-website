"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SwissTeamDrawReel, type TeamDrawReveal } from "@/components/SwissTeamDrawReel";
import { nextSwissPot, previewSwissPotRound, slotLetter, swissPotSeeds, type SwissPotAction, type PotPool } from "@/lib/swiss-pot-draw";
import { computeSwissRecords } from "@/lib/tournament-swiss-rules";
import type { SwissPotSession } from "@/lib/swiss-pot-sandbox";

const ENDPOINT = "/api/tournament/swiss-pot-test";
const buttonClass =
	"rounded-xl border border-[var(--line-strong)] px-4 py-3 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40";

export function SwissPotSimulator() {
	const [session, setSession] = useState<SwissPotSession | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [resetOpen, setResetOpen] = useState(false);
	const [rematchRecord, setRematchRecord] = useState<string | null>(null);
	const [reveal, setReveal] = useState<TeamDrawReveal | null>(null);
	const pendingSession = useRef<SwissPotSession | null>(null);
	const actionLock = useRef(false);
	const actionRequest = useRef<AbortController | null>(null);
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		const controller = new AbortController();
		void fetch(ENDPOINT, { cache: "no-store", signal: controller.signal })
			.then(async (response) => {
				const data = await response.json();
				if (!response.ok) throw new Error(data.message || "Testsession konnte nicht geladen werden.");
				setSession(data);
			})
			.catch((failure: unknown) => {
				if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Lokale Testsession nicht erreichbar.");
			});
		return () => {
			mounted.current = false;
			controller.abort();
			actionRequest.current?.abort();
		};
	}, []);
	function finishReveal() {
		if (!mounted.current) return;
		if (pendingSession.current) setSession(pendingSession.current);
		pendingSession.current = null;
		actionLock.current = false;
		setBusy(false);
	}
	async function act(action: SwissPotAction) {
		if (!session || actionLock.current) return;
		actionLock.current = true;
		setBusy(true);
		setError("");
		pendingSession.current = null;
		const pot = action.type === "draw" ? nextSwissPot(session.state) : null;
		const candidates = pot?.remaining.map((key) => session.state.teams.find((team) => team.key === key)!) ?? [];
		setReveal(pot && candidates.length ? { id: session.revision + 1, round: pot.round, record: pot.record, slot: pot.slot, candidates } : null);
		const controller = new AbortController();
		actionRequest.current = controller;
		try {
			const response = await fetch(ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action, revision: session.revision }),
				signal: controller.signal,
			});
			const data = await response.json();
			if (!mounted.current) return;
			if (!response.ok) {
				if (data.state && typeof data.revision === "number") setSession({ state: data.state, revision: data.revision });
				throw new Error(data.message || "Testaktion fehlgeschlagen.");
			}
			const updated = { state: data.state, revision: data.revision } as SwissPotSession;
			if (pot && candidates.length) {
				const drawn = updated.state.events.slice(session.state.events.length).find((event) => event.teamKey);
				if (!drawn?.teamKey || !pot.remaining.includes(drawn.teamKey)) {
					setSession(updated);
					throw new Error("Die Ziehung wurde gespeichert, aber der Animationstopf passt nicht mehr. Bitte den aktuellen Stand prüfen.");
				}
				pendingSession.current = updated;
				setReveal((current) => (current ? { ...current, winner: drawn.teamKey, assignedSlot: drawn.toSlot, message: drawn.message } : null));
				return;
			}
			setSession(updated);
			actionLock.current = false;
			setBusy(false);
		} catch (failure) {
			if (!mounted.current || controller.signal.aborted) return;
			setReveal(null);
			pendingSession.current = null;
			actionLock.current = false;
			setError(failure instanceof Error ? failure.message : "Netzwerkfehler. Bitte erneut versuchen.");
			setBusy(false);
		}
	}
	const state = session?.state;
	const round = state?.rounds.at(-1);
	const boardRound = busy && reveal && state ? (previewSwissPotRound(state) ?? round) : round;
	const waitingForResults = Boolean(round?.complete && round.pairings.some((pair) => !pair.winnerTeamKey));
	const blocked = Boolean(round && !round.complete && !round.pools.some((pool) => !pool.complete && !pool.automatic));
	const finished = Boolean(round?.round === 4 && round.complete && !waitingForResults);
	const nextPot = state ? nextSwissPot(state) : null;
	const remaining = nextPot?.remaining ?? [];
	const names = Object.fromEntries(state?.teams.map((team) => [team.key, team.name]) ?? []);
	const records = state ? computeSwissRecords(state.teams, state.rounds) : new Map();
	const seeds = state ? swissPotSeeds(state) : [];
	const nextNumber = round && !round.complete ? round.round : (round?.round ?? 0) + 1;
	const lastEvent = state?.events.at(-1);
	const drawLabel = finished
		? "Simulation abgeschlossen"
		: waitingForResults
			? "Zuerst alle Sieger eintragen"
			: blocked
				? "Rematch-Entscheidung offen"
				: nextNumber === 4
					? "Platzierungsrunde öffnen"
					: `Runde ${nextNumber}: Ein Team ziehen`;
	return (
		<main className="page-section compact-top">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<span className="rounded-full border border-[var(--line-strong)] bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent)]">
					Nur lokal · acht erfundene Teams
				</span>
				<a href="/tournament/admin/swiss-test" className="text-xs text-[var(--muted)] hover:text-[var(--accent)]">
					Zum bisherigen Swiss-Test
				</a>
			</div>
			<p className="eyebrow">Die Swiss-Lostrommel</p>
			<h1 className="max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
				Ein Team. Ein Los.
				<br />
				<span className="text-[var(--accent)]">Ein sichtbarer Platz.</span>
			</h1>
			<p className="mt-5 max-w-3xl text-sm leading-7 text-[var(--muted)]">
				Ziehe Teams einzeln in A bis H. Gegenüber liegt jeweils die andere Hälfte: A–E, B–F, C–G, D–H. In Vierer-Töpfen gilt A–C und B–D. Vorherige Gegner sind gesperrt;
				nötige Slot-Verschiebungen werden erklärt. Zweier-Töpfe werden automatisch zugeordnet.
			</p>
			<div className="my-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-xs leading-6 text-[var(--muted)]">
				Isolierte Datenbank: <code>lauchgruen_swiss_draw_sandbox</code> auf lokalem Mongo-Port 27027. Keine Riot-/Discord-Aufrufe, keine echten Teams, keine Änderung der
				Live-Auslosung. Ein Neuladen behält deinen Teststand.
			</div>
			{error ? (
				<p role="alert" className="my-5 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-4 text-sm text-[var(--danger)]">
					{error}
				</p>
			) : null}
			{!state ? (
				<p role="status" className="text-[var(--muted)]">
					{error ? "Mongo-Container prüfen und die Seite neu laden." : "Lokale Testsession wird geladen…"}
				</p>
			) : (
				<>
					<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
						<section className="content-panel min-w-0">
							<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
								<div>
									<p className="panel-kicker">{boardRound ? `Runde ${boardRound.round} von 4` : "Noch kein Los gezogen"}</p>
									<h2 className="mt-2 font-display text-2xl font-semibold">{boardRound?.round === 4 ? "Die Platzierungsduelle" : "Das Ziehbrett"}</h2>
								</div>
								<button className={buttonClass} disabled={busy} onClick={() => setResetOpen(true)}>
									Test zurücksetzen
								</button>
							</div>
							{!boardRound ? (
								<div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-10 text-center text-sm leading-7 text-[var(--muted)]">
									Alle acht Teams liegen im 0–0-Topf.
									<br />
									Der erste Klick zieht nur das Team für Slot A.
								</div>
							) : (
								<div className="grid gap-5">
									{boardRound.pools.map((pool) => (
										<PoolBoard
											key={pool.record}
											pool={pool}
											names={names}
											busy={busy}
											roundComplete={boardRound.complete}
											pairings={boardRound.pairings}
											draw={reveal?.round === boardRound.round && reveal.record === pool.record ? reveal : null}
											onRevealComplete={finishReveal}
											onResult={(pairingId, winnerTeamKey) => void act({ type: "result", pairingId, winnerTeamKey })}
											onRematch={() => setRematchRecord(pool.record)}
										/>
									))}
								</div>
							)}
						</section>
						<aside className="grid gap-4 lg:sticky lg:top-8">
							<section className="content-panel">
								<p className="panel-kicker">{nextPot ? `Lostopf ${nextPot.record.replace("-", "–")}` : "Nächster Schritt"}</p>
								<div className="my-5 flex min-h-20 flex-wrap content-start gap-2">
									{remaining.length ? (
										remaining.map((key) => (
											<span key={key} className="rounded-lg border border-[var(--line)] px-2.5 py-2 text-xs text-[var(--muted)]">
												{names[key]}
											</span>
										))
									) : (
										<p className="text-xs leading-6 text-[var(--muted)]">
											{waitingForResults
												? "Wähle links bei jedem Match den Sieger. Erst dann wird der nächste Topf geöffnet."
												: blocked
													? "Mit zwei Teams gibt es keinen Ausweichslot. Ein Rematch braucht deine ausdrückliche Freigabe."
													: finished
														? "Alle Testmatches sind entschieden."
														: "Der nächste Klick öffnet die nächste Runde; Zweier-Töpfe sind automatisch."}
										</p>
									)}
								</div>
								<button
									onClick={() => void act({ type: "draw" })}
									disabled={busy || waitingForResults || blocked || finished}
									className="w-full rounded-xl bg-[var(--accent)] px-4 py-4 text-sm font-bold text-[var(--on-accent)] disabled:cursor-not-allowed disabled:opacity-40"
								>
									{busy ? (reveal ? "Die Lostrommel läuft…" : "Wird gespeichert…") : drawLabel}
								</button>
							</section>
							{lastEvent ? (
								<div key={state.events.length} role="status" className="rounded-2xl border border-[var(--line-strong)] bg-[var(--accent)]/5 p-5">
									<p className="panel-kicker">{lastEvent.teamKey ? "Gerade gezogen" : "Hinweis"}</p>
									<p className="mt-3 text-sm leading-7 text-[var(--text)]">{lastEvent.message}</p>
								</div>
							) : null}
							<section className="content-panel">
								<p className="panel-kicker">Aktuelle Bilanzen</p>
								<ul className="mt-4 grid gap-2">
									{state.teams.map((team) => (
										<li key={team.key} className="flex justify-between gap-3 text-xs">
											<span className="text-[var(--muted)]">{team.name}</span>
											<span className="font-mono text-[var(--text)]">
												{records.get(team.key)?.wins ?? 0}–{records.get(team.key)?.losses ?? 0}
											</span>
										</li>
									))}
								</ul>
							</section>
						</aside>
					</div>
					{seeds.length ? (
						<section className="content-panel mt-6">
							<p className="panel-kicker">Nur Simulation · keine Übernahme ins Turnier</p>
							<h2 className="mt-2 font-display text-2xl font-semibold">Die acht Playoff-Seeds</h2>
							<ol className="mt-5 grid gap-2 sm:grid-cols-2">
								{seeds.map(({ seed, teamKey }) => (
									<li key={seed} className="flex gap-4 rounded-xl border border-[var(--line)] p-3 text-sm">
										<span className="font-mono text-[var(--accent)]">#{seed}</span>
										{names[teamKey]}
									</li>
								))}
							</ol>
						</section>
					) : null}
					<div className="mt-6 grid gap-4 md:grid-cols-2">
						<section className="content-panel">
							<h2 className="font-display text-lg font-semibold">Bisherige Runden</h2>
							<div className="mt-4 grid gap-4">
								{state.rounds.slice(0, -1).map((previous) => (
									<div key={previous.round}>
										<p className="mb-2 text-xs font-semibold text-[var(--accent)]">Runde {previous.round}</p>
										{previous.pairings.map((pair) => (
											<p key={pair.id} className="my-1 text-xs leading-6 text-[var(--muted)]">
												{names[pair.teamAKey]} – {names[pair.teamBKey]} · Sieger: {pair.winnerTeamKey ? names[pair.winnerTeamKey] : "offen"}
											</p>
										))}
									</div>
								))}
								{state.rounds.length < 2 ? <p className="text-xs text-[var(--muted)]">Noch keine frühere Runde.</p> : null}
							</div>
						</section>
						<section className="content-panel">
							<h2 className="font-display text-lg font-semibold">Ziehprotokoll</h2>
							<ol className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-2">
								{state.events.map((event, index) => (
									<li key={index} className="border-b border-[var(--line)] pb-3 text-xs leading-6 text-[var(--muted)]">
										<span className="mr-2 font-mono text-[var(--accent)]">
											R{event.round} · {event.record}
										</span>
										{event.message}
									</li>
								))}
							</ol>
						</section>
					</div>
				</>
			)}
			<ConfirmDialog
				open={resetOpen}
				title="Nur die lokale Simulation zurücksetzen?"
				description="Alle Lose und Testsieger dieser lokalen Fake-Team-Session werden entfernt. Das echte Turnier und der bisherige Swiss-Test bleiben unverändert."
				tone="danger"
				confirmLabel="Lokalen Test zurücksetzen"
				onConfirm={() => {
					setResetOpen(false);
					void act({ type: "reset" });
				}}
				onCancel={() => setResetOpen(false)}
			/>
			<ConfirmDialog
				open={rematchRecord !== null}
				title="Platzierungs-Rematch im Test erlauben?"
				description="Diese beiden Teams haben bereits gegeneinander gespielt. Mit zwei Teams im Topf ist kein Slot-Tausch möglich. Die Testsession wartet, bis du dieses Rematch ausdrücklich erlaubst; es wird niemals ein Gegner mit anderer Bilanz eingesetzt."
				tone="danger"
				confirmLabel="Rematch nur im Test freigeben"
				onConfirm={() => {
					if (rematchRecord) void act({ type: "approve-rematch", record: rematchRecord });
					setRematchRecord(null);
				}}
				onCancel={() => setRematchRecord(null)}
			/>
		</main>
	);
}

function PoolBoard({
	pool,
	names,
	busy,
	roundComplete,
	pairings,
	onResult,
	onRematch,
	draw,
	onRevealComplete,
}: {
	pool: PotPool;
	names: Record<string, string>;
	busy: boolean;
	roundComplete: boolean;
	pairings: NonNullable<SwissPotSession["state"]["rounds"][number]>["pairings"];
	onResult: (id: string, winner: string) => void;
	onRematch: () => void;
	draw: TeamDrawReveal | null;
	onRevealComplete: () => void;
}) {
	const half = pool.slots.length / 2;
	return (
		<section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-soft)] p-4">
			<header className="mb-4 flex flex-wrap items-center justify-between gap-2">
				<h3 className="font-mono text-xl font-semibold text-[var(--accent)]">{pool.record.replace("-", "–")}</h3>
				<span className="text-xs text-[var(--muted)]">{pool.automatic ? "Automatische Zuordnung" : `${pool.drawOrder.length}/${pool.teamKeys.length} Teams gezogen`}</span>
			</header>
			<div className="grid gap-3">
				{Array.from({ length: half }, (_, row) => {
					const first = pool.slots[row],
						second = pool.slots[row + half];
					const pair = pairings.find((entry) => entry.recordA === pool.record && entry.teamAKey === first && entry.teamBKey === second);
					return (
						<div key={row} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
							<Slot index={row} name={first ? names[first] : null} draw={draw} busy={busy} onRevealComplete={onRevealComplete} />
							<span className="text-[10px] text-[var(--muted)]">VS</span>
							<Slot index={row + half} name={second ? names[second] : null} draw={draw} busy={busy} onRevealComplete={onRevealComplete} />
							{pair ? (
								<div className="col-span-3 grid grid-cols-2 gap-2">
									<button
										className={`${buttonClass} !px-2 !py-2 !text-xs ${pair.winnerTeamKey === first ? "!border-[var(--accent)] !text-[var(--accent)]" : ""}`}
										disabled={busy || !roundComplete || pair.winnerTeamKey === first}
										onClick={() => onResult(pair.id, first!)}
									>
										{pair.winnerTeamKey === first ? "✓ " : ""}
										{names[first!]} gewinnt
									</button>
									<button
										className={`${buttonClass} !px-2 !py-2 !text-xs ${pair.winnerTeamKey === second ? "!border-[var(--accent)] !text-[var(--accent)]" : ""}`}
										disabled={busy || !roundComplete || pair.winnerTeamKey === second}
										onClick={() => onResult(pair.id, second!)}
									>
										{pair.winnerTeamKey === second ? "✓ " : ""}
										{names[second!]} gewinnt
									</button>
								</div>
							) : null}
						</div>
					);
				})}
			</div>
			{pool.drawOrder.length ? (
				<p className="mt-4 text-[11px] leading-6 text-[var(--muted)]">Ziehreihenfolge: {pool.drawOrder.map((key) => names[key]).join(" → ")}</p>
			) : null}
			{pool.blockedRematches.length && !pool.rematchApproved ? (
				<div role="alert" className="mt-4 rounded-xl border border-[var(--amber)]/30 bg-[var(--amber)]/5 p-4">
					<p className="text-xs leading-6 text-[var(--amber)]">Rematch erkannt. Kein Ausweichslot im Zweier-Topf. Es wurde noch kein Match freigegeben.</p>
					<button disabled={busy} onClick={onRematch} className={`${buttonClass} mt-3 !text-xs`}>
						Rematch-Entscheidung öffnen
					</button>
				</div>
			) : null}
			{pool.rematchApproved ? <p className="mt-4 text-xs text-[var(--amber)]">Rematch im Test ausdrücklich freigegeben.</p> : null}
		</section>
	);
}
function Slot({ index, name, draw, busy, onRevealComplete }: { index: number; name: string | null; draw: TeamDrawReveal | null; busy: boolean; onRevealComplete: () => void }) {
	const animating = busy && draw?.slot === index;
	const revealed = !busy && name && draw?.winner && (draw.assignedSlot ?? draw.slot) === index;
	return (
		<div
			data-draw-slot={slotLetter(index)}
			className={`swiss-draw-slot flex min-h-14 items-center gap-2 rounded-xl border p-3 ${animating ? "is-drawing" : revealed ? "is-revealed" : ""} ${name ? "border-[var(--line-strong)] bg-[var(--panel)]" : "border-dashed border-[var(--line)]"}`}
		>
			<span className="text-xs font-bold text-[var(--accent)]">{slotLetter(index)}</span>
			{animating ? (
				<SwissTeamDrawReel key={draw.id} draw={draw} onComplete={onRevealComplete} />
			) : (
				<span aria-live={revealed ? "polite" : undefined} className={`min-w-0 break-words text-xs font-semibold ${name ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>
					{name ?? "Noch nicht gezogen"}
				</span>
			)}
		</div>
	);
}
