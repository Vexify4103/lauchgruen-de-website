import { TournamentLink as Link } from "./TournamentLink";
import { areTournamentApplicationsOpen, formatTournamentApplicationDeadlineLabel } from "@/lib/tournament-application-deadline";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { playoffFormatLabel } from "@/lib/tournament-format";
import { mainEventTeamCount } from "@/lib/tournament-structure";
import { getTournamentSettings, type TournamentSettings } from "@/lib/tournament-settings";
import { listTournamentArchives } from "@/lib/tournament-next";
import { TournamentMarkdown } from "@/components/TournamentMarkdown";
import { getMatchControlContext, type ControlMatch } from "@/lib/match-control";
import { resolveTournamentCompletion, type TournamentCompletion } from "@/lib/tournament-completion";
import { getRosterPublicationStatus } from "@/lib/roster";
import { buildRulebook, formatTournamentDay, stageLabel } from "@/lib/tournament-presentation";

export default async function TournamentOverviewPage() {
	const [settings, archives, roster] = await Promise.all([getTournamentSettings(), listTournamentArchives(), getRosterPublicationStatus()]);
	const mode = settings.activeTournament.mode;
	const running = mode === "live" || mode === "paused" || mode === "finished";
	const [control, context] = running ? await Promise.all([getMatchControlContext(), getTournamentContext()]) : [null, null];
	const completion = mode === "finished" && control ? resolveTournamentCompletion(control.matches) : null;
	const championRoster = completion ? (context?.teams.find((team) => team.name === completion.championTeamName)?.players.map((player) => player.riotId) ?? []) : [];
	const applicationsOpen = areTournamentApplicationsOpen(
		settings.applicationsOpen,
		new Date(),
		settings.applicationDeadlineOverride,
		settings.applicationDeadline,
		settings.applicationOpenAt
	);

	return (
		<>
			{settings.activeTournament.description?.trim() ? (
				<section className="page-section compact-top">
					<div className="content-panel">
						<p className="panel-kicker">Über das Turnier</p>
						<p className="whitespace-pre-wrap">{settings.activeTournament.description}</p>
					</div>
				</section>
			) : null}
			{completion ? <ChampionSection completion={completion} roster={championRoster} /> : null}
			<section className="page-section compact-top two-columns" aria-label="Regelwerk und Ablauf">
				<RulebookPanel settings={settings} applicationsOpen={applicationsOpen} />
				<aside className="grid gap-4" aria-label="Turnierablauf">
					<Lifecycle settings={settings} rosterPublished={roster.published} />
					{settings.ultimateBravery.prizePool.trim() ? (
						<div className="content-panel tight">
							<p className="panel-kicker">Preise</p>
							<div className="mt-4">
								<TournamentMarkdown>{settings.ultimateBravery.prizePool}</TournamentMarkdown>
							</div>
						</div>
					) : null}
				</aside>
			</section>
			<HubLinks settings={settings} matches={control?.matches ?? []} teamCount={roster.published ? roster.teamCount : 0} archiveCount={archives.length} />
		</>
	);
}

function RulebookPanel({ settings, applicationsOpen }: { settings: TournamentSettings; applicationsOpen: boolean }) {
	const structure = settings.ultimateBravery;
	const rulebook = buildRulebook(settings);
	const participants = mainEventTeamCount(structure);
	const qualification =
		structure.dayOneFormat === "undecided"
			? "Wird festgelegt"
			: structure.advanceTeamCount >= participants
				? structure.playInTeamCount > 0
					? `Play-in, dann ${participants} Teams in die Playoffs`
					: "Alle Teams in die Playoffs"
				: `Top ${structure.advanceTeamCount} in die Playoffs`;
	return (
		<div className="content-panel">
			<p className="panel-kicker">Regelwerk</p>
			<h2>Tryhard. Aber fair.</h2>
			<p>
				Kein Esports-Turnier mit Millionenpreisgeld, sondern ein Community-Abend mit Anspruch. Seid fair, bleibt entspannt und habt Spaß. Das vollständige Regelwerk findest
				du unter{" "}
				<Link href="/tournament/terms" className="font-bold text-[var(--accent)] underline underline-offset-4">
					Turnierregeln
				</Link>
				.
			</p>
			<ol className="rule-list">
				{rulebook.map((rule) => (
					<li key={rule.title}>
						<strong>{rule.title}</strong>
						<span>{rule.text}</span>
					</li>
				))}
			</ol>
			<dl className="facts">
				<div>
					<dt>Teams</dt>
					<dd>
						{structure.teamCount} × {structure.playersPerTeam} Spieler
					</dd>
				</div>
				<div>
					<dt>Tag 1</dt>
					<dd>{stageLabel(structure) ?? "Format folgt"}</dd>
				</div>
				<div>
					<dt>Tag 2</dt>
					<dd>{playoffFormatLabel(structure.format) ?? "Format folgt"}</dd>
				</div>
				<div>
					<dt>Start</dt>
					<dd>{formatTournamentDay(structure.startAt) ?? "Wird angekündigt"}</dd>
				</div>
				<div>
					<dt>Qualifikation</dt>
					<dd>{qualification}</dd>
				</div>
				<div>
					<dt>Anmeldung</dt>
					<dd>{applicationsOpen ? `Offen bis ${formatTournamentApplicationDeadlineLabel(settings.applicationDeadline)}` : "Geschlossen"}</dd>
				</div>
			</dl>
		</div>
	);
}

const LIFECYCLE_STEPS = ["Anmelden", "Teams & Seeding", "Tag 1 · Stage", "Tag 2 · Playoffs & Finale"] as const;

