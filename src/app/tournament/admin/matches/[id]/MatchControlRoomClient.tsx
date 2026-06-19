"use client";

import { TournamentLink as Link } from "../../../TournamentLink";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { ControlMatch } from "@/lib/match-control";
import type { ChampionPool } from "@/lib/champion-pools";
import type { TournamentTeam } from "@/lib/tournament-data";
import type { RosterSnapshot } from "@/lib/roster";
import { createDraftSequence, draftComplete, draftReady, type DraftSide, type TournamentDraftState } from "@/lib/tournament-draft-shared";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { ThemedSelect } from "@/components/ThemedSelect";
import { formatGameDuration, parseGameDuration } from "@/lib/match-duration";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";

function opggMultiSearchUrl(riotIds: string[]) {
	const uniqueIds = [...new Set(riotIds.filter(Boolean))];
	const params = new URLSearchParams({
		summoners: uniqueIds.length > 0 ? `${uniqueIds.join(", ")},` : "",
	});
	return `https://op.gg/lol/multisearch/euw?${params.toString()}`;
}

function teamRiotIds(team: TournamentTeam | null) {
	return team?.players.map((player) => player.riotId) ?? [];
}

function draftedPicksForMatchTeams(draft: TournamentDraftState, blueSide: "teamA" | "teamB", sequence: ReturnType<typeof createDraftSequence>) {
	if (!draftComplete(draft, sequence)) {
		return { teamA: [] as string[], teamB: [] as string[] };
	}
	const bluePicks = draft.actions.filter((action) => action.kind === "pick" && action.side === "teamA").map((action) => action.champion);
	const redPicks = draft.actions.filter((action) => action.kind === "pick" && action.side === "teamB").map((action) => action.champion);
	return blueSide === "teamA" ? { teamA: bluePicks, teamB: redPicks } : { teamA: redPicks, teamB: bluePicks };
}

