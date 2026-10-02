"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useId, useRef, useState, useTransition, type DragEvent } from "react";
import { championFitsRole } from "@/lib/champion-roles";
import type { ChampionPool, ChampionPoolEntry } from "@/lib/champion-pools";
import { fearlessLockBadge, fearlessLockLabel, type FearlessLock, type FearlessLocks } from "@/lib/fearless";
import type { ControlMatch } from "@/lib/match-control";
import {
	DRAFT_FIRST_PHASE_BANS,
	DRAFT_BANS_PER_SIDE,
	DRAFT_ROLE_LABELS,
	DRAFT_ROLE_SECONDS,
	DRAFT_ROLES,
	DRAFT_TOTAL_MS,
	DRAFT_ROLE_TOTAL_MS,
	DRAFT_TURN_SECONDS,
	createDraftSequence,
	draftBans,
	draftComplete,
	draftHasRoles,
	draftPicks,
	draftReady,
	draftRoleOrder,
	nextDraftTurn,
	rolePhaseActive,
	swapRoleOrder,
	type DraftAction,
	type DraftRole,
	type DraftSide,
	type DraftTurn,
	type TournamentDraftState,
} from "@/lib/tournament-draft-shared";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { playDraftCompleteSound, playDraftStartSound, unlockTournamentAudio } from "@/lib/tournament-sounds";

type EditableSide = DraftSide | null;
type ChampionEntry = ChampionPool["champions"][number];
type DraftResponse = { draft?: TournamentDraftState; message?: string } | null;

/** Local selection for "kein Ban"; never sent as a champion name. */
const NO_BAN = "\u0000none";
const SIDE_LABEL: Record<DraftSide, string> = { teamA: "Blue Side", teamB: "Red Side" };

