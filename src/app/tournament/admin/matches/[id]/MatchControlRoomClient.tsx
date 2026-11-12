"use client";

import { RoleIcon } from "@/components/RoleIcon";
import { TournamentLink as Link } from "../../../TournamentLink";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { ControlMatch } from "@/lib/match-control";
import type { ChampionPool } from "@/lib/champion-pools";
import type { TournamentTeam } from "@/lib/tournament-data";
import type { RosterSnapshot } from "@/lib/roster";
import { createDraftSequence, draftComplete, draftReady, draftRoleOrder, type DraftSide, type TournamentDraftState } from "@/lib/tournament-draft-shared";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { ThemedSelect } from "@/components/ThemedSelect";
import { ThemedNumberInput } from "@/components/ThemedNumberInput";
import { formatGameDuration, parseGameDuration } from "@/lib/match-duration";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { ReplayReviewPanel, type ReplayPrefill } from "./ReplayReviewPanel";

function opggMultiSearchUrl(riotIds: string[]) {
	const uniqueIds = [...new Set(riotIds.filter(Boolean))];
	const params = new URLSearchParams({
		summoners: uniqueIds.length > 0 ? `${uniqueIds.join(", ")},` : "",
	});
	return `https://op.gg/lol/multisearch/euw?${params.toString()}`;
}

function teamRiotIds(team: TournamentTeam | null) {
	return team?.players.map((player) => player.scoutRiotId ?? player.riotId) ?? [];
}

