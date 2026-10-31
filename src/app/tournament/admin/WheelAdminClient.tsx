"use client";

import { useState, useTransition } from "react";
import { azLetterPools } from "@/lib/tournament-data";
import { compactPoolLabel, remainingPoolsForTeam, type TournamentWheelState, type WheelMatchAssignment } from "@/lib/tournament-wheel-shared";
import { poolHistoryScopeForMatchId } from "@/lib/tournament-rules";
import type { AdminMatch } from "./MatchAdminClient";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ThemedSelect, type SelectOption } from "@/components/ThemedSelect";

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
	const aParts = /^([a-p])-r(\d+)-(\d+)$/.exec(a.id);
	const bParts = /^([a-p])-r(\d+)-(\d+)$/.exec(b.id);
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
	const groupMatches = matches.filter((match) => match.phase === "groups").sort(compareGroupMatchOrder);
	const playoffMatches = matches.filter((match) => match.phase === "playoffs");
	const earlyPlayoffMatches = playoffMatches.filter((match) => poolHistoryScopeForMatchId(match.id) === "early");
	const finalCycleMatches = playoffMatches.filter((match) => poolHistoryScopeForMatchId(match.id) === "finals");
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

	const teamARemaining = selectedMatch ? remainingPoolsForTeam(state, selectedMatch.teamA, poolHistoryScopeForMatchId(selectedMatch.id)) : [];
	const teamBRemaining = selectedMatch ? remainingPoolsForTeam(state, selectedMatch.teamB, poolHistoryScopeForMatchId(selectedMatch.id)) : [];

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
		<section className="rounded-[16px] border border-[var(--line-strong)] bg-[var(--admin-step)] p-5">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<div className="text-xs font-semibold text-[var(--muted)]">A-Z Wheel of Fortune</div>
					<h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Pools pro Match ziehen</h2>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
						Wähle ein Match aus. Das Wheel zieht getrennt für Team A und Team B je einen Pool, den das jeweilige Team noch nicht gespielt hat.
					</p>
				</div>
				<button
					type="button"
					onClick={() => setResetConfirmOpen(true)}
					disabled={isPending || spinning}
					className="rounded-[12px] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-xs font-semibold text-[var(--danger)] transition hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] disabled:opacity-60"
				>
					Wheel-Daten zurücksetzen
				</button>
			</div>

			<div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
				<label className="grid gap-2">
					<span className="text-xs font-semibold text-[var(--muted)]">Match</span>
					<ThemedSelect
						value={selectedMatchId}
						onChange={(value) => {
							setSelectedMatchId(value);
							setPreview(null);
							setMessage(null);
						}}
						ariaLabel="Match für die Pool-Ziehung"
						emptyMessage="Keine Matches für eine Pool-Ziehung verfügbar."
						options={[
							...matchOptions("Gruppenphase · fortlaufende Pool-Historie", groupMatches, state),
							...matchOptions("Frühe Playoffs · dieselbe Pool-Historie", earlyPlayoffMatches, state),
							...matchOptions("Finalblock · neuer Pool-Zyklus", finalCycleMatches, state),
						]}
					/>
				</label>
				<button
					type="button"
					onClick={spin}
					disabled={
						!selectedMatch || isPending || spinning || selectedMatchCompleted || hasActiveDrawForSelected || teamARemaining.length === 0 || teamBRemaining.length === 0
					}
					className="bg-[var(--accent)] rounded-[12px] px-6 py-4 text-sm font-semibold text-[var(--on-accent)] transition disabled:opacity-60"
				>
					{spinning ? "Dreht…" : selectedMatchCompleted ? "Match abgeschlossen" : hasActiveDrawForSelected ? "Pool bereits gezogen" : "Beide Pools ziehen"}
				</button>
			</div>

			{selectedMatch ? (
				<p className="mt-3 text-xs font-medium leading-5 text-[var(--muted)]">
					{poolHistoryScopeForMatchId(selectedMatch.id) === "finals"
						? "Finalblock: Für beide Teams startet hier eine frische Pool-Historie."
						: "Fortlaufend: Bereits gespielte Pools bleiben für dieses Team weiterhin ausgeschlossen."}
				</p>
			) : null}

			{selectedMatchCompleted || hasActiveDrawForSelected ? (
				<p className="mt-3 text-sm font-medium text-[var(--muted)]">
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

			{message ? (
				<div role="status" className="mt-4 rounded-[12px] border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-3 text-sm font-medium text-[var(--accent)]">
					{message}
				</div>
			) : null}

			{state.history.length > 0 ? (
				<div className="mt-5 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4">
					<div className="text-xs font-semibold text-[var(--muted)]">Verlauf</div>
					<div className="mt-3 grid gap-2">
						{state.history.slice(0, 8).map((entry) => (
							<div
								key={`${entry.matchId}-${entry.spunAt}`}
								className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] px-3 py-2 text-xs font-medium text-[var(--muted)]"
							>
								<span className="text-[var(--accent)]">{entry.matchId}</span>
								{"·"}
								{entry.teamAName}: {compactPoolLabel(entry.teamAPool)}
								{"vs"}
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

function matchOptions(group: string, matches: AdminMatch[], state: TournamentWheelState): SelectOption[] {
	return matches.map((match) => {
		const teamsResolved = isResolvableTeamName(match.teamA) && isResolvableTeamName(match.teamB);
		const status = !teamsResolved
			? "wartet auf Teams"
			: match.status === "Finished" || state.completedMatchIds.includes(match.id)
				? "abgeschlossen"
				: state.currentAssignment?.matchId === match.id
					? "Pool gezogen"
					: "bereit";
		return { value: match.id, label: `${match.id}: ${match.teamA} vs ${match.teamB}`, description: status, group, disabled: !teamsResolved };
	});
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
		<div className="rounded-[16px] border border-[var(--line)] bg-[var(--admin-inset)] p-4">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-xs font-semibold text-[var(--muted)]">{side}</div>
					<div className="mt-1 text-xl font-semibold text-[var(--text)]">{teamName}</div>
				</div>
				<div className="rounded-full border border-[var(--line)] bg-[var(--admin-step)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">{remaining} übrig</div>
			</div>

			<div className="mt-4 grid place-items-center">
				<div className="relative grid size-56 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--admin-inset)]">
					<div className="absolute inset-1 rounded-full blur-xl" />
					<div
						className="absolute inset-3 rounded-full border border-[var(--line)] bg-[conic-gradient(from_0deg,#bef264_0_30deg,#67e8f9_30deg_60deg,#fcd34d_60deg_90deg,#86efac_90deg_120deg,#fda4af_120deg_150deg,#a7f3d0_150deg_180deg,#bef264_180deg_210deg,#67e8f9_210deg_240deg,#fcd34d_240deg_270deg,#86efac_270deg_300deg,#fda4af_300deg_330deg,#a7f3d0_330deg_360deg)] transition-transform duration-[1900ms] ease-out"
						style={{ transform: `rotate(${rotation}deg)` }}
					>
						{azLetterPools.map((letterPool, index) => {
							const angle = index * SEGMENT_DEGREES + SEGMENT_DEGREES / 2;
							const uprightFlip = angle > 90 && angle < 270 ? 180 : 0;
							return (
								<span
									key={letterPool}
									className="absolute left-1/2 top-1/2 grid h-8 w-12 origin-center place-items-center rounded-full border border-[var(--line)] bg-[var(--muted)] text-xs font-semibold text-[var(--accent)]"
									style={{
										transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-78px) rotate(${-angle + uprightFlip}deg)`,
									}}
								>
									{compactPoolLabel(letterPool)}
								</span>
							);
						})}
						<div className="absolute inset-[5.4rem] rounded-full border border-[var(--line-strong)] bg-[var(--admin-step)]" />
					</div>
					<div className="absolute -right-1 top-1/2 z-10 h-0 w-0 -translate-y-1/2 border-y-[10px] border-r-[18px] border-y-transparent border-r-[var(--text)]" />
					<div className="relative z-10 grid size-24 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--muted)] text-center">
						<span className="px-2 text-2xl font-semibold text-[var(--accent)]">{spinning ? "…" : pool ? compactPoolLabel(pool) : "?"}</span>
					</div>
				</div>
			</div>
		</div>
	);
}
