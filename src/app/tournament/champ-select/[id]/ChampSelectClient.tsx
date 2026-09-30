"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useId, useRef, useState, useTransition } from "react";
import type { ChampionPool, ChampionPoolEntry } from "@/lib/champion-pools";
import { fearlessLockLabel, type FearlessLock, type FearlessLocks } from "@/lib/fearless";
import type { ControlMatch } from "@/lib/match-control";
import {
	DRAFT_TOTAL_MS,
	DRAFT_TURN_SECONDS,
	createDraftSequence,
	draftComplete,
	draftReady,
	nextDraftTurn,
	type DraftAction,
	type DraftSide,
	type TournamentDraftState,
} from "@/lib/tournament-draft-shared";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { playDraftCompleteSound, playDraftStartSound, unlockTournamentAudio } from "@/lib/tournament-sounds";

type EditableSide = "teamA" | "teamB" | null;

export function ChampSelectClient({
	match,
	draft,
	mode,
	blueChampions,
	redChampions,
	fearlessLocks,
	closedReason,
	lockOpponentChampions,
	editableSide,
	blueTeamLabel,
	redTeamLabel,
	extraBanSide,
	isOwner,
}: {
	match: ControlMatch;
	draft: TournamentDraftState;
	mode: "pools" | "fearless";
	/** Pick candidates of Blue (teamA) and Red (teamB). */
	blueChampions: ChampionPool["champions"];
	redChampions: ChampionPool["champions"];
	fearlessLocks: FearlessLocks;
	closedReason: string | null;
	lockOpponentChampions: boolean;
	editableSide: EditableSide;
	blueTeamLabel: string;
	redTeamLabel: string;
	extraBanSide: DraftSide | null;
	isOwner: boolean;
}) {
	const fearless = mode === "fearless";
	const searchId = useId();
	const [state, setState] = useState(draft);
	const [selectedChampion, setSelectedChampion] = useState("");
	const [search, setSearch] = useState("");
	const [hideLocked, setHideLocked] = useState(false);
	const deferredSearch = useDeferredValue(search);
	const [message, setMessage] = useState("");
	const [now, setNow] = useState(() => Date.now());
	const [isPending, startTransition] = useTransition();
	const timeoutHandledRef = useRef("");
	const lastBroadcastSelectionRef = useRef("");
	const previousReadyRef = useRef(draftReady(draft));
	const previousCompleteRef = useRef(draftComplete(draft, createDraftSequence(extraBanSide)));

	const draftSequence = createDraftSequence(extraBanSide);
	const currentTurn = nextDraftTurn(state, draftSequence);
	const complete = draftComplete(state, draftSequence);
	const ready = draftReady(state);
	const ownReady = editableSide ? Boolean(state.readyBy[editableSide]) : false;
	const timer = getTimerState(state, now, draftSequence);
	const allChampions = [...new Map([...blueChampions, ...redChampions].map((champion) => [champion.name, champion])).values()];
	const usedChampions = new Set(state.actions.map((action) => action.champion));
	const turnLocks = currentTurn && currentTurn.kind === "pick" ? fearlessLocks[currentTurn.side] : {};
	const candidatePool = currentTurn ? championsForTurn(currentTurn, blueChampions, redChampions, fearless) : [];
	const searchTerm = normalizeChampionSearch(deferredSearch);
	const visiblePool = candidatePool.filter(
		(champion) =>
			(!searchTerm || normalizeChampionSearch(champion.name).includes(searchTerm)) && !(hideLocked && (turnLocks[champion.name] || usedChampions.has(champion.name)))
	);
	const availableCount = candidatePool.filter((champion) => !turnLocks[champion.name] && !usedChampions.has(champion.name)).length;
	const selectable = (champion: string) => Boolean(champion) && !usedChampions.has(champion) && !turnLocks[champion];
	const canLock = Boolean(currentTurn && editableSide === currentTurn.side && ready && !timer.expired && selectable(selectedChampion));
	const adminCanLock = Boolean(isOwner && currentTurn && ready && !timer.expired && selectable(selectedChampion));

	useEffect(() => {
		const interval = window.setInterval(() => setNow(Date.now()), 250);
		return () => window.clearInterval(interval);
	}, []);

	useEffect(() => {
		if (!previousReadyRef.current && ready) playDraftStartSound();
		previousReadyRef.current = ready;
	}, [ready]);

	useEffect(() => {
		if (!previousCompleteRef.current && complete) playDraftCompleteSound();
		previousCompleteRef.current = complete;
	}, [complete]);

	useEffect(() => {
		let cancelled = false;
		const interval = window.setInterval(async () => {
			const next = await fetchDraft(match.id);
			if (!cancelled && next) setState(next);
		}, 2500);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [match.id]);

	useEffect(() => {
		if (!currentTurn || !state.currentTurnStartedAt || !timer.expired) return;
		const key = `${state.actions.length}-${state.currentTurnStartedAt}`;
		if (timeoutHandledRef.current === key) return;
		timeoutHandledRef.current = key;
		startTransition(async () => {
			if (selectedChampion && (canLock || adminCanLock)) {
				const response = await fetch("/api/tournament/draft", {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						matchId: match.id,
						champion: selectedChampion,
					}),
				});
				const json = (await response.json().catch(() => null)) as { draft?: TournamentDraftState; message?: string } | null;
				if (json?.draft) {
					setState(json.draft);
					setMessage(`${selectedChampion} wurde automatisch ${currentTurn.kind === "ban" ? "gebannt" : "gelockt"}.`);
					setSelectedChampion("");
					setNow(Date.now());
					return;
				}
				if (!response.ok) {
					setMessage(json?.message ?? "Auto-Lock konnte nicht verarbeitet werden.");
					return;
				}
			}

			const response = await fetch("/api/tournament/draft", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					matchId: match.id,
					action: "timeout",
				}),
			});
			const json = (await response.json().catch(() => null)) as { draft?: TournamentDraftState; message?: string } | null;
			if (json?.draft) {
				const autoLocked = json.draft.actions.length > state.actions.length && !json.draft.resetReason;
				setState(json.draft);
				setSelectedChampion("");
				if (autoLocked) {
					setMessage("Ausgewählter Champion wurde automatisch gelockt.");
					return;
				}
				setMessage(json.draft.resetReason ?? "Draft wurde wegen Timeout zurückgesetzt.");
			} else if (!response.ok) {
				setMessage(json?.message ?? "Timeout konnte nicht verarbeitet werden.");
			}
		});
	}, [adminCanLock, canLock, currentTurn, match.id, selectedChampion, state.actions.length, state.currentTurnStartedAt, timer.expired]);

	async function markReady() {
		if (!editableSide || state.readyBy[editableSide]) return;
		setMessage("");
		await unlockTournamentAudio();
		startTransition(async () => {
			const response = await fetch("/api/tournament/draft", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					matchId: match.id,
					action: "ready",
				}),
			});
			const json = (await response.json().catch(() => null)) as { draft?: TournamentDraftState; message?: string } | null;
			if (!response.ok || !json?.draft) {
				setMessage(json?.message ?? "Ready konnte nicht gespeichert werden.");
				return;
			}
			setState(json.draft);
			setMessage(draftReady(json.draft) ? "Beide Captains sind ready. Timer läuft." : "Ready gespeichert. Warte auf den anderen Captain.");
		});
	}

	async function lockChampion() {
		if (!canLock && !adminCanLock) return;
		setMessage("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/draft", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					matchId: match.id,
					champion: selectedChampion,
				}),
			});
			const json = (await response.json().catch(() => null)) as { draft?: TournamentDraftState; message?: string } | null;
			if (!response.ok || !json?.draft) {
				setMessage(json?.message ?? "Draft konnte nicht gespeichert werden.");
				return;
			}
			setState(json.draft);
			setSelectedChampion("");
			setNow(Date.now());
			setMessage("Champion gelockt.");
		});
	}

	function selectChampion(champion: string) {
		if (!selectable(champion)) return;
		setSelectedChampion(champion);
		if (!currentTurn || !ready || timer.expired) return;
		if (!isOwner && editableSide !== currentTurn.side) return;
		const key = `${state.actions.length}:${currentTurn.side}:${currentTurn.kind}:${champion}`;
		if (lastBroadcastSelectionRef.current === key) return;
		lastBroadcastSelectionRef.current = key;
		void fetch("/api/tournament/draft", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				matchId: match.id,
				action: "select",
				champion,
			}),
		})
			.then(async (response) => {
				const json = (await response.json().catch(() => null)) as { draft?: TournamentDraftState } | null;
				if (response.ok && json?.draft) setState(json.draft);
			})
			.catch(() => undefined);
	}

	async function adminAction(action: "forceReady" | "reset" | "undo") {
		if (!isOwner || isPending) return;
		setMessage("");
		await unlockTournamentAudio();
		startTransition(async () => {
			const response = await fetch("/api/tournament/draft", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					matchId: match.id,
					action,
				}),
			});
			const json = (await response.json().catch(() => null)) as { draft?: TournamentDraftState; message?: string } | null;
			if (!response.ok || !json?.draft) {
				setMessage(json?.message ?? "Admin-Aktion fehlgeschlagen.");
				return;
			}
			setState(json.draft);
			setSelectedChampion("");
			setNow(Date.now());
			setMessage(action === "forceReady" ? "Ready Check wurde erzwungen." : action === "undo" ? "Letzter Lock wurde zurückgenommen." : "Draft wurde zurückgesetzt.");
		});
	}

	return (
		<div className="grid gap-3">
			<div className="hidden">
				<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Tournament Draft · {match.id}</div>
				<h1 className="mt-1 text-2xl font-black tracking-tight text-emerald-50 sm:text-3xl">
					{blueTeamLabel} vs {redTeamLabel}
				</h1>
				<p className="mt-1 text-xs leading-5 text-emerald-100/54">
					Beide Captains klicken zuerst ready. Danach hat jeder Turn {DRAFT_TURN_SECONDS}
					Sekunden plus kurze 0-Sekunden-Pufferzeit. Bans zielen auf den gegnerischen Pool, Picks kommen aus dem eigenen Pool.
				</p>
			</div>

			<div className="grid items-start gap-4 xl:grid-cols-[24vw_minmax(30rem,1fr)_24vw] 2xl:grid-cols-[25vw_minmax(42rem,1fr)_25vw]">
				<DraftTrack
					side="teamA"
					title={blueTeamLabel}
					poolLabel={
						fearless
							? fearlessSummary(fearlessLocks.teamA)
							: poolSummary(match.blueSide === "teamA" ? (match.poolAssignment?.teamAPool ?? null) : (match.poolAssignment?.teamBPool ?? null))
					}
					locks={fearless ? fearlessLocks.teamA : null}
					actions={state.actions}
					allChampions={allChampions}
					accent="blue"
					banSlots={3 + (extraBanSide === "teamA" ? 1 : 0)}
					currentTurn={currentTurn}
					selectedChampion={selectedChampion}
					ready={Boolean(state.readyBy.teamA)}
				/>
				<CurrentTurnPanel
					closedReason={closedReason}
					turn={currentTurn}
					complete={complete}
					ready={ready}
					readyBy={state.readyBy}
					timer={timer}
					editableSide={editableSide}
					selectedChampion={selectedChampion}
					onReady={markReady}
					onLock={lockChampion}
					disabled={isPending || !canLock}
					adminCanLock={adminCanLock}
					pending={isPending}
				/>
				<DraftTrack
					side="teamB"
					title={redTeamLabel}
					poolLabel={
						fearless
							? fearlessSummary(fearlessLocks.teamB)
							: poolSummary(match.blueSide === "teamA" ? (match.poolAssignment?.teamBPool ?? null) : (match.poolAssignment?.teamAPool ?? null))
					}
					locks={fearless ? fearlessLocks.teamB : null}
					actions={state.actions}
					allChampions={allChampions}
					accent="red"
					banSlots={3 + (extraBanSide === "teamB" ? 1 : 0)}
					currentTurn={currentTurn}
					selectedChampion={selectedChampion}
					ready={Boolean(state.readyBy.teamB)}
				/>

				{currentTurn && !closedReason ? (
					<section className="rounded-[1.25rem] border border-white/8 bg-black/16 p-3 shadow-xl shadow-black/20 sm:p-4 xl:col-start-2">
						<div className="flex flex-wrap items-end justify-between gap-3">
							<div>
								<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">{currentTurn.kind === "ban" ? "Ban-Auswahl" : "Pick-Auswahl"}</div>
								<h2 className="mt-1 text-xl font-black text-emerald-50">
									{turnLabel(currentTurn)} · {turnPoolLabel(currentTurn.kind, fearless)}
								</h2>
							</div>
							<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-black tabular-nums text-lime-100">{availableCount} verfügbar</div>
						</div>
						{fearless ? (
							<div className="mt-3 flex flex-wrap items-center gap-3">
								<label htmlFor={searchId} className="sr-only">
									Champion suchen
								</label>
								<input
									id={searchId}
									type="search"
									name="champion-search"
									autoComplete="off"
									spellCheck={false}
									placeholder="Champion suchen…"
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									className="min-w-0 flex-1 rounded-xl border border-white/12 bg-black/28 px-3 py-2 text-sm font-semibold text-emerald-50 outline-none placeholder:text-emerald-100/32 focus-visible:border-lime-200/50"
								/>
								{currentTurn.kind === "pick" ? (
									<label className="inline-flex cursor-pointer items-center gap-2 text-xs font-black text-emerald-100/70">
										<input type="checkbox" checked={hideLocked} onChange={(event) => setHideLocked(event.target.checked)} className="size-4 accent-lime-300" />
										Gesperrte ausblenden
									</label>
								) : null}
							</div>
						) : null}

						<div className="draft-scrollbar-hidden mt-3 max-h-[50vh] overflow-y-auto pr-1">
							{visiblePool.length === 0 ? (
								<p className="rounded-xl border border-white/8 bg-black/20 px-4 py-6 text-center text-sm font-bold text-emerald-100/56">
									Kein Champion passt zur Suche.
								</p>
							) : null}
							<div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 2xl:grid-cols-10">
								{visiblePool.map((champion) => {
									const used = usedChampions.has(champion.name);
									const lock = turnLocks[champion.name];
									const active = selectedChampion === champion.name;
									return (
										<button
											key={champion.id}
											type="button"
											disabled={used || Boolean(lock) || !ready || timer.expired || (!isOwner && editableSide !== currentTurn.side) || isPending}
											onClick={() => selectChampion(champion.name)}
											title={lock ? fearlessLockLabel(lock) : used ? "Bereits in diesem Draft gewählt" : undefined}
											aria-label={
												lock ? `${champion.name}, gesperrt: ${fearlessLockLabel(lock)}` : used ? `${champion.name}, bereits gewählt` : champion.name
											}
											aria-pressed={active}
											className={`group relative overflow-hidden rounded-xl border p-1.5 text-left transition-[transform,border-color,background-color] [contain-intrinsic-size:auto_7rem] [content-visibility:auto] ${
												active
													? "border-lime-200/60 bg-lime-200/16 shadow-lg shadow-lime-300/10"
													: used || lock
														? "border-white/6 bg-black/30 opacity-35 grayscale"
														: "border-white/10 bg-black/18 hover:-translate-y-0.5 hover:border-lime-200/30"
											} disabled:cursor-not-allowed`}
										>
											<ChampionIcon champion={champion} />
											{lock ? (
												<span className="absolute left-1 top-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-amber-100">
													{lock.source === "own" ? "Gespielt" : "Gegner"}
												</span>
											) : null}
											<div className="mt-1.5 truncate text-center text-xs font-black text-emerald-50">{champion.name}</div>
										</button>
									);
								})}
							</div>
						</div>

						<div className="sticky bottom-3 z-20 mx-auto mt-4 max-w-xl rounded-2xl border border-lime-200/18 bg-[#111]/94 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
							<div className="grid gap-3">
								<div className="min-w-0 text-center">
									<div className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-200/58">{!ready ? "Ready Check" : "Ausgewählt"}</div>
									<div className="mt-1 truncate text-lg font-black text-emerald-50">
										{!ready ? (ownReady ? "Du bist ready" : "Warte auf beide Captains") : selectedChampion || "Noch kein Champion gewählt"}
									</div>
									<div className="hidden text-[10px] font-black uppercase tracking-[0.2em] text-lime-200/58">Ausgewählt</div>
									<div className="hidden mt-1 truncate text-lg font-black text-emerald-50">{selectedChampion || "Noch kein Champion gewählt"}</div>
								</div>
								<button
									type="button"
									disabled={!ready ? !editableSide || ownReady || isPending : isPending || (!canLock && !adminCanLock)}
									onClick={!ready ? markReady : lockChampion}
									className={`mx-auto w-full max-w-sm rounded-xl px-6 py-3 text-xs font-black uppercase tracking-[0.18em] shadow-xl transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 ${
										!ready ? "bg-lime-200 text-emerald-950 shadow-lime-300/20" : draftActionButtonClass(currentTurn.kind)
									}`}
								>
									{!ready
										? !editableSide
											? "Nur Captains"
											: "Ready"
										: draftActionLabel({
												champion: selectedChampion,
												kind: currentTurn.kind,
												admin: adminCanLock && !canLock,
											})}
								</button>
							</div>
						</div>
					</section>
				) : null}

				<div className="xl:col-start-2">
					{complete ? (
						<CompletedDraftSummary actions={state.actions} champions={allChampions} blueTeamLabel={blueTeamLabel} redTeamLabel={redTeamLabel} />
					) : (
						<DraftOrder actions={state.actions} sequence={draftSequence} extraBanSide={extraBanSide} />
					)}
				</div>
			</div>

			{isOwner ? (
				<AdminDraftControls
					disabled={isPending}
					selectedChampion={selectedChampion}
					canLock={adminCanLock}
					onForceReady={() => adminAction("forceReady")}
					onUndo={() => adminAction("undo")}
					onReset={() => adminAction("reset")}
					onLock={lockChampion}
				/>
			) : null}

			{message ? (
				<div role="status" className="rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">
					{message}
				</div>
			) : null}

			<style>{`
        .draft-scrollbar-hidden {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .draft-scrollbar-hidden::-webkit-scrollbar {
          display: none;
        }
        @keyframes draft-breathe {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(190, 242, 100, 0.0); }
          50% { transform: scale(1.015); box-shadow: 0 0 0 4px rgba(190, 242, 100, 0.16); }
        }
      `}</style>
		</div>
	);
}

