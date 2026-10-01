import { TournamentLink as Link } from "../TournamentLink";
import { computeGroupStandings, resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { listAuditLog } from "@/lib/tournament-audit";
import { playoffFormatLabel } from "@/lib/tournament-format";
import { stageLabel } from "@/lib/tournament-presentation";
import { getTournamentSettings, type TournamentSettings } from "@/lib/tournament-settings";
import { listApplications, readTournamentState } from "@/lib/tournament-storage";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getTournamentWheelState } from "@/lib/tournament-wheel";
import { getAdminVersions } from "@/lib/admin-version";
import { getTournamentArchive, listTournamentArchives } from "@/lib/tournament-next";
import { getMatchControlContext, type ControlMatch } from "@/lib/match-control";
import { resolveTournamentCompletion } from "@/lib/tournament-completion";
import { getRosterPublicationStatus } from "@/lib/roster";
import { usesFlexibleEngine, usesUltimateBravery } from "@/lib/tournament-kind";
import type { TournamentTeam } from "@/lib/tournament-data";
import { MatchAdminClient, type AdminMatch } from "./MatchAdminClient";
import { AuditLogPanel } from "./AuditLogPanel";
import { WheelAdminClient } from "./WheelAdminClient";
import { ControlOverview } from "./ControlOverview";
import { getDefaultRulesMarkdown } from "@/lib/tournament-rulebook";

const STATUS_LABELS: Record<string, string> = { Pending: "Draft", Live: "Im Spiel", Scheduled: "Geplant", Finished: "Beendet", Locked: "Offen" };

export default async function TournamentAdminPage() {
	const [settings, audit, archives, control, applications, roster, context] = await Promise.all([
		getTournamentSettings(),
		listAuditLog(),
		listTournamentArchives(),
		getMatchControlContext(),
		listApplications(),
		getRosterPublicationStatus(),
		getTournamentContext(),
	]);
	const active = settings.activeTournament;
	const flexible = usesFlexibleEngine(active);
	const archivePending = active.mode === "finished" && !(await getTournamentArchive(active.id));
	const completion = archivePending ? resolveTournamentCompletion(control.matches) : null;
	const playable = control.matches.filter((match) => match.teamAName && match.teamBName);
	const running = playable.filter((match) => match.status === "Live" || match.status === "Pending");
	const upcoming = playable.filter((match) => match.status === "Scheduled").slice(0, 6);
	const missingResults = playable.filter((match) => match.status === "Finished" && (match.scoreA === undefined || match.scoreB === undefined));

	// Legacy A-Z events keep their inline match table and pool wheel.
	const legacy = flexible ? null : await loadLegacyAdmin();
	const versions = await getAdminVersions(["settings", ...(legacy?.matches.map((match) => `match:${match.id}`) ?? [])]);

	return (
		<>
			<ControlOverview
				defaultRules={getDefaultRulesMarkdown(settings)}
				settings={settings}
				settingsVersion={versions.settings ?? 0}
				stats={{
					applications: applications.length,
					teams: roster.published ? roster.teamCount : context.teams.length,
					players: roster.playerCount,
					matchesFinished: playable.filter((match) => match.status === "Finished").length,
					matchesTotal: control.matches.length,
					live: running.length,
					rosterPublished: roster.published,
				}}
				archive={{ pending: archivePending, championTeam: completion?.championTeamName ?? null }}
			/>

			<div className="admin-split">
				<div className="min-w-0">
					<section className="admin-panel" aria-labelledby="match-desk-title">
						<div className="admin-panel-head">
							<div>
								<span>Match Desk</span>
								<h2 id="match-desk-title">Aktive & nächste Matches</h2>
							</div>
							<Link href="/tournament/admin/live" className="button ghost small">
								Live-Cockpit öffnen
							</Link>
						</div>
						{running.length + upcoming.length === 0 ? (
							<div className="attention-clear">
								<p>
									{control.matches.length === 0
										? "Noch keine Matches. Sobald Roster und Stage stehen, erscheinen sie hier."
										: "Gerade läuft nichts und kein weiteres Match ist angesetzt."}
								</p>
							</div>
						) : (
							<ul className="attention-list">
								{[...running, ...upcoming].map((match) => (
									<MatchRow key={match.id} match={match} />
								))}
							</ul>
						)}
					</section>

					{legacy ? (
						<section className="admin-panel">
							{legacy.tiebreakerGroups.length > 0 ? (
								<p role="alert" className="alert mb-5">
									<strong>Tiebreaker erforderlich:</strong> {legacy.tiebreakerGroups.map((group) => `Gruppe ${group}`).join(", ")} ist nicht eindeutig
									entschieden.
								</p>
							) : null}
							<MatchAdminClient
								initialMatches={legacy.matches}
								initialStored={legacy.stored}
								initialVersions={Object.fromEntries(legacy.matches.map((match) => [match.id, versions[`match:${match.id}`] ?? 0]))}
								ultimateBravery={usesUltimateBravery(active)}
							/>
						</section>
					) : null}
					{legacy ? (
						<div className="mb-[18px]">
							<WheelAdminClient initialState={legacy.wheel} matches={legacy.matches} />
						</div>
					) : null}
				</div>

				<aside className="min-w-0">
					<section className="admin-panel" aria-labelledby="attention-title">
						<div className="admin-panel-head">
							<div>
								<span>Braucht Aufmerksamkeit</span>
								<h2 id="attention-title">Offene Ergebnisse</h2>
							</div>
							<b aria-label={`${missingResults.length} offen`}>{missingResults.length}</b>
						</div>
						{missingResults.length === 0 ? (
							<div className="attention-clear">
								<span aria-hidden="true">✓</span>
								<p>Alle beendeten Matches haben ein Ergebnis.</p>
							</div>
						) : (
							<ul className="attention-list">
								{missingResults.map((match) => (
									<MatchRow key={match.id} match={match} warn />
								))}
							</ul>
						)}
					</section>
					<ReadinessPanel settings={settings} teams={context.teams} rosterPublished={roster.published} latestArchiveTitle={archives[0]?.title ?? null} />
				</aside>
			</div>

			<AuditLogPanel key={audit[0]?.id ?? "empty"} initialEntries={audit} />
		</>
	);
}

