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

export default async function AdminLiveDashboardPage() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) redirect("/tournament/admin");

	const [ctx, settings] = await Promise.all([getMatchControlContext(), getTournamentSettings()]);
	const isUltimateBravery = usesUltimateBravery(settings.activeTournament);
	const config = settings.ultimateBravery;
	const swissData =
		config.dayOneFormat === "swiss" || config.dayOneFormat === "swiss-elimination"
			? await Promise.all([getSwissStageState(settings.activeTournament.id), listSwissAudit(settings.activeTournament.id, 12)])
			: null;
	const swissTeamNames = ctx.teams.filter((team) => team.group !== PLAY_IN_GROUP).map((team) => team.name);
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
	const openRerollRequests = [...ultimateBraveryStatuses.values()].reduce((total, status) => total + status.rerollRequestCount, 0);
	const attentionCount = waiting.length + missingScores.length + unresolved.length + openRerollRequests;

	return (
		<>
			<div className="admin-stat-grid">
				<article>
					<span>Aktiv</span>
					<strong>{live.length}</strong>
					<small>im Draft oder Spiel</small>
				</article>
				<article>
					<span>Wartet</span>
					<strong>{waiting.length}</strong>
					<small>bereit zur Freigabe</small>
				</article>
				<article>
					<span>Geplant</span>
					<strong>{scheduled.length}</strong>
					<small>im Rolling Schedule</small>
				</article>
				<article>
					<span>Aufgaben</span>
					<strong>{attentionCount}</strong>
					<small>{attentionCount ? "brauchen Aufmerksamkeit" : "alles erledigt"}</small>
				</article>
			</div>
			<div className="mb-[18px] flex flex-wrap items-center gap-2">
				<StateBadge active={settings.tournamentLive} label={settings.tournamentLive ? "Turnier öffentlich live" : "Turnier in Vorbereitung"} />
				<StateBadge active={settings.draftEnabled} label={settings.draftEnabled ? "Matchzugriff aktiv" : "Matchzugriff pausiert"} />
			</div>
			{stages ? (
				<StageControlPanel
					pendingReason={stages.dayOne.pendingReason}
					playIn={playInPanel}
					ties={openStageTies(stages, config.advanceTeamCount)}
					decisions={Object.entries(stages.overrides).map(([key, order]) => ({ key, title: standingOverrideTitle(key), order }))}
				/>
			) : null}
			{swissData ? <SwissDrawControl initialState={swissData[0]} configuredRounds={config.swissRounds} teams={swissTeamNames} initialAudit={swissData[1]} /> : null}

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid gap-5">
					<CockpitPanel eyebrow="Im Spiel" title="Aktive Matches" count={activeDrafts.length} tone="red">
						{activeDrafts.length === 0 ? (
							<EmptyState
								title="Derzeit läuft kein Match."
								text={
									playable.length === 0
										? "Sobald Teams und Matches erstellt sind, wird dieses Cockpit automatisch gefüllt."
										: "Die nächsten vorbereiteten Matches stehen direkt darunter bereit."
								}
							/>
						) : (
							<div className="grid gap-3 lg:grid-cols-2">
								{activeDrafts.map((entry) => (
									<LiveMatchCard
										key={entry.match.id}
										entry={entry}
										isUltimateBravery={isUltimateBravery}
										ultimateBraveryStatus={ultimateBraveryStatuses.get(entry.match.id)}
									/>
								))}
							</div>
						)}
					</CockpitPanel>

					<CockpitPanel eyebrow="Rolling Schedule" title="Als Nächstes" count={nextMatches.length} tone="cyan">
						{nextMatches.length === 0 ? (
							<EmptyState
								title="Noch keine nächsten Matches."
								text={
									isUltimateBravery
										? "Format, Teams und Bracket müssen zuerst finalisiert werden."
										: "Alle spielbaren Matches sind abgeschlossen oder bereits live."
								}
							/>
						) : (
							<div className="divide-y divide-[var(--line)] overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)]">
								{nextMatches.map((match, index) => (
									<QueueMatchRow
										key={match.id}
										match={match}
										position={index + 1}
										isUltimateBravery={isUltimateBravery}
										ultimateBraveryStatus={ultimateBraveryStatuses.get(match.id)}
									/>
								))}
							</div>
						)}
					</CockpitPanel>
				</div>

				<aside className="grid content-start gap-5">
					<AttentionPanel waiting={waiting} missingScores={missingScores} unresolved={unresolved} matches={playable} ultimateBraveryStatuses={ultimateBraveryStatuses} />
				</aside>
			</div>
		</>
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
	return [...playIn, ...interleaved, ...matches.filter((match) => match.phase === "playoffs")].slice(0, 4);
}