function championsForTurn(turn: { side: DraftSide; kind: "ban" | "pick" }, blueChampions: ChampionPool["champions"], redChampions: ChampionPool["champions"], fearless: boolean) {
	const own = turn.side === "teamA" ? blueChampions : redChampions;
	const enemy = turn.side === "teamA" ? redChampions : blueChampions;
	// Fearless drafts share one full roster; pools ban from the enemy pool.
	return turn.kind === "pick" || fearless ? own : enemy;
}

function turnPoolLabel(kind: "ban" | "pick", fearless: boolean) {
	if (fearless) return kind === "ban" ? "alle Champions" : "ohne Fearless-Sperren";
	return kind === "ban" ? "gegnerischer Pool" : "eigener Pool";
}

function normalizeChampionSearch(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]/g, "");
}

function poolSummary(pool: string | null) {
	return pool ? `Pool ${compactPoolLabel(pool)}` : "Noch kein Pool gezogen";
}

function fearlessSummary(locks: Record<string, FearlessLock>) {
	const count = Object.keys(locks).length;
	return count === 0 ? "Fearless · noch keine Sperren" : `Fearless · ${count} ${count === 1 ? "Champion" : "Champions"} gesperrt`;
}

function draftActionLabel({ champion, kind, admin }: { champion: string; kind: "ban" | "pick"; admin?: boolean }) {
	if (!champion) return "Champion wählen";
	const action = kind === "ban" ? "bannen" : "locken";
	return admin ? `${champion} als Admin ${action}` : `${champion} ${action}`;
}

