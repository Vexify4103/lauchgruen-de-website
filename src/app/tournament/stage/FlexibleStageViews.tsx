import { TournamentLink as Link } from "../TournamentLink";
import { BracketTree } from "@/components/BracketTree";
import { StandingsTable } from "@/components/StandingsTable";
import { PageIntro } from "@/components/site/PageIntro";
import type { ControlMatch } from "@/lib/match-control";
import type { TournamentSettings } from "@/lib/tournament-settings";
import type { FlexibleStages } from "@/lib/tournament-stages";
import { DAY_ONE_FORMAT_DETAILS, bestOfLabel, describeTiebreakers, mainEventTeamCount } from "@/lib/tournament-structure";

type Config = TournamentSettings["ultimateBravery"];

const STATUS_LABELS: Record<string, string> = { Scheduled: "Geplant", Pending: "Champ Select", Live: "Live", Finished: "Beendet", Locked: "Offen" };

/** Compact list of stage matches with score, series length and status. */
export function StageMatchList({ matches, title }: { matches: ControlMatch[]; title?: string }) {
	if (!matches.length) return null;
	return (
		<div className="content-panel tight">
			{title ? (
				<h2 className="filter-label">
					<span>{title}</span>
					<i>{matches.length}</i>
				</h2>
			) : null}
			<ul className="grid gap-2 md:grid-cols-2">
				{matches.map((match) => {
					const scored = match.scoreA !== undefined && match.scoreB !== undefined;
					return (
						<li key={match.id} data-stage-match-id={match.id}>
							<Link
								href={`/tournament/matches/${match.id}`}
								className={`grid gap-1 rounded-xl border px-3 py-2.5 text-sm transition hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] ${match.status === "Live" ? "border-[color-mix(in_srgb,var(--live)_40%,var(--line))]" : "border-[var(--line)]"}`}
							>
								<span className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
									<span className="truncate">{match.round}</span>
									<span className="shrink-0">
										{match.bestOf > 1 ? `${bestOfLabel(match.bestOf)} · ` : ""}
										{STATUS_LABELS[match.status] ?? match.status}
									</span>
								</span>
								<span className="flex items-center justify-between gap-3 font-bold">
									<span className={`min-w-0 truncate ${match.winner && match.winner === match.teamAName ? "text-[var(--accent)]" : ""}`}>{match.teamALabel}</span>
									<span className="shrink-0 tabular-nums text-[var(--muted)]">{scored ? `${match.scoreA}:${match.scoreB}` : "vs"}</span>
									<span className={`min-w-0 truncate text-right ${match.winner && match.winner === match.teamBName ? "text-[var(--accent)]" : ""}`}>
										{match.teamBLabel}
									</span>
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

export function PlayInSection({ stages, matches, config }: { stages: FlexibleStages; matches: ControlMatch[]; config: Config }) {
	const playInMatches = matches.filter((match) => match.phase === "play-in");
	return (
		<section className="page-section compact-top">
			<PageIntro kicker="Vor Tag 1 · Play-in" title={`${config.playInTeamCount} Teams, ${config.playInTeamCount / 2} Plätze.`}>
				Die Sieger ziehen an Tag 1 ein, die Verlierer scheiden aus. Alle Play-in-Matches sind {bestOfLabel(config.bestOf.dayOne)}.
			</PageIntro>
			{stages.playIn ? (
				<StageMatchList matches={playInMatches} />
			) : (
				<p className="content-panel tight text-sm text-[var(--muted)]">Die Play-in-Paarungen werden vor Turnierstart von der Turnierleitung festgelegt.</p>
			)}
		</section>
	);
}

export function DirectPlayoffsStage({ stages, config }: { stages: FlexibleStages; config: Config }) {
	const seeds = Object.entries(stages.dayOne.seeds).sort(([a], [b]) => Number(a) - Number(b));
	return (
		<section className="page-section compact-top">
			<PageIntro kicker="Tag 1 · Setzliste" title="Keine Vorrunde. Direkt ins Bracket.">
				{DAY_ONE_FORMAT_DETAILS.none} {mainEventTeamCount(config)} Teams starten in den Playoffs.
			</PageIntro>
			<div className="content-panel tight">
				<ol className="grid gap-2 sm:grid-cols-2">
					{seeds.map(([seed, name]) => (
						<li key={seed} className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-bold">
							<span className="w-10 shrink-0 tabular-nums text-[var(--accent)]">#{seed}</span>
							<span className={name ? "" : "text-[var(--muted)]"}>{name ?? "Folgt nach Veröffentlichung"}</span>
						</li>
					))}
				</ol>
				<Link href="/tournament/playoffs" className="button ghost small mt-5">
					Zum Bracket
				</Link>
			</div>
		</section>
	);
}

export function GslStage({ stages, matches, config }: { stages: FlexibleStages; matches: ControlMatch[]; config: Config }) {
	return (
		<section className="page-section compact-top wide">
			<PageIntro kicker="Tag 1 · GSL-Gruppen" title={`${stages.dayOne.groups.length} Gruppen à vier. Zwei kommen weiter.`}>
				{DAY_ONE_FORMAT_DETAILS.gsl} Alle Gruppenspiele sind {bestOfLabel(config.bestOf.dayOne)}.
			</PageIntro>
			<div className="grid gap-5">
				{stages.dayOne.groups.map((group) => {
					const groupMatches = matches.filter((match) => match.group === group.group);
					return (
						<article key={group.group} className="content-panel tight !p-3 sm:!p-5">
							<header className="mb-4 flex flex-wrap items-end justify-between gap-3">
								<h2 className="font-display text-2xl font-semibold">Gruppe {group.group}</h2>
								<ol className="flex flex-wrap gap-2 text-xs font-bold">
									{[1, 2, 3, 4].map((place) => (
										<li
											key={place}
											className={`rounded-full border px-3 py-1 ${place <= 2 ? "border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted)]"}`}
										>
											{place}. {group.placements?.[place] ?? "offen"}
										</li>
									))}
								</ol>
							</header>
							{groupMatches.length ? (
								<BracketTree matches={groupMatches} showPools={false} />
							) : (
								<p className="text-sm text-[var(--muted)]">{group.teams.length ? group.teams.join(" · ") : "Die Gruppe wird noch besetzt."}</p>
							)}
						</article>
					);
				})}
			</div>
		</section>
	);
}

export function FlexibleGroupsStage({ stages, matches, config }: { stages: FlexibleStages; matches: ControlMatch[]; config: Config }) {
	const groups = stages.dayOne.groups;
	return (
		<section className="page-section compact-top wide">
			<PageIntro
				kicker="Tag 1 · Gruppenphase"
				title={`${groups.length} ${groups.length === 1 ? "Gruppe" : "Gruppen"}. ${config.advanceTeamCount >= mainEventTeamCount(config) ? "Alle ziehen weiter." : `Top ${config.advanceTeamCount} ziehen weiter.`}`}
			>
				{config.groupRoundRobinLegs === 2 ? "Hin- und Rückrunde" : "Jeder gegen jeden"}, alle Spiele {bestOfLabel(config.bestOf.dayOne)}. Platzierung:{" "}
				{describeTiebreakers(config.tiebreakers)}.
			</PageIntro>
			<div className="standings-grid">
				{groups.map((group) => (
					<StandingsTable
						key={group.group}
						kicker={`Gruppe ${group.group}`}
						title={`${group.teams.length} Teams`}
						standings={group.standings}
						advancing={group.advancingPlaces}
						showGames={config.bestOf.dayOne > 1}
						full={groups.length === 1}
					/>
				))}
			</div>
			<div className="mt-6 grid gap-5">
				{groups.map((group) => (
					<StageMatchList key={group.group} title={`Gruppe ${group.group} · Matches`} matches={matches.filter((match) => match.group === group.group)} />
				))}
			</div>
		</section>
	);
}