export function ChampSelectClient({
	match,
	draft,
	mode,
	blueChampions,
	redChampions,
	fearlessLocks,
	closedReason,
	editableSide,
	blueTeamLabel,
	redTeamLabel,
	extraBanSide,
	isOwner,
	spectator = false,
}: {
	match: ControlMatch;
	draft: TournamentDraftState;
	mode: "pools" | "fearless";
	/** Pick candidates of Blue (teamA) and Red (teamB). */
	blueChampions: ChampionPool["champions"];
	redChampions: ChampionPool["champions"];
	fearlessLocks: FearlessLocks;
	closedReason: string | null;
	lockOpponentChampions?: boolean;
	editableSide: EditableSide;
	blueTeamLabel: string;
	redTeamLabel: string;
	extraBanSide: DraftSide | null;
	isOwner: boolean;
	/** Read-only stream/spectator view. */
	spectator?: boolean;
}) {
	const fearless = mode === "fearless";
	const searchId = useId();
	const [state, setState] = useState(draft);
	const [selected, setSelected] = useState("");
	const [search, setSearch] = useState("");
	const [roleFilter, setRoleFilter] = useState<DraftRole | null>(null);
	const [hideLocked, setHideLocked] = useState(false);
	const [swapFrom, setSwapFrom] = useState<{ side: DraftSide; index: number } | null>(null);
	const [message, setMessage] = useState("");
	const [now, setNow] = useState<number | null>(null);
	const [isPending, startTransition] = useTransition();
	const deferredSearch = useDeferredValue(search);
	const timeoutHandledRef = useRef("");
	const lastHoverRef = useRef("");

	const sequence = createDraftSequence(extraBanSide);
	const currentTurn = nextDraftTurn(state, sequence);
	const ready = draftReady(state);
	const complete = draftComplete(state, sequence);
	const rolePhase = rolePhaseActive(state, sequence);
	const finished = complete && !rolePhase;
	const timer = timerState(state, now, rolePhase, complete);
	const controlsSide = (side: DraftSide) => !spectator && (isOwner || editableSide === side);
	const canDraft = Boolean(!spectator && !closedReason && ready && currentTurn && !timer.expired && controlsSide(currentTurn.side));

	const allChampions = uniqueChampions([...blueChampions, ...redChampions]);
	const byName = new Map(allChampions.map((champion) => [champion.name, champion]));
	const used = new Set(state.actions.filter((action) => !action.skipped).map((action) => action.champion));
	const turnLocks: Record<string, FearlessLock> = currentTurn?.kind === "pick" ? fearlessLocks[currentTurn.side] : {};
	// Fearless: free champions per role for the team picking now (or the viewer's team), so thin roles show early.
	const countSide: DraftSide | null = fearless ? (currentTurn?.kind === "pick" ? currentTurn.side : editableSide) : null;
	const roleCounts = countSide
		? Object.fromEntries(
				DRAFT_ROLES.map((role) => [
					role,
					allChampions.filter((champion) => championFitsRole(champion.id, role) && !used.has(champion.name) && !fearlessLocks[countSide][champion.name]).length,
				])
			)
		: null;
	const pool = currentTurn ? championsForTurn(currentTurn, blueChampions, redChampions, fearless) : allChampions;
	const term = normalizeSearch(deferredSearch);
	const visible = pool.filter(
		(champion) =>
			(!term || normalizeSearch(champion.name).includes(term)) &&
			(!roleFilter || championFitsRole(champion.id, roleFilter)) &&
			!(hideLocked && (used.has(champion.name) || turnLocks[champion.name]))
	);
	const selectable = (name: string) => name === NO_BAN || (Boolean(name) && !used.has(name) && !turnLocks[name]);
	// Actors preview their own click; everyone else sees the hover the server broadcast.
	const serverHover = currentTurn && state.pendingSelection?.side === currentTurn.side && state.pendingSelection.kind === currentTurn.kind ? state.pendingSelection.champion : "";
	const preview = canDraft && selected ? selected : serverHover;

	const turnKey = `${state.actions.length}:${state.currentTurnStartedAt ?? ""}`;
	const [selectionKey, setSelectionKey] = useState(turnKey);
	if (selectionKey !== turnKey) {
		setSelectionKey(turnKey);
		setSelected("");
	}

	useEffect(() => {
		const tick = () => setNow(Date.now());
		const first = window.setTimeout(tick, 0);
		const interval = window.setInterval(tick, 250);
		return () => {
			window.clearTimeout(first);
			window.clearInterval(interval);
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		const interval = window.setInterval(
			async () => {
				const next = await fetchDraft(match.id);
				if (!cancelled && next) setState(next);
			},
			spectator ? 800 : 1000
		);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [match.id, spectator]);

	const wasReady = useRef(ready);
	useEffect(() => {
		if (!wasReady.current && ready) playDraftStartSound();
		wasReady.current = ready;
	}, [ready]);
	const wasComplete = useRef(complete);
	useEffect(() => {
		if (!wasComplete.current && complete) playDraftCompleteSound();
		wasComplete.current = complete;
	}, [complete]);

	// Captains and admins report an expired timer; the server decides what happens.
	useEffect(() => {
		if (spectator || (!editableSide && !isOwner) || !timer.expired) return;
		const key = `${state.actions.length}:${state.currentTurnStartedAt ?? state.rolePhaseStartedAt ?? ""}`;
		if (timeoutHandledRef.current === key) return;
		timeoutHandledRef.current = key;
		void post({ matchId: match.id, action: "timeout" }).then((json) => {
			if (!json?.draft) {
				// Clocks can differ slightly from the server's; try again shortly.
				window.setTimeout(() => {
					if (timeoutHandledRef.current === key) timeoutHandledRef.current = "";
				}, 1500);
				return;
			}
			setState(json.draft);
			setMessage(timeoutMessage(json.draft, state));
		});
	}, [editableSide, isOwner, match.id, spectator, state, timer.expired]);

	function run(task: () => Promise<DraftResponse>, onDone?: (draft: TournamentDraftState) => void) {
		setMessage("");
		startTransition(async () => {
			const json = await task();
			if (!json?.draft) {
				setMessage(json?.message ?? "Aktion fehlgeschlagen. Bitte erneut versuchen.");
				return;
			}
			setState(json.draft);
			onDone?.(json.draft);
		});
	}

	async function markReady() {
		await unlockTournamentAudio();
		run(
			() => post({ matchId: match.id, action: "ready" }),
			(next) => setMessage(draftReady(next) ? "" : "Ready. Warte auf den anderen Captain.")
		);
	}

	function lockSelection() {
		if (!canDraft || !selectable(selected)) return;
		const body = selected === NO_BAN ? { matchId: match.id, skip: true } : { matchId: match.id, champion: selected };
		run(
			() => request("PATCH", body),
			() => setSelected("")
		);
	}

	function choose(name: string) {
		if (!canDraft || !selectable(name)) return;
		setSelected(name);
		if (name === NO_BAN || !currentTurn) return;
		const key = `${turnKey}:${name}`;
		if (lastHoverRef.current === key) return;
		lastHoverRef.current = key;
		void post({ matchId: match.id, action: "select", champion: name }).then((json) => {
			if (json?.draft) setState(json.draft);
		});
	}

	function moveRole(side: DraftSide, from: number, to: number) {
		const order = swapRoleOrder(draftRoleOrder(state, side), from, to);
		setSwapFrom(null);
		if (from === to) return;
		setState((current) => ({ ...current, roles: { ...current.roles, [side]: { order } } }));
		void post({ matchId: match.id, action: "roles", order, ...(isOwner ? { side } : {}) }).then((json) => {
			if (json?.draft) setState(json.draft);
			else if (json?.message) setMessage(json.message);
		});
	}

	function confirmRoles(side: DraftSide) {
		run(() => post({ matchId: match.id, action: "confirmRoles", order: draftRoleOrder(state, side), ...(isOwner ? { side } : {}) }));
	}

	function adminAction(action: "forceReady" | "reset" | "undo") {
		if (action === "reset" && !window.confirm("Draft komplett zurücksetzen?")) return;
		run(() => post({ matchId: match.id, action }));
	}

	const roleSide: DraftSide | null = rolePhase ? (editableSide ?? (isOwner ? (state.roles?.teamA?.confirmedAt ? "teamB" : "teamA") : null)) : null;
	const laneProps = {
		state,
		byName,
		currentTurn: ready && !closedReason ? currentTurn : null,
		preview,
		rolePhase,
		swapFrom,
		onSwapStart: setSwapFrom,
		onMove: moveRole,
	};

	return (
		<div className="draft-room">
			<header className="draft-head">
				<TeamHeader side="teamA" name={blueTeamLabel} detail={laneDetail("teamA", fearless, fearlessLocks, match)} ready={Boolean(state.readyBy.teamA)} />
				<PhaseHeader
					closedReason={closedReason}
					ready={ready}
					turn={currentTurn}
					rolePhase={rolePhase}
					finished={finished}
					timer={timer}
					sequence={sequence}
					done={state.actions.length}
				/>
				<TeamHeader side="teamB" name={redTeamLabel} detail={laneDetail("teamB", fearless, fearlessLocks, match)} ready={Boolean(state.readyBy.teamB)} />
			</header>

			{closedReason ? <p className="draft-notice">{closedReason}</p> : null}

			<div className="draft-board">
				<PickLane side="teamA" editable={rolePhase && controlsSide("teamA") && !state.roles?.teamA?.confirmedAt} {...laneProps} />

				<section className="draft-center" aria-label="Champion-Auswahl">
					<div className="draft-toolbar">
						{DRAFT_ROLES.map((role) => (
							<button
								key={role}
								type="button"
								className="draft-role-filter"
								aria-pressed={roleFilter === role}
								onClick={() => setRoleFilter(roleFilter === role ? null : role)}
								title={roleCounts && countSide ? `${roleCounts[role]} freie ${DRAFT_ROLE_LABELS[role]}-Champions für ${SIDE_LABEL[countSide]}` : undefined}
							>
								{DRAFT_ROLE_LABELS[role]}
								{roleCounts ? (
									<small className="draft-role-count" data-low={roleCounts[role] <= 8}>
										{roleCounts[role]}
									</small>
								) : null}
							</button>
						))}
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
							className="draft-search"
						/>
						{fearless ? (
							<label className="draft-toggle">
								<input type="checkbox" checked={hideLocked} onChange={(event) => setHideLocked(event.target.checked)} />
								Gesperrte ausblenden
							</label>
						) : null}
					</div>

					<div className="draft-grid">
						{currentTurn?.kind === "ban" && ready ? (
							<button type="button" className="draft-tile" disabled={!canDraft} aria-pressed={canDraft && selected === NO_BAN} onClick={() => choose(NO_BAN)}>
								<div className="draft-tile-art draft-none-art" aria-hidden="true">
									<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
										<circle cx="12" cy="12" r="9" />
										<path d="M5.6 18.4 18.4 5.6" />
									</svg>
								</div>
								<span>Kein Ban</span>
							</button>
						) : null}
						{visible.map((champion) => {
							const lock = turnLocks[champion.name];
							const taken = used.has(champion.name);
							return (
								<button
									key={champion.id}
									type="button"
									className="draft-tile"
									disabled={!canDraft || taken || Boolean(lock) || isPending}
									aria-pressed={canDraft && selected === champion.name}
									data-hover={!canDraft && serverHover === champion.name}
									data-used={taken || Boolean(lock)}
									title={lock ? fearlessLockLabel(lock) : taken ? "Bereits gepickt oder gebannt" : undefined}
									aria-label={lock ? `${champion.name}, gesperrt: ${fearlessLockLabel(lock)}` : taken ? `${champion.name}, bereits gewählt` : champion.name}
									onClick={() => choose(champion.name)}
								>
									<div className="draft-tile-art">
										<Image src={champion.imageUrl} alt="" fill sizes="5rem" />
										{lock ? <i className="draft-tile-lock">{fearlessLockBadge(lock)}</i> : null}
									</div>
									<span>{champion.name}</span>
								</button>
							);
						})}
						{visible.length === 0 ? <p className="draft-empty">Kein Champion passt zu Suche und Filter.</p> : null}
					</div>
				</section>

				<PickLane side="teamB" editable={rolePhase && controlsSide("teamB") && !state.roles?.teamB?.confirmedAt} {...laneProps} />
			</div>

			<div className="draft-foot">
				<BanRow side="teamA" state={state} byName={byName} extra={extraBanSide === "teamA"} currentTurn={ready ? currentTurn : null} preview={preview} />
				<div className="draft-action">
					<ActionButton
						spectator={spectator}
						closedReason={closedReason}
						editableSide={editableSide}
						isOwner={isOwner}
						ready={ready}
						ownReady={Boolean(editableSide && state.readyBy[editableSide])}
						turn={currentTurn}
						canDraft={canDraft}
						selected={selected}
						rolePhase={rolePhase}
						roleSide={roleSide}
						roleConfirmed={Boolean(roleSide && state.roles?.[roleSide]?.confirmedAt)}
						finished={finished}
						pending={isPending}
						onReady={markReady}
						onLock={lockSelection}
						onConfirmRoles={confirmRoles}
					/>
					{rolePhase && roleSide && !state.roles?.[roleSide]?.confirmedAt ? (
						<small>Ziehe deine Picks auf die richtige Lane oder tippe zwei Karten an, um sie zu tauschen.</small>
					) : null}
				</div>
				<BanRow side="teamB" state={state} byName={byName} extra={extraBanSide === "teamB"} currentTurn={ready ? currentTurn : null} preview={preview} />
			</div>

			{message ? (
				<p role="status" className="draft-message">
					{message}
				</p>
			) : null}

			{isOwner && !spectator ? (
				<div className="draft-admin">
					<span>Admin</span>
					<button type="button" className="button ghost small" disabled={isPending || complete} onClick={() => adminAction("forceReady")}>
						Force Ready
					</button>
					<button type="button" className="button ghost small" disabled={isPending || state.actions.length === 0} onClick={() => adminAction("undo")}>
						Letzten Lock zurücknehmen
					</button>
					<button type="button" className="button ghost small" disabled={isPending} onClick={() => adminAction("reset")}>
						Draft zurücksetzen
					</button>
				</div>
			) : null}
		</div>
	);
}

function TeamHeader({ side, name, detail, ready }: { side: DraftSide; name: string; detail: string; ready: boolean }) {
	return (
		<div className="draft-team" data-side={side}>
			<h2>{name}</h2>
			<p>
				{SIDE_LABEL[side]} · {detail}
			</p>
			<span className="draft-ready" data-ready={ready}>
				{ready ? "Ready" : "Wartet"}
			</span>
		</div>
	);
}

function PhaseHeader({
	closedReason,
	ready,
	turn,
	rolePhase,
	finished,
	timer,
	sequence,
	done,
}: {
	closedReason: string | null;
	ready: boolean;
	turn: DraftTurn | null;
	rolePhase: boolean;
	finished: boolean;
	timer: TimerState;
	sequence: DraftTurn[];
	done: number;
}) {
	const label = closedReason
		? "Noch nicht freigegeben"
		: finished
			? "Draft abgeschlossen"
			: rolePhase
				? "Rollen bestätigen"
				: !ready
					? "Warte auf Captains"
					: turn
						? `${SIDE_LABEL[turn.side]} ${turn.kind === "ban" ? "bannt" : "pickt"}`
						: "";
	const showTimer = !closedReason && ready && !finished;
	return (
		<div className="draft-phase" aria-live="polite">
			<div className="draft-phase-bar" data-side={showTimer && !rolePhase ? turn?.side : undefined} aria-hidden="true">
				<span />
				<span />
			</div>
			<strong>{label}</strong>
			{showTimer ? (
				<span className="draft-timer" data-urgent={timer.remainingMs > 0 && timer.remainingMs <= 5000} aria-label={`${timer.label} Sekunden`}>
					{timer.label}
				</span>
			) : null}
			<div className="draft-steps" aria-label={`${Math.min(done, sequence.length)} von ${sequence.length} Draft-Schritten`}>
				{sequence.map((step, index) => (
					<i key={index} data-side={step.side} data-kind={step.kind} data-state={index < done ? "done" : index === done && ready ? "now" : "open"} />
				))}
			</div>
		</div>
	);
}

function PickLane({
	side,
	state,
	byName,
	currentTurn,
	preview,
	rolePhase,
	editable,
	swapFrom,
	onSwapStart,
	onMove,
}: {
	side: DraftSide;
	state: TournamentDraftState;
	byName: Map<string, ChampionEntry>;
	currentTurn: DraftTurn | null;
	preview: string;
	rolePhase: boolean;
	editable: boolean;
	swapFrom: { side: DraftSide; index: number } | null;
	onSwapStart: (value: { side: DraftSide; index: number } | null) => void;
	onMove: (side: DraftSide, from: number, to: number) => void;
}) {
	const [dropTarget, setDropTarget] = useState<number | null>(null);
	const withRoles = draftHasRoles(state);
	const picks = withRoles ? draftRoleOrder(state, side) : draftPicks(state, side);
	const actions = state.actions.filter((action) => action.side === side && action.kind === "pick");
	const activeIndex = currentTurn?.side === side && currentTurn.kind === "pick" ? picks.length : -1;
	const confirmed = Boolean(state.roles?.[side]?.confirmedAt);

	function onDrop(event: DragEvent, index: number) {
		event.preventDefault();
		setDropTarget(null);
		const from = Number(event.dataTransfer.getData("text/plain"));
		if (Number.isInteger(from)) onMove(side, from, index);
	}

	return (
		<div className="draft-lane" data-side={side} aria-label={`Picks ${SIDE_LABEL[side]}`}>
			{DRAFT_ROLES.map((role, index) => {
				const name = picks[index];
				const champion = name ? byName.get(name) : undefined;
				const auto = actions.find((action) => action.champion === name)?.auto;
				const previewChampion = !name && index === activeIndex && preview ? byName.get(preview) : undefined;
				const shown = champion ?? previewChampion;
				const content = (
					<>
						{shown ? <Image src={splashUrl(shown)} alt="" fill sizes="16rem" /> : <span className="draft-pick-empty">{index === activeIndex ? "Pickt…" : ""}</span>}
						{withRoles ? <span className="draft-role-chip">{DRAFT_ROLE_LABELS[role]}</span> : null}
						{auto === "random" ? <span className="draft-auto-chip">Zufall</span> : null}
						{shown ? <span className="draft-pick-name">{shown.name}</span> : null}
					</>
				);
				if (editable && name) {
					const pressed = swapFrom?.side === side && swapFrom.index === index;
					return (
						<button
							key={role}
							type="button"
							className="draft-pick"
							data-swappable="true"
							data-drop={dropTarget === index}
							aria-pressed={pressed}
							aria-label={`${name} als ${DRAFT_ROLE_LABELS[role]}${pressed ? ", ausgewählt zum Tauschen" : ""}`}
							draggable
							onDragStart={(event) => {
								event.dataTransfer.setData("text/plain", String(index));
								event.dataTransfer.effectAllowed = "move";
							}}
							onDragOver={(event) => {
								event.preventDefault();
								setDropTarget(index);
							}}
							onDragLeave={() => setDropTarget(null)}
							onDrop={(event) => onDrop(event, index)}
							onClick={() => (swapFrom?.side === side ? onMove(side, swapFrom.index, index) : onSwapStart({ side, index }))}
						>
							{content}
						</button>
					);
				}
				return (
					<div
						key={role}
						className="draft-pick"
						data-state={champion ? "locked" : previewChampion ? "preview" : index === activeIndex ? "active" : "open"}
						title={rolePhase && confirmed ? "Rollen bestätigt" : undefined}
					>
						{content}
					</div>
				);
			})}
		</div>
	);
}

function BanRow({
	side,
	state,
	byName,
	extra,
	currentTurn,
	preview,
}: {
	side: DraftSide;
	state: TournamentDraftState;
	byName: Map<string, ChampionEntry>;
	extra: boolean;
	currentTurn: DraftTurn | null;
	preview: string;
}) {
	const bans = draftBans(state, side);
	const firstPhase = DRAFT_FIRST_PHASE_BANS + (extra ? 1 : 0);
	const total = DRAFT_BANS_PER_SIDE + (extra ? 1 : 0);
	const activeIndex = currentTurn?.side === side && currentTurn.kind === "ban" ? bans.length : -1;
	const slot = (index: number) => {
		const action: DraftAction | undefined = bans[index];
		const champion = action && !action.skipped ? byName.get(action.champion) : index === activeIndex && preview ? byName.get(preview) : undefined;
		const state = action ? "locked" : champion ? "preview" : index === activeIndex ? "active" : "open";
		return (
			<div
				key={index}
				className="draft-ban"
				data-state={state}
				data-skipped={Boolean(action?.skipped)}
				title={action ? (action.skipped ? "Kein Ban" : action.champion) : undefined}
				aria-label={action ? (action.skipped ? "Kein Ban" : `Ban ${action.champion}`) : `Ban ${index + 1} offen`}
			>
				{champion ? <Image src={champion.imageUrl} alt="" fill sizes="2.5rem" /> : null}
			</div>
		);
	};
	return (
		<div className="draft-bans" data-side={side} aria-label={`Bans ${SIDE_LABEL[side]}`}>
			<div className="draft-ban-group">{Array.from({ length: firstPhase }, (_, index) => slot(index))}</div>
			<div className="draft-ban-group">{Array.from({ length: total - firstPhase }, (_, index) => slot(firstPhase + index))}</div>
		</div>
	);
}

function ActionButton({
	spectator,
	closedReason,
	editableSide,
	isOwner,
	ready,
	ownReady,
	turn,
	canDraft,
	selected,
	rolePhase,
	roleSide,
	roleConfirmed,
	finished,
	pending,
	onReady,
	onLock,
	onConfirmRoles,
}: {
	spectator: boolean;
	closedReason: string | null;
	editableSide: EditableSide;
	isOwner: boolean;
	ready: boolean;
	ownReady: boolean;
	turn: DraftTurn | null;
	canDraft: boolean;
	selected: string;
	rolePhase: boolean;
	roleSide: DraftSide | null;
	roleConfirmed: boolean;
	finished: boolean;
	pending: boolean;
	onReady: () => void;
	onLock: () => void;
	onConfirmRoles: (side: DraftSide) => void;
}) {
	const disabled = (label: string) => (
		<button type="button" className="draft-action-button" disabled>
			{label}
		</button>
	);
	if (closedReason) return disabled("Noch nicht freigegeben");
	if (finished) return disabled("Draft abgeschlossen");
	if (rolePhase) {
		if (spectator || !roleSide) return disabled("Rollenwahl läuft");
		if (roleConfirmed) return disabled(isOwner && !editableSide ? "Rollen bestätigt" : "Warte auf Gegner");
		return (
			<button type="button" className="draft-action-button" disabled={pending} onClick={() => onConfirmRoles(roleSide)}>
				{isOwner && !editableSide ? `Rollen ${SIDE_LABEL[roleSide]} bestätigen` : "Rollen bestätigen"}
			</button>
		);
	}
	if (!ready) {
		if (spectator || !editableSide) return disabled("Warte auf Captains");
		return (
			<button type="button" className="draft-action-button" disabled={ownReady || pending} onClick={onReady}>
				{ownReady ? "Warte auf Gegner" : "Ready"}
			</button>
		);
	}
	if (!turn) return disabled("Draft abgeschlossen");
	if (!canDraft) return disabled(turn.kind === "ban" ? "Gegner bannt…" : "Gegner pickt…");
	const label = !selected
		? turn.kind === "ban"
			? "Champion zum Bannen wählen"
			: "Champion wählen"
		: selected === NO_BAN
			? "Kein Ban bestätigen"
			: `${selected} ${turn.kind === "ban" ? "bannen" : "locken"}`;
	return (
		<button type="button" className="draft-action-button" data-kind={turn.kind} disabled={!selected || pending} onClick={onLock}>
			{label}
		</button>
	);
}

type TimerState = { label: string; remainingMs: number; expired: boolean };

/** `now` is null until the page is mounted, so server and first client render show the same full timer. */
function timerState(state: TournamentDraftState, now: number | null, rolePhase: boolean, complete: boolean): TimerState {
	const startedAt = rolePhase ? state.rolePhaseStartedAt : !complete && draftReady(state) ? state.currentTurnStartedAt : undefined;
	const seconds = rolePhase ? DRAFT_ROLE_SECONDS : DRAFT_TURN_SECONDS;
	if (!startedAt || now === null) return { label: String(seconds), remainingMs: seconds * 1000, expired: false };
	const elapsed = Math.max(0, now - new Date(startedAt).getTime());
	const remainingMs = Math.max(0, seconds * 1000 - elapsed);
	return { label: String(Math.ceil(remainingMs / 1000)), remainingMs, expired: elapsed >= (rolePhase ? DRAFT_ROLE_TOTAL_MS : DRAFT_TOTAL_MS) };
}

function timeoutMessage(next: TournamentDraftState, previous: TournamentDraftState): string {
	if (next.resetReason && next.actions.length === 0) return next.resetReason;
	if (next.rolesFinalizedAt && !previous.rolesFinalizedAt) return "Zeit abgelaufen: Die aktuelle Rollenverteilung gilt.";
	const added = next.actions[previous.actions.length];
	if (!added) return "";
	if (added.skipped) return "Zeit abgelaufen: kein Ban.";
	if (added.auto === "random") return `Zeit abgelaufen: ${added.champion} wurde zufällig gepickt.`;
	return `Zeit abgelaufen: ${added.champion} wurde automatisch gelockt.`;
}

function laneDetail(side: DraftSide, fearless: boolean, locks: FearlessLocks, match: ControlMatch) {
	if (fearless) {
		const count = Object.keys(locks[side]).length;
		return count === 0 ? "keine Fearless-Sperren" : `${count} gesperrt`;
	}
	const blueIsA = match.blueSide === "teamA";
	const pool =
		side === "teamA"
			? blueIsA
				? match.poolAssignment?.teamAPool
				: match.poolAssignment?.teamBPool
			: blueIsA
				? match.poolAssignment?.teamBPool
				: match.poolAssignment?.teamAPool;
	return pool ? `Pool ${compactPoolLabel(pool)}` : "noch kein Pool";
}

function championsForTurn(turn: DraftTurn, blueChampions: ChampionEntry[], redChampions: ChampionEntry[], fearless: boolean) {
	const own = turn.side === "teamA" ? blueChampions : redChampions;
	const enemy = turn.side === "teamA" ? redChampions : blueChampions;
	// Fearless drafts share one roster; pool drafts ban from the enemy pool.
	return turn.kind === "pick" || fearless ? own : enemy;
}

function uniqueChampions(champions: ChampionEntry[]) {
	return [...new Map(champions.map((champion) => [champion.name, champion])).values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function splashUrl(champion: ChampionPoolEntry) {
	return `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${champion.id}_0.jpg`;
}

function normalizeSearch(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]/g, "");
}

async function request(method: "POST" | "PATCH", body: Record<string, unknown>): Promise<DraftResponse> {
	try {
		const response = await fetch("/api/tournament/draft", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		const json = (await response.json().catch(() => null)) as DraftResponse;
		return response.ok ? json : { message: json?.message ?? "Aktion fehlgeschlagen." };
	} catch {
		return { message: "Keine Verbindung. Bitte erneut versuchen." };
	}
}

function post(body: Record<string, unknown>) {
	return request("POST", body);
}

async function fetchDraft(matchId: string): Promise<TournamentDraftState | null> {
	try {
		const response = await fetch(`/api/tournament/draft?matchId=${encodeURIComponent(matchId)}`, { cache: "no-store" });
		const json = (await response.json().catch(() => null)) as { draft?: TournamentDraftState } | null;
		return response.ok && json?.draft ? json.draft : null;
	} catch {
		return null;
	}
}
