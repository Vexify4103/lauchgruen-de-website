"use client";

import { useState, useTransition } from "react";
import { azLetterPools } from "@/lib/tournament-data";
import { compactPoolLabel, remainingPoolsForTeam, type TournamentWheelState, type WheelMatchAssignment } from "@/lib/tournament-wheel-shared";
import { poolHistoryScopeForMatchPhase } from "@/lib/tournament-rules";
import type { AdminMatch } from "./MatchAdminClient";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const SPIN_DURATION_MS = 1900;
const SEGMENT_DEGREES = 360 / azLetterPools.length;

function responseMessage(json: unknown, fallback: string) {
	if (json && typeof json === "object" && "message" in json) {
		const message = (json as { message?: unknown }).message;
		if (typeof message === "string") return message;
	}
	return fallback;
}

function isResolvableTeamName(name: string) {
	return !/^(seed|winner|loser|tbd|-)($| )/i.test(name.trim());
}

function normalizeDegrees(degrees: number) {
	return ((degrees % 360) + 360) % 360;
}

function landingRotationForPool(pool: string, previousRotation: number) {
	const index = Math.max(0, azLetterPools.indexOf(pool));
	const segmentCenter = index * SEGMENT_DEGREES + SEGMENT_DEGREES / 2;
	const pointerAngle = 90;
	const target = normalizeDegrees(pointerAngle - segmentCenter);
	const delta = normalizeDegrees(target - normalizeDegrees(previousRotation));

	return previousRotation + 360 * 5 + delta;
}

function compareGroupMatchOrder(a: AdminMatch, b: AdminMatch) {
	const aParts = /^([ab])-r(\d+)-(\d+)$/.exec(a.id);
	const bParts = /^([ab])-r(\d+)-(\d+)$/.exec(b.id);
	if (!aParts || !bParts) return a.id.localeCompare(b.id);

	const roundDifference = Number(aParts[2]) - Number(bParts[2]);
	if (roundDifference !== 0) return roundDifference;

	const groupDifference = aParts[1].localeCompare(bParts[1]);
	if (groupDifference !== 0) return groupDifference;

	return Number(aParts[3]) - Number(bParts[3]);
}

function assignmentForMatch(state: TournamentWheelState, matchId: string): WheelMatchAssignment | null {
	return state.currentAssignment?.matchId === matchId ? state.currentAssignment : (state.history.find((entry) => entry.matchId === matchId) ?? null);
}

