import { TournamentLink as Link } from "../TournamentLink";
import type { ReactNode } from "react";

const dataItems = [
  {
    title: "Optionale Twitch-Verknüpfung",
    text: "Wenn du Twitch freiwillig verbindest, speichern wir deine Twitch-ID, deinen Login, Anzeigenamen, dein Profilbild sowie deine Einstellung zur öffentlichen Live-Anzeige. Zugriffstoken werden nach der Verknüpfung nicht dauerhaft gespeichert. Während eines laufenden Matches prüfen wir über die Twitch-API, ob dein Kanal live ist.",
  },
  {
    title: "Discord-Daten",
    text: "Beim Login speichern wir deine Discord-ID, deinen Discord-Handle und, falls verfügbar, deinen Nutzernamen. Wir prüfen außerdem, ob du Mitglied des Lauchgruen-Discords bist, weil die Teilnahme an den Discord-Server gebunden ist.",
  },
  {
    title: "Riot-Account-Daten",
    text: "Für die Riot-Verifizierung speichern wir Riot-ID, Game Name, Tagline, PUUID, Verifizierungszeitpunkt und deinen automatisch ermittelten Solo/Duo-Rang. Die PUUID bleibt stabil, damit Namensänderungen später korrekt zugeordnet werden können.",
  },
  {
    title: "Bewerbungsdaten",
    text: "Wir speichern Anzeigename, Main Rolle, Wunschrollen, Teilnahmebestätigung für die angekündigten Termine, Notizen und Zeitpunkte der Bewerbung bzw. Bearbeitung.",
  },
  {
    title: "Turnierdaten",
    text: "Während des Turniers speichern wir Teamzuweisungen, Captains, Gruppen, Seeds, Matchstatus, Scores, gezogene A-Z Pools, Draft-Bans/Picks, gespielte Champions, Admin-Notizen und Audit-/Event-Logs.",
  },
  {
    title: "Öffentlich sichtbare Daten",
    text: "Teamname, Roster, Riot-ID, Rollen, OP.GG-/DPM-Links, Gruppenstand, Matchstatus, gezogene Pools und Draft-/Matchinformationen können auf den öffentlichen Turnierseiten und OBS-Overlays sichtbar sein.",
  },
];

const purposes = [
  "Bewerbungen eindeutig zuordnen und Doppelanmeldungen vermeiden.",
  "Riot-Accounts verifizieren und Rankings für faire Teambildung berücksichtigen.",
  "Teams, Gruppenphase, Playoffs, Captains, Drafts und Scores organisieren.",
  "Discord-Rollen, Channels, Captains und Bot-Aktionen mit dem Turnier synchronisieren.",
  "Regelverstöße nachvollziehen und bei Bedarf Blacklist-Einträge verwalten.",
];

export default function TournamentPrivacyPage() {
  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-5xl">
        <div className="rounded-[2.4rem] border border-lime-200/14 bg-gradient-to-br from-lime-200/12 via-emerald-400/8 to-cyan-400/8 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
            Datenschutz
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
            Welche Daten wir für das Turnier verarbeiten.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-100/72">
            Diese Seite erklärt transparent, welche Daten für das Lauchgruen
            League-of-Legends-Turnier verarbeitet werden. Sie ist keine
            anwaltliche Rechtsberatung, sondern die praktische Datenschutzerklärung
            für dieses Community-Turnier.
          </p>
        </div>

        <div className="mt-6 grid gap-5">
          <InfoBlock title="Wer ist verantwortlich?">
            <p>
              Verantwortlich für die Turnierorganisation ist das Lauchgruen
              Orga-Team. Kontakt läuft aktuell über den Lauchgruen-Discord oder
              direkt über Luca / Lauchgruen und die eingetragenen Turnieradmins.
            </p>
          </InfoBlock>

          <InfoBlock title="Welche Daten werden gespeichert?">
            <div className="grid gap-3 md:grid-cols-2">
              {dataItems.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/8 bg-black/18 p-4">
                  <h2 className="text-sm font-black text-lime-100">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-emerald-100/68">{item.text}</p>
                </div>
              ))}
            </div>
          </InfoBlock>

          <InfoBlock title="Wofür nutzen wir diese Daten?">
            <ul className="grid gap-2">
              {purposes.map((purpose) => (
                <li key={purpose} className="rounded-2xl border border-white/8 bg-black/18 p-3">
                  {purpose}
                </li>
              ))}
            </ul>
          </InfoBlock>

          <InfoBlock title="Wer kann die Daten sehen?">
            <p>
              Bewerbungen, Notizen, Discord-IDs, PUUIDs, Admin-Notizen und Logs
              sind nur für berechtigte Turnieradmins sichtbar. Öffentliche
              Turnierseiten zeigen nur Daten, die für Zuschauer und Teilnehmer
              sinnvoll sind, zum Beispiel Teams, Riot-IDs, Rollen, Pools, Scores
              und Draft-Informationen.
            </p>
          </InfoBlock>

          <InfoBlock title="Externe Dienste">
            <p>
              Wir nutzen Discord für Login, Servermitgliedschaft, Rollen und den
              Turnierbetrieb. Riot-Daten werden serverseitig über die Riot API
              abgefragt. OP.GG und DPM werden als externe Links angezeigt; beim
              Anklicken gelten deren eigene Datenschutzregeln.
            </p>
          </InfoBlock>

          <InfoBlock title="Speicherdauer und Löschung">
            <p>
              Turnierdaten werden mindestens für Organisation, Nachvollziehbarkeit
              und Abschluss des Events gespeichert. Wenn du möchtest, dass deine
              Bewerbung oder dein Riot-Link gelöscht oder korrigiert wird, melde
              dich beim Orga-Team. Daten, die für Regelverstöße, Blacklist,
              Ergebnisnachweise oder Missbrauchsschutz nötig sind, können länger
              gespeichert werden.
            </p>
          </InfoBlock>

          <InfoBlock title="Deine Rechte">
            <p>
              Du kannst beim Orga-Team Auskunft, Korrektur oder Löschung deiner
              gespeicherten Bewerbungsdaten anfragen. Wenn du deinen Riot-Account
              trennst, werden der Riot-Link und die dazugehörige Bewerbung im
              System entfernt; Blacklist- oder Missbrauchsschutzdaten können
              davon ausgenommen sein.
            </p>
          </InfoBlock>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/tournament/terms"
              className="rounded-2xl border border-white/14 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
            >
              Teilnahmebedingungen
            </Link>
            <Link
              href="/tournament/apply"
              className="rounded-2xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 transition hover:-translate-y-0.5"
            >
              Zur Bewerbung
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 text-sm leading-7 text-emerald-100/72 shadow-xl shadow-black/20">
      <h2 className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </article>
  );
}
