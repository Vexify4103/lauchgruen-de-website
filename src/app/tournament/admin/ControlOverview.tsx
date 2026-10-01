"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TOURNAMENT_KIND_LABELS } from "@/lib/tournament-kind";
import type { TournamentSettings } from "@/lib/tournament-settings";
import { TournamentLink as Link } from "../TournamentLink";
import { AdminModal } from "./AdminModal";
import { ArchiveTournamentPanel } from "./ArchiveTournamentPanel";
import { DiscordControlCenter } from "./DiscordControlCenter";
import { TournamentModePanel, type TournamentSettingsSection } from "./TournamentModePanel";
import { RefreshRanksButton } from "./applicants/RefreshRanksButton";
import { TournamentInformationEditor } from "./TournamentInformationEditor";
import { PreferenceGroupSettingsEditor } from "./PreferenceGroupSettingsEditor";

type ModalKey = TournamentSettingsSection | "riot" | "discord" | "information" | "groups";

const MODE_COPY: Record<TournamentSettings["activeTournament"]["mode"], { label: string; line: string; detail: string }> = {
	teaser: { label: "Ankündigung", line: "Angekündigt.", detail: "Nur Übersicht und Regeln sind öffentlich. Setze Format, Termine und Bewerbungszeitraum." },
	registration: { label: "Anmeldung", line: "Bewerbungen laufen.", detail: "Das Formular ist im gesetzten Zeitraum offen. Danach Teams im Roster-Builder bauen." },
	preparation: { label: "Vorbereitung", line: "Teams in Arbeit.", detail: "Roster bauen, veröffentlichen und die Stage seeden. Danach live schalten." },
	live: { label: "Live", line: "Turnier läuft.", detail: "Matches im Live-Cockpit freigeben, Drafts begleiten und Ergebnisse eintragen." },
	paused: { label: "Pausiert", line: "Pausiert.", detail: "Öffentliche Abläufe sind angehalten. Über den Lebenszyklus wieder live schalten." },
	finished: { label: "Abgeschlossen", line: "Champion steht fest.", detail: "Ergebnisse prüfen, archivieren und das nächste Turnier vorbereiten." },
};