function draftActionButtonClass(kind: "ban" | "pick") {
	return kind === "ban" ? "bg-red-300 text-red-950 shadow-red-400/20" : "bg-sky-300 text-sky-950 shadow-sky-400/20";
}

type TimerState = {
	label: string;
	remainingMs: number;
	expired: boolean;
	progress: number;
};

function getTimerState(state: TournamentDraftState, now: number, sequence: Array<{ side: DraftSide; kind: "ban" | "pick" }>): TimerState {
	const turnMs = DRAFT_TURN_SECONDS * 1000;
	if (!state.currentTurnStartedAt || !draftReady(state) || draftComplete(state, sequence)) {
		return {
			label: String(DRAFT_TURN_SECONDS),
			remainingMs: turnMs,
			expired: false,
			progress: 100,
		};
	}

	const elapsed = Math.max(0, now - new Date(state.currentTurnStartedAt).getTime());
	const remainingMs = Math.max(0, turnMs - elapsed);
	const totalRemainingMs = Math.max(0, DRAFT_TOTAL_MS - elapsed);
	const inGrace = remainingMs <= 0;
	return {
		label: inGrace ? "0" : String(Math.ceil(remainingMs / 1000)),
		remainingMs,
		expired: totalRemainingMs <= 0,
		progress: inGrace ? Math.round((totalRemainingMs / (DRAFT_TOTAL_MS - turnMs)) * 100) : Math.round((remainingMs / turnMs) * 100),
	};
}