export function MatchControlRoomClient({
	match,
	teamA,
	teamB,
	pools,
	draft,
	extraBanSide,
	roster,
	draftEnabled,
	parallelMatches,
	initialVersion,
	initialRosterVersion,
}: {
	match: ControlMatch;
	teamA: TournamentTeam | null;
	teamB: TournamentTeam | null;
	pools: ChampionPool[];
	draft: TournamentDraftState;
	extraBanSide: DraftSide | null;
	roster: RosterSnapshot;
	draftEnabled: boolean;
	parallelMatches: ControlMatch[];
	initialVersion: number;
	initialRosterVersion: number;
}) {
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [version, setVersion] = useState(initialVersion);
	const [rosterVersion, setRosterVersion] = useState(initialRosterVersion);
	const draftSequence = createDraftSequence(extraBanSide);
	const draftedPicks = draftedPicksForMatchTeams(draft, match.blueSide, draftSequence);
	const [scoreA, setScoreA] = useState(match.scoreA?.toString() ?? "");
	const [scoreB, setScoreB] = useState(match.scoreB?.toString() ?? "");
	const [gameDuration, setGameDuration] = useState(formatGameDuration(match.gameDurationSeconds));
	const [status, setStatus] = useState(match.status ?? "Scheduled");
	const [blueSide, setBlueSide] = useState<"teamA" | "teamB">(match.blueSide);
	const [isCasted, setIsCasted] = useState(Boolean(match.isCasted));
	const [teamAChampions, setTeamAChampions] = useState(match.teamAChampions?.length ? match.teamAChampions : draftedPicks.teamA);
	const [teamBChampions, setTeamBChampions] = useState(match.teamBChampions?.length ? match.teamBChampions : draftedPicks.teamB);
	const [adminNote, setAdminNote] = useState(match.adminNote ?? "");
	const [message, setMessage] = useState("");
	const [coinTossing, setCoinTossing] = useState(false);
	const [coinWinner, setCoinWinner] = useState<"teamA" | "teamB">(match.blueSide);
	const [resetDraftConfirmOpen, setResetDraftConfirmOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [savedMatchValues, setSavedMatchValues] = useState(
		JSON.stringify({
			scoreA: match.scoreA?.toString() ?? "",
			scoreB: match.scoreB?.toString() ?? "",
			gameDuration: formatGameDuration(match.gameDurationSeconds),
			blueSide: match.blueSide,
			isCasted: Boolean(match.isCasted),
			teamAChampions: match.teamAChampions?.length ? match.teamAChampions : draftedPicks.teamA,
			teamBChampions: match.teamBChampions?.length ? match.teamBChampions : draftedPicks.teamB,
			adminNote: match.adminNote ?? "",
		})
	);
	const currentMatchValues = JSON.stringify({
		scoreA,
		scoreB,
		gameDuration,
		blueSide,
		isCasted,
		teamAChampions,
		teamBChampions,
		adminNote,
	});

	useUnsavedChanges({
		dirty: currentMatchValues !== savedMatchValues,
		label: `Match ${match.id}`,
		save: persistMatch,
	});

	const canDraw = Boolean(teamA && teamB && !match.poolAssignment && status !== "Finished");
	const canPrepare = Boolean(teamA && teamB && status === "Scheduled" && !match.poolAssignment);
	const poolA = match.poolAssignment?.teamAPool ?? null;
	const poolB = match.poolAssignment?.teamBPool ?? null;
	const allowedA = poolA ? (pools.find((pool) => pool.pool === poolA)?.champions ?? []) : [];
	const allowedB = poolB ? (pools.find((pool) => pool.pool === poolB)?.champions ?? []) : [];

	function drawPools() {
		if (!teamA || !teamB || isPending) return;
		setMessage("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/wheel", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "spin",
					matchId: match.id,
					teamAName: teamA.name,
					teamBName: teamB.name,
				}),
			});
			const json = (await response.json().catch(() => null)) as { message?: string } | null;
			if (!response.ok) {
				setMessage(json?.message ?? "Pools konnten nicht gezogen werden.");
				return;
			}
			setMessage("Pools gezogen.");
			router.refresh();
		});
	}

	function prepareMatch() {
		if (!canPrepare || isPending) return;
		setMessage("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/matches/start", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: match.id }),
			});
			const json = (await response.json().catch(() => null)) as { message?: string; drewPools?: boolean } | null;
			if (!response.ok) {
				setMessage(json?.message ?? "Match konnte nicht vorbereitet werden.");
				return;
			}
			setStatus("Scheduled");
			setMessage(json?.drewPools ? "Match vorbereitet und Pools gezogen." : "Match ist vorbereitet.");
			router.refresh();
		});
	}

	function resetDraft() {
		if (isPending) return;
		setResetDraftConfirmOpen(false);

		setMessage("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/draft", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					matchId: match.id,
					action: "reset",
				}),
			});
			const json = (await response.json().catch(() => null)) as { message?: string } | null;
			if (!response.ok) {
				setMessage(json?.message ?? "Draft konnte nicht zurückgesetzt werden.");
				return;
			}

			setTeamAChampions([]);
			setTeamBChampions([]);
			setStatus("Scheduled");
			setMessage("Draft vollständig zurückgesetzt. Beide Captains müssen erneut ready klicken.");
			router.refresh();
		});
	}

	async function persistMatch(): Promise<boolean> {
		setMessage("");
		const response = await fetch("/api/tournament/matches", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				id: match.id,
				expectedVersion: version,
				scoreA,
				scoreB,
				gameDuration,
				teamAChampions,
				teamBChampions,
				blueSide,
				isCasted,
				adminNote,
			}),
		});
		const json = (await response.json().catch(() => null)) as {
			message?: string;
			match?: { status?: ControlMatch["status"] };
			version?: number;
		} | null;
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return false;
			}
			setMessage(json?.message ?? "Match konnte nicht gespeichert werden.");
			return false;
		}
		if (json?.version !== undefined) setVersion(json.version);
		if (json?.match?.status) {
			setStatus(json.match.status);
		}
		setSavedMatchValues(currentMatchValues);
		setMessage(json?.match?.status === "Finished" ? "Ergebnis gespeichert. Match ist abgeschlossen." : "Match gespeichert.");
		router.refresh();
		return true;
	}

	function saveMatch(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		startTransition(async () => {
			await persistMatch();
		});
	}

	function tossCoin() {
		if (coinTossing) return;
		setMessage("");
		setCoinTossing(true);
		const winner = Math.random() < 0.5 ? "teamA" : "teamB";
		window.setTimeout(() => {
			setCoinWinner(winner);
			setCoinTossing(false);
			setMessage(`${winner === "teamA" ? match.teamALabel : match.teamBLabel} gewinnt den Coin Toss und darf Blue oder Red Side wählen.`);
		}, 1400);
	}

	return (
		<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]">
			<section className="grid content-start gap-5">
				{parallelMatches.length > 0 ? (
					<div className="rounded-2xl border border-cyan-200/16 bg-cyan-300/[0.06] p-4">
						<div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/58">Läuft parallel</div>
						<div className="mt-3 grid gap-2 sm:grid-cols-2">
							{parallelMatches.map((parallel) => (
								<Link
									key={parallel.id}
									href={`/tournament/admin/matches/${parallel.id}`}
									className="rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm font-black text-emerald-50 transition hover:border-cyan-200/30"
								>
									{parallel.teamALabel} vs {parallel.teamBLabel}
								</Link>
							))}
						</div>
					</div>
				) : null}
				<div className="rounded-[2rem] border border-lime-200/12 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
					<div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
						<div className="min-w-0">
							<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
								{match.phase === "groups" ? "Gruppenphase" : "Playoffs"} · {match.id}
							</div>
							<h1 className="mt-2 text-4xl font-black tracking-tight text-emerald-50">
								{match.teamALabel} vs {match.teamBLabel}
							</h1>
							<p className="mt-3 text-sm font-bold text-emerald-100/54">
								{match.round} · {match.time}
							</p>
						</div>
						<div className="flex w-full flex-wrap gap-2 md:w-auto md:shrink-0 md:justify-end">
							<Link
								href="/tournament/admin"
								className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.045] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/72 transition hover:border-lime-200/26 hover:text-lime-100 md:flex-none"
							>
								Zurück
							</Link>
							<Link
								href={`/tournament/champ-select/${match.id}`}
								className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-lime-200/24 bg-lime-200/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-lime-50 transition hover:border-lime-200/48 md:flex-none"
							>
								Draft steuern
							</Link>
							{draftEnabled ? (
								<Link
									href={`/tournament/champ-select/${match.id}/spectate`}
									className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-sky-200/16 bg-sky-300/8 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-sky-100 transition hover:border-sky-200/34 md:flex-none"
								>
									Zuschaueransicht
								</Link>
							) : null}
							<button
								type="button"
								onClick={() => setResetDraftConfirmOpen(true)}
								disabled={isPending}
								className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-red-200/18 bg-red-500/[0.07] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-red-100/76 transition hover:border-red-200/36 hover:text-red-50 disabled:opacity-50 md:flex-none"
							>
								Draft zurücksetzen
							</button>
						</div>
					</div>
				</div>

				<div className="grid gap-5 xl:grid-cols-2">
					<TeamPanel side="Team A" team={teamA} pool={poolA} fallback={match.teamALabel} />
					<TeamPanel side="Team B" team={teamB} pool={poolB} fallback={match.teamBLabel} />
				</div>

				{match.poolAssignment ? (
					<details className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-4 shadow-xl shadow-black/18">
						<summary className="cursor-pointer text-xs font-black uppercase tracking-[0.22em] text-lime-200/64">Gespielte Champions eintragen</summary>
						<div className="mt-4 grid gap-4 xl:grid-cols-2">
							<ChampionPicker
								title={`${match.teamALabel} · gespielte Champions`}
								champions={allowedA}
								selected={teamAChampions}
								onChange={setTeamAChampions}
								embedded
							/>
							<ChampionPicker
								title={`${match.teamBLabel} · gespielte Champions`}
								champions={allowedB}
								selected={teamBChampions}
								onChange={setTeamBChampions}
								embedded
							/>
						</div>
					</details>
				) : null}

				<details className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-4 shadow-xl shadow-black/18">
					<summary className="cursor-pointer text-xs font-black uppercase tracking-[0.22em] text-lime-200/64">Match-Zusammenfassung und Draft</summary>
					<div className="mt-4">
						<DraftSummary match={match} draft={draft} sequence={draftSequence} teamAChampions={teamAChampions} teamBChampions={teamBChampions} embedded />
					</div>
				</details>
			</section>

			<aside className="grid content-start gap-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
				<LobbyChecklist
					poolsDrawn={Boolean(match.poolAssignment)}
					captainsReady={draftReady(draft)}
					draftComplete={draftComplete(draft, draftSequence)}
					scoreSaved={scoreA !== "" && scoreB !== "" && (match.phase !== "groups" || parseGameDuration(gameDuration) !== null)}
					matchFinished={status === "Finished"}
				/>

				<button
					type="button"
					onClick={prepareMatch}
					disabled={!canPrepare || isPending}
					className="rounded-[1.4rem] bg-gradient-to-r from-amber-200 via-lime-200 to-cyan-200 px-5 py-4 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{match.poolAssignment ? "Match vorbereitet" : "Match vorbereiten"}
				</button>

				<div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 shadow-xl shadow-black/24">
					<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">A-Z Pools</div>
					{match.poolAssignment ? (
						<div className="mt-4 grid gap-3">
							<div className="rounded-2xl border border-sky-200/16 bg-sky-300/8 p-3">
								<div className="text-xs font-bold text-emerald-100/54">Blue Side</div>
								<div className="mt-1 text-lg font-black text-sky-100">{blueSide === "teamA" ? match.teamALabel : match.teamBLabel}</div>
							</div>
							<PoolBadge label={match.poolAssignment.teamAName} pool={match.poolAssignment.teamAPool} />
							<PoolBadge label={match.poolAssignment.teamBName} pool={match.poolAssignment.teamBPool} />
						</div>
					) : (
						<p className="mt-3 text-sm leading-6 text-emerald-100/56">Noch keine Pools gezogen. Ziehe sie hier direkt für dieses Match.</p>
					)}
					<button
						type="button"
						onClick={drawPools}
						disabled={!canDraw || isPending}
						className="mt-4 w-full rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{match.poolAssignment ? "Pools vorhanden" : "Pools ziehen"}
					</button>
				</div>

				<form
					onSubmit={saveMatch}
					className="order-first rounded-[1.6rem] border border-lime-200/16 bg-gradient-to-br from-lime-200/[0.075] via-white/[0.045] to-cyan-300/[0.04] p-4 shadow-xl shadow-black/24"
				>
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/58">Matchsteuerung</div>
							<div className="mt-1 text-lg font-black text-emerald-50">Ergebnis eintragen</div>
						</div>
						<span className="rounded-full border border-white/10 bg-black/18 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-100/48">
							{status}
						</span>
					</div>
					<div className="mt-3 grid grid-cols-2 gap-2">
						<ScoreField label={match.teamALabel} value={scoreA} onChange={setScoreA} />
						<ScoreField label={match.teamBLabel} value={scoreB} onChange={setScoreB} />
						<label className="col-span-2 grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-xl border border-white/8 bg-black/16 p-2.5">
							<span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/52">Spielzeit</span>
							<input
								value={gameDuration}
								onChange={(event) => setGameDuration(event.target.value)}
								inputMode="numeric"
								placeholder="mm:ss"
								pattern="\d{1,3}:[0-5]\d"
								className="w-full rounded-lg border border-white/10 bg-black/24 px-2 py-2 text-center text-sm font-black text-emerald-50 outline-none placeholder:text-emerald-100/24 focus:border-lime-200/40"
							/>
						</label>
					</div>
					<div className="mt-3 grid grid-cols-2 gap-2">
						<div className="grid gap-1.5">
							<span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/52">Status (automatisch)</span>
							<div className="flex min-h-11 items-center rounded-xl border border-white/10 bg-black/24 px-3 text-sm font-black text-emerald-100/72">{status}</div>
						</div>
						<label className="grid gap-1.5">
							<span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/52">Blue Side</span>
							<ThemedSelect
								name="blueSide"
								value={blueSide}
								onChange={(value) => setBlueSide(value as "teamA" | "teamB")}
								options={[
									{ value: "teamA", label: match.teamALabel },
									{ value: "teamB", label: match.teamBLabel },
								]}
							/>
						</label>
						<label className="col-span-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/16 p-3 transition hover:border-cyan-200/24">
							<span>
								<span className="block text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/62">Live gecastet</span>
								<span className="mt-1 block text-xs font-bold leading-5 text-emerald-100/54">Zeigt dieses Match im Zeitplan als Cast-Match an.</span>
							</span>
							<span className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-white/10 bg-black/30 p-1">
								<input type="checkbox" checked={isCasted} onChange={(event) => setIsCasted(event.target.checked)} className="peer sr-only" />
								<span className="h-5 w-5 rounded-full bg-emerald-100/42 transition peer-checked:translate-x-5 peer-checked:bg-cyan-200 peer-checked:shadow-lg peer-checked:shadow-cyan-300/30" />
							</span>
						</label>
					</div>
					<div className="mt-3">
						<CoinTossButton
							teamALabel={match.teamALabel}
							teamBLabel={match.teamBLabel}
							winner={coinWinner}
							tossing={coinTossing}
							disabled={isPending}
							onToss={tossCoin}
							compact
						/>
					</div>
					<details className="mt-3 rounded-xl border border-white/8 bg-black/14 p-3">
						<summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/52">Admin-Notiz und Hinweise</summary>
						<textarea
							value={adminNote}
							onChange={(event) => setAdminNote(event.target.value)}
							rows={2}
							placeholder="Optional: Warum wurde das Ergebnis geändert?"
							className="mt-3 w-full rounded-xl border border-white/10 bg-black/24 px-3 py-2.5 text-sm font-bold text-emerald-50 outline-none transition placeholder:text-emerald-100/34 focus:border-lime-200/40"
						/>
						<ProtectionWarnings
							hasPools={Boolean(match.poolAssignment)}
							draftReady={draftReady(draft)}
							draftComplete={draftComplete(draft, draftSequence)}
							blueSideChanged={blueSide !== match.blueSide}
							status={status}
						/>
					</details>
					<button
						type="submit"
						disabled={isPending}
						className="mt-3 w-full rounded-xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-lg shadow-lime-300/10 transition hover:bg-lime-100 disabled:opacity-50"
					>
						{isPending ? "Wird gespeichert..." : "Match speichern"}
					</button>
				</form>

				{message ? <div className="rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">{message}</div> : null}

				<details className="rounded-[1.4rem] border border-amber-200/14 bg-amber-200/[0.035] p-3">
					<summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/68">Notfall: Ersatzspieler</summary>
					<div className="mt-3">
						<EmergencySubPanel match={match} roster={roster} version={rosterVersion} onVersionChange={setRosterVersion} onMessage={setMessage} embedded />
					</div>
				</details>
			</aside>
			<ConfirmDialog
				open={resetDraftConfirmOpen}
				title="Draft vollständig zurücksetzen?"
				description="Picks, Bans, Ready-Status, Hover, Timer und automatisch übernommene Champions werden gelöscht. Pools und Ergebnisfelder bleiben erhalten."
				confirmLabel="Draft zurücksetzen"
				cancelLabel="Abbrechen"
				tone="danger"
				onCancel={() => setResetDraftConfirmOpen(false)}
				onConfirm={resetDraft}
			/>
		</div>
	);
}

