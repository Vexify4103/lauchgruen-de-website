import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getMatchControlContext, type ControlMatch } from "@/lib/match-control";
import { getDraftState } from "@/lib/tournament-draft";
import { createDraftSequence, draftComplete, draftReady } from "@/lib/tournament-draft-shared";
import { bonusBanSideForMatch } from "@/lib/tournament-rules";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { TournamentLink as Link } from "../../TournamentLink";
import { getSwissStageState, listSwissAudit } from "@/lib/tournament-swiss";
import { SwissDrawControl } from "./SwissDrawControl";
import { StageControlPanel } from "./StageControlPanel";
import { openStageTies, standingOverrideTitle } from "@/lib/tournament-stages";
import { PLAY_IN_GROUP } from "@/lib/tournament-runtime";
import { resolveUltimateBraveryMatchPlayers } from "@/lib/ultimate-bravery-match";
import { listUltimateBraveryRolls } from "@/lib/ultimate-bravery";
import { getUltimateBraveryDraftStatus, type UltimateBraveryDraftStatus } from "@/lib/ultimate-bravery-state";
import { usesUltimateBravery } from "@/lib/tournament-kind";

type LiveMatch = {
	match: ControlMatch;
	draftReady: boolean;
	draftComplete: boolean;
	actions: number;
	total: number;
};

const STATUS_LABEL: Record<string, string> = { Scheduled: "Geplant", Pending: "Wartet auf Start", Live: "Live", Finished: "Beendet", Locked: "Gesperrt" };