async function fetchDraft(matchId: string): Promise<TournamentDraftState | null> {
	const response = await fetch(`/api/tournament/draft?matchId=${encodeURIComponent(matchId)}`);
	const json = (await response.json().catch(() => null)) as { draft?: TournamentDraftState } | null;
	return response.ok && json?.draft ? json.draft : null;
}

function AdminDraftControls({
	disabled,
	selectedChampion,
	canLock,
	onForceReady,
	onUndo,
	onReset,
	onLock,
}: {
	disabled: boolean;
	selectedChampion: string;
	canLock: boolean;
	onForceReady: () => void;
	onUndo: () => void;
	onReset: () => void;
	onLock: () => void;
}) {
	return (
		<section className="rounded-[2rem] border border-amber-200/18 bg-amber-200/[0.055] p-5 shadow-xl shadow-black/20">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.24em] text-amber-100/72">Admin Override</div>
					<p className="mt-2 text-sm leading-6 text-amber-50/72">Panic buttons für Misclicks, Disconnects oder kaputte Ready Checks.</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-black/22 px-4 py-2 text-xs font-black text-amber-50/70">{selectedChampion || "Kein Champion gewählt"}</div>
			</div>
			<div className="mt-4 grid gap-2 sm:grid-cols-4">
				<button
					type="button"
					disabled={disabled}
					onClick={onForceReady}
					className="rounded-2xl border border-lime-200/20 bg-lime-200/12 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-lime-50 disabled:opacity-45"
				>
					Force Ready
				</button>
				<button
					type="button"
					disabled={disabled || !canLock}
					onClick={onLock}
					className="rounded-2xl border border-sky-200/20 bg-sky-300/12 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-sky-50 disabled:opacity-45"
				>
					Admin Lock
				</button>
				<button
					type="button"
					disabled={disabled}
					onClick={onUndo}
					className="rounded-2xl border border-amber-200/24 bg-amber-200/12 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-amber-50 disabled:opacity-45"
				>
					Undo Last
				</button>
				<button
					type="button"
					disabled={disabled}
					onClick={onReset}
					className="rounded-2xl border border-red-300/24 bg-red-500/12 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-red-100 disabled:opacity-45"
				>
					Reset Draft
				</button>
			</div>
		</section>
	);
}

