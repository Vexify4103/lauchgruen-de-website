import { readTournamentState } from "@/lib/tournament-storage";
import { computeGroupStandings } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";

const groups = ["A", "B"] as const;

export default async function GroupsPage() {
  const ctx = await getTournamentContext();
  const state = await readTournamentState(ctx.groupMatches);
  const standings = computeGroupStandings(state.matches, ctx.teams, ctx.groupMatches);
  const matchesWithScores = ctx.groupMatches.map((match) => ({
    ...match,
    ...(state.matches[match.id] ?? {}),
  }));

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
            Gruppenphase
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
            Zwei Vierergruppen. Top 3 jeder Gruppe ziehen ein.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-100/68">
            Sechs BO1-Spiele pro Gruppe. Gruppensieger werden als Seed #1 / #2
            ins Upper Bracket gesetzt, die Zweiten als #3 / #4, und Platz drei
            startet als #5 / #6 im Lower Bracket.
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {groups.map((group) => {
            const groupStandings = standings[group];
            const matches = matchesWithScores.filter((match) => match.group === group);

            return (
              <article key={group} className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/60">
                      Gruppe
                    </div>
                    <h2 className="mt-2 text-4xl font-black text-lime-100">{group}</h2>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/18 px-4 py-2 text-sm font-black text-emerald-100/70">
                    BO1 · jeder gegen jeden
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                  <div className="grid grid-cols-[2rem_1fr_3rem_3rem_3rem] gap-2 bg-white/[0.06] px-4 py-3 text-xs font-black uppercase tracking-[0.2em] text-lime-200/62">
                    <span>#</span>
                    <span>Team</span>
                    <span className="text-right">W-L</span>
                    <span className="text-right">+/-</span>
                    <span className="text-right">PF</span>
                  </div>
                  {groupStandings.map((standing) => {
                    const advances = standing.rank <= 3;
                    return (
                      <div
                        key={standing.team.id}
                        className={`grid grid-cols-[2rem_1fr_3rem_3rem_3rem] gap-2 border-t border-white/8 px-4 py-3 text-sm ${
                          advances ? "" : "opacity-70"
                        }`}
                      >
                        <span className={`font-black ${advances ? "text-lime-100" : "text-emerald-100/40"}`}>
                          {standing.rank}
                        </span>
                        <span className="truncate font-bold text-emerald-50">{standing.team.name}</span>
                        <span className="text-right font-black text-lime-100">
                          {standing.wins}-{standing.losses}
                        </span>
                        <span className="text-right font-bold text-emerald-100/70">
                          {standing.pointDiff > 0 ? `+${standing.pointDiff}` : standing.pointDiff}
                        </span>
                        <span className="text-right font-bold text-emerald-100/60">
                          {standing.pointsFor}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 grid gap-3">
                  {matches.map((match) => (
                    <div key={match.id} className="rounded-2xl border border-white/10 bg-black/18 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">
                          {match.round} · {match.time}
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-100/62">
                          {match.status}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-lg font-black text-emerald-50">
                        <span className="truncate text-right">{match.teamA}</span>
                        <span className="text-center text-lime-100">
                          {match.scoreA !== undefined && match.scoreB !== undefined
                            ? `${match.scoreA}:${match.scoreB}`
                            : "vs."}
                        </span>
                        <span className="truncate">{match.teamB}</span>
                      </div>
                      {match.winner ? (
                        <div className="mt-3 text-sm font-bold text-lime-100">
                          Sieger: {match.winner}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