function draftedPicksForMatchTeams(draft: TournamentDraftState, blueSide: "teamA" | "teamB", sequence: ReturnType<typeof createDraftSequence>) {
	if (!draftComplete(draft, sequence)) {
		return { teamA: [] as string[], teamB: [] as string[] };
	}
	const bluePicks = draftRoleOrder(draft, "teamA");
	const redPicks = draftRoleOrder(draft, "teamB");
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
	flow = "pools",
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
	/** rolls: Ultimate Bravery builds · pools: A-Z pools drawn per match · fearless: released full-roster draft */
	flow?: "rolls" | "pools" | "fearless";
}) {
	const ultimateBravery = flow === "rolls";
	const poolFlow = flow === "pools";
	const releaseFlow = flow !== "pools";
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
	const [seriesPrefill, setSeriesPrefill] = useState<(ReplayPrefill & { nonce: number }) | null>(null);

	function applyReplay(prefill: ReplayPrefill) {
		// Bo1 fills the result form, a series fills the next game; staff still save it themselves.
		if (match.bestOf > 1) {
			setSeriesPrefill({ ...prefill, nonce: Date.now() });
			return;
		}
		setScoreA(prefill.winner === "teamA" ? "1" : "0");
		setScoreB(prefill.winner === "teamB" ? "1" : "0");
		setGameDuration(formatGameDuration(prefill.durationSeconds));
	}
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

	const canDraw = Boolean(poolFlow && teamA && teamB && !match.poolAssignment && status !== "Finished");
	const canPrepare = Boolean(teamA && teamB && status === "Scheduled" && (releaseFlow || !match.poolAssignment));
	const canRetryNotifications = Boolean(releaseFlow && teamA && teamB && (status === "Live" || status === "Pending"));
	const releaseLabel = ultimateBravery ? "Rolls" : "Champ Select";
	const poolA = match.poolAssignment?.teamAPool ?? null;
	const poolB = match.poolAssignment?.teamBPool ?? null;
	const everyChampion = flow === "fearless" ? pools.flatMap((pool) => pool.champions).sort((a, b) => a.name.localeCompare(b.name, "de")) : [];
	const allowedA = flow === "fearless" ? everyChampion : poolA ? (pools.find((pool) => pool.pool === poolA)?.champions ?? []) : [];
	const allowedB = flow === "fearless" ? everyChampion : poolB ? (pools.find((pool) => pool.pool === poolB)?.champions ?? []) : [];

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

	function prepareMatch(action: "start" | "notify" = "start") {
		if ((action === "start" ? !canPrepare : !canRetryNotifications) || isPending) return;
		setMessage("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/matches/start", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: match.id, action }),
			});
			const json = (await response.json().catch(() => null)) as { message?: string; drewPools?: boolean } | null;
			if (!response.ok) {
				setMessage(json?.message ?? "Match konnte nicht vorbereitet werden.");
				return;
			}
			if (action === "start") setStatus(releaseFlow ? "Pending" : "Scheduled");
			setMessage(
				releaseFlow
					? (json?.message ?? `${releaseLabel} für beide Teams freigegeben.`)
					: json?.drewPools
						? "Match vorbereitet und Pools gezogen."
						: "Match ist vorbereitet."
			);
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

	const statusLabel = STATUS_LABEL[status] ?? status;
	const phaseLabel = ultimateBravery ? "Ultimate Bravery" : match.phase === "groups" ? "Tag 1" : match.phase === "play-in" ? "Play-in" : "Playoffs";

	return (
		<div className="grid gap-5">
			<header className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--admin-step)] p-5">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<p className="m-0 text-xs font-medium text-[var(--muted)]">
							{phaseLabel} · {match.round}
							{match.bestOf > 1 ? ` · Bo${match.bestOf}` : ""}
							<span className="font-mono"> · {match.id}</span>
						</p>
						<h1 className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 break-words font-display text-3xl font-medium tracking-tight text-[var(--text)] sm:text-4xl">
							<span>{match.teamALabel}</span>
							<span className="text-lg text-[var(--muted)]">vs</span>
							<span>{match.teamBLabel}</span>
						</h1>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<span
							className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold ${
								status === "Live"
									? "bg-[color-mix(in_srgb,var(--live)_16%,transparent)] text-[var(--live)]"
									: status === "Finished"
										? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
										: "bg-[var(--admin-inset)] text-[var(--muted)]"
							}`}
						>
							{status === "Live" ? <i aria-hidden className="size-1.5 rounded-full bg-[var(--live)]" /> : null}
							{statusLabel}
						</span>
						<Link
							href={ultimateBravery ? `/tournament/matches/${match.id}` : `/tournament/champ-select/${match.id}`}
							className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--admin-step)] px-3 text-xs font-semibold text-[var(--text)] transition hover:border-[var(--line-strong)]"
						>
							{ultimateBravery ? "Spieleransicht" : "Draft steuern"}
						</Link>
						{draftEnabled && !ultimateBravery ? (
							<Link
								href={`/tournament/champ-select/${match.id}/spectate`}
								className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--admin-step)] px-3 text-xs font-semibold text-[var(--text)] transition hover:border-[var(--line-strong)]"
							>
								Zuschauer
							</Link>
						) : null}
						{!ultimateBravery ? (
							<button
								type="button"
								onClick={() => setResetDraftConfirmOpen(true)}
								disabled={isPending}
								className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--danger)] disabled:opacity-50"
							>
								Draft zurücksetzen
							</button>
						) : null}
					</div>
				</div>
				{!ultimateBravery ? (
					<MatchStepper
						steps={[
							{ label: poolFlow ? "Pools gezogen" : "Freigegeben", done: poolFlow ? Boolean(match.poolAssignment) : status !== "Scheduled" },
							{ label: "Captains ready", done: draftReady(draft) },
							{ label: "Draft fertig", done: draftComplete(draft, draftSequence) },
							{
								label: "Ergebnis",
								done: scoreA !== "" && scoreB !== "" && (match.phase !== "groups" || match.bestOf > 1 || parseGameDuration(gameDuration) !== null),
							},
							{ label: "Beendet", done: status === "Finished" },
						]}
					/>
				) : null}
				{parallelMatches.length > 0 ? (
					<p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
						<span>Parallel:</span>
						{parallelMatches.map((parallel) => (
							<Link key={parallel.id} href={`/tournament/admin/matches/${parallel.id}`} className="font-medium text-[var(--text)] hover:text-[var(--accent)]">
								{parallel.teamATag ?? parallel.teamALabel} vs {parallel.teamBTag ?? parallel.teamBLabel}
								{parallel.status === "Live" ? <span className="ml-1 text-[var(--live)]">live</span> : null}
							</Link>
						))}
					</p>
				) : null}
			</header>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
				<section className="grid min-w-0 content-start gap-4" aria-label="Teams, Replays und Draft">
					<div className="grid gap-4 2xl:grid-cols-2">
						<TeamPanel tag={match.teamATag ?? null} team={teamA} pool={poolA} fallback={match.teamALabel} blue={blueSide === "teamA"} />
						<TeamPanel tag={match.teamBTag ?? null} team={teamB} pool={poolB} fallback={match.teamBLabel} blue={blueSide === "teamB"} />
					</div>
					{(poolFlow && match.poolAssignment) || flow === "fearless" ? (
						<details className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] p-4">
							<summary className="cursor-pointer text-xs font-semibold text-[var(--muted)]">
								{flow === "fearless" ? "Gespielte Champions korrigieren (Fearless-Historie)" : "Gespielte Champions eintragen"}
							</summary>
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

					{!ultimateBravery || status === "Scheduled" ? (
						<details className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] p-4">
							<summary className="cursor-pointer text-xs font-semibold text-[var(--muted)]">Match-Zusammenfassung und Draft</summary>
							<div className="mt-4">
								<DraftSummary match={match} draft={draft} sequence={draftSequence} teamAChampions={teamAChampions} teamBChampions={teamBChampions} embedded />
							</div>
						</details>
					) : null}
					<details className="rounded-xl border border-[color-mix(in_srgb,var(--amber)_30%,var(--line))] bg-[var(--admin-step)] p-4">
						<summary className="cursor-pointer text-xs font-semibold text-[var(--amber)]">Notfall: Ersatzspieler</summary>
						<div className="mt-3">
							<EmergencySubPanel match={match} roster={roster} version={rosterVersion} onVersionChange={setRosterVersion} onMessage={setMessage} embedded />
						</div>
					</details>
				</section>

				<aside className="grid min-w-0 content-start gap-4" aria-label="Match steuern">
					{releaseFlow ? (
						status === "Finished" ? null : (
							<div className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] p-4">
								<div className="text-sm font-semibold text-[var(--text)]">Discord Match Call</div>
								<p className="mt-2 text-xs leading-5 text-[var(--muted)]">
									{status === "Scheduled"
										? ultimateBravery
											? "Gibt die persönlichen Rolls frei und benachrichtigt beide Teamrollen in ihren privaten Textkanälen."
											: "Öffnet den Champ Select für beide Captains und benachrichtigt beide Teamrollen in ihren privaten Textkanälen."
										: "Prüft beide Teamnachrichten erneut. Bereits erfolgreich versandte Nachrichten werden nicht doppelt gepostet."}
								</p>
								<button
									type="button"
									onClick={() => prepareMatch(status === "Scheduled" ? "start" : "notify")}
									disabled={isPending || (status === "Scheduled" ? !canPrepare : !canRetryNotifications)}
									className="bg-[var(--accent)] mt-3 w-full rounded-lg px-5 py-3 text-xs font-semibold text-[var(--on-accent)] transition disabled:cursor-not-allowed disabled:opacity-50"
								>
									{isPending ? "Wird eingereiht…" : status === "Scheduled" ? `${releaseLabel} freigeben & Teams pingen` : "Teamnachrichten erneut prüfen"}
								</button>
							</div>
						)
					) : (
						<button
							type="button"
							onClick={() => prepareMatch("start")}
							disabled={!canPrepare || isPending}
							className="bg-[var(--accent)] rounded-[12px] px-5 py-4 text-xs font-semibold text-[var(--on-accent)] transition disabled:cursor-not-allowed disabled:opacity-50"
						>
							{match.poolAssignment ? "Match vorbereitet" : "Match vorbereiten"}
						</button>
					)}

					{poolFlow ? (
						<div className="rounded-[16px] border border-[var(--line)] bg-[var(--admin-inset)] p-5">
							<div className="text-xs font-semibold text-[var(--muted)]">A-Z Pools</div>
							{match.poolAssignment ? (
								<div className="mt-4 grid gap-3">
									<div className="rounded-[12px] border border-[var(--line)] bg-[var(--admin-step)] p-3">
										<div className="text-xs font-medium text-[var(--muted)]">Blue Side</div>
										<div className="mt-1 text-lg font-semibold text-[var(--text)]">{blueSide === "teamA" ? match.teamALabel : match.teamBLabel}</div>
									</div>
									<PoolBadge label={match.poolAssignment.teamAName} pool={match.poolAssignment.teamAPool} />
									<PoolBadge label={match.poolAssignment.teamBName} pool={match.poolAssignment.teamBPool} />
								</div>
							) : (
								<p className="mt-3 text-sm leading-6 text-[var(--muted)]">Noch keine Pools gezogen. Ziehe sie hier direkt für dieses Match.</p>
							)}
							<button
								type="button"
								onClick={drawPools}
								disabled={!canDraw || isPending}
								className="bg-[var(--accent)] mt-4 w-full rounded-[12px] px-5 py-3 text-xs font-semibold text-[var(--on-accent)] transition disabled:cursor-not-allowed disabled:opacity-50"
							>
								{match.poolAssignment ? "Pools vorhanden" : "Pools ziehen"}
							</button>
						</div>
					) : null}

					{match.bestOf > 1 ? (
						<SeriesPanel
							key={seriesPrefill?.nonce ?? "series"}
							match={match}
							version={version}
							onVersion={setVersion}
							onMessage={setMessage}
							busy={isPending}
							onDone={() => router.refresh()}
							prefill={seriesPrefill?.gameNumber === match.games.length + 1 ? seriesPrefill : null}
						/>
					) : null}
					<form onSubmit={saveMatch} className="rounded-xl border border-[var(--line-strong)] bg-[var(--admin-step)] p-4">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="mt-1 text-lg font-semibold text-[var(--text)]">{match.bestOf > 1 ? `Serienstand (Bo${match.bestOf})` : "Ergebnis eintragen"}</div>
							</div>
						</div>
						<div className="mt-3 grid grid-cols-2 gap-2">
							<ScoreField
								label={match.teamALabel}
								value={match.games.length ? String(match.scoreA ?? 0) : scoreA}
								onChange={setScoreA}
								disabled={match.games.length > 0}
							/>
							<ScoreField
								label={match.teamBLabel}
								value={match.games.length ? String(match.scoreB ?? 0) : scoreB}
								onChange={setScoreB}
								disabled={match.games.length > 0}
							/>
							{match.bestOf > 1 ? (
								<p className="col-span-2 text-xs leading-5 text-[var(--muted)]">
									{match.games.length
										? "Der Serienstand kommt aus den erfassten Spielen oben."
										: `Erfasse die Spiele oben einzeln, oder trage hier direkt das Endergebnis ein (zum Beispiel ${Math.floor(match.bestOf / 2) + 1}:${Math.floor(match.bestOf / 2)}).`}
								</p>
							) : null}
							<label
								className={`col-span-2 grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-2.5 ${match.bestOf > 1 ? "hidden" : ""}`}
							>
								<span className="text-xs font-semibold text-[var(--muted)]">Spielzeit</span>
								<input
									name="game-duration"
									autoComplete="off"
									value={gameDuration}
									onChange={(event) => setGameDuration(event.target.value)}
									inputMode="numeric"
									placeholder="mm:ss…"
									pattern="\d{1,3}:[0-5]\d"
									className="w-full rounded-lg border border-[var(--line)] bg-[var(--admin-inset)] px-2 py-2 text-center text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
								/>
							</label>
						</div>
						<div className="mt-3 grid grid-cols-2 gap-2">
							{match.sideSelectionTeamName ? (
								<div className="col-span-2 rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2.5">
									<div className="text-xs font-semibold text-[var(--muted)]">Seitenwahl{match.bestOf > 1 ? ` · Spiel ${match.games.length + 1}` : ""}</div>
									<div className="mt-1 text-sm font-medium text-[var(--text)]">
										{match.sideSelectionTeamName}
										{match.sideSelectionSeed ? ` (Seed #${match.sideSelectionSeed})` : ""} entscheidet über Blue oder Red Side.
									</div>
								</div>
							) : null}
							{match.sideSelectionRule === "higher-seed" && !match.sideSelectionTeamName ? (
								<p role="alert" className="col-span-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200">
									Seitenwahl offen: Teams oder eindeutige Playoff-Seeds fehlen noch. Bitte zuerst das Seeding prüfen. Kein Münzwurf: Das höher gesetzte Team
									entscheidet über Blue oder Red Side.
								</p>
							) : null}
							<label className="col-span-2 grid gap-1.5">
								<span className="text-xs font-semibold text-[var(--muted)]">Blue Side</span>
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
							<label className="col-span-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-3 transition hover:border-[var(--line-strong)]">
								<span>
									<span className="block text-xs font-semibold text-[var(--muted)]">Live gecastet</span>
									<span className="mt-1 block text-xs font-medium leading-5 text-[var(--muted)]">Zeigt dieses Match im Zeitplan als Cast-Match an.</span>
								</span>
								<span className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-[var(--line)] bg-[var(--admin-inset)] p-1">
									<input type="checkbox" name="is-casted" checked={isCasted} onChange={(event) => setIsCasted(event.target.checked)} className="peer sr-only" />
									<span className="h-5 w-5 rounded-full bg-[var(--admin-step)] transition peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--admin-bg)] peer-checked:translate-x-5 peer-checked:bg-[var(--muted)]" />
								</span>
							</label>
						</div>
						{(match.sideSelectionRule ? match.sideSelectionRule === "coin-flip" : !match.sideSelectionTeamName) ? (
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
						) : null}
						<details className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-3">
							<summary className="cursor-pointer text-xs font-semibold text-[var(--muted)]">Admin-Notiz und Hinweise</summary>
							<textarea
								name="admin-note"
								aria-label="Admin-Notiz"
								autoComplete="off"
								value={adminNote}
								onChange={(event) => setAdminNote(event.target.value)}
								rows={2}
								placeholder="Optional: Warum wurde das Ergebnis geändert?…"
								className="mt-3 w-full rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2.5 text-sm font-medium text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
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
							className="mt-3 w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-xs font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent)] disabled:opacity-50"
						>
							{isPending ? "Wird gespeichert…" : "Match speichern"}
						</button>
					</form>

					{message ? (
						<div role="status" className="rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-3 text-sm font-medium text-[var(--accent)]">
							{message}
						</div>
					) : null}
				</aside>
			</div>
			<ReplayReviewPanel match={match} onApply={applyReplay} />
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
		<div className="mt-4 rounded-[12px] border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] p-3">
			<div className="text-xs font-semibold text-[var(--muted)]">Schutz-Hinweise</div>
			<div className="mt-2 grid gap-2">
				{warnings.map((warning) => (
					<p key={warning} className="text-xs font-medium leading-5 text-[var(--muted)]">
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
			<div className={embedded ? "" : "rounded-[16px] border border-[var(--line)] bg-[var(--admin-step)] p-5"}>
				<div className="text-xs font-semibold text-[var(--muted)]">Match-Zusammenfassung</div>
				<p className="mt-3 text-sm leading-6 text-[var(--muted)]">
					Sobald Pools, Draft oder Score vorhanden sind, entsteht hier automatisch eine kompakte Zusammenfassung für Orga, Discord oder Stream.
				</p>
			</div>
		);
	}

	return (
		<div className={embedded ? "" : "rounded-[16px] border border-[var(--line)] bg-[var(--admin-step)] p-5"}>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<div className="text-xs font-semibold text-[var(--muted)]">Match-Zusammenfassung</div>
					<h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
						{match.teamALabel} vs {match.teamBLabel}
					</h2>
				</div>
				<span className="rounded-full border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
					{complete ? "Draft abgeschlossen" : `Draft ${draft.actions.length}/${sequence.length}`}
				</span>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-4">
				<SummaryTile label="Score" value={match.scoreA !== undefined && match.scoreB !== undefined ? `${match.scoreA}:${match.scoreB}` : "Noch offen"} />
				<SummaryTile label="Spielzeit" value={match.gameDurationSeconds !== undefined ? formatGameDuration(match.gameDurationSeconds) : "Noch offen"} />
				<SummaryTile label="Bans" value={bans.length > 0 ? bans.map((action) => (action.skipped ? "Kein Ban" : action.champion)).join(",") : "Noch keine"} />
				<SummaryTile label="Picks" value={picks.length > 0 ? picks.map((action) => action.champion).join(",") : "Noch keine"} />
			</div>

			<div className="mt-3 grid gap-3 md:grid-cols-2">
				<SummaryTile label={`${match.teamALabel} gespielt`} value={teamAChampions.length > 0 ? teamAChampions.join(",") : "Noch nicht eingetragen"} />
				<SummaryTile label={`${match.teamBLabel} gespielt`} value={teamBChampions.length > 0 ? teamBChampions.join(",") : "Noch nicht eingetragen"} />
			</div>
		</div>
	);
}