export function WheelAdminClient({ initialState, matches }: { initialState: TournamentWheelState; matches: AdminMatch[] }) {
	const playableMatches = matches.filter((match) => isResolvableTeamName(match.teamA) && isResolvableTeamName(match.teamB));
	const groupMatches = playableMatches.filter((match) => match.phase === "groups").sort(compareGroupMatchOrder);
	const playoffMatches = playableMatches.filter((match) => match.phase === "playoffs");
	const [state, setState] = useState(initialState);
	const [selectedMatchId, setSelectedMatchId] = useState(playableMatches[0]?.id ?? "");
	const [spinning, setSpinning] = useState(false);
	const [preview, setPreview] = useState<WheelMatchAssignment | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [teamARotation, setTeamARotation] = useState(0);
	const [teamBRotation, setTeamBRotation] = useState(0);
	const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const selectedMatch = playableMatches.find((match) => match.id === selectedMatchId) ?? null;
	const selectedAssignment = selectedMatch ? assignmentForMatch(state, selectedMatch.id) : null;
	const display = preview ?? selectedAssignment;
	const hasActiveDrawForSelected = Boolean(selectedMatch && selectedAssignment);
	const selectedMatchCompleted = Boolean(selectedMatch && (selectedMatch.status === "Finished" || state.completedMatchIds.includes(selectedMatch.id)));

	const teamARemaining = selectedMatch ? remainingPoolsForTeam(state, selectedMatch.teamA, poolHistoryScopeForMatchPhase(selectedMatch.phase)) : [];
	const teamBRemaining = selectedMatch ? remainingPoolsForTeam(state, selectedMatch.teamB, poolHistoryScopeForMatchPhase(selectedMatch.phase)) : [];

	function spin() {
		if (!selectedMatch || isPending || spinning) return;
		setMessage(null);
		setPreview(null);
		setSpinning(true);
		setTeamARotation((rotation) => rotation + 720);
		setTeamBRotation((rotation) => rotation + 720);

		startTransition(async () => {
			const response = await fetch("/api/tournament/wheel", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "spin",
					matchId: selectedMatch.id,
					teamAName: selectedMatch.teamA,
					teamBName: selectedMatch.teamB,
				}),
			});
			const json = (await response.json().catch(() => null)) as TournamentWheelState | { message?: string } | null;

			if (!response.ok || !json || !("usedPoolsByTeam" in json) || !json.currentAssignment) {
				setMessage(responseMessage(json, "Wheel konnte nicht gedreht werden."));
				setSpinning(false);
				return;
			}

			const assignment = json.currentAssignment;
			setTeamARotation((rotation) => landingRotationForPool(assignment.teamAPool, rotation));
			setTeamBRotation((rotation) => landingRotationForPool(assignment.teamBPool, rotation));

			window.setTimeout(() => {
				setPreview(assignment);
				setState(json);
				setMessage(`${assignment.teamAName}: ${compactPoolLabel(assignment.teamAPool)} · ${assignment.teamBName}: ${compactPoolLabel(assignment.teamBPool)}`);
				setSpinning(false);
			}, SPIN_DURATION_MS);
		});
	}

	function reset() {
		if (isPending || spinning) return;
		setResetConfirmOpen(false);
		setMessage(null);
		setPreview(null);
		setTeamARotation(0);
		setTeamBRotation(0);
		startTransition(async () => {
			const response = await fetch("/api/tournament/wheel", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "reset" }),
			});
			const json = (await response.json().catch(() => null)) as TournamentWheelState | { message?: string } | null;
			if (!response.ok || !json || !("usedPoolsByTeam" in json)) {
				setMessage(responseMessage(json, "Reset fehlgeschlagen."));
				return;
			}
			setState(json);
			setMessage("Wheel zurückgesetzt.");
		});
	}

	return (
		<section className="rounded-[2rem] border border-lime-200/12 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">A-Z Wheel of Fortune</div>
					<h2 className="mt-2 text-2xl font-black text-emerald-50">Pools pro Match ziehen</h2>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/64">
						Wähle ein Match aus. Das Wheel zieht getrennt für Team A und Team B je einen Pool, den das jeweilige Team noch nicht gespielt hat.
					</p>
				</div>
				<button
					type="button"
					onClick={() => setResetConfirmOpen(true)}
					disabled={isPending || spinning}
					className="rounded-2xl border border-red-300/24 bg-red-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-red-100 transition hover:border-red-200/44 disabled:opacity-60"
				>
					Wheel-Daten zurücksetzen
				</button>
			</div>

			<div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
				<label className="grid gap-2">
					<span className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">Match</span>
					<select
						value={selectedMatchId}
						onChange={(event) => {
							setSelectedMatchId(event.target.value);
							setPreview(null);
							setMessage(null);
						}}
						className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-sm font-bold text-emerald-50 outline-none"
					>
						<MatchOptions label="Gruppenphase" matches={groupMatches} state={state} />
						<MatchOptions label="Playoffs · neuer Pool-Zyklus" matches={playoffMatches} state={state} />
					</select>
				</label>
				<button
					type="button"
					onClick={spin}
					disabled={
						!selectedMatch || isPending || spinning || selectedMatchCompleted || hasActiveDrawForSelected || teamARemaining.length === 0 || teamBRemaining.length === 0
					}
					className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5 disabled:opacity-60"
				>
					{spinning ? "Dreht..." : selectedMatchCompleted ? "Match abgeschlossen" : hasActiveDrawForSelected ? "Pool bereits gezogen" : "Beide Pools ziehen"}
				</button>
			</div>

			{selectedMatchCompleted || hasActiveDrawForSelected ? (
				<p className="mt-3 text-sm font-bold text-emerald-100/52">
					{selectedMatchCompleted
						? "Dieses Match ist abgeschlossen. Pools werden nach dem Speichern als gespielt gezählt."
						: "Für dieses Match wurde bereits gezogen. Speichere das Match als Finished, damit die Pools in die Team-Historie wandern."}
				</p>
			) : null}

			{selectedMatch ? (
				<div className="mt-6 grid gap-4 lg:grid-cols-2">
					<TeamWheel
						side="Team A"
						teamName={selectedMatch.teamA}
						pool={display?.matchId === selectedMatch.id ? display.teamAPool : null}
						remaining={teamARemaining.length}
						rotation={teamARotation}
						spinning={spinning}
					/>
					<TeamWheel
						side="Team B"
						teamName={selectedMatch.teamB}
						pool={display?.matchId === selectedMatch.id ? display.teamBPool : null}
						remaining={teamBRemaining.length}
						rotation={teamBRotation}
						spinning={spinning}
					/>
				</div>
			) : null}

			{message ? <div className="mt-4 rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">{message}</div> : null}

			{state.history.length > 0 ? (
				<div className="mt-5 rounded-2xl border border-white/8 bg-black/18 p-4">
					<div className="text-[10px] font-black uppercase tracking-[0.24em] text-lime-200/56">Verlauf</div>
					<div className="mt-3 grid gap-2">
						{state.history.slice(0, 8).map((entry) => (
							<div
								key={`${entry.matchId}-${entry.spunAt}`}
								className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs font-bold text-emerald-100/72"
							>
								<span className="text-lime-100">{entry.matchId}</span>
								{" · "}
								{entry.teamAName}: {compactPoolLabel(entry.teamAPool)}
								{" vs "}
								{entry.teamBName}: {compactPoolLabel(entry.teamBPool)}
							</div>
						))}
					</div>
				</div>
			) : null}
			<ConfirmDialog
				open={resetConfirmOpen}
				title="Wheel-Daten zurücksetzen?"
				description="Alle gezogenen Pools und Team-Historien des gesamten Turniers werden gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
				confirmLabel="Alles zurücksetzen"
				cancelLabel="Abbrechen"
				tone="danger"
				onCancel={() => setResetConfirmOpen(false)}
				onConfirm={reset}
			/>
		</section>
	);
}