function CockpitPanel({ eyebrow, title, count, tone, children }: { eyebrow: string; title: string; count: number; tone: "red" | "cyan"; children: ReactNode }) {
	const accent = tone === "red" ? "text-[var(--danger)] bg-[var(--danger)]" : "text-[var(--muted)] bg-[var(--muted)]";
	return (
		<section className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[#09170f]/88">
			<header className="flex items-end justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
				<div>
					<div className={`text-xs font-semibold ${accent.split(" ")[0]}`}>{eyebrow}</div>
					<h2 className="mt-1 text-2xl font-semibold text-[var(--text)]">{title}</h2>
				</div>
				<span className="rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2 font-mono text-sm font-semibold text-[var(--text)]">{count}</span>
			</header>
			<div className="p-4 sm:p-5">{children}</div>
		</section>
	);
}

function LiveMatchCard({ entry, isUltimateBravery, ultimateBraveryStatus }: { entry: LiveMatch; isUltimateBravery: boolean; ultimateBraveryStatus?: UltimateBraveryDraftStatus }) {
	const { match } = entry;
	return (
		<Link
			href={`/tournament/admin/matches/${match.id}`}
			className="group overflow-hidden rounded-[12px] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] transition hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)]"
		>
			<div className="p-4">
				<div className="flex items-center justify-between gap-3">
					<span className="text-xs font-semibold text-[var(--muted)]">Live · {match.round}</span>
					<span className="font-mono text-xs font-medium text-[var(--muted)]">{match.id}</span>
				</div>
				<div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
					<strong className="text-lg text-[var(--text)]">{match.teamALabel}</strong>
					<span className="text-xs font-semibold text-[var(--danger)]">VS</span>
					<strong className="text-right text-lg text-[var(--text)]">{match.teamBLabel}</strong>
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					{isUltimateBravery ? (
						<>
							<Chip text={`${ultimateBraveryStatus?.lockedCount ?? 0}/${ultimateBraveryStatus?.totalPlayers ?? 10} bestätigt`} />
							{ultimateBraveryStatus?.rerollRequestCount ? <DangerChip text={`${ultimateBraveryStatus.rerollRequestCount} Ausnahme offen`} /> : null}
						</>
					) : (
						<>
							<Chip text={entry.draftComplete ? "Draft fertig" : entry.draftReady ? `Draft ${entry.actions}/${entry.total}` : "Wartet auf Captains"} />
							<Chip
								text={
									match.poolAssignment
										? `${compactPoolLabel(match.poolAssignment.teamAPool)} vs ${compactPoolLabel(match.poolAssignment.teamBPool)}`
										: "Pools offen"
								}
							/>
						</>
					)}
				</div>
				<div className="mt-4 text-xs font-semibold text-[var(--muted)] transition group-hover:text-[var(--danger)]">Control Room öffnen →</div>
			</div>
		</Link>
	);
}

function QueueMatchRow({
	match,
	position,
	isUltimateBravery,
	ultimateBraveryStatus,
}: {
	match: ControlMatch;
	position: number;
	isUltimateBravery: boolean;
	ultimateBraveryStatus?: UltimateBraveryDraftStatus;
}) {
	return (
		<Link
			href={`/tournament/admin/matches/${match.id}`}
			className="group grid gap-3 px-4 py-3.5 transition hover:bg-[var(--admin-step)] sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center"
		>
			<span className="font-mono text-lg font-semibold text-[var(--muted)]">{String(position).padStart(2, "0")}</span>
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold text-[var(--text)]">
					{match.teamALabel} <span className="text-[var(--muted)]">vs</span> {match.teamBLabel}
				</div>
				<div className="mt-1 text-xs font-medium text-[var(--muted)]">
					{match.round} · {match.time} · {match.status}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<span className="hidden rounded-full border border-[var(--line)] bg-[var(--admin-step)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] md:inline-flex">
					{isUltimateBravery
						? ultimateBraveryStatus?.rerollRequestCount
							? `${ultimateBraveryStatus.rerollRequestCount} Ausnahme offen`
							: `${ultimateBraveryStatus?.lockedCount ?? 0}/${ultimateBraveryStatus?.totalPlayers ?? 10} bestätigt`
						: match.poolAssignment
							? "Pools bereit"
							: "Vorbereiten"}
				</span>
				<span className="text-[var(--muted)] transition group-hover:translate-x-1 group-hover:text-[var(--text)]">→</span>
			</div>
		</Link>
	);
}

function AttentionPanel({
	waiting,
	missingScores,
	unresolved,
	matches,
	ultimateBraveryStatuses,
}: {
	waiting: ControlMatch[];
	missingScores: ControlMatch[];
	unresolved: ControlMatch[];
	matches: ControlMatch[];
	ultimateBraveryStatuses: Map<string, UltimateBraveryDraftStatus>;
}) {
	const tasks = [
		...[...ultimateBraveryStatuses.entries()]
			.filter(([, status]) => status.rerollRequestCount > 0)
			.map(([matchId, status]) => ({
				match: matches.find((match) => match.id === matchId),
				matchId,
				label: `${status.rerollRequestCount} Reroll-Ausnahme${status.rerollRequestCount === 1 ? "" : "n"} offen`,
				tone: "amber" as const,
			})),
		...waiting.map((match) => ({ match, matchId: match.id, label: "Match wartet auf Start", tone: "cyan" as const })),
		...missingScores.map((match) => ({ match, matchId: match.id, label: "Ergebnis fehlt", tone: "amber" as const })),
		...unresolved.slice(0, 4).map((match) => ({ match, matchId: match.id, label: "Teams noch nicht bestimmt", tone: "amber" as const })),
	];
	return (
		<section className="rounded-[16px] border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] p-5">
			<div className="flex items-center justify-between gap-3">
				<div>
					<div className="text-xs font-semibold text-[var(--muted)]">Aufmerksamkeit</div>
					<h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Orga-Aufgaben</h2>
				</div>
				<span
					className={`grid size-10 place-items-center rounded-full border font-mono text-sm font-semibold ${tasks.length ? "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] text-[var(--amber)]" : "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]"}`}
				>
					{tasks.length}
				</span>
			</div>
			<div className="mt-4 grid gap-2">
				{tasks.length === 0 ? (
					<div className="rounded-xl border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-3 text-xs font-medium text-[var(--accent)]">
						Keine Orga-Aktion offen
					</div>
				) : (
					tasks.slice(0, 8).map(({ match, matchId, label, tone }) => (
						<Link
							key={`${matchId}-${label}`}
							href={`/tournament/admin/matches/${matchId}`}
							className={`rounded-xl border px-3 py-2.5 transition hover:bg-[var(--admin-step)] ${tone === "amber" ? "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)]" : "border-[var(--line)] bg-[var(--admin-step)]"}`}
						>
							<div className="truncate text-xs font-semibold text-[var(--text)]">{match ? `${match.teamALabel} vs ${match.teamBLabel}` : matchId}</div>
							<div className="mt-1 text-xs font-medium text-[var(--muted)]">{label}</div>
						</Link>
					))
				)}
			</div>
		</section>
	);
}

function StateBadge({ active, label }: { active: boolean; label: string }) {
	return (
		<span className="tally rounded-full border border-[var(--line)] px-3 py-1.5" data-tone={active ? "ok" : "warn"}>
			{label}
		</span>
	);
}

function Chip({ text }: { text: string }) {
	return <span className="rounded-full border border-[var(--line)] bg-[var(--admin-inset)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">{text}</span>;
}

function DangerChip({ text }: { text: string }) {
	return <span className="rounded-full border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--danger)]">{text}</span>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
	return (
		<div className="rounded-[12px] border border-dashed border-[var(--line)] bg-[var(--admin-inset)] px-5 py-8 text-center">
			<div className="text-sm font-semibold text-[var(--muted)]">{title}</div>
			<p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-[var(--muted)]">{text}</p>
		</div>
	);
}