function MatchRow({ match, warn = false }: { match: ControlMatch; warn?: boolean }) {
	const tone = warn ? "warn" : match.status === "Live" || match.status === "Pending" ? "live" : undefined;
	return (
		<li>
			<Link href={`/tournament/admin/matches/${encodeURIComponent(match.id)}`}>
				<div className="min-w-0">
					<span>{match.round}</span>
					<strong>
						{match.teamALabel} <i className="px-1 font-normal not-italic text-[var(--muted)]">vs</i> {match.teamBLabel}
					</strong>
				</div>
				<b data-tone={tone}>{warn ? "Ergebnis fehlt" : (STATUS_LABELS[match.status] ?? match.status)}</b>
			</Link>
		</li>
	);
}

function ReadinessPanel({
	settings,
	teams,
	rosterPublished,
	latestArchiveTitle,
}: {
	settings: TournamentSettings;
	teams: TournamentTeam[];
	rosterPublished: boolean;
	latestArchiveTitle: string | null;
}) {
	const config = settings.ultimateBravery;
	const openAt = settings.applicationOpenAt ? new Date(settings.applicationOpenAt).getTime() : Number.NaN;
	const deadline = new Date(settings.applicationDeadline).getTime();
	const stage = stageLabel(config);
	const checks = [
		{
			label: "Format",
			done: Boolean(stage) && config.format !== "undecided" && Boolean(config.startAt),
			detail: stage ? `${stage} · ${playoffFormatLabel(config.format) ?? "Playoffs offen"}` : "Stage und Playoffs festlegen",
		},
		{
			label: "Bewerbungszeitraum",
			done: Number.isFinite(openAt) && Number.isFinite(deadline) && openAt < deadline,
			detail: "Start und Frist gültig gesetzt",
		},
		{ label: "Roster veröffentlicht", done: rosterPublished, detail: rosterPublished ? `${teams.length} Teams öffentlich` : "Im Roster-Builder veröffentlichen" },
		{
			label: "Captains",
			done: teams.length > 0 && teams.every((team) => Boolean(team.captainRef)),
			detail: `${teams.filter((team) => team.captainRef).length}/${teams.length} gesetzt`,
		},
		{
			label: "Discord-Rollen",
			done: teams.length > 0 && teams.every((team) => Boolean(team.discordRoleId)),
			detail: `${teams.filter((team) => team.discordRoleId).length}/${teams.length} verknüpft`,
		},
		{ label: "Archiv", done: Boolean(latestArchiveTitle), detail: latestArchiveTitle ? `Zuletzt: ${latestArchiveTitle}` : "Noch kein Turnier archiviert" },
	];
	return (
		<section className="admin-panel" aria-labelledby="readiness-title">
			<div className="admin-panel-head">
				<div>
					<span>Vorbereitung</span>
					<h2 id="readiness-title">Startklar-Check</h2>
				</div>
				<b>
					{checks.filter((check) => check.done).length}/{checks.length}
				</b>
			</div>
			<ul className="attention-list">
				{checks.map((check) => (
					<li key={check.label}>
						<div>
							<div className="min-w-0">
								<span>{check.label}</span>
								<strong className="!text-[13px] !font-semibold text-[var(--muted)]">{check.detail}</strong>
							</div>
							<b data-tone={check.done ? undefined : "warn"}>{check.done ? "✓ Erledigt" : "Offen"}</b>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

async function loadLegacyAdmin() {
	const ctx = await getTournamentContext();
	const [state, wheel] = await Promise.all([readTournamentState(ctx.groupMatches), getTournamentWheelState()]);
	const withPools = new Set([...wheel.history.map((assignment) => assignment.matchId), ...(wheel.currentAssignment ? [wheel.currentAssignment.matchId] : [])]);
	const standings = computeGroupStandings(state.matches, ctx.teams, ctx.groupMatches);
	const matches: AdminMatch[] = [
		...ctx.groupMatches.map<AdminMatch>((match) => ({
			id: match.id,
			phase: "groups",
			group: match.group,
			round: match.round,
			teamA: match.teamA,
			teamB: match.teamB,
			status: (state.matches[match.id]?.status ?? match.status) as AdminMatch["status"],
			poolsDrawn: withPools.has(match.id),
		})),
		...resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches).map<AdminMatch>((match) => ({
			id: match.id,
			phase: "playoffs",
			round: match.round,
			teamA: match.teamALabel,
			teamB: match.teamBLabel,
			status: match.status as AdminMatch["status"],
			poolsDrawn: withPools.has(match.id),
		})),
	];
	return {
		matches,
		stored: state.matches,
		wheel,
		tiebreakerGroups: Object.keys(standings).filter((group) => standings[group].some((standing) => standing.tiebreakerRequired)),
	};
}