function ProtectionWarnings({
	hasPools,
	draftReady,
	draftComplete,
	blueSideChanged,
	status,
}: {
	hasPools: boolean;
	draftReady: boolean;
	draftComplete: boolean;
	blueSideChanged: boolean;
	status: string;
}) {
	const warnings = [
		hasPools && status !== "Finished" ? "Pools sind bereits gezogen. Ein erneuter Spin ist absichtlich blockiert, bis das Match beendet ist." : "",
		blueSideChanged && (draftReady || draftComplete) ? "Blue Side wurde geändert, aber der Draft hat schon begonnen. Draft danach ggf. zurücksetzen." : "",
		draftComplete && status !== "Finished" ? "Draft ist abgeschlossen und das Match live. Ein gültiges Ergebnis schließt es automatisch ab." : "",
	].filter(Boolean);
	if (warnings.length === 0) return null;

	return (
		<div className="mt-4 rounded-2xl border border-amber-200/18 bg-amber-200/8 p-3">
			<div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/70">Schutz-Hinweise</div>
			<div className="mt-2 grid gap-2">
				{warnings.map((warning) => (
					<p key={warning} className="text-xs font-bold leading-5 text-amber-50/78">
						{warning}
					</p>
				))}
			</div>
		</div>
	);
}

function DraftSummary({
	match,
	draft,
	sequence,
	teamAChampions,
	teamBChampions,
	embedded = false,
}: {
	match: ControlMatch;
	draft: TournamentDraftState;
	sequence: ReturnType<typeof createDraftSequence>;
	teamAChampions: string[];
	teamBChampions: string[];
	embedded?: boolean;
}) {
	const bans = draft.actions.filter((action) => action.kind === "ban");
	const picks = draft.actions.filter((action) => action.kind === "pick");
	const complete = draftComplete(draft, sequence);
	const hasContent = draft.actions.length > 0 || teamAChampions.length > 0 || teamBChampions.length > 0 || match.scoreA !== undefined || match.scoreB !== undefined;

	if (!hasContent) {
		return (
			<div className={embedded ? "" : "rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 shadow-xl shadow-black/20"}>
				<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">Match-Zusammenfassung</div>
				<p className="mt-3 text-sm leading-6 text-emerald-100/52">
					Sobald Pools, Draft oder Score vorhanden sind, entsteht hier automatisch eine kompakte Zusammenfassung für Orga, Discord oder Stream.
				</p>
			</div>
		);
	}

	return (
		<div className={embedded ? "" : "rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20"}>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">Match-Zusammenfassung</div>
					<h2 className="mt-2 text-2xl font-black text-emerald-50">
						{match.teamALabel} vs {match.teamBLabel}
					</h2>
				</div>
				<span className="rounded-full border border-white/10 bg-black/18 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/58">
					{complete ? "Draft abgeschlossen" : `Draft ${draft.actions.length}/${sequence.length}`}
				</span>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-4">
				<SummaryTile label="Score" value={match.scoreA !== undefined && match.scoreB !== undefined ? `${match.scoreA}:${match.scoreB}` : "Noch offen"} />
				<SummaryTile label="Spielzeit" value={match.gameDurationSeconds !== undefined ? formatGameDuration(match.gameDurationSeconds) : "Noch offen"} />
				<SummaryTile label="Bans" value={bans.length > 0 ? bans.map((action) => action.champion).join(", ") : "Noch keine"} />
				<SummaryTile label="Picks" value={picks.length > 0 ? picks.map((action) => action.champion).join(", ") : "Noch keine"} />
			</div>

			<div className="mt-3 grid gap-3 md:grid-cols-2">
				<SummaryTile label={`${match.teamALabel} gespielt`} value={teamAChampions.length > 0 ? teamAChampions.join(", ") : "Noch nicht eingetragen"} />
				<SummaryTile label={`${match.teamBLabel} gespielt`} value={teamBChampions.length > 0 ? teamBChampions.join(", ") : "Noch nicht eingetragen"} />
			</div>
		</div>
	);
}

