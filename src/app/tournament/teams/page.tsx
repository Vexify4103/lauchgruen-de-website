import { getTournamentContext } from "@/lib/tournament-runtime";
import { CopyOverlayButton } from "./CopyOverlayButton";

function CrownIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="currentColor"
    >
      <path d="M3 17h18l-1.5-9-4.5 4-3-6-3 6-4.5-4L3 17zm0 2h18v2H3v-2z" />
    </svg>
  );
}

export default async function TeamsPage() {
  const { teams } = await getTournamentContext();
  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
            Teams und Rosters
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
            Aktuelle Teams, klickbare Spieler.
          </h1>
          <p className="mt-4 text-sm leading-7 text-emerald-100/68">
            Die Rosters werden gesperrt, sobald Staff die Bewerbungen bestätigt
            hat. Jeder Spielername verlinkt direkt auf OP.GG und DPM.
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {teams.map((team) => (
            <article
              key={team.id}
              className={`overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br ${team.accent} p-5 shadow-xl shadow-black/24`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-100/62">
                    Gruppe {team.group} · Seed {team.seed}
                  </div>
                  <h2 className="mt-2 text-3xl font-black text-emerald-50">{team.name}</h2>
                  {!team.captainRef ? (
                    // Captain-Zeile nur zeigen, wenn kein gekrönter Spieler in der
                    // Roster-Liste auftaucht (sonst doppelt sich die Info).
                    <p className="mt-1 text-sm text-emerald-100/60">
                      Captain: {team.captain}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-2xl border border-white/12 bg-black/20 px-4 py-2 text-sm font-black text-lime-100">
                    {team.record}
                  </div>
                  <CopyOverlayButton teamId={team.id} />
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {team.players.map((player) => {
                  const isCaptain =
                    !!team.captainRef && team.captainRef.riotId === player.riotId;
                  return (
                    <div
                      key={`${team.id}-${player.riotId}`}
                      className={`grid gap-3 rounded-2xl border p-4 sm:grid-cols-[7rem_1fr_auto] sm:items-center ${
                        isCaptain
                          ? "border-lime-200/30 bg-lime-200/[0.08]"
                          : "border-white/10 bg-black/22"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-lime-200/60">
                        <span>{player.role}</span>
                        {isCaptain ? (
                          <span
                            title="Team-Captain"
                            aria-label="Team-Captain"
                            className="inline-flex size-5 items-center justify-center rounded-full border border-lime-200/40 bg-lime-200/14 text-lime-50"
                          >
                            <CrownIcon />
                          </span>
                        ) : null}
                      </div>
                      <div>
                        <a
                          href={player.opggUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`text-lg font-black hover:text-lime-100 ${
                            isCaptain ? "text-lime-50" : "text-emerald-50"
                          }`}
                        >
                          {player.name}
                        </a>
                        <div className="text-sm text-emerald-100/54">{player.riotId}</div>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={player.opggUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/72 hover:text-lime-100"
                        >
                          OP.GG
                        </a>
                        <a
                          href={player.dpmUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/72 hover:text-lime-100"
                        >
                          DPM
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