function Lifecycle({ settings, rosterPublished }: { settings: TournamentSettings; rosterPublished: boolean }) {
	const mode = settings.activeTournament.mode;
	const current = mode === "finished" ? 4 : mode === "live" || mode === "paused" ? 2 : rosterPublished || mode === "preparation" ? 1 : 0;
	return (
		<ol className="status-stack">
			{LIFECYCLE_STEPS.map((label, index) => (
				<li key={label} data-state={index < current ? "done" : index === current ? "current" : undefined} aria-current={index === current ? "step" : undefined}>
					<span>{String(index + 1).padStart(2, "0")}</span>
					<p>{label}</p>
				</li>
			))}
		</ol>
	);
}

function ChampionSection({ completion, roster }: { completion: TournamentCompletion; roster: string[] }) {
	return (
		<section className="page-section compact-top compact-bottom" aria-labelledby="champion-title">
			<div className="content-panel relative overflow-hidden border-[color-mix(in_srgb,var(--amber)_35%,var(--line))]">
				<p className="panel-kicker text-[var(--amber)]">Champion</p>
				<h2 id="champion-title" className="!text-[clamp(40px,6vw,80px)] !leading-[0.92]">
					{completion.championTeamName}
				</h2>
				<p>
					{completion.championTeamName} gewinnt das Grand Final gegen {completion.finalistTeamName}.
				</p>
				<div className="mt-6 inline-grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border border-[var(--line)] bg-black/20 px-5 py-4">
					<span className={`truncate text-right text-sm font-bold ${completion.scoreA > completion.scoreB ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
						{completion.teamAName}
					</span>
					<span className="font-display text-2xl font-bold tabular-nums">
						{completion.scoreA}:{completion.scoreB}
					</span>
					<span className={`truncate text-sm font-bold ${completion.scoreB > completion.scoreA ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
						{completion.teamBName}
					</span>
				</div>
				{roster.length ? (
					<ul className="mt-6 flex flex-wrap gap-2" aria-label="Champion-Roster">
						{roster.map((riotId) => (
							<li key={riotId} className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm font-bold">
								{riotId}
							</li>
						))}
					</ul>
				) : null}
			</div>
		</section>
	);
}

function HubLinks({ settings, matches, teamCount, archiveCount }: { settings: TournamentSettings; matches: ControlMatch[]; teamCount: number; archiveCount: number }) {
	const structure = settings.ultimateBravery;
	const playoffMatches = matches.filter((match) => match.phase === "playoffs");
	const stageMatches = matches.filter((match) => match.phase === "groups" || match.phase === "play-in");
	const finished = (list: ControlMatch[]) => list.filter((match) => match.status === "Finished").length;
	const liveCount = matches.filter((match) => match.status === "Live" || match.status === "Pending").length;
	const links = [
		settings.activeTournament.mode === "live"
			? {
					href: "/tournament/live",
					kicker: "Live-Zentrale",
					title: liveCount ? `${liveCount} ${liveCount === 1 ? "Match läuft" : "Matches laufen"} gerade` : "Alle laufenden Matches",
					text: "Streams, Drafts und Ergebnisse in Echtzeit.",
					primary: true,
				}
			: null,
		structure.format !== "undecided"
			? {
					href: "/tournament/playoffs",
					kicker: "Bracket",
					title: "Das komplette Bracket",
					text: playoffMatches.length ? `${playoffMatches.length} Matches · ${finished(playoffMatches)} beendet` : "Wird nach der Stage automatisch gefüllt.",
					primary: settings.activeTournament.mode !== "live",
				}
			: null,
		teamCount ? { href: "/tournament/teams", kicker: "Teams", title: "Das Line-up", text: `${teamCount} Teams mit Roster und Captain` } : null,
		structure.dayOneFormat !== "undecided"
			? {
					href: "/tournament/stage",
					kicker: stageLabel(structure) ?? "Stage",
					title: "Tabelle & Qualifikation",
					text: stageMatches.length ? `${stageMatches.length} Matches · ${finished(stageMatches)} beendet` : "Paarungen folgen am ersten Turniertag.",
				}
			: null,
		settings.activeTournament.kind === "fearless" && teamCount
			? { href: "/tournament/fearless", kicker: "Fearless", title: "Gesperrte Champions", text: "Welche Champions jedes Team schon verbraucht hat." }
			: null,
		{
			href: "/tournament/winners",
			kicker: "Archiv",
			title: "Hall of Fame",
			text: `${archiveCount} ${archiveCount === 1 ? "vergangenes Turnier" : "vergangene Turniere"} im Archiv`,
		},
	].filter((link): link is NonNullable<typeof link> => Boolean(link));

	return (
		<section className="page-section compact-top" aria-labelledby="hub-title">
			<div className="section-title">
				<p>Turnier-Hub</p>
				<h2 id="hub-title">Jede Runde im Blick.</h2>
				<span>Die Detailseiten aktualisieren sich automatisch, sobald die Orga Roster, Paarungen und Ergebnisse veröffentlicht.</span>
			</div>
			<div className="tournament-overview-links">
				{links.map((link, index) => (
					<Link
						key={link.href}
						href={link.href}
						className={`tournament-overview-link ${"primary" in link && link.primary && index === links.findIndex((entry) => "primary" in entry && entry.primary) ? "primary" : ""}`}
					>
						<span>{link.kicker}</span>
						<h3>{link.title}</h3>
						<p>{link.text}</p>
						<b aria-hidden="true">↗</b>
					</Link>
				))}
			</div>
		</section>
	);
}