export default async function AdminLiveDashboardPage() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) redirect("/tournament/admin");

	const [ctx, settings] = await Promise.all([getMatchControlContext(), getTournamentSettings()]);
	const isUltimateBravery = usesUltimateBravery(settings.activeTournament);
	const config = settings.structure;
	const swissData =
		config.dayOneFormat === "swiss" || config.dayOneFormat === "swiss-elimination"
			? await Promise.all([getSwissStageState(settings.activeTournament.id), listSwissAudit(settings.activeTournament.id, 12)])
			: null;
	const swissTeams = ctx.teams.filter((team) => team.group !== PLAY_IN_GROUP && team.storageKey);
	const swissTeamNames = swissTeams.map((team) => team.name);
	const stages = ctx.stages;
	const playInPanel =
		stages && config.playInTeamCount > 0
			? {
					required: config.playInTeamCount,
					pairs: stages.playIn
						? stages.playIn.matches.map((match) => ({
								matchId: match.id,
								teamAName: match.teamALabel,
								teamBName: match.teamBLabel,
								winner: match.winner,
								score: match.stored?.scoreA !== undefined && match.stored.scoreB !== undefined ? `${match.stored.scoreA}:${match.stored.scoreB}` : null,
								status: match.status,
							}))
						: null,
					candidates: ctx.teams
						.flatMap((team) => (team.storageKey ? [{ key: team.storageKey, name: team.name }] : []))
						.sort((a, b) => a.name.localeCompare(b.name, "de")),
				}
			: null;
	const playable = ctx.matches.filter((match) => match.teamAName && match.teamBName);
	const live = playable.filter((match) => match.status === "Live");
	const waiting = playable.filter((match) => match.status === "Pending");
	const scheduled = playable.filter((match) => match.status === "Scheduled");
	const finished = playable.filter((match) => match.status === "Finished");
	const open = playable.filter((match) => match.status !== "Finished");
	const nextMatches = getNextMatches(open.filter((match) => match.status !== "Live"));
	const missingScores = playable.filter((match) => match.status === "Finished" && (match.scoreA === undefined || match.scoreB === undefined));
	const unresolved = ctx.matches.filter((match) => !match.teamAName || !match.teamBName);
	const ultimateBraveryStatuses = new Map<string, UltimateBraveryDraftStatus>(
		isUltimateBravery
			? await Promise.all(
					playable.map(async (match) => {
						const [players, rolls] = await Promise.all([resolveUltimateBraveryMatchPlayers(match.id), listUltimateBraveryRolls(match.id)]);
						return [match.id, getUltimateBraveryDraftStatus(players ?? [], rolls)] as const;
					})
				)
			: []
	);
	const activeDrafts = isUltimateBravery ? live.map(emptyDraftState) : await Promise.all(live.map((match) => loadDraftState(match, settings.activeTournament)));
	const tasks = buildTasks({ waiting, missingScores, matches: playable, ultimateBraveryStatuses });
	const ties = stages ? openStageTies(stages, config.advanceTeamCount) : [];
	const decisions = stages ? Object.entries(stages.overrides).map(([key, order]) => ({ key, title: standingOverrideTitle(key), order })) : [];

	return (
		<div className="grid gap-5">
			<section aria-label="Lage" className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-[var(--line)] bg-[var(--admin-step)] px-5 py-4">
				<Figure value={live.length} label="live" tone={live.length ? "live" : undefined} />
				<Figure value={waiting.length} label="warten auf Start" />
				<Figure value={scheduled.length} label="geplant" />
				<Figure value={finished.length} label="beendet" />
				<Figure value={tasks.length} label={tasks.length === 1 ? "Aufgabe" : "Aufgaben"} tone={tasks.length ? "amber" : undefined} />
				<div className="ml-auto flex flex-wrap gap-2">
					<StateBadge active={settings.tournamentLive} label={settings.tournamentLive ? "Turnier öffentlich live" : "Turnier in Vorbereitung"} />
					<StateBadge active={settings.draftEnabled} label={settings.draftEnabled ? "Matchzugriff aktiv" : "Matchzugriff pausiert"} />
				</div>
				{stages?.dayOne.pendingReason ? <p className="m-0 w-full border-t border-[var(--line)] pt-3 text-sm text-[var(--muted)]">{stages.dayOne.pendingReason}</p> : null}
			</section>

			{stages ? <StageControlPanel pendingReason={null} playIn={playInPanel} ties={ties} decisions={decisions} /> : null}

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<Panel title="Matches" aria="Live und als Nächstes">
					{activeDrafts.length === 0 && nextMatches.length === 0 ? (
						<p className="m-0 px-4 py-4 text-sm text-[var(--muted)]">
							{playable.length === 0 ? "Sobald Teams und Matches erstellt sind, erscheinen sie hier." : "Alle spielbaren Matches sind abgeschlossen."}
						</p>
					) : (
						<ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
							{activeDrafts.map((entry) => (
								<MatchRow
									key={entry.match.id}
									match={entry.match}
									detail={
										isUltimateBravery
											? ultimateBraveryDetail(ultimateBraveryStatuses.get(entry.match.id))
											: entry.draftComplete
												? "Draft fertig, im Spiel"
												: entry.draftReady
													? `Draft ${entry.actions}/${entry.total}`
													: "Wartet auf Captains"
									}
								/>
							))}
							{activeDrafts.length === 0 ? <li className="px-4 py-2.5 text-xs text-[var(--muted)]">Gerade läuft kein Match.</li> : null}
							{nextMatches.map((match) => (
								<MatchRow
									key={match.id}
									match={match}
									detail={
										isUltimateBravery
											? ultimateBraveryDetail(ultimateBraveryStatuses.get(match.id))
											: match.poolAssignment
												? `Pools ${compactPoolLabel(match.poolAssignment.teamAPool)} · ${compactPoolLabel(match.poolAssignment.teamBPool)}`
												: null
									}
								/>
							))}
						</ul>
					)}
				</Panel>

				<Panel title="Orga-Aufgaben" aria="Orga-Aufgaben" count={tasks.length}>
					{tasks.length === 0 ? (
						<p className="m-0 px-4 py-4 text-sm text-[var(--accent)]">Nichts offen.</p>
					) : (
						<ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
							{tasks.slice(0, 10).map((task) => (
								<li key={`${task.matchId}-${task.label}`}>
									<Link href={`/tournament/admin/matches/${task.matchId}`} className="block px-4 py-2.5 transition hover:bg-[var(--admin-inset)]">
										<div className="truncate text-sm font-medium text-[var(--text)]">{task.title}</div>
										<div className={`mt-0.5 text-xs ${task.tone === "amber" ? "text-[var(--amber)]" : "text-[var(--muted)]"}`}>{task.label}</div>
									</Link>
								</li>
							))}
						</ul>
					)}
					{unresolved.length ? (
						<p className="m-0 border-t border-[var(--line)] px-4 py-2.5 text-xs text-[var(--muted)]">
							{unresolved.length} {unresolved.length === 1 ? "Match wartet" : "Matches warten"} noch auf Teams aus früheren Runden.
						</p>
					) : null}
				</Panel>
			</div>

			{swissData ? (
				<SwissDrawControl
					initialState={swissData[0]}
					configuredRounds={config.swissRounds}
					teams={swissTeamNames}
					initialAudit={swissData[1]}
					potTeams={swissTeams.map((team) => ({ key: team.storageKey!, name: team.name }))}
					teamDrawEnabled={config.dayOneFormat === "swiss" && swissTeams.length === 8 && config.advanceTeamCount === 8 && config.swissRounds === 4}
					seededOrder={config.swissRoundOneSeeding === "seeded" ? [...swissTeams].sort((a, b) => a.seed - b.seed).map((team) => team.storageKey!) : undefined}
				/>
			) : null}
		</div>
	);
}

async function loadDraftState(match: ControlMatch, active: Parameters<typeof bonusBanSideForMatch>[1]): Promise<LiveMatch> {
	const draft = await getDraftState(match.id);
	const sequence = createDraftSequence(bonusBanSideForMatch(match, active));
	return { match, draftReady: draftReady(draft), draftComplete: draftComplete(draft, sequence), actions: draft.actions.length, total: sequence.length };
}

function emptyDraftState(match: ControlMatch): LiveMatch {
	return { match, draftReady: false, draftComplete: false, actions: 0, total: 0 };
}

