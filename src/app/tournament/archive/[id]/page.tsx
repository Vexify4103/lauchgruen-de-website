import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BracketTree } from "@/components/BracketTree";
import { SwissStageBoard } from "@/components/SwissStageBoard";
import { EmptyState, PageIntro } from "@/components/site/PageIntro";
import { playedChampionsByTeam } from "@/lib/fearless";
import { formatGameDuration } from "@/lib/match-duration";
import { TOURNAMENT_KIND_LABELS, tournamentKind, type TournamentKind } from "@/lib/tournament-kind";
import { getTournamentArchive, type ArchivedControlMatch, type TournamentArchive, type TournamentArchiveSnapshot } from "@/lib/tournament-next";
import { compactPoolLabel } from "@/lib/tournament-wheel";
import { TournamentLink as Link } from "../../TournamentLink";

type ArchiveView = "overview" | "teams" | "stage" | "playoffs" | "results" | "drafts";
type Snapshot = TournamentArchiveSnapshot;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
	const archive = await getTournamentArchive((await params).id);
	return archive ? { title: `${archive.title} · Archiv`, description: `${archive.championTeam} gewinnt ${archive.title} (${archive.dateLabel}).` } : {};
}

function archiveViews(snapshot: Snapshot | undefined, kind: TournamentKind): Array<{ id: ArchiveView; label: string }> {
	if (!snapshot) return [{ id: "overview", label: "Übersicht" }];
	const flexible = Boolean(snapshot.controlMatches);
	const hasStage = flexible ? Boolean(snapshot.swiss?.rounds.length) || snapshot.groupMatches.length > 0 : true;
	const draftsLabel = kind === "ultimate-bravery" ? "Builds" : kind === "az" ? "Pools & Drafts" : "Drafts";
	const hasDrafts = kind === "ultimate-bravery" ? Boolean(snapshot.ultimateBraveryRolls?.length) : snapshot.drafts.length > 0 || snapshot.wheel.history.length > 0;
	return [
		{ id: "overview", label: "Übersicht" },
		{ id: "teams", label: "Teams" },
		...(hasStage ? [{ id: "stage" as const, label: snapshot.swiss?.rounds.length ? "Swiss Stage" : "Gruppen" }] : []),
		{ id: "playoffs", label: "Bracket" },
		...(flexible ? [{ id: "results" as const, label: "Ergebnisse" }] : []),
		...(hasDrafts ? [{ id: "drafts" as const, label: draftsLabel }] : []),
	];
}

export default async function TournamentArchivePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
	const [{ id }, query] = await Promise.all([params, searchParams]);
	const archive = await getTournamentArchive(id);
	if (!archive) notFound();
	const snapshot = archive.snapshot;
	const kind = snapshot?.kind ?? tournamentKind({ id: archive.id });
	const views = archiveViews(snapshot, kind);
	// Old links used ?view=groups/pools for the A-Z archive.
	const requested = query.view === "groups" ? "stage" : query.view === "pools" ? "drafts" : query.view;
	const view = views.find((entry) => entry.id === requested)?.id ?? "overview";

	return (
		<>
			<section className="tournament-hero is-compact" aria-labelledby="archive-title">
				<div className="tournament-hero-mark">
					<Image src="/tournament-bear-mark.png" alt="" width={96} height={96} unoptimized />
				</div>
				<div className="tournament-hero-copy min-w-0">
					<p className="eyebrow">
						<i />
						Archiv · {archive.season}
					</p>
					<h1 id="archive-title">{archive.title}</h1>
					<ul className="tournament-pills" aria-label="Eckdaten">
						<li>{archive.dateLabel}</li>
						<li>{archive.format}</li>
						{snapshot ? <li>{snapshot.teams.length} Teams</li> : null}
					</ul>
				</div>
				<div className="hero-side-action">
					<small>Champion</small>
					<strong className="!text-[32px]">{archive.championTeam}</strong>
					<Link href="/tournament/winners" className="button ghost small">
						Alle Turniere
					</Link>
				</div>
			</section>
			{views.length > 1 ? (
				<nav className="tournament-subnav" aria-label="Archivseiten">
					{views.map((entry) => (
						<Link
							key={entry.id}
							href={`/tournament/archive/${archive.id}${entry.id === "overview" ? "" : `?view=${entry.id}`}`}
							aria-current={view === entry.id ? "page" : undefined}
						>
							{entry.label}
						</Link>
					))}
				</nav>
			) : null}

			<section className={`page-section compact-top ${view === "stage" || view === "playoffs" ? "wide" : ""}`}>
				{view === "overview" ? <Overview archive={archive} kind={kind} /> : null}
				{view === "teams" && snapshot ? <Teams snapshot={snapshot} kind={kind} /> : null}
				{view === "stage" && snapshot ? <Stage snapshot={snapshot} /> : null}
				{view === "playoffs" && snapshot ? <Playoffs snapshot={snapshot} /> : null}
				{view === "results" && snapshot?.controlMatches ? <Results matches={snapshot.controlMatches} /> : null}
				{view === "drafts" && snapshot ? <Drafts snapshot={snapshot} kind={kind} /> : null}
			</section>
		</>
	);
}