function CurrentTurnPanel({
	closedReason,
	turn,
	complete,
	ready,
	readyBy,
	timer,
	editableSide,
	selectedChampion,
	disabled,
	adminCanLock,
	pending,
	onReady,
	onLock,
}: {
	closedReason: string | null;
	turn: { side: DraftSide; kind: "ban" | "pick" } | null;
	complete: boolean;
	ready: boolean;
	readyBy: TournamentDraftState["readyBy"];
	timer: TimerState;
	editableSide: EditableSide;
	selectedChampion: string;
	disabled: boolean;
	adminCanLock: boolean;
	pending: boolean;
	onReady: () => void;
	onLock: () => void;
}) {
	const editable = turn && editableSide === turn.side;
	const ownReady = editableSide ? Boolean(readyBy[editableSide]) : false;
	return (
		<aside className="rounded-none border-0 bg-transparent p-0 text-center shadow-none">
			<div className="hidden text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">Aktueller Turn</div>
			{closedReason ? (
				<p className="mx-auto max-w-sm rounded-2xl border border-amber-200/18 bg-amber-200/8 px-4 py-3 text-sm font-bold leading-6 text-amber-100/76">{closedReason}</p>
			) : complete ? (
				<p className="mx-auto w-fit border-t-4 border-lime-300 px-8 pt-2 text-xs font-black uppercase tracking-[0.22em] text-lime-100">Draft abgeschlossen</p>
			) : !ready ? (
				<>
					<p className="mx-auto w-fit border-t-4 border-lime-300/75 px-8 pt-2 text-xs font-black uppercase tracking-[0.22em] text-emerald-50">Waiting for drafter</p>
					<button type="button" disabled={!editableSide || ownReady || pending} onClick={onReady} className="hidden">
						{!editableSide ? "Nur Captains können ready klicken" : ownReady ? "Du bist ready" : "Ready"}
					</button>
				</>
			) : turn ? (
				<>
					<div className="mx-auto w-fit border-t-4 border-lime-300/75 px-8 pt-2">
						<div className="text-sm font-black text-emerald-50">{turnLabel(turn)}</div>
						<div className={`mt-1 text-3xl font-black tabular-nums ${timer.remainingMs <= 0 ? "text-amber-100" : "text-emerald-50"}`}>{timer.label}</div>
						<div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
							<div
								className={`h-full rounded-full transition-[width] ${timer.remainingMs <= 0 ? "bg-amber-200" : "bg-lime-200"}`}
								style={{ width: `${timer.progress}%` }}
							/>
						</div>
						{timer.remainingMs > 0 && timer.remainingMs <= 5000 ? (
							<div className="mt-3 animate-pulse rounded-xl border border-red-300/30 bg-red-500/16 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-100">
								Letzte 5 Sekunden
							</div>
						) : null}
						<p className="hidden mt-2 text-xs leading-5 text-emerald-100/54">
							{timer.remainingMs <= 0
								? "Timer ist auf 0. Gleich wird ohne Champion gelockt und der Draft neu gestartet."
								: turn.kind === "ban"
									? "Wähle einen Champion aus dem gegnerischen Pool."
									: "Wähle einen Champion aus deinem eigenen Pool."}
						</p>
					</div>
					<button
						type="button"
						disabled={disabled}
						onClick={onLock}
						className={`hidden mt-3 w-full rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-[0.18em] shadow-xl disabled:cursor-not-allowed disabled:opacity-45 ${draftActionButtonClass(
							turn.kind
						)}`}
					>
						{editable
							? draftActionLabel({
									champion: selectedChampion,
									kind: turn.kind,
								})
							: adminCanLock
								? draftActionLabel({
										champion: selectedChampion,
										kind: turn.kind,
										admin: true,
									})
								: "Nicht dein Turn"}
					</button>
				</>
			) : null}
		</aside>
	);
}