/** Play-in first, then Day 1 alternating between groups, then the playoffs. */
function getNextMatches(matches: ControlMatch[]) {
	const playIn = matches.filter((match) => match.phase === "play-in");
	const groupMatches = matches.filter((match) => match.phase === "groups");
	const byGroup = new Map<string, ControlMatch[]>();
	for (const match of groupMatches) {
		const group = match.group ?? /^([a-p])-/.exec(match.id)?.[1]?.toUpperCase() ?? "";
		byGroup.set(group, [...(byGroup.get(group) ?? []), match]);
	}
	const lanes = [...byGroup.values()];
	const interleaved = Array.from({ length: Math.max(0, ...lanes.map((lane) => lane.length)) }, (_, index) => lanes.flatMap((lane) => (lane[index] ? [lane[index]] : []))).flat();
	return [...playIn, ...interleaved, ...matches.filter((match) => match.phase === "playoffs")].slice(0, 6);
}

function buildTasks({
	waiting,
	missingScores,
	matches,
	ultimateBraveryStatuses,
}: {
	waiting: ControlMatch[];
	missingScores: ControlMatch[];
	matches: ControlMatch[];
	ultimateBraveryStatuses: Map<string, UltimateBraveryDraftStatus>;
}) {
	const title = (match: ControlMatch | undefined, matchId: string) => (match ? `${match.teamALabel} vs ${match.teamBLabel}` : matchId);
	return [
		...[...ultimateBraveryStatuses.entries()]
			.filter(([, status]) => status.rerollRequestCount > 0)
			.map(([matchId, status]) => ({
				matchId,
				title: title(
					matches.find((match) => match.id === matchId),
					matchId
				),
				label: `${status.rerollRequestCount} Reroll-Ausnahme${status.rerollRequestCount === 1 ? "" : "n"} offen`,
				tone: "amber" as const,
			})),
		...missingScores.map((match) => ({ matchId: match.id, title: title(match, match.id), label: "Ergebnis fehlt", tone: "amber" as const })),
		...waiting.map((match) => ({ matchId: match.id, title: title(match, match.id), label: "Wartet auf Start", tone: "neutral" as const })),
	];
}

function ultimateBraveryDetail(status: UltimateBraveryDraftStatus | undefined) {
	if (!status) return null;
	return status.rerollRequestCount ? `${status.rerollRequestCount} Ausnahme offen` : `${status.lockedCount}/${status.totalPlayers} bestätigt`;
}

function Figure({ value, label, tone }: { value: number; label: string; tone?: "live" | "amber" }) {
	const color = tone === "live" ? "text-[var(--live)]" : tone === "amber" ? "text-[var(--amber)]" : value ? "text-[var(--text)]" : "text-[var(--muted)]";
	return (
		<div className="flex items-baseline gap-2">
			<strong className={`font-display text-2xl font-semibold tabular-nums ${color}`}>{value}</strong>
			<span className="text-sm text-[var(--muted)]">{label}</span>
		</div>
	);
}

function Panel({ title, aria, count, children }: { title: string; aria: string; count?: number; children: ReactNode }) {
	return (
		<section aria-label={aria} className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--admin-step)]">
			<header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
				<h2 className="m-0 text-sm font-semibold text-[var(--text)]">{title}</h2>
				{count !== undefined ? <span className="font-mono text-xs text-[var(--muted)]">{count}</span> : null}
			</header>
			{children}
		</section>
	);
}

function MatchRow({ match, detail }: { match: ControlMatch; detail: string | null }) {
	const live = match.status === "Live";
	return (
		<li>
			<Link
				href={`/tournament/admin/matches/${match.id}`}
				className={`group grid items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-[var(--admin-inset)] sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] ${
					live ? "bg-[color-mix(in_srgb,var(--live)_6%,transparent)]" : ""
				}`}
			>
				<span
					className={`inline-flex items-center gap-2 text-xs font-medium ${live ? "text-[var(--live)]" : match.status === "Pending" ? "text-[var(--text)]" : "text-[var(--muted)]"}`}
				>
					{live ? <i aria-hidden className="size-1.5 rounded-full bg-[var(--live)]" /> : null}
					{STATUS_LABEL[match.status] ?? match.status}
				</span>
				<span className="min-w-0">
					<span className="flex min-w-0 items-baseline gap-2 text-sm">
						{match.teamATag ? <span className="font-mono text-xs font-semibold text-[var(--muted)]">{match.teamATag}</span> : null}
						<span className="truncate font-medium text-[var(--text)]">{match.teamALabel}</span>
						<span className="text-xs text-[var(--muted)]">vs</span>
						<span className="truncate font-medium text-[var(--text)]">{match.teamBLabel}</span>
						{match.teamBTag ? <span className="font-mono text-xs font-semibold text-[var(--muted)]">{match.teamBTag}</span> : null}
					</span>
					<span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
						{match.round}
						{detail ? ` · ${detail}` : ""}
					</span>
				</span>
				<span className="text-xs font-medium text-[var(--muted)] transition group-hover:text-[var(--text)]">Öffnen →</span>
			</Link>
		</li>
	);
}

function StateBadge({ active, label }: { active: boolean; label: string }) {
	return (
		<span className="tally rounded-full border border-[var(--line)] px-3 py-1.5" data-tone={active ? "ok" : "warn"}>
			{label}
		</span>
	);
}
