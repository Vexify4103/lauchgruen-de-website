import Link from "next/link";

const ruleSections = [
  {
    title: "Verbindliche Anmeldung",
    text: "Mit dem Absenden der Bewerbung meldest du dich verbindlich für beide Turniertage an: Freitag, 19.06.2026 und Samstag, 20.06.2026, jeweils ab 18:00 Uhr CEST. Wenn du unsicher bist oder nur teilweise Zeit hast, musst du das in den Notizen angeben oder dem Orga-Team frühzeitig schreiben.",
  },
  {
    title: "Discord und Riot-Account",
    text: "Teilnahme ist nur mit Discord-Login, Mitgliedschaft im Lauchgruen-Discord und verifiziertem Riot-Account möglich. Du darfst nur mit deinem eigenen Riot-Account teilnehmen. Account-Sharing, Smurf-Verschleierung oder falsche Angaben können zum Ausschluss führen.",
  },
  {
    title: "A-Z Champion-Pools",
    text: "Für jedes Match wird pro Team ein A-Z Pool gelost. Ein Team darf in diesem Match nur Champions aus dem eigenen Pool picken. Bans richten sich gegen den gegnerischen Pool. Gespielte Pools verlassen für das jeweilige Team das Rad; zum zweiten Spieltag / Playoff-Tag wird der Pool-Verlauf zurückgesetzt.",
  },
  {
    title: "Draft und Captains",
    text: "Nur Team-Captains oder berechtigte Admins dürfen im Champ Select ready klicken, Champions auswählen, bannen oder locken. Bei Disconnects, Missclicks oder technischen Problemen dürfen Admins Drafts pausieren, zurücksetzen, force-ready setzen oder Locks korrigieren.",
  },
  {
    title: "Verhalten",
    text: "Das Turnier ist ein Spaß- und Community-Event. Toxisches Verhalten, Beleidigungen, absichtliches Feeden, Griefing, Cheating, Scripting, Stream-Sniping, Belästigung oder sonstiges störendes Verhalten kann zum Ausschluss führen.",
  },
  {
    title: "Substitutes und Teamänderungen",
    text: "Das Orga-Team darf Ersatzspieler eintragen, Rollen ändern oder Teams anpassen, wenn das für Fairness, Ablauf oder Notfälle nötig ist. Historische Matchdaten bleiben dabei möglichst nachvollziehbar erhalten.",
  },
  {
    title: "Admin-Entscheidungen",
    text: "Das Orga-Team entscheidet über Streitfälle, technische Probleme, Regelverstöße, Remakes, Ergebnis-Korrekturen und Disqualifikationen. Ziel ist ein fairer und entspannter Ablauf für alle Beteiligten.",
  },
  {
    title: "Öffentliche Darstellung",
    text: "Teamname, Roster, Riot-ID, Rollen, Scores, Pools, Draft-Informationen und Turnierstatus können auf der Website, in OBS-Overlays, Discord-Embeds oder im Stream sichtbar sein.",
  },
];

export default function TournamentTermsPage() {
  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-5xl">
        <div className="rounded-[2.4rem] border border-lime-200/14 bg-gradient-to-br from-lime-200/12 via-emerald-400/8 to-cyan-400/8 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
            Teilnahmebedingungen
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
            Regeln für das Kunterbunte A-Z Turnier.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-100/72">
            Diese Teilnahmebedingungen halten fest, was du mit deiner Bewerbung
            bestätigst. Kurz gesagt: ehrlich anmelden, beide Tage einplanen,
            fair spielen, nett bleiben und Admin-Entscheidungen respektieren.
          </p>
        </div>

        <div className="mt-6 grid gap-4">
          {ruleSections.map((section, index) => (
            <article
              key={section.title}
              className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20"
            >
              <div className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-2xl border border-lime-200/18 bg-lime-200/10 text-sm font-black text-lime-100">
                  {index + 1}
                </span>
                <div>
                  <h2 className="text-lg font-black text-emerald-50">{section.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-emerald-100/70">{section.text}</p>
                </div>
              </div>
            </article>
          ))}

          <article className="rounded-[2rem] border border-amber-200/18 bg-amber-200/[0.06] p-5 shadow-xl shadow-black/20">
            <h2 className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/72">
              Zustimmung bei Bewerbung
            </h2>
            <p className="mt-4 text-sm leading-7 text-amber-50/82">
              Wenn du auf „Bewerbung absenden“ klickst, bestätigst du, dass du
              diese Teilnahmebedingungen und die Datenschutzhinweise gelesen hast
              und mit der Verarbeitung deiner Turnierdaten für Organisation,
              Durchführung und Nachvollziehbarkeit des Events einverstanden bist.
            </p>
          </article>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/tournament/privacy"
              className="rounded-2xl border border-white/14 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
            >
              Datenschutz
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