function CompletedDraftSummary({
	actions,
	champions,
	blueTeamLabel,
	redTeamLabel,
}: {
	actions: DraftAction[];
	champions: ChampionPool["champions"];
	blueTeamLabel: string;
	redTeamLabel: string;
}) {
	const byName = new Map(champions.map((champion) => [champion.name, champion]));
	return (
		<section className="rounded-[1.5rem] border border-lime-200/14 bg-lime-200/[0.055] p-4 shadow-xl shadow-black/20">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/64">Draft abgeschlossen</div>
					<h2 className="mt-1 text-2xl font-black text-emerald-50">Finaler Draft</h2>
				</div>
				<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-black text-lime-100">{actions.length} Locks</div>
			</div>
			<div className="mt-4 grid gap-3 md:grid-cols-2">
				<FinalTeamDraft label={blueTeamLabel} side="teamA" actions={actions} byName={byName} tone="blue" />
				<FinalTeamDraft label={redTeamLabel} side="teamB" actions={actions} byName={byName} tone="red" />
			</div>
		</section>
	);
}

function FinalTeamDraft({
	label,
	side,
	actions,
	byName,
	tone,
}: {
	label: string;
	side: DraftSide;
	actions: DraftAction[];
	byName: Map<string, ChampionPoolEntry>;
	tone: "blue" | "red";
}) {
	const sideActions = actions.filter((action) => action.side === side);
	const picks = sideActions.filter((action) => action.kind === "pick");
	const bans = sideActions.filter((action) => action.kind === "ban");
	return (
		<div className={`rounded-2xl border p-3 ${tone === "blue" ? "border-sky-200/18 bg-sky-300/[0.055]" : "border-red-200/18 bg-red-400/[0.055]"}`}>
			<div className={`text-xs font-black uppercase tracking-[0.18em] ${tone === "blue" ? "text-sky-100/72" : "text-red-100/72"}`}>{label}</div>
			<div className="mt-3 grid grid-cols-5 gap-2">
				{picks.map((action) => (
					<ChampionMini key={`${action.side}-${action.kind}-${action.champion}`} champion={byName.get(action.champion)} label={action.champion} />
				))}
			</div>
			<div className="mt-3 grid grid-cols-6 gap-2 opacity-80">
				{bans.map((action) => (
					<ChampionMini key={`${action.side}-${action.kind}-${action.champion}`} champion={byName.get(action.champion)} label={action.champion} banned />
				))}
			</div>
		</div>
	);
}

