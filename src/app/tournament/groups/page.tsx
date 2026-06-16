import { TournamentLink as Link } from "../TournamentLink";
import { readTournamentState } from "@/lib/tournament-storage";
import { computeGroupStandings } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { compactPoolLabel, getTournamentWheelState } from "@/lib/tournament-wheel";
import { formatGameDuration } from "@/lib/match-duration";

const groups = ["A", "B"] as const;

export default async function GroupsPage() {
  const ctx = await getTournamentContext();
  const [state, wheel] = await Promise.all([
    readTournamentState(ctx.groupMatches),
    getTournamentWheelState(),
  ]);
  const standings = computeGroupStandings(state.matches, ctx.teams, ctx.groupMatches);
  const matchesWithScores = ctx.groupMatches.map((match) => ({
    ...match,
    ...(state.matches[match.id] ?? {}),
    poolAssignment:
      wheel.currentAssignment?.matchId === match.id
        ? wheel.currentAssignment
        : wheel.history.find((entry) => entry.matchId === match.id) ?? null,
  }));

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
            Gruppenphase
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
            Zwei Vierergruppen. Alle Teams ziehen in die Playoffs ein.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-100/68">
            Zwölf BO1-Spiele pro Gruppe, also sechs Spiele pro Team mit Hin- und
            Rückrunde. Die Gruppensieger überspringen die erste
            Upper-Bracket-Runde. Platz 2 spielt dort mit vier Bans gegen Platz 3
            der anderen Gruppe. Die Viertplatzierten starten in Runde 1 des
            Lower Brackets.
          </p>
          <div className="mt-5 rounded-2xl border border-amber-200/16 bg-amber-200/[0.06] p-4 text-sm leading-7 text-amber-50/82">
            <strong>Platzierung:</strong> Zuerst zählt die Sieg-Niederlagen-Bilanz.
            Bei Gleichstand zählen die direkten Siege zwischen den betroffenen
            Teams. Bleibt auch dieser Vergleich gleich, gewinnt das Team mit der
            niedrigeren durchschnittlichen Spielzeit seiner Siege innerhalb
            dieses direkten Vergleichs. Andere Gruppenspiele beeinflussen diesen
            Tiebreak nicht.
          </div>
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
                    12 Matches · 6 pro Team
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                  <div className="grid grid-cols-[2rem_1fr_3rem_3rem_5rem] gap-2 bg-white/[0.06] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-lime-200/62">
                    <span>#</span>
                    <span>Team</span>
                    <span className="text-right">W-L</span>
                    <span className="text-right">DV</span>
                    <span className="text-right">Ø DV-Sieg</span>
                  </div>
                  {groupStandings.map((standing) => {
                    const rankStyle = standing.rank === 1
                      ? "border-lime-200/22 bg-gradient-to-r from-lime-200/16 via-emerald-300/8 to-transparent shadow-[inset_3px_0_0_rgb(190_242_100/0.8)]"
                      : standing.rank === 4
                        ? "border-orange-300/18 bg-gradient-to-r from-orange-400/12 via-amber-300/[0.04] to-transparent shadow-[inset_3px_0_0_rgb(251_146_60/0.72)]"
                        : "border-white/8 bg-black/8";
                    const rankTone = standing.rank === 1
                      ? "text-lime-100"
                      : standing.rank === 4
                        ? "text-orange-200"
                        : "text-emerald-100/72";
                    return (
                      <div
                        key={standing.team.id}
                        className={`grid grid-cols-[2rem_1fr_3rem_3rem_5rem] gap-2 border-t px-4 py-3 text-sm ${rankStyle}`}
                      >
                        <span className={`font-black ${rankTone}`}>
                          {standing.rank}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-emerald-50">
                            {standing.team.name}
                          </span>
                          <span className={`mt-0.5 block text-[9px] font-black uppercase tracking-[0.15em] ${rankTone}`}>
                            {standing.rank === 1
                              ? "Freilos · Einstieg Upper R2"
                              : standing.rank === 2
                                ? "Upper R1 · 4 Bans"
                                : standing.rank === 3
                                  ? "Upper R1"
                                  : "Start im Lower Bracket"}
                          </span>
                        </span>
                        <span className="text-right font-black text-lime-100">
                          {standing.wins}-{standing.losses}
                        </span>
                        <span className="text-right font-bold text-emerald-100/70">
                          {standing.headToHeadWins}
                        </span>
                        <span className="text-right font-bold text-emerald-100/60">
                          {standing.avgWinTimeSeconds === null
                            ? "–"
                            : formatGameDuration(Math.round(standing.avgWinTimeSeconds))}
                        </span>
                        {standing.tiebreakerRequired ? (
                          <span className="col-span-5 mt-1 rounded-xl border border-amber-200/18 bg-amber-200/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">
                            Tiebreaker erforderlich
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 grid gap-3">
                  {matches.map((match) => {
                    const isLive = match.status === "Live";
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
                        <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">
                          {match.round}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-cyan-200/14 bg-cyan-300/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/62">
                            {match.time}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/62">
                            {statusLabel(match.status)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-lg font-black text-emerald-50">
                        <div className="min-w-0 text-right">
                          <span className="block truncate">{match.teamA}</span>
                          {match.poolAssignment ? (
                            <span className="mt-1 inline-flex rounded-full border border-lime-200/18 bg-lime-200/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-lime-50/80">
                              Pool {compactPoolLabel(match.poolAssignment.teamAPool)}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-center text-lime-100">
                          {match.scoreA !== undefined && match.scoreB !== undefined
                            ? `${match.scoreA}:${match.scoreB}`
                            : "vs."}
                        </span>
                        <div className="min-w-0">
                          <span className="block truncate">{match.teamB}</span>
                          {match.poolAssignment ? (
                            <span className="mt-1 inline-flex rounded-full border border-lime-200/18 bg-lime-200/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-lime-50/80">
                              Pool {compactPoolLabel(match.poolAssignment.teamBPool)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {match.winner ? (
                        <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold text-lime-100">
                          <span>Sieger: {match.winner}</span>
                          {match.gameDurationSeconds !== undefined ? (
                            <span className="text-emerald-100/56">
                              Spielzeit: {formatGameDuration(match.gameDurationSeconds)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {isLive ? (
                          <span className="rounded-full border border-red-300/30 bg-red-500/16 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-red-100">
                            Current Match
                          </span>
                        ) : null}
                        {match.poolAssignment ? (
                          <Link
                            href={`/tournament/champ-select/${match.id}/spectate`}
                            className="rounded-full border border-sky-200/20 bg-sky-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-50/82"
                          >
                            Draft Link bereit
                          </Link>
                        ) : (
                          <span className="rounded-full border border-white/10 bg-black/18 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/38">
                            Wartet auf Pools
                          </span>
                        )}
                      </div>
                    </div>
                  );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "Scheduled":
      return "Geplant";
    case "Pending":
      return "Ausstehend";
    case "Locked":
      return "Gesperrt";
    case "Live":
      return "Live";
    case "Finished":
      return "Beendet";
    default:
      return status;
  }
}
