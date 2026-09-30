import { redirect } from "next/navigation";
import { TournamentLink as Link } from "../../TournamentLink";
import { auth } from "@/lib/auth";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { loadRosterSnapshot } from "@/lib/roster";
import { RosterBuilder } from "./RosterBuilder";
import { getAdminVersion } from "@/lib/admin-version";
import { RefreshRanksButton } from "../applicants/RefreshRanksButton";
import { getTournamentSettings } from "@/lib/tournament-settings";

export const dynamic = "force-dynamic";

export default async function RosterPage() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));

	// The admin layout already gates access; this only guards direct renders.
	if (!isOwner) redirect("/tournament/admin");

	const [snapshot, version, settings] = await Promise.all([loadRosterSnapshot(), getAdminVersion("roster"), getTournamentSettings()]);

	return (
		<>
			<section className="control-overview" aria-labelledby="roster-overview-title">
				<header className="control-overview-header">
					<div className="control-overview-copy">
						<p>Turnierorganisation · Roster</p>
						<h2 id="roster-overview-title">
							Teams bauen.
							<br />
							<span>Balance sehen.</span>
						</h2>
						<small>
							Spieler zuweisen, Wunschgruppen prüfen und Teamstärken vergleichen. „Entwurf speichern“ bleibt privat; erst „Teams veröffentlichen“ aktualisiert
							Website, Bot-Rollen und Benachrichtigungen.
						</small>
					</div>
					<aside className="control-status-panel" aria-label="Veröffentlichung">
						<div>
							<span>Veröffentlichung</span>
							<strong>{snapshot.publication.publishedAt ? "Öffentliche Teams" : "Privater Entwurf"}</strong>
							<small>
								{snapshot.publication.publishedAt
									? snapshot.publication.hasUnpublishedChanges
										? "Der Entwurf enthält Änderungen, die noch nicht veröffentlicht sind."
										: "Website und Discord zeigen den aktuellen Stand."
									: "Nur Admins sehen die Teams, bis du sie veröffentlichst."}
							</small>
						</div>
						<div className="control-status-actions">
							<Link className="button ghost" href="/tournament/teams" target="_blank" rel="noreferrer">
								Vorschau <span aria-hidden="true">↗</span>
							</Link>
						</div>
					</aside>
				</header>
				<div className="control-overview-toolbar">
					<div className="control-tool-group">
						<span>Daten</span>
						<div>
							<RefreshRanksButton label="Spielerdaten aktualisieren" confirmBulk />
						</div>
					</div>
				</div>
				<dl>
					<div>
						<dt>{snapshot.applicants.length}</dt>
						<dd>Bewerber</dd>
					</div>
					<div>
						<dt>
							{snapshot.teams.length}/{settings.ultimateBravery.teamCount}
						</dt>
						<dd>Teams</dd>
					</div>
					<div>
						<dt>{snapshot.teams.reduce((total, team) => total + team.players.length, 0)}</dt>
						<dd>Zugewiesen</dd>
					</div>
					<div>
						<dt>{snapshot.teams.filter((team) => team.captainDiscordId).length}</dt>
						<dd>Captains</dd>
					</div>
				</dl>
			</section>

			<RosterBuilder
				snapshot={snapshot}
				initialVersion={version}
				dayOneFormat={settings.ultimateBravery.dayOneFormat}
				groupCount={settings.ultimateBravery.groupCount}
				plannedTeamCount={settings.ultimateBravery.teamCount}
			/>
		</>
	);
}