function Overview({ archive, kind }: { archive: TournamentArchive; kind: TournamentKind }) {
	const final = archive.snapshot?.controlMatches?.find((match) => match.id === "gf") ?? archive.snapshot?.playoffs.find((match) => match.id === "gf");
	return (
		<div className="two-columns">
			<div className="content-panel">
				<p className="panel-kicker text-[var(--amber)]">Champion</p>
				<h2 className="!text-[clamp(40px,6vw,76px)] !leading-[0.92]">{archive.championTeam}</h2>
				{archive.finalistTeam ? (
					<p>
						Grand Final gegen {archive.finalistTeam}
						{final && final.scoreA !== undefined && final.scoreB !== undefined ? ` · ${final.scoreA}:${final.scoreB}` : ""}
						{final && "gameDurationSeconds" in final && final.gameDurationSeconds ? ` · ${formatGameDuration(final.gameDurationSeconds)}` : ""}
					</p>
				) : null}
				<ul className="mt-6 flex flex-wrap gap-2" aria-label="Champion-Roster">
					{archive.championRoster.map((player) => (
						<li key={player} className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm font-bold">
							{player}
						</li>
					))}
				</ul>
				{archive.note ? <p className="alert mt-6">{archive.note}</p> : null}
			</div>
			<aside className="content-panel tight">
				<p className="panel-kicker">Archivstatus</p>
				<h2 className="!text-2xl">{archive.snapshot ? "Vollständiger Snapshot" : "Hall-of-Fame-Eintrag"}</h2>
				<p className="text-sm leading-6 text-[var(--muted)]">
					{archive.snapshot
						? `Teams, Stage, Bracket und ${kind === "ultimate-bravery" ? "Builds" : "Drafts"} zeigen den gespeicherten Turnierstand und ändern sich nicht mehr.`
						: "Für diesen älteren Eintrag wurden keine vollständigen Matchdaten archiviert."}
				</p>
				<dl className="facts !grid-cols-1">
					<div>
						<dt>Regelwerk</dt>
						<dd>{TOURNAMENT_KIND_LABELS[kind]}</dd>
					</div>
					<div>
						<dt>Archiviert</dt>
						<dd>{new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(new Date(archive.createdAt))}</dd>
					</div>
				</dl>
				{archive.vodUrl ? (
					<a href={archive.vodUrl} target="_blank" rel="noreferrer" className="button primary small mt-6">
						VOD ansehen <span aria-hidden="true">↗</span>
					</a>
				) : null}
			</aside>
		</div>
	);
}

function Teams({ snapshot, kind }: { snapshot: Snapshot; kind: TournamentKind }) {
	const played = kind === "fearless" && snapshot.controlMatches ? playedChampionsByTeam(snapshot.controlMatches) : null;
	return (
		<>
			<PageIntro kicker="Rosters" title="Das Line-up." as="h2" />
			<div className="roster-grid">
				{snapshot.teams.map((team) => (
					<article key={team.id} className="roster-card">
						<header className="roster-card-header">
							<div className="roster-card-title">
								{snapshot.controlMatches ? null : (
									<span>
										{team.group}
										{team.seed}
									</span>
								)}
								<h3>{team.name}</h3>
							</div>
							{played ? <span className="text-xs font-bold text-[var(--muted)]">{played.get(team.name)?.length ?? 0} gespielt</span> : null}
						</header>
						<p className="mt-2 text-xs text-[var(--muted)]">Captain: {team.captain}</p>
						<ul>
							{team.players.map((player) => (
								<li key={player.riotId}>
									<strong>{player.name}</strong>
									<small>{player.role}</small>
								</li>
							))}
						</ul>
					</article>
				))}
			</div>
		</>
	);
}