function SummaryTile({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-white/8 bg-black/18 p-4">
			<div className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-200/52">{label}</div>
			<div className="mt-2 text-sm font-bold leading-6 text-emerald-100/78">{value}</div>
		</div>
	);
}

function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	return (
		<label className="grid gap-2 rounded-xl border border-white/8 bg-black/16 p-2.5">
			<span className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/52" title={label}>
				{label}
			</span>
			<input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				type="number"
				min="0"
				className="w-full rounded-lg border border-white/10 bg-black/24 px-3 py-2 text-center text-lg font-black text-emerald-50 outline-none focus:border-lime-200/40"
			/>
		</label>
	);
}

function LobbyChecklist({
	poolsDrawn,
	captainsReady,
	draftComplete,
	scoreSaved,
	matchFinished,
}: {
	poolsDrawn: boolean;
	captainsReady: boolean;
	draftComplete: boolean;
	scoreSaved: boolean;
	matchFinished: boolean;
}) {
	const items = [
		{ label: "Pools drawn", ok: poolsDrawn },
		{ label: "Captains ready", ok: captainsReady },
		{ label: "Draft complete", ok: draftComplete },
		{ label: "Score saved", ok: scoreSaved },
		{ label: "Match finished", ok: matchFinished },
	];
	return (
		<div className="rounded-[1.4rem] border border-lime-200/12 bg-lime-200/[0.045] p-3 shadow-xl shadow-black/20">
			<div className="flex items-center justify-between gap-3">
				<div className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-200/58">Lobby Checklist</div>
				<div className="rounded-full border border-white/10 bg-black/18 px-2.5 py-1 text-[10px] font-black text-lime-100">
					{items.filter((item) => item.ok).length}/{items.length}
				</div>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-1.5">
				{items.map((item) => (
					<div
						key={item.label}
						className={`flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-[10px] font-bold ${
							item.ok ? "border-lime-200/18 bg-lime-200/8 text-lime-50" : "border-white/8 bg-black/18 text-emerald-100/46"
						}`}
					>
						<span className="truncate">{item.label}</span>
						<span className={`size-2 shrink-0 rounded-full ${item.ok ? "bg-lime-200" : "bg-white/16"}`} />
					</div>
				))}
			</div>
		</div>
	);
}