export function ControlOverview({
	settings,
	settingsVersion,
	stats,
	archive,
	defaultRules,
}: {
	settings: TournamentSettings;
	defaultRules: string;
	settingsVersion: number;
	stats: { applications: number; teams: number; players: number; matchesFinished: number; matchesTotal: number; live: number; rosterPublished: boolean };
	archive: { pending: boolean; championTeam: string | null };
}) {
	const router = useRouter();
	const [modal, setModal] = useState<ModalKey | null>(null);
	const [informationDirty, setInformationDirty] = useState(false);
	const active = settings.activeTournament;
	const mode = MODE_COPY[active.mode];
	const close = () => {
		if (modal === "information" && informationDirty && !window.confirm("Ungespeicherte Turnierinformationen verwerfen?")) return;
		setInformationDirty(false);
		setModal(null);
	};
	const saved = () => router.refresh();
	const settingsModal = (key: TournamentSettingsSection, kicker: string, title: string, wide = false) => (
		<AdminModal open={modal === key} kicker={kicker} title={title} onClose={close} wide={wide}>
			<TournamentModePanel initialSettings={settings} initialVersion={settingsVersion} section={key} onSaved={saved} />
		</AdminModal>
	);

	return (
		<section className="control-overview" aria-labelledby="control-overview-title">
			<header className="control-overview-header">
				<div className="control-overview-copy">
					<p>
						Turnierorganisation · {TOURNAMENT_KIND_LABELS[active.kind]} · {active.season}
					</p>
					<h2 id="control-overview-title">
						{active.name}.
						<br />
						<span>{mode.line}</span>
					</h2>
					<small>{mode.detail}</small>
				</div>
				<aside className="control-status-panel" aria-label="Turnierstatus">
					<div>
						<span>Status</span>
						<strong>{mode.label}</strong>
						<small>
							{archive.pending
								? `Bereit zum Archivieren${archive.championTeam ? ` · Champion ${archive.championTeam}` : ""}.`
								: stats.rosterPublished
									? `${stats.teams} Teams veröffentlicht · Champ Select ${settings.draftEnabled ? "aktiv" : "pausiert"}.`
									: "Roster noch nicht veröffentlicht."}
						</small>
					</div>
					<div className="control-status-actions">
						<Link className="button ghost" href="/tournament" target="_blank" rel="noreferrer">
							Vorschau <span aria-hidden="true">↗</span>
						</Link>
						<button className={archive.pending ? "button primary" : "button ghost"} type="button" onClick={() => setModal("lifecycle")}>
							{archive.pending ? "Archivieren" : "Lebenszyklus"}
						</button>
					</div>
				</aside>
			</header>

			<div className="control-overview-toolbar">
				<div className="control-tool-group">
					<span>Turnier-Setup</span>
					<div>
						<button className="button ghost" type="button" onClick={() => setModal("information")}>
							Turnierinformationen
						</button>
						<button className="button ghost" type="button" onClick={() => setModal("format")}>
							Turnierformat
						</button>
						<button className="button ghost" type="button" onClick={() => setModal("rules")}>
							Regeln & Preise
						</button>
						<button className="button ghost" type="button" onClick={() => setModal("applications")}>
							Bewerbungszeitraum
						</button>
						<button className="button ghost" type="button" onClick={() => setModal("groups")}>
							Wunschgruppen
						</button>
						<button className="button ghost" type="button" onClick={() => setModal("lifecycle")}>
							Lebenszyklus
						</button>
					</div>
				</div>
				<div className="control-tool-group control-tool-operations">
					<span>Daten & Discord</span>
					<div>
						<button className="button ghost" type="button" onClick={() => setModal("riot")}>
							<span aria-hidden="true">↻</span> Riot-Daten aktualisieren
						</button>
						<button className="button ghost" type="button" onClick={() => setModal("discord")}>
							Discord-Steuerung
						</button>
						<Link className="button ghost" href="/tournament/admin/roster">
							Roster-Builder
						</Link>
						<Link className="button ghost" href="/tournament/admin/live">
							Live-Cockpit
						</Link>
					</div>
				</div>
			</div>

			<dl>
				<div>
					<dt>{stats.applications}</dt>
					<dd>Bewerbungen</dd>
				</div>
				<div>
					<dt>{stats.teams}</dt>
					<dd>Teams · {stats.players} Spieler</dd>
				</div>
				<div>
					<dt>
						{stats.matchesFinished}/{stats.matchesTotal}
					</dt>
					<dd>Matches beendet</dd>
				</div>
				<div>
					<dt>{stats.live}</dt>
					<dd>Aktiv im Draft / Spiel</dd>
				</div>
			</dl>

			{settingsModal("format", "Turnier-Setup", "Turnierformat", true)}
			<AdminModal open={modal === "information"} kicker="Turnier-Setup" title="Turnierinformationen" onClose={close} wide>
				{modal === "information" ? (
					<TournamentInformationEditor
						settings={settings}
						initialVersion={settingsVersion}
						defaultRules={defaultRules}
						onSaved={saved}
						onDirtyChange={setInformationDirty}
					/>
				) : null}
			</AdminModal>
			{settingsModal("rules", "Turnier-Setup", "Regeln & Preise", true)}
			{settingsModal("applications", "Turnier-Setup", "Bewerbungszeitraum", true)}
			<AdminModal open={modal === "groups"} kicker="Turnier-Setup" title="Wunschgruppen" onClose={close}>
				{modal === "groups" ? <PreferenceGroupSettingsEditor settings={settings} initialVersion={settingsVersion} onSaved={saved} /> : null}
			</AdminModal>
			<AdminModal open={modal === "lifecycle"} kicker="Turnier-Setup" title="Lebenszyklus" onClose={close} wide>
				<div className="grid gap-5">
					<TournamentModePanel initialSettings={settings} initialVersion={settingsVersion} section="lifecycle" onSaved={saved} />
					{archive.pending ? <ArchiveTournamentPanel activeName={active.name} championTeam={archive.championTeam} /> : null}
				</div>
			</AdminModal>
			<AdminModal open={modal === "riot"} kicker="Daten & Discord" title="Riot-Profile abgleichen" onClose={close} wide>
				<p className="mb-4 text-sm leading-6 text-[var(--muted)]">
					Aktualisiert Riot-ID, Rang und Summoner-Level sämtlicher gespeicherter Konten. Bewerbungen und Roster-Namen werden automatisch mitgezogen.
				</p>
				<RefreshRanksButton label="Alle Riot-Profile aktualisieren" confirmBulk scope="verified" />
			</AdminModal>
			<AdminModal open={modal === "discord"} kicker="Daten & Discord" title="Discord-Steuerung" onClose={close} wide>
				<DiscordControlCenter />
			</AdminModal>
		</section>
	);
}