function ChampionMini({ champion, label, banned }: { champion?: ChampionPoolEntry; label: string; banned?: boolean }) {
	return (
		<div className="min-w-0">
			<div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/24">
				{champion ? <ChampionIcon champion={champion} /> : null}
				{banned ? <div className="pointer-events-none absolute inset-x-[-20%] top-1/2 h-0.5 -rotate-45 bg-red-100/80" /> : null}
			</div>
			<div className="mt-1 truncate text-center text-[10px] font-black text-emerald-50/78">{label}</div>
		</div>
	);
}

function DraftTrack({
	side,
	title,
	poolLabel,
	locks,
	actions,
	allChampions,
	accent,
	banSlots,
	currentTurn,
	selectedChampion,
	ready,
}: {
	side: DraftSide;
	title: string;
	poolLabel: string;
	locks: Record<string, FearlessLock> | null;
	actions: DraftAction[];
	allChampions: ChampionPool["champions"];
	accent: "blue" | "red";
	banSlots: number;
	currentTurn: { side: DraftSide; kind: "ban" | "pick" } | null;
	selectedChampion: string;
	ready: boolean;
}) {
	const sideActions = actions.filter((action) => action.side === side);
	const picks = sideActions.filter((action) => action.kind === "pick");
	const bans = sideActions.filter((action) => action.kind === "ban");
	const byName = new Map(allChampions.map((champion) => [champion.name, champion]));
	const isBlue = accent === "blue";
	const pendingChampion = currentTurn?.side === side && selectedChampion ? byName.get(selectedChampion) : undefined;
	const pendingPickIndex = currentTurn?.side === side && currentTurn.kind === "pick" ? picks.length : -1;
	const pendingBanIndex = currentTurn?.side === side && currentTurn.kind === "ban" ? bans.length : -1;
	return (
		<article className={`sticky top-4 border-0 bg-transparent p-0 shadow-none xl:row-span-3 ${isBlue ? "text-sky-50" : "text-red-50"}`}>
			<header className={isBlue ? "" : "text-right"}>
				<div className={`flex items-center gap-2 ${isBlue ? "justify-start" : "justify-end"}`}>
					<div className={isBlue ? "text-xs font-black uppercase tracking-[0.24em] text-sky-100/70" : "text-xs font-black uppercase tracking-[0.24em] text-red-100/70"}>
						{side === "teamA" ? "Blue Side" : "Red Side"}
					</div>
					<span
						className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${
							ready ? "border-lime-200/24 bg-lime-200/12 text-lime-100" : "border-white/10 bg-black/24 text-emerald-100/38"
						}`}
					>
						{ready ? "Ready" : "Wartet"}
					</span>
				</div>
				<h2 className={isBlue ? "mt-2 break-words text-2xl font-black text-sky-50 2xl:text-3xl" : "mt-2 break-words text-2xl font-black text-red-50 2xl:text-3xl"}>
					{title}
				</h2>
				<p className="mt-1 text-sm font-bold text-emerald-100/52">{poolLabel}</p>
			</header>

			<div className="mt-4">
				<div className="hidden text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/60">Picks</div>
				<div className="mt-2 grid gap-2">
					{Array.from({ length: 5 }).map((_, index) => (
						<Slot
							key={`pick-${index}`}
							action={picks[index]}
							champion={picks[index] ? byName.get(picks[index].champion) : undefined}
							pendingChampion={pendingPickIndex === index ? pendingChampion : undefined}
							active={pendingPickIndex === index}
							label={`Pick ${index + 1}`}
						/>
					))}
				</div>
			</div>

			<div className="mt-4">
				<div className="hidden text-[10px] font-black uppercase tracking-[0.22em] text-red-100/60">Bans</div>
				<div className="mt-2 grid grid-cols-4 gap-2">
					{Array.from({ length: banSlots }).map((_, index) => (
						<Slot
							key={`ban-${index}`}
							action={bans[index]}
							champion={bans[index] ? byName.get(bans[index].champion) : undefined}
							pendingChampion={pendingBanIndex === index ? pendingChampion : undefined}
							active={pendingBanIndex === index}
							compact
							label={`B${index + 1}`}
						/>
					))}
				</div>
			</div>
			{locks && Object.keys(locks).length > 0 ? <FearlessLockList locks={locks} byName={byName} align={isBlue ? "left" : "right"} /> : null}
		</article>
	);
}

function FearlessLockList({ locks, byName, align }: { locks: Record<string, FearlessLock>; byName: Map<string, ChampionPoolEntry>; align: "left" | "right" }) {
	const entries = Object.values(locks).sort((a, b) => a.source.localeCompare(b.source) || a.champion.localeCompare(b.champion, "de"));
	return (
		<details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-emerald-50">
			<summary className={`cursor-pointer text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/80 ${align === "right" ? "text-right" : ""}`}>
				Fearless-Sperren ({entries.length})
			</summary>
			<ul className="mt-3 grid grid-cols-6 gap-1.5" aria-label="Gesperrte Champions">
				{entries.map((lock) => {
					const champion = byName.get(lock.champion);
					return (
						<li key={lock.champion} title={`${lock.champion}: ${fearlessLockLabel(lock)}`} className="relative">
							{champion ? (
								<div className={`relative aspect-square overflow-hidden rounded-md grayscale ${lock.source === "opponent" ? "opacity-60" : ""}`}>
									<Image
										src={champion.imageUrl}
										alt={`${lock.champion} (${lock.source === "own" ? "selbst gespielt" : "vom Gegner gespielt"})`}
										fill
										sizes="3rem"
										className="object-cover"
									/>
								</div>
							) : (
								<span className="block truncate text-[10px] font-bold">{lock.champion}</span>
							)}
						</li>
					);
				})}
			</ul>
		</details>
	);
}

function Slot({
	action,
	champion,
	pendingChampion,
	active,
	compact,
	label,
}: {
	action?: DraftAction;
	champion?: ChampionPoolEntry;
	pendingChampion?: ChampionPoolEntry;
	active?: boolean;
	compact?: boolean;
	label?: string;
}) {
	if (!action && !pendingChampion) {
		return (
			<div
				className={`grid place-items-center rounded-sm border bg-white/[0.055] ${compact ? "aspect-square" : "h-24 2xl:h-28"} ${
					active ? "animate-[draft-breathe_1400ms_ease-in-out_infinite] border-lime-200/55 opacity-100" : "border-white/10 opacity-55"
				}`}
			>
				<span className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/34">{label ?? "Open"}</span>
			</div>
		);
	}

	if (compact) {
		const shownChampion = champion ?? pendingChampion;
		return (
			<div
				className={`relative overflow-hidden rounded-sm border bg-red-500/10 ${
					pendingChampion && !action ? "animate-[draft-breathe_1400ms_ease-in-out_infinite] border-red-200/60" : "border-red-200/22"
				}`}
			>
				{shownChampion ? <ChampionIcon champion={shownChampion} /> : null}
				<div className="pointer-events-none absolute inset-0 bg-black/20" />
				{action ? <div className="pointer-events-none absolute inset-x-[-20%] top-1/2 h-0.5 -rotate-45 bg-red-100/80 shadow-lg shadow-red-500/30" /> : null}
			</div>
		);
	}

	const shownChampion = champion ?? pendingChampion;
	return (
		<div
			className={`relative grid min-h-24 overflow-hidden rounded-sm border bg-lime-200/10 shadow-lg shadow-black/18 2xl:min-h-28 ${
				pendingChampion && !action ? "animate-[draft-breathe_1400ms_ease-in-out_infinite] border-lime-200/60" : "border-lime-200/22"
			}`}
		>
			{shownChampion ? (
				<>
					<div className="absolute inset-0 scale-125 opacity-35 blur-sm">
						<Image src={shownChampion.imageUrl} alt="" fill sizes="20rem" className="object-cover" />
					</div>
					<div className="absolute inset-0 bg-gradient-to-r from-black/78 via-black/45 to-transparent" />
				</>
			) : null}
			<div className="relative grid grid-cols-[4.25rem_1fr] items-center gap-3 p-2">
				{shownChampion ? <ChampionIcon champion={shownChampion} /> : null}
				<div className="min-w-0">
					<div className="truncate text-sm font-black text-emerald-50">{action?.champion ?? pendingChampion?.name}</div>
					<div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/42">{action?.kind ?? "selected"}</div>
				</div>
			</div>
		</div>
	);
}

function ChampionIcon({ champion }: { champion: ChampionPoolEntry }) {
	return (
		<div className="relative aspect-square overflow-hidden rounded-xl bg-emerald-950">
			<Image src={champion.imageUrl} alt={champion.name} fill sizes="8rem" className="object-cover" />
		</div>
	);
}

function DraftOrder({ actions, sequence, extraBanSide }: { actions: DraftAction[]; sequence: Array<{ side: DraftSide; kind: "ban" | "pick" }>; extraBanSide: DraftSide | null }) {
	return (
		<div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
			<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">Draft Order</div>
			{extraBanSide ? (
				<p className="mt-2 text-xs font-bold text-lime-100/70">Gruppenplatz-2-Bonus: {turnLabel({ side: extraBanSide })} hat in diesem Match einen vierten Ban.</p>
			) : null}
			<div className="mt-4 flex flex-wrap gap-2">
				{sequence.map((turn, index) => {
					const action = actions[index];
					return (
						<div
							key={`${turn.side}-${turn.kind}-${index}`}
							className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
								action
									? "border-lime-200/24 bg-lime-200/10 text-lime-50"
									: index === actions.length
										? "border-amber-200/30 bg-amber-200/12 text-amber-100"
										: "border-white/10 bg-black/18 text-emerald-100/38"
							}`}
						>
							{index + 1}. {turn.side === "teamA" ? "Blue" : "Red"} {turn.kind}
							{action ? ` · ${action.champion}` : ""}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function turnLabel(turn: { side: DraftSide }) {
	return turn.side === "teamA" ? "Blue Side" : "Red Side";
}
