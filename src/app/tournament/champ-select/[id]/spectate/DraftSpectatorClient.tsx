"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { ChampionPool, ChampionPoolEntry } from "@/lib/champion-pools";
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

type TimerState = {
	label: string;
	remainingMs: number;
	expired: boolean;
	progress: number;
};

export type DraftViewerPerspective = "neutral" | "blue" | "red";

export function DraftSpectatorClient({
	match,
	draft,
	perspective,
	blueTeamLabel,
	redTeamLabel,
	blueChampions,
	redChampions,
	extraBanSide,
}: {
	match: ControlMatch;
	draft: TournamentDraftState;
	perspective: DraftViewerPerspective;
	blueTeamLabel: string;
	redTeamLabel: string;
	blueChampions: ChampionPool["champions"];
	redChampions: ChampionPool["champions"];
	extraBanSide: DraftSide | null;
}) {
	const [state, setState] = useState(draft);
	const [now, setNow] = useState(() => Date.now());
	const sequence = createDraftSequence(extraBanSide);
	const currentTurn = nextDraftTurn(state, sequence);
	const ready = draftReady(state);
	const complete = draftComplete(state, sequence);
	const timer = getTimerState(state, now, sequence);
	const allChampions = [...blueChampions, ...redChampions];
	const usedChampions = new Set(state.actions.map((action) => action.champion));
	const pendingSelection = state.pendingSelection;
	const candidatePool = currentTurn ? championsForTurn(currentTurn, blueChampions, redChampions) : [];
	const activePoolMessage = currentTurn ? describeActivePool(currentTurn, perspective) : null;

	useEffect(() => {
		const interval = window.setInterval(() => setNow(Date.now()), 250);
		return () => window.clearInterval(interval);
	}, []);

	useEffect(() => {
		let cancelled = false;
		const interval = window.setInterval(async () => {
			const response = await fetch(`/api/tournament/draft?matchId=${encodeURIComponent(match.id)}`);
			const json = (await response.json().catch(() => null)) as { draft?: TournamentDraftState } | null;
			if (!cancelled && response.ok && json?.draft) setState(json.draft);
		}, 700);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [match.id]);

	return (
		<div className="grid gap-3">
			<div className="grid items-start gap-4 xl:grid-cols-[24vw_minmax(30rem,1fr)_24vw] 2xl:grid-cols-[25vw_minmax(42rem,1fr)_25vw]">
				<DraftLane
					side="teamA"
					title={blueTeamLabel}
					pool={match.blueSide === "teamA" ? (match.poolAssignment?.teamAPool ?? null) : (match.poolAssignment?.teamBPool ?? null)}
					actions={state.actions}
					champions={allChampions}
					banSlots={3 + (extraBanSide === "teamA" ? 1 : 0)}
					currentTurn={currentTurn}
					pendingSelection={pendingSelection}
					ready={Boolean(state.readyBy.teamA)}
					poolContext={poolContext("blue", perspective)}
					tone="blue"
				/>

				<LiveStatus matchHasPools={Boolean(match.poolAssignment)} turn={currentTurn} ready={ready} complete={complete} timer={timer} />

				<DraftLane
					side="teamB"
					title={redTeamLabel}
					pool={match.blueSide === "teamA" ? (match.poolAssignment?.teamBPool ?? null) : (match.poolAssignment?.teamAPool ?? null)}
					actions={state.actions}
					champions={allChampions}
					banSlots={3 + (extraBanSide === "teamB" ? 1 : 0)}
					currentTurn={currentTurn}
					pendingSelection={pendingSelection}
					ready={Boolean(state.readyBy.teamB)}
					poolContext={poolContext("red", perspective)}
					tone="red"
				/>

				<section className="rounded-[1.25rem] border border-white/8 bg-black/16 p-3 shadow-xl shadow-black/20 sm:p-4 xl:col-start-2">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div>
							<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">{viewerLabel(perspective)}</div>
							<h2 className="mt-1 text-xl font-black text-emerald-50">
								{currentTurn
									? `${turnLabel(currentTurn)} · ${activePoolMessage}`
									: complete
										? "Draft abgeschlossen"
										: "Wartet auf Draft"}
							</h2>
						</div>
						<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-black text-lime-100">
							{complete ? `${state.actions.length} Locks` : `${candidatePool.length} Champions`}
						</div>
					</div>

					<div className="draft-scrollbar-hidden mt-3 max-h-[50vh] overflow-y-auto pr-1">
						{complete ? (
							<CompletedDraftSummary actions={state.actions} champions={allChampions} blueTeamLabel={blueTeamLabel} redTeamLabel={redTeamLabel} />
						) : candidatePool.length ? (
							<div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 2xl:grid-cols-10">
								{candidatePool.map((champion) => {
									const used = usedChampions.has(champion.name);
									const pending =
										pendingSelection?.champion === champion.name && pendingSelection.side === currentTurn?.side && pendingSelection.kind === currentTurn?.kind;
									return (
										<div
											key={champion.id}
											className={`group overflow-hidden rounded-xl border p-1.5 text-left transition ${
												pending
													? "border-lime-200/60 bg-lime-200/16 shadow-lg shadow-lime-300/10"
													: used
														? "border-white/6 bg-black/30 opacity-35 grayscale"
														: "border-white/10 bg-black/18"
											}`}
										>
											<ChampionIcon champion={champion} />
											<div className="mt-1.5 truncate text-center text-xs font-black text-emerald-50">{champion.name}</div>
										</div>
									);
								})}
							</div>
						) : (
							<div className="grid min-h-64 place-items-center rounded-2xl border border-white/8 bg-black/16 text-sm font-bold text-emerald-100/46">
								Noch kein aktiver Champion-Pool.
							</div>
						)}
					</div>
				</section>

				<div className="xl:col-start-2">
					<DraftOrder actions={state.actions} sequence={sequence} extraBanSide={extraBanSide} />
				</div>
			</div>

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

function LiveStatus({
	matchHasPools,
	turn,
	ready,
	complete,
	timer,
}: {
	matchHasPools: boolean;
	turn: { side: DraftSide; kind: "ban" | "pick" } | null;
	ready: boolean;
	complete: boolean;
	timer: TimerState;
}) {
	if (!matchHasPools) {
		return (
			<div className="mx-auto max-w-sm rounded-2xl border border-amber-200/18 bg-amber-200/8 px-4 py-3 text-center text-sm font-bold leading-6 text-amber-100/76">
				Für dieses Match wurden noch keine Pools gezogen.
			</div>
		);
	}
	if (complete) {
		return (
			<div className="mx-auto w-fit border-t-4 border-lime-300 px-8 pt-2 text-center">
				<p className="text-xs font-black uppercase tracking-[0.22em] text-lime-100">Draft abgeschlossen</p>
			</div>
		);
	}
	if (!ready) {
		return (
			<div className="mx-auto w-fit border-t-4 border-lime-300/75 px-8 pt-2 text-center">
				<p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-50">Waiting for drafter</p>
				<p className="mt-1 text-[11px] font-bold text-emerald-100/48">Beide Captains müssen ready sein.</p>
			</div>
		);
	}
	if (!turn) return null;

	const isRed = turn.side === "teamB";
	return (
		<div className={`mx-auto w-fit border-t-4 ${isRed ? "border-red-400" : "border-sky-400"} px-8 pt-2 text-center`}>
			<div className={`text-xs font-black uppercase tracking-[0.2em] ${isRed ? "text-red-100" : "text-sky-100"}`}>
				{isRed ? "Red" : "Blue"} {turn.kind === "ban" ? "Ban" : "Pick"}
			</div>
			<div className={`mt-1 text-3xl font-black tabular-nums ${timer.remainingMs <= 0 ? "text-amber-100" : "text-emerald-50"}`}>{timer.label}</div>
			<div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
				<div
					className={`h-full rounded-full transition-all ${timer.remainingMs <= 0 ? "bg-amber-200" : isRed ? "bg-red-400" : "bg-sky-400"}`}
					style={{ width: `${timer.progress}%` }}
				/>
			</div>
		</div>
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
		<div className="grid gap-3 md:grid-cols-2">
			<FinalTeamDraft label={blueTeamLabel} side="teamA" actions={actions} byName={byName} tone="blue" />
			<FinalTeamDraft label={redTeamLabel} side="teamB" actions={actions} byName={byName} tone="red" />
		</div>
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

function DraftLane({
	side,
	title,
	pool,
	actions,
	champions,
	banSlots,
	currentTurn,
	pendingSelection,
	ready,
	poolContext,
	tone,
}: {
	side: DraftSide;
	title: string;
	pool: string | null;
	actions: DraftAction[];
	champions: ChampionPool["champions"];
	banSlots: number;
	currentTurn: { side: DraftSide; kind: "ban" | "pick" } | null;
	pendingSelection?: TournamentDraftState["pendingSelection"];
	ready: boolean;
	poolContext: string;
	tone: "blue" | "red";
}) {
	const sideActions = actions.filter((action) => action.side === side);
	const bans = sideActions.filter((action) => action.kind === "ban");
	const picks = sideActions.filter((action) => action.kind === "pick");
	const byName = new Map(champions.map((champion) => [champion.name, champion]));
	const isBlue = tone === "blue";
	const activePickIndex = currentTurn?.side === side && currentTurn.kind === "pick" ? picks.length : -1;
	const activeBanIndex = currentTurn?.side === side && currentTurn.kind === "ban" ? bans.length : -1;
	const pendingChampion = pendingSelection?.side === side ? byName.get(pendingSelection.champion) : undefined;

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
				<p className="mt-1 text-sm font-bold text-emerald-100/52">{pool ? `${poolContext}: ${compactPoolLabel(pool)}` : "Noch kein Pool gezogen"}</p>
			</header>

			<div className="mt-4">
				<div className="mt-2 grid gap-2">
					{Array.from({ length: 5 }).map((_, index) => (
						<DraftSlot
							key={`pick-${index}`}
							action={picks[index]}
							champion={picks[index] ? byName.get(picks[index].champion) : undefined}
							pendingChampion={activePickIndex === index && pendingSelection?.kind === "pick" ? pendingChampion : undefined}
							active={activePickIndex === index}
							label={`Pick ${index + 1}`}
						/>
					))}
				</div>
			</div>

			<div className="mt-4">
				<div className="mt-2 grid grid-cols-4 gap-2">
					{Array.from({ length: banSlots }).map((_, index) => (
						<DraftSlot
							key={`ban-${index}`}
							action={bans[index]}
							champion={bans[index] ? byName.get(bans[index].champion) : undefined}
							pendingChampion={activeBanIndex === index && pendingSelection?.kind === "ban" ? pendingChampion : undefined}
							active={activeBanIndex === index}
							compact
							label={`B${index + 1}`}
						/>
					))}
				</div>
			</div>
		</article>
	);
}

function DraftSlot({
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

function poolContext(side: "blue" | "red", perspective: DraftViewerPerspective) {
	if (perspective === "neutral") return `${side === "blue" ? "Blue" : "Red"} Champion-Pool`;
	return perspective === side ? "Dein Champion-Pool" : "Champion-Pool des Gegners";
}

function viewerLabel(perspective: DraftViewerPerspective) {
	if (perspective === "blue") return "Blue-Team-Ansicht";
	if (perspective === "red") return "Red-Team-Ansicht";
	return "Neutrale Zuschaueransicht";
}

function describeActivePool(turn: { side: DraftSide; kind: "ban" | "pick" }, perspective: DraftViewerPerspective) {
	const activeSide = turn.side === "teamA" ? "blue" : "red";
	if (perspective === "neutral") {
		return turn.kind === "ban" ? "Bans stammen aus dem gegnerischen Pool" : "Picks stammen aus dem eigenen Pool";
	}
	const activeIsViewer = perspective === activeSide;
	if (turn.kind === "ban") {
		return activeIsViewer ? "Dein Team bannt aus dem gegnerischen Pool" : "Das Gegnerteam bannt aus deinem Pool";
	}
	return activeIsViewer ? "Dein Team pickt aus dem eigenen Pool" : "Das Gegnerteam pickt aus dem eigenen Pool";
}

function championsForTurn(turn: { side: DraftSide; kind: "ban" | "pick" }, blueChampions: ChampionPool["champions"], redChampions: ChampionPool["champions"]) {
	if (turn.kind === "pick") {
		return turn.side === "teamA" ? blueChampions : redChampions;
	}
	return turn.side === "teamA" ? redChampions : blueChampions;
}

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

function turnLabel(turn: { side: DraftSide }) {
	return turn.side === "teamA" ? "Blue Side" : "Red Side";
}