function CoinTossButton({
	teamALabel,
	teamBLabel,
	winner,
	tossing,
	disabled,
	onToss,
	compact = false,
}: {
	teamALabel: string;
	teamBLabel: string;
	winner: "teamA" | "teamB";
	tossing: boolean;
	disabled: boolean;
	onToss: () => void;
	compact?: boolean;
}) {
	const winnerLabel = winner === "teamA" ? teamALabel : teamBLabel;
	const finalRotation = winner === "teamA" ? "rotateY(0deg)" : "rotateY(180deg)";
	return (
		<div className={`rounded-xl border border-amber-200/16 bg-amber-200/[0.055] ${compact ? "p-2.5" : "p-3"}`}>
			<div className="flex items-center gap-3">
				<div className={`relative grid shrink-0 place-items-center ${compact ? "size-10" : "size-14"}`} style={{ perspective: "500px" }}>
					<div
						className={`relative rounded-full shadow-xl shadow-amber-300/20 ${compact ? "size-9" : "size-12"} ${
							tossing
								? winner === "teamA"
									? "animate-[coin-flip-a_1400ms_cubic-bezier(0.2,0.8,0.2,1)]"
									: "animate-[coin-flip-b_1400ms_cubic-bezier(0.2,0.8,0.2,1)]"
								: ""
						}`}
						style={{
							transform: tossing ? undefined : finalRotation,
							transformStyle: "preserve-3d",
						}}
					>
						<CoinFace label="A" />
						<CoinFace label="B" back />
					</div>
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/70">Coin Toss</div>
					<div className="mt-1 truncate text-sm font-black text-emerald-50">{tossing ? "Münze fliegt..." : `${winnerLabel} darf Side wählen`}</div>
				</div>
			</div>
			<button
				type="button"
				disabled={disabled || tossing}
				onClick={onToss}
				className={`${compact ? "mt-2 py-2" : "mt-3 py-2.5"} w-full rounded-lg border border-amber-200/24 bg-amber-200/12 px-4 text-[10px] font-black uppercase tracking-[0.16em] text-amber-50 transition hover:border-amber-200/42 disabled:cursor-not-allowed disabled:opacity-45`}
			>
				{tossing ? "Toss läuft..." : "Coin Toss starten"}
			</button>
			<style>{`
        @keyframes coin-flip-a {
          0% { transform: rotateY(0deg) translateY(0) scale(1); }
          20% { transform: rotateY(540deg) translateY(-16px) scale(1.08); }
          42% { transform: rotateY(1080deg) translateY(-6px) scale(1.04); }
          64% { transform: rotateY(1620deg) translateY(-12px) scale(1.06); }
          84% { transform: rotateY(2160deg) translateY(0) scale(1); }
          100% { transform: rotateY(2520deg) translateY(0) scale(1); }
        }
        @keyframes coin-flip-b {
          0% { transform: rotateY(0deg) translateY(0) scale(1); }
          20% { transform: rotateY(540deg) translateY(-16px) scale(1.08); }
          42% { transform: rotateY(1080deg) translateY(-6px) scale(1.04); }
          64% { transform: rotateY(1620deg) translateY(-12px) scale(1.06); }
          84% { transform: rotateY(2160deg) translateY(0) scale(1); }
          100% { transform: rotateY(2700deg) translateY(0) scale(1); }
        }
      `}</style>
		</div>
	);
}