function SummaryTile({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-4">
			<div className="text-xs font-semibold text-[var(--muted)]">{label}</div>
			<div className="mt-2 text-sm font-medium leading-6 text-[var(--muted)]">{value}</div>
		</div>
	);
}

function ScoreField({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
	return (
		<label className="grid gap-2 rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-2.5">
			<span className="min-w-0 truncate text-xs font-semibold text-[var(--muted)]" title={label}>
				{label}
			</span>
			<ThemedNumberInput value={value} onChange={onChange} min={0} ariaLabel={`Score ${label}`} disabled={disabled} />
		</label>
	);
}

const STATUS_LABEL: Record<string, string> = { Scheduled: "Geplant", Pending: "Champ Select", Live: "Live", Finished: "Beendet", Locked: "Wartet" };

/** Where the match stands: release, ready check, draft, result, finished. */
function MatchStepper({ steps }: { steps: Array<{ label: string; done: boolean }> }) {
	const current = steps.findIndex((step) => !step.done);
	return (
		<ol className="m-0 grid list-none grid-cols-5 gap-2 p-0" aria-label="Ablauf">
			{steps.map((step, index) => (
				<li key={step.label} className="grid gap-1.5">
					<span
						aria-hidden
						className={`h-1 rounded-full ${step.done ? "bg-[var(--accent)]" : index === current ? "bg-[color-mix(in_srgb,var(--accent)_40%,var(--line))]" : "bg-[var(--line)]"}`}
					/>
					<span className={`truncate text-xs ${step.done ? "text-[var(--text)]" : index === current ? "font-medium text-[var(--text)]" : "text-[var(--muted)]"}`}>
						{step.label}
						<span className="sr-only">{step.done ? " (erledigt)" : " (offen)"}</span>
					</span>
				</li>
			))}
		</ol>
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
		<div
			className={`rounded-xl border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] ${compact ? "p-2.5" : "p-3"}`}
		>
			<div className="flex items-center gap-3">
				<div className={`relative grid shrink-0 place-items-center ${compact ? "size-10" : "size-14"}`} style={{ perspective: "500px" }}>
					<div
						className={`relative rounded-full ${compact ? "size-9" : "size-12"} ${
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
					<div className="text-xs font-semibold text-[var(--muted)]">Coin Toss</div>
					<div className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{tossing ? "Münze fliegt…" : `${winnerLabel} darf Side wählen`}</div>
				</div>
			</div>
			<button
				type="button"
				disabled={disabled || tossing}
				onClick={onToss}
				className={`${compact ? "mt-2 py-2" : "mt-3 py-2.5"} w-full rounded-lg border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-4 text-xs font-semibold text-[var(--amber)] transition hover:border-[color-mix(in_srgb,var(--amber)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-45`}
			>
				{tossing ? "Toss läuft…" : "Coin Toss starten"}
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
			className={`bg-[var(--accent)] absolute inset-0 grid place-items-center rounded-full border text-sm font-semibold text-[var(--on-accent)] ${
				label === "A" ? "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] " : "border-[var(--line-strong)] "
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
		<div className={embedded ? "rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-3" : "rounded-[16px] border border-[var(--line)] bg-[var(--admin-step)] p-5"}>
			<div className="flex items-center justify-between gap-3">
				<div className="text-xs font-semibold text-[var(--muted)]">{title}</div>
				<div className="text-xs font-semibold text-[var(--muted)]">{selected.length} gewählt</div>
			</div>
			{champions.length === 0 ? (
				<p className="mt-3 text-sm italic text-[var(--muted)]">Ziehe zuerst Pools, damit Champions auswählbar sind.</p>
			) : (
				<div className="mt-4 grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
					{champions.map((champion) => {
						const active = selectedSet.has(champion.name);
						return (
							<label
								key={champion.id}
								className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
									active
										? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]"
										: "border-[var(--line)] bg-[var(--admin-inset)] text-[var(--muted)] hover:border-[var(--line-strong)]"
								}`}
							>
								<input
									type="checkbox"
									checked={active}
									onChange={(event) => {
										onChange(event.target.checked ? [...selected, champion.name] : selected.filter((name) => name !== champion.name));
									}}
									className="accent-[var(--accent)]"
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
		<div className="rounded-[12px] border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-3">
			<div className="truncate text-xs font-medium text-[var(--muted)]">{label}</div>
			<div className="mt-1 text-3xl font-semibold text-[var(--accent)]">{compactPoolLabel(pool)}</div>
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
	const [role, setRole] = useState("Top");
	const [isPending, startTransition] = useTransition();
	const matchTeams = roster.teams.filter((team) => team.name === match.teamAName || team.name === match.teamBName);
	const selectedTeam = roster.teams.find((team) => team.key === teamKey) ?? matchTeams[0] ?? null;
	const incomingOptions = roster.applicants.filter((applicant) => {
		const currentAssignment = selectedTeam?.players.find((player) => player.discordId === applicant.discordId);
		return !currentAssignment || currentAssignment.role === "Sub";
	});
	const substituteDirty = Boolean(teamKey || incomingDiscordId || outgoingDiscordId || role !== "Top");

	async function persistSubstitute(): Promise<boolean> {
		const targetTeamKey = teamKey || selectedTeam?.key || "";
		if (!targetTeamKey || !incomingDiscordId) {
			onMessage("Bitte Team und Ersatzspieler auswählen.");
			return false;
		}
		if (!outgoingDiscordId) {
			onMessage("Bitte wähle den aktiven Spieler aus, den der Substitute ersetzt.");
			return false;
		}

		const response = await fetch("/api/tournament/substitute", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				matchId: match.id,
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
		setRole("Top");
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
		<form onSubmit={submit} className={embedded ? "" : "rounded-[16px] border border-[var(--line)] bg-[var(--admin-inset)] p-5"}>
			<div className="text-xs font-semibold text-[var(--muted)]">Emergency Substitute</div>
			<p className="mt-2 text-xs leading-5 text-[var(--muted)]">
				Aktiviert einen Ersatzspieler für dieses Match. Bereits bestätigte Rolls der übrigen neun Spieler bleiben erhalten; nur der Roll des ausgewechselten Spielers wird
				entfernt.
			</p>
			<div className="mt-4 grid gap-3">
				<label className="grid gap-2">
					<span className="text-xs font-semibold text-[var(--muted)]">Team</span>
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
					<span className="text-xs font-semibold text-[var(--muted)]">Incoming</span>
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
					<span className="text-xs font-semibold text-[var(--muted)]">Wird ersetzt</span>
					<ThemedSelect
						name="outgoing"
						value={outgoingDiscordId}
						onChange={(value) => {
							setOutgoingDiscordId(value);
							const outgoing = selectedTeam?.players.find((player) => player.discordId === value);
							if (outgoing?.role && ["Top", "Jungle", "Mid", "Bot", "Support"].includes(outgoing.role)) setRole(outgoing.role);
						}}
						options={[
							{ value: "", label: "Aktiven Spieler wählen" },
							...(selectedTeam?.players ?? [])
								.filter((player) => player.role !== "Sub")
								.map((player) => ({
									value: player.discordId,
									label: `${player.role ?? "Fill"} · ${player.riotId}`,
								})),
						]}
					/>
				</label>
				<label className="grid gap-2">
					<span className="text-xs font-semibold text-[var(--muted)]">Rolle</span>
					<ThemedSelect
						name="role"
						value={role}
						onChange={setRole}
						options={["Top", "Jungle", "Mid", "Bot", "Support"].map((value) => ({
							value,
							label: value,
						}))}
					/>
				</label>
			</div>
			<button
				type="submit"
				disabled={isPending}
				className="mt-4 w-full rounded-[12px] border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-5 py-3 text-xs font-semibold text-[var(--amber)] transition hover:border-[color-mix(in_srgb,var(--amber)_35%,transparent)] disabled:opacity-50"
			>
				Substitute speichern
			</button>
		</form>
	);
}

function TeamPanel({ tag, team, pool, fallback, blue }: { tag: string | null; team: TournamentTeam | null; pool: string | null; fallback: string; blue: boolean }) {
	const riotIds = teamRiotIds(team);
	return (
		<article className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)]">
			<header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
				{tag ? <span className="rounded-md bg-[var(--admin-inset)] px-2 py-1 font-mono text-xs font-semibold text-[var(--text)]">{tag}</span> : null}
				<h2 className="m-0 min-w-0 flex-1 truncate text-base font-semibold text-[var(--text)]">{team?.name ?? fallback}</h2>
				<span className={`text-xs font-medium ${blue ? "text-[#6f9dff]" : "text-[#ff7380]"}`}>{blue ? "Blau" : "Rot"}</span>
				{pool ? <span className="text-xs font-semibold text-[var(--accent)]">Pool {compactPoolLabel(pool)}</span> : null}
				{riotIds.length > 0 ? (
					<a href={opggMultiSearchUrl(riotIds)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--accent)]">
						OP.GG ↗
					</a>
				) : null}
			</header>
			{team ? (
				<ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
					{team.players.map((player) => (
						<li key={player.riotId} className="flex items-center gap-3 px-4 py-2">
							<span className="grid w-5 shrink-0 place-items-center text-[var(--muted)]">
								<RoleIcon role={player.role} className="size-4" />
							</span>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium text-[var(--text)]">{player.name}</div>
								<div className="truncate text-xs text-[var(--muted)]">{player.riotId}</div>
							</div>
							<a href={player.opggUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--muted)] hover:text-[var(--accent)]">
								OP.GG
							</a>
							<a href={player.dpmUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--muted)] hover:text-[var(--accent)]">
								DPM
							</a>
						</li>
					))}
				</ul>
			) : (
				<p className="m-0 px-4 py-3 text-sm text-[var(--muted)]">Team steht noch nicht fest. Das Roster erscheint, sobald der Bracket-Platz besetzt ist.</p>
			)}
		</article>
	);
}

/** Bo3/Bo5: record one game at a time; the server prepares the next game (fresh draft, side rule). */
function SeriesPanel({
	match,
	version,
	onVersion,
	onMessage,
	busy,
	onDone,
	prefill,
}: {
	match: ControlMatch;
	version: number;
	onVersion: (version: number) => void;
	onMessage: (message: string) => void;
	busy: boolean;
	onDone: () => void;
	prefill?: ReplayPrefill | null;
}) {
	const { showConflict } = useAdminConflict();
	const [winner, setWinner] = useState<"teamA" | "teamB" | null>(prefill?.winner ?? null);
	const [duration, setDuration] = useState(prefill ? formatGameDuration(prefill.durationSeconds) : "");
	const [undoOpen, setUndoOpen] = useState(false);
	const [pending, startTransition] = useTransition();
	const needed = Math.floor(match.bestOf / 2) + 1;
	const scoreA = match.games.filter((game) => game.winner === "teamA").length;
	const scoreB = match.games.filter((game) => game.winner === "teamB").length;
	const decided = Math.max(scoreA, scoreB) >= needed;
	const nextGame = match.games.length + 1;

	function send(body: Record<string, unknown>, success: string) {
		startTransition(async () => {
			const response = await fetch("/api/tournament/matches/game", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: match.id, expectedVersion: version, ...body }),
			});
			const json = (await response.json().catch(() => null)) as { message?: string; version?: number; decided?: boolean } | null;
			if (!response.ok) {
				if (isAdminVersionConflict(response, json)) {
					showConflict(json);
					return;
				}
				onMessage(json?.message ?? "Das Spiel konnte nicht gespeichert werden.");
				return;
			}
			if (json?.version !== undefined) onVersion(json.version);
			setWinner(null);
			setDuration("");
			onMessage(json?.decided ? "Serie entschieden. Das Match ist abgeschlossen." : success);
			onDone();
		});
	}

	return (
		<section className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] p-4" aria-labelledby={`series-${match.id}`}>
			<div className="flex items-center justify-between gap-3">
				<div>
					<div className="text-xs font-semibold text-[var(--muted)]">Serie · Best of {match.bestOf}</div>
					<h3 id={`series-${match.id}`} className="mt-1 text-lg font-semibold text-[var(--text)]">
						{match.teamALabel} {scoreA}:{scoreB} {match.teamBLabel}
					</h3>
				</div>
				<span className="rounded-full border border-[var(--line)] bg-[var(--admin-inset)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
					{decided ? "Entschieden" : `Spiel ${nextGame}`}
				</span>
			</div>
			{match.games.length ? (
				<ol className="mt-3 grid gap-1.5">
					{match.games.map((game) => (
						<li
							key={game.number}
							className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2 text-xs"
						>
							<span className="font-semibold text-[var(--text)]">
								Spiel {game.number}: {game.winner === "teamA" ? match.teamALabel : match.teamBLabel}
							</span>
							<span className="font-medium text-[var(--muted)]">
								{game.durationSeconds !== undefined ? formatGameDuration(game.durationSeconds) : "ohne Zeit"} · Blau:{""}
								{game.blueSide === "teamB" ? match.teamBLabel : match.teamALabel}
							</span>
						</li>
					))}
				</ol>
			) : (
				<p className="mt-3 text-xs leading-5 text-[var(--muted)]">Noch kein Spiel erfasst. Nach jedem Spiel startet der Champ Select für das nächste Spiel neu.</p>
			)}
			{!decided && match.teamAName && match.teamBName ? (
				<div className="mt-3 grid gap-2">
					<div className="grid grid-cols-2 gap-2" role="group" aria-label={`Sieger von Spiel ${nextGame}`}>
						{(["teamA", "teamB"] as const).map((side) => (
							<button
								key={side}
								type="button"
								aria-pressed={winner === side}
								onClick={() => setWinner(side)}
								className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold ${winner === side ? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--admin-inset)] text-[var(--muted)]"}`}
							>
								{side === "teamA" ? match.teamALabel : match.teamBLabel}
							</button>
						))}
					</div>
					<label className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-2.5">
						<span className="text-xs font-semibold text-[var(--muted)]">Spielzeit Spiel {nextGame}</span>
						<input
							name={`game-${nextGame}-duration`}
							autoComplete="off"
							value={duration}
							onChange={(event) => setDuration(event.target.value)}
							inputMode="numeric"
							placeholder="mm:ss…"
							pattern="\d{1,3}:[0-5]\d"
							className="w-full rounded-lg border border-[var(--line)] bg-[var(--admin-inset)] px-2 py-2 text-center text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
						/>
					</label>
					<button
						type="button"
						disabled={!winner || pending || busy}
						onClick={() =>
							send({ action: "record", winner, gameDuration: duration }, `Spiel ${nextGame} gespeichert. Der Champ Select für Spiel ${nextGame + 1} ist bereit.`)
						}
						className="bg-[var(--accent)] rounded-xl px-4 py-3 text-xs font-semibold text-[var(--on-accent)] disabled:opacity-40"
					>
						{pending ? "Speichert…" : `Spiel ${nextGame} abschließen`}
					</button>
				</div>
			) : null}
			{match.games.length ? (
				<button
					type="button"
					disabled={pending || busy}
					onClick={() => setUndoOpen(true)}
					className="mt-3 w-full rounded-xl border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--amber)] disabled:opacity-40"
				>
					Spiel {match.games.length} zurücknehmen
				</button>
			) : null}
			<ConfirmDialog
				open={undoOpen}
				title={`Spiel ${match.games.length} zurücknehmen?`}
				description="Das Ergebnis dieses Spiels wird entfernt und das Spiel gilt wieder als laufend. Das geht nicht mehr, sobald ein späteres Match mit dem Sieger dieser Serie begonnen hat."
				confirmLabel="Spiel zurücknehmen"
				tone="danger"
				onConfirm={() => {
					setUndoOpen(false);
					send({ action: "undo" }, `Spiel ${match.games.length} wurde zurückgenommen.`);
				}}
				onCancel={() => setUndoOpen(false)}
			/>
		</section>
	);
}