function MatchOptions({ label, matches, state }: { label: string; matches: AdminMatch[]; state: TournamentWheelState }) {
	if (matches.length === 0) return null;
	return (
		<optgroup label={label}>
			{matches.map((match) => (
				<option key={match.id} value={match.id} className="bg-emerald-950">
					{match.id}: {match.teamA} vs {match.teamB}
					{match.status === "Finished" || state.completedMatchIds.includes(match.id)
						? " · abgeschlossen"
						: state.currentAssignment?.matchId === match.id
							? " · Pool gezogen"
							: ""}
				</option>
			))}
		</optgroup>
	);
}

function TeamWheel({
	side,
	teamName,
	pool,
	remaining,
	rotation,
	spinning,
}: {
	side: string;
	teamName: string;
	pool: string | null;
	remaining: number;
	rotation: number;
	spinning: boolean;
}) {
	return (
		<div className="rounded-[1.7rem] border border-white/10 bg-black/18 p-4">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-[10px] font-black uppercase tracking-[0.24em] text-lime-200/58">{side}</div>
					<div className="mt-1 text-xl font-black text-emerald-50">{teamName}</div>
				</div>
				<div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black text-emerald-100/56">{remaining} übrig</div>
			</div>

			<div className="mt-4 grid place-items-center">
				<div className="relative grid size-56 place-items-center rounded-full border border-lime-200/20 bg-black/28 shadow-xl shadow-black/30">
					<div className="absolute inset-1 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(190,242,100,0.22),transparent_58%)] blur-xl" />
					<div
						className="absolute inset-3 rounded-full border border-white/10 bg-[conic-gradient(from_0deg,#bef264_0_30deg,#67e8f9_30deg_60deg,#fcd34d_60deg_90deg,#86efac_90deg_120deg,#fda4af_120deg_150deg,#a7f3d0_150deg_180deg,#bef264_180deg_210deg,#67e8f9_210deg_240deg,#fcd34d_240deg_270deg,#86efac_270deg_300deg,#fda4af_300deg_330deg,#a7f3d0_330deg_360deg)] shadow-[inset_0_0_30px_rgba(6,78,59,0.45)] transition-transform duration-[1900ms] ease-out"
						style={{ transform: `rotate(${rotation}deg)` }}
					>
						{azLetterPools.map((letterPool, index) => {
							const angle = index * SEGMENT_DEGREES + SEGMENT_DEGREES / 2;
							const uprightFlip = angle > 90 && angle < 270 ? 180 : 0;
							return (
								<span
									key={letterPool}
									className="absolute left-1/2 top-1/2 grid h-8 w-12 origin-center place-items-center rounded-full border border-emerald-950/20 bg-emerald-950/72 text-[10px] font-black tracking-[0.08em] text-lime-50 shadow-lg shadow-black/20"
									style={{
										transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-78px) rotate(${-angle + uprightFlip}deg)`,
									}}
								>
									{compactPoolLabel(letterPool)}
								</span>
							);
						})}
						<div className="absolute inset-[5.4rem] rounded-full border border-emerald-950/35 bg-emerald-950/35" />
					</div>
					<div className="absolute -right-1 top-1/2 z-10 h-0 w-0 -translate-y-1/2 border-y-[10px] border-r-[18px] border-y-transparent border-r-emerald-50" />
					<div className="relative z-10 grid size-24 place-items-center rounded-full border border-lime-200/24 bg-emerald-950/92 text-center shadow-xl shadow-black/40">
						<span className="px-2 text-2xl font-black text-lime-100">{spinning ? "..." : pool ? compactPoolLabel(pool) : "?"}</span>
					</div>
				</div>
			</div>
		</div>
	);
}