function Stage({ snapshot }: { snapshot: Snapshot }) {
	if (snapshot.swiss?.rounds.length && snapshot.structure) {
		return (
			<>
				<PageIntro kicker="Tag 1" title="Swiss Stage." as="h2" />
				<SwissStageBoard
					config={snapshot.structure}
					teamNames={snapshot.teams.map((team) => team.name)}
					state={snapshot.swiss}
					activeRound={snapshot.swiss.rounds.length}
				/>
			</>
		);
	}
	const groups = Object.keys(snapshot.standings)
		.filter((key) => Array.isArray(snapshot.standings[key]))
		.sort();
	return (
		<>
			<PageIntro kicker="Tag 1" title="Gruppenphase." as="h2" />
			<div className="standings-grid">
				{groups.map((group) => (
					<article key={group} className="standings-card">
						<header>
							<h3>Gruppe {group}</h3>
							<span>Abschlusstabelle</span>
						</header>
						<div className="standings-table-wrap">
							<table className="standings-table">
								<thead>
									<tr>
										<th scope="col">#</th>
										<th scope="col">Team</th>
										<th scope="col">W-L</th>
										<th scope="col">DV</th>
										<th scope="col" title="Durchschnittliche Siegzeit">
											Ø Sieg
										</th>
									</tr>
								</thead>
								<tbody>
									{snapshot.standings[group].map((standing) => (
										<tr key={standing.team.id} data-advancing={standing.rank === 1 ? "true" : undefined}>
											<td>{standing.rank}</td>
											<td>
												<strong>{standing.team.name}</strong>
											</td>
											<td>
												{standing.wins}-{standing.losses}
											</td>
											<td>{standing.headToHeadWins}</td>
											<td>{standing.avgRecordedWinTimeSeconds === null ? "–" : formatGameDuration(Math.round(standing.avgRecordedWinTimeSeconds))}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<ul className="grid gap-2 p-4">
							{snapshot.groupMatches
								.filter((match) => match.group === group)
								.map((match) => {
									const score = snapshot.matches[match.id];
									const assignment = snapshot.wheel.history.find((entry) => entry.matchId === match.id);
									return (
										<li key={match.id} className="rounded-xl border border-[var(--line)] bg-black/18 px-3 py-2 text-sm">
											<div className="flex items-center justify-between gap-3">
												<span className="truncate">
													{match.teamA} vs {match.teamB}
												</span>
												<strong className="tabular-nums">
													{score?.scoreA ?? "–"}:{score?.scoreB ?? "–"}
												</strong>
											</div>
											{assignment ? (
												<div className="mt-1 text-xs font-bold text-[var(--accent)]">
													{compactPoolLabel(assignment.teamAPool)} · {compactPoolLabel(assignment.teamBPool)}
												</div>
											) : null}
										</li>
									);
								})}
						</ul>
					</article>
				))}
			</div>
		</>
	);
}

function Playoffs({ snapshot }: { snapshot: Snapshot }) {
	const matches = snapshot.controlMatches
		? snapshot.controlMatches.filter((match) => match.phase === "playoffs").map((match) => ({ ...match, poolAssignment: null }))
		: snapshot.playoffs.map((match) => ({ ...match, poolAssignment: snapshot.wheel.history.find((entry) => entry.matchId === match.id) ?? null }));
	return (
		<>
			<PageIntro kicker="Tag 2" title="Das finale Bracket." as="h2" />
			{matches.length ? (
				<div className="content-panel tight !p-3 sm:!p-5">
					<BracketTree matches={matches} showPools={false} />
				</div>
			) : (
				<EmptyState title="Für dieses Turnier ist kein Bracket gespeichert." />
			)}
		</>
	);
}

function Results({ matches }: { matches: ArchivedControlMatch[] }) {
	const played = matches.filter((match) => match.status === "Finished" && match.teamAName && match.teamBName);
	return (
		<>
			<PageIntro kicker="Ergebnisse" title={`${played.length} gespielte Matches.`} as="h2" />
			<div className="standings-card">
				<div className="standings-table-wrap">
					<table className="standings-table">
						<thead>
							<tr>
								<th scope="col">Runde</th>
								<th scope="col">Begegnung</th>
								<th scope="col">Ergebnis</th>
								<th scope="col">Spielzeit</th>
							</tr>
						</thead>
						<tbody>
							{played.map((match) => (
								<tr key={match.id}>
									<td className="whitespace-nowrap text-left text-xs text-[var(--muted)]">{match.round}</td>
									<td>
										<span className={match.winner === match.teamAName ? "font-bold" : "text-[var(--muted)]"}>{match.teamAName}</span>
										<span className="text-[var(--muted)]"> vs </span>
										<span className={match.winner === match.teamBName ? "font-bold" : "text-[var(--muted)]"}>{match.teamBName}</span>
									</td>
									<td className="font-bold">
										{match.scoreA ?? "–"}:{match.scoreB ?? "–"}
									</td>
									<td>{match.gameDurationSeconds ? formatGameDuration(match.gameDurationSeconds) : "–"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</>
	);
}

function Drafts({ snapshot, kind }: { snapshot: Snapshot; kind: TournamentKind }) {
	const roundOf = new Map((snapshot.controlMatches ?? []).map((match) => [match.id, `${match.round} · ${match.teamALabel} vs ${match.teamBLabel}`]));
	if (kind === "ultimate-bravery") {
		const byMatch = new Map<string, NonNullable<Snapshot["ultimateBraveryRolls"]>>();
		for (const roll of snapshot.ultimateBraveryRolls ?? []) byMatch.set(roll.matchId, [...(byMatch.get(roll.matchId) ?? []), roll]);
		return (
			<>
				<PageIntro kicker="Ultimate Bravery" title="Alle gewürfelten Builds." as="h2" />
				<div className="grid gap-3">
					{[...byMatch.entries()].map(([matchId, rolls]) => (
						<details key={matchId} className="content-panel tight">
							<summary className="cursor-pointer font-display text-lg font-semibold">
								{roundOf.get(matchId) ?? matchId} <span className="text-sm text-[var(--muted)]">· {rolls.length} Spieler</span>
							</summary>
							<ul className="mt-4 grid gap-2 md:grid-cols-2">
								{rolls.map((roll) => (
									<li key={`${roll.teamName}-${roll.riotId}`} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-black/18 p-2">
										{roll.champion.imageUrl ? <Image src={roll.champion.imageUrl} alt="" width={40} height={40} className="size-10 rounded-lg" /> : null}
										<div className="min-w-0">
											<div className="truncate text-sm font-bold">
												{roll.champion.name} · {roll.riotId}
											</div>
											<div className="truncate text-xs text-[var(--muted)]">
												{roll.teamName} · {roll.role} · {roll.items.map((item) => item.name).join(", ") || "Build nicht gespeichert"}
											</div>
										</div>
									</li>
								))}
							</ul>
						</details>
					))}
				</div>
			</>
		);
	}
	return (
		<>
			<PageIntro kicker={kind === "az" ? "Pools & Drafts" : "Fearless"} title="Draft-Historie." as="h2" />
			{kind === "az" && snapshot.wheel.history.length ? (
				<div className="content-panel tight mb-4">
					<p className="panel-kicker">Gezogene Pools</p>
					<ul className="mt-3 grid gap-2 md:grid-cols-2">
						{snapshot.wheel.history.map((entry) => (
							<li key={`${entry.matchId}-${entry.spunAt}`} className="rounded-xl border border-[var(--line)] bg-black/18 p-3 text-sm">
								<strong className="text-[var(--accent)]">{entry.matchId}</strong>{" "}
								<span className="text-[var(--muted)]">
									{entry.teamAName}: {compactPoolLabel(entry.teamAPool)} · {entry.teamBName}: {compactPoolLabel(entry.teamBPool)}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
			<div className="grid gap-3">
				{snapshot.drafts.map((draft) => (
					<details key={draft.matchId} className="content-panel tight">
						<summary className="cursor-pointer font-display text-lg font-semibold">
							{roundOf.get(draft.matchId) ?? draft.matchId} <span className="text-sm text-[var(--muted)]">· {draft.actions.length} Aktionen</span>
						</summary>
						<ol className="mt-3 flex flex-wrap gap-2">
							{draft.actions.map((action, index) => (
								<li
									key={`${action.champion}-${index}`}
									className="rounded-lg border border-[var(--line)] bg-black/18 px-2 py-1 text-xs font-bold text-[var(--muted)]"
								>
									{action.side === "teamA" ? "Blue" : "Red"} {action.kind === "ban" ? "Ban" : "Pick"}:{" "}
									<span className="text-[var(--text)]">{action.champion}</span>
								</li>
							))}
						</ol>
					</details>
				))}
			</div>
		</>
	);
}
