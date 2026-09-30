import type { Metadata } from "next";
import { listTournamentArchives, type TournamentArchive } from "@/lib/tournament-next";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { tournamentKind, type TournamentKind } from "@/lib/tournament-kind";
import { formatTournamentDay, tournamentModeLabel } from "@/lib/tournament-presentation";
import { PageIntro, EmptyState } from "@/components/site/PageIntro";
import { TournamentLink as Link } from "../TournamentLink";

export const metadata: Metadata = {
	title: "Turniere & Hall of Fame",
	description: "Alle Lauchgruen Community-Turniere: das aktuelle Turnier, vergangene Sieger, Teams und Brackets.",
};

const KIND_EMBLEMS: Record<TournamentKind, string> = { az: "AZ", "ultimate-bravery": "UB", fearless: "F" };

function archiveKind(archive: TournamentArchive): TournamentKind {
	return archive.snapshot?.kind ?? tournamentKind({ id: archive.id });
}

export default async function TournamentListPage() {
	const [settings, archives] = await Promise.all([getTournamentSettings(), listTournamentArchives()]);
	const active = settings.activeTournament;
	const activeArchived = archives.some((archive) => archive.id === active.id);
	const start = formatTournamentDay(settings.ultimateBravery.startAt);

	return (
		<div className="inner-page">
			<section className="page-section page-hero">
				<PageIntro kicker="Community-Turniere" title="Finde dein nächstes Bracket." compact={false}>
					Jedes Lauchgruen-Turnier lebt hier, von der Anmeldung bis zum Grand Final. Abgeschlossene Turniere bleiben mit Teams, Stage und Bracket im Archiv.
				</PageIntro>
			</section>
			<section className="page-section compact-top">
				{activeArchived ? null : (
					<>
						<h2 className="filter-label">
							<span>Aktuell</span>
							<i>1</i>
						</h2>
						<div className="tournament-list">
							<Link className="tournament-card" href="/tournament">
								<div className="game-emblem" aria-hidden="true">
									{KIND_EMBLEMS[active.kind]}
								</div>
								<div className="tournament-card-copy">
									<span>{tournamentModeLabel(active.mode).label}</span>
									<h3>{active.name}</h3>
									<p>{active.season}</p>
								</div>
								<div className="tournament-card-meta">
									<strong>{start ?? "Termin folgt"}</strong>
									<small>League of Legends · EUW</small>
									<b>
										Turnier ansehen <span aria-hidden="true">↗</span>
									</b>
								</div>
							</Link>
						</div>
					</>
				)}

				<h2 className={`filter-label ${activeArchived ? "" : "past"}`}>
					<span>Hall of Fame</span>
					<i>{archives.length}</i>
				</h2>
				{archives.length === 0 ? (
					<EmptyState title="Noch keine abgeschlossenen Turniere.">Der erste Eintrag wartet auf den Champion von {active.name}.</EmptyState>
				) : (
					<div className="tournament-list">
						{archives.map((archive) => (
							<ArchiveCard key={archive.id} archive={archive} />
						))}
					</div>
				)}
			</section>
		</div>
	);
}

function ArchiveCard({ archive }: { archive: TournamentArchive }) {
	const body = (
		<>
			<div className="game-emblem" aria-hidden="true">
				{KIND_EMBLEMS[archiveKind(archive)]}
			</div>
			<div className="tournament-card-copy">
				<span>Champion · {archive.championTeam}</span>
				<h3>{archive.title}</h3>
				<p>
					{archive.finalistTeam ? `Finale gegen ${archive.finalistTeam}. ` : ""}
					{archive.championRoster.join(" · ")}
				</p>
				{archive.note ? <p className="mt-2 text-sm">{archive.note}</p> : null}
			</div>
			<div className="tournament-card-meta">
				<strong>{archive.dateLabel}</strong>
				<small>{archive.format}</small>
				<b>
					{archive.snapshot ? (
						<>
							Archiv ansehen <span aria-hidden="true">↗</span>
						</>
					) : (
						"Hall-of-Fame-Eintrag"
					)}
				</b>
			</div>
		</>
	);
	return archive.snapshot ? (
		<Link className="tournament-card" href={`/tournament/archive/${archive.id}`}>
			{body}
		</Link>
	) : (
		<article className="tournament-card">{body}</article>
	);
}
