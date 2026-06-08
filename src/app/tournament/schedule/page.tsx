import Link from "next/link";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { readTournamentState } from "@/lib/tournament-storage";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { compactPoolLabel, getTournamentWheelState } from "@/lib/tournament-wheel";

export default async function TournamentSchedulePage() {
  const ctx = await getTournamentContext();
  const [state, wheel] = await Promise.all([
    readTournamentState(ctx.groupMatches),
    getTournamentWheelState(),
  ]);
  const playoffs = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);
  const poolFor = (matchId: string) =>
    wheel.currentAssignment?.matchId === matchId
      ? wheel.currentAssignment
      : wheel.history.find((entry) => entry.matchId === matchId) ?? null;

  const friday = ctx.groupMatches.map((match) => ({
    id: match.id,
    day: "Freitag, 19.06.",
    phase: "Gruppenphase",
    round: match.round,
    time: match.time,
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA: state.matches[match.id]?.scoreA,
    scoreB: state.matches[match.id]?.scoreB,
    status: state.matches[match.id]?.status ?? match.status,
    pool: poolFor(match.id),
  }));

  const saturday = playoffs.map((match) => ({
    id: match.id,
    day: "Samstag, 20.06.",
    phase: "Playoffs",
    round: match.round,
    time: match.time,
    teamA: match.teamALabel,
    teamB: match.teamBLabel,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    status: match.status,
    pool: poolFor(match.id),
  }));

  const sections = [
    { title: "Spieltag 1", description: "Gruppenphase ab 18:00 Uhr CEST.", matches: friday },
    { title: "Spieltag 2", description: "Playoffs, Platzierungsspiele und Finale ab 18:00 Uhr CEST.", matches: saturday },
  ];

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
            Zeitplan
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
            Wann wird was gespielt?
          </h1>
          <p className="mt-4 text-sm leading-7 text-emerald-100/68">
            Beide Spieltage starten um 18:00 Uhr CEST. Der genaue Ablauf kann sich
            je nach Matchdauer verschieben, aber diese Seite zeigt dir immer den
            aktuellen Status, gezogene Pools und Draft-Links.
          </p>
        </div>

        <div className="mt-8 grid gap-6">
          {sections.map((section) => (
            <article
              key={section.title}
              className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/60">
                    {section.title}
                  </div>
                  <h2 className="mt-2 text-2xl font-black text-emerald-50">
                    {section.description}
                  </h2>
                </div>
                <span className="rounded-2xl border border-white/10 bg-black/18 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/60">
                  {section.matches.length} Matches
                </span>
              </div>

              <div className="mt-5 grid gap-3">
                {section.matches.map((match) => {
                  const isLive = match.status === "Live";
                  const hasTeams = !/seed|winner|loser|tbd/i.test(`${match.teamA} ${match.teamB}`);
                  return (
                    <div
                      key={match.id}
                      className={`rounded-2xl border p-4 ${
                        isLive
                          ? "border-red-300/34 bg-red-500/12 shadow-lg shadow-red-950/20"
                          : "border-white/10 bg-black/18"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/58">
                          {match.day} · {match.phase} · {match.round}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/62">
                            {match.time}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/62">
                            {match.status}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                        <TeamLine team={match.teamA} pool={match.pool?.teamAPool ?? null} />
                        <div className="text-center text-2xl font-black text-lime-100">
                          {match.scoreA !== undefined && match.scoreB !== undefined
                            ? `${match.scoreA}:${match.scoreB}`
                            : "vs."}
                        </div>
                        <TeamLine team={match.teamB} pool={match.pool?.teamBPool ?? null} right />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {isLive ? (
                          <span className="rounded-full border border-red-300/30 bg-red-500/16 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-red-100">
                            Aktuelles Match
                          </span>
                        ) : null}
                        {match.pool ? (
                          <Link
                            href={`/tournament/champ-select/${match.id}/spectate`}
                            className="rounded-full border border-sky-200/20 bg-sky-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-50/82"
                          >
                            Spectator Draft
                          </Link>
                        ) : hasTeams ? (
                          <span className="rounded-full border border-white/10 bg-black/18 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/38">
                            Pools noch offen
                          </span>
                        ) : null}
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

function TeamLine({
  team,
  pool,
  right,
}: {
  team: string;
  pool: string | null;
  right?: boolean;
}) {
  return (
    <div className={right ? "text-left md:text-right" : "text-left"}>
      <div className="truncate text-xl font-black text-emerald-50">{team}</div>
      {pool ? (
        <span className="mt-1 inline-flex rounded-full border border-lime-200/18 bg-lime-200/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-lime-50/80">
          Pool {compactPoolLabel(pool)}
        </span>
      ) : null}
    </div>
  );
}
