import Link from "next/link";
import {
  applicationSteps,
  playoffMatches,
  tournament,
} from "@/lib/tournament-data";
import { getTournamentContext } from "@/lib/tournament-runtime";

const stats = [
  { label: "Format", value: tournament.format },
  { label: "Region", value: tournament.region },
  { label: "Start", value: tournament.startDate },
];

const APPLICATIONS_ENABLED =
  process.env.TOURNAMENT_APPLICATIONS_ENABLED !== "false";

export default async function TournamentHomePage() {
  const { teams, groupMatches } = await getTournamentContext();
  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-[2.4rem] border border-lime-200/14 bg-gradient-to-br from-lime-200/12 via-emerald-400/8 to-cyan-400/8 p-6 shadow-2xl shadow-black/30 sm:p-8 lg:p-10">
          <div className="inline-flex rounded-full border border-lime-200/20 bg-lime-200/10 px-4 py-2 text-xs font-black uppercase tracking-[0.32em] text-lime-100/80">
            {tournament.season}
          </div>
          <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.92] tracking-tight text-emerald-50 sm:text-6xl lg:text-7xl">
            League-Abende mit Bracket, Einsatz und Regeln, die man wirklich liest.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-emerald-100/72 sm:text-lg">
            Der Turnierhub sammelt Bewerbungen, veröffentlicht Teams und Rosters,
            trackt die Gruppenphase und macht die Playoffs zu einer sauberen
            Broadcast-Seite für Spieler, Mods und Zuschauer.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {APPLICATIONS_ENABLED ? (
              <Link
                href="/tournament/apply"
                className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5"
              >
                Jetzt bewerben
              </Link>
            ) : (
              <span
                aria-disabled="true"
                title="Bewerbungen sind aktuell geschlossen"
                className="cursor-not-allowed rounded-2xl border border-white/8 bg-white/[0.025] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-100/32"
              >
                Bewerbungen geschlossen
              </span>
            )}
            <Link
              href="/tournament/teams"
              className="rounded-2xl border border-white/14 bg-white/[0.04] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
            >
              Teams ansehen
            </Link>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {stats.map((item) => (
              <div key={item.label} className="rounded-3xl border border-white/10 bg-black/18 p-5">
                <div className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/58">
                  {item.label}
                </div>
                <div className="mt-3 text-lg font-black text-emerald-50">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-xl shadow-black/20">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
              Bewerbungsablauf
            </div>
            <div className="mt-4 grid gap-3">
              {applicationSteps.map((step, index) => (
                <div key={step} className="flex gap-3 rounded-2xl border border-white/8 bg-black/16 p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-lime-200/12 text-sm font-black text-lime-100">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-emerald-100/72">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-amber-200/14 bg-amber-200/[0.06] p-6">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/70">
              Account-Verknüpfung
            </div>
            <h2 className="mt-3 text-2xl font-black text-amber-50">
              Riot und Discord bereit
            </h2>
            <p className="mt-3 text-sm leading-7 text-emerald-100/70">
              Discord-Sign-in identifiziert die Bewerbung, Riot-Verifizierung
              läuft direkt im Formular über den League-Client-Profilicon-Trick.
              Kein zusätzliches OAuth-Setup nötig.
            </p>
          </div>
        </aside>
      </section>

      <section className="mx-auto mt-6 grid w-full max-w-7xl gap-4 lg:grid-cols-3">
        <DashboardCard
          href="/tournament/teams"
          label="Teams"
          title={`${teams.length} sichtbare Rosters`}
          text="Jeder Spielereintrag verlinkt Riot-ID, OP.GG und DPM direkt."
        />
        <DashboardCard
          href="/tournament/groups"
          label="Gruppen"
          title={`${groupMatches.length} geplante Spiele`}
          text="Die Gruppenphase ist bereit für Scores, Bilanz und Stream-Timing."
        />
        <DashboardCard
          href="/tournament/playoffs"
          label="Finals"
          title={`${playoffMatches.length} Bracket-Slots`}
          text="Sechs Teams im Double-Elim mit Bracket Reset — Upper, Lower und Grand Final auf einer Seite."
        />
      </section>
    </div>
  );
}

function DashboardCard({
  href,
  label,
  title,
  text,
}: {
  href: string;
  label: string;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-lime-200/26"
    >
      <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/60">
        {label}
      </div>
      <h2 className="mt-3 text-2xl font-black text-emerald-50 group-hover:text-lime-100">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-7 text-emerald-100/68">{text}</p>
    </Link>
  );
}