function CoinFace({ label, back }: { label: "A" | "B"; back?: boolean }) {
	return (
		<div
			className={`absolute inset-0 grid place-items-center rounded-full border text-sm font-black text-emerald-950 ${
				label === "A"
					? "border-amber-100/40 bg-gradient-to-br from-amber-100 via-lime-200 to-emerald-300"
					: "border-sky-100/40 bg-gradient-to-br from-sky-100 via-cyan-200 to-lime-200"
			}`}
			style={{
				backfaceVisibility: "hidden",
				transform: back ? "rotateY(180deg)" : "rotateY(0deg)",
			}}
		>
			{label}
		</div>
	);
}

function ChampionPicker({
	title,
	champions,
	selected,
	onChange,
	embedded = false,
}: {
	title: string;
	champions: ChampionPool["champions"];
	selected: string[];
	onChange: (next: string[]) => void;
	embedded?: boolean;
}) {
	const selectedSet = new Set(selected);
	return (
		<div className={embedded ? "rounded-xl border border-white/8 bg-black/14 p-3" : "rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20"}>
			<div className="flex items-center justify-between gap-3">
				<div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/58">{title}</div>
				<div className="text-xs font-black text-emerald-100/44">{selected.length} gewählt</div>
			</div>
			{champions.length === 0 ? (
				<p className="mt-3 text-sm italic text-emerald-100/42">Ziehe zuerst Pools, damit Champions auswählbar sind.</p>
			) : (
				<div className="mt-4 grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
					{champions.map((champion) => {
						const active = selectedSet.has(champion.name);
						return (
							<label
								key={champion.id}
								className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${
									active ? "border-lime-200/34 bg-lime-200/12 text-lime-50" : "border-white/8 bg-black/18 text-emerald-100/64 hover:border-lime-200/20"
								}`}
							>
								<input
									type="checkbox"
									checked={active}
									onChange={(event) => {
										onChange(event.target.checked ? [...selected, champion.name] : selected.filter((name) => name !== champion.name));
									}}
									className="accent-lime-200"
								/>
								<span className="truncate">{champion.name}</span>
							</label>
						);
					})}
				</div>
			)}
		</div>
	);
}

function PoolBadge({ label, pool }: { label: string; pool: string }) {
	return (
		<div className="rounded-2xl border border-lime-200/14 bg-lime-200/8 p-3">
			<div className="truncate text-xs font-bold text-emerald-100/54">{label}</div>
			<div className="mt-1 text-3xl font-black text-lime-100">{compactPoolLabel(pool)}</div>
		</div>
	);
}

function EmergencySubPanel({
	match,
	roster,
	version,
	onVersionChange,
	onMessage,
	embedded = false,
}: {
	match: ControlMatch;
	roster: RosterSnapshot;
	version: number;
	onVersionChange: (version: number) => void;
	onMessage: (message: string) => void;
	embedded?: boolean;
}) {
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [teamKey, setTeamKey] = useState("");
	const [incomingDiscordId, setIncomingDiscordId] = useState("");
	const [outgoingDiscordId, setOutgoingDiscordId] = useState("");
	const [role, setRole] = useState("Sub");
	const [isPending, startTransition] = useTransition();
	const matchTeams = roster.teams.filter((team) => team.name === match.teamAName || team.name === match.teamBName);
	const selectedTeam = roster.teams.find((team) => team.key === teamKey) ?? matchTeams[0] ?? null;
	const incomingOptions = roster.applicants.filter((applicant) => !selectedTeam?.players.some((player) => player.discordId === applicant.discordId));
	const substituteDirty = Boolean(teamKey || incomingDiscordId || outgoingDiscordId || role !== "Sub");

	async function persistSubstitute(): Promise<boolean> {
		const targetTeamKey = teamKey || selectedTeam?.key || "";
		if (!targetTeamKey || !incomingDiscordId) {
			onMessage("Bitte Team und Ersatzspieler auswählen.");
			return false;
		}

		const response = await fetch("/api/tournament/substitute", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				teamKey: targetTeamKey,
				incomingDiscordId,
				outgoingDiscordId: outgoingDiscordId || undefined,
				role,
				expectedVersion: version,
			}),
		});
		const json = (await response.json().catch(() => null)) as { message?: string; version?: number } | null;
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return false;
			}
			onMessage(json?.message ?? "Substitute konnte nicht gespeichert werden.");
			return false;
		}
		if (json?.version !== undefined) onVersionChange(json.version);
		onMessage("Emergency Substitute gespeichert.");
		setTeamKey("");
		setIncomingDiscordId("");
		setOutgoingDiscordId("");
		setRole("Sub");
		router.refresh();
		return true;
	}

	useUnsavedChanges({
		dirty: substituteDirty,
		label: "Emergency Substitute",
		save: persistSubstitute,
	});

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		startTransition(async () => {
			await persistSubstitute();
		});
	}

	if (matchTeams.length === 0) return null;

	return (
		<form onSubmit={submit} className={embedded ? "" : "rounded-[2rem] border border-amber-200/16 bg-amber-200/[0.055] p-5 shadow-xl shadow-black/20"}>
			<div className="text-xs font-black uppercase tracking-[0.24em] text-amber-100/72">Emergency Substitute</div>
			<p className="mt-2 text-xs leading-5 text-amber-50/62">Tauscht einen Spieler im aktiven Roster, ohne Match-Historie oder Scores anzufassen.</p>
			<div className="mt-4 grid gap-3">
				<label className="grid gap-2">
					<span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/52">Team</span>
					<ThemedSelect
						name="subTeam"
						value={teamKey || selectedTeam?.key || ""}
						onChange={(value) => {
							setTeamKey(value);
							setOutgoingDiscordId("");
						}}
						options={matchTeams.map((team) => ({ value: team.key, label: team.name }))}
					/>
				</label>
				<label className="grid gap-2">
					<span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/52">Incoming</span>
					<ThemedSelect
						name="incoming"
						value={incomingDiscordId}
						onChange={setIncomingDiscordId}
						options={[
							{ value: "", label: "Spieler wählen" },
							...incomingOptions.map((applicant) => ({
								value: applicant.discordId,
								label: `${applicant.displayName} · ${applicant.riotId}`,
							})),
						]}
					/>
				</label>
				<label className="grid gap-2">
					<span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/52">Optional raus</span>
					<ThemedSelect
						name="outgoing"
						value={outgoingDiscordId}
						onChange={setOutgoingDiscordId}
						options={[
							{ value: "", label: "Niemanden entfernen" },
							...(selectedTeam?.players ?? []).map((player) => ({
								value: player.discordId,
								label: `${player.role ?? "Fill"} · ${player.riotId}`,
							})),
						]}
					/>
				</label>
				<label className="grid gap-2">
					<span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/52">Rolle</span>
					<ThemedSelect
						name="role"
						value={role}
						onChange={setRole}
						options={["Sub", "Top", "Jungle", "Mid", "Bot", "Support", "Fill"].map((value) => ({
							value,
							label: value,
						}))}
					/>
				</label>
			</div>
			<button
				type="submit"
				disabled={isPending}
				className="mt-4 w-full rounded-2xl border border-amber-200/24 bg-amber-200/12 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-amber-50 transition hover:border-amber-200/42 disabled:opacity-50"
			>
				Substitute speichern
			</button>
		</form>
	);
}

function TeamPanel({ side, team, pool, fallback }: { side: string; team: TournamentTeam | null; pool: string | null; fallback: string }) {
	const riotIds = teamRiotIds(team);
	return (
		<article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">{side}</div>
					<h2 className="mt-2 break-words text-3xl font-black text-emerald-50">{team?.name ?? fallback}</h2>
					{pool ? (
						<div className="mt-2 inline-flex rounded-full border border-lime-200/20 bg-lime-200/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-lime-50">
							Pool {compactPoolLabel(pool)}
						</div>
					) : null}
				</div>
				{riotIds.length > 0 ? (
					<a
						href={opggMultiSearchUrl(riotIds)}
						target="_blank"
						rel="noreferrer"
						className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-100/72 hover:text-lime-100"
					>
						OP.GG
					</a>
				) : null}
			</div>

			{team ? (
				<details className="mt-4 rounded-xl border border-white/8 bg-black/14 p-3">
					<summary className="flex cursor-pointer items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/58">
						<span>Roster anzeigen</span>
						<span>{team.players.length} Spieler</span>
					</summary>
					<div className="mt-3 grid gap-2">
						{team.players.map((player) => (
							<div key={player.riotId} className="grid gap-2 rounded-xl border border-white/8 bg-black/20 p-3 sm:grid-cols-[5.5rem_1fr_auto] sm:items-center">
								<div className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/58">{player.role}</div>
								<div className="min-w-0">
									<div className="truncate text-sm font-black text-emerald-50">{player.name}</div>
									<div className="truncate text-xs text-emerald-100/46">{player.riotId}</div>
								</div>
								<div className="flex gap-2">
									<a
										href={player.opggUrl}
										target="_blank"
										rel="noreferrer"
										className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100/64 hover:text-lime-100"
									>
										OP.GG
									</a>
									<a
										href={player.dpmUrl}
										target="_blank"
										rel="noreferrer"
										className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100/64 hover:text-lime-100"
									>
										DPM
									</a>
								</div>
							</div>
						))}
					</div>
				</details>
			) : (
				<p className="mt-4 rounded-2xl border border-amber-200/16 bg-amber-200/8 p-4 text-sm text-amber-50/76">
					Dieses Team ist noch nicht aufgelöst. Sobald Seeds/Bracket-Slots feststehen, erscheint hier das Roster.
				</p>
			)}
		</article>
	);
}
