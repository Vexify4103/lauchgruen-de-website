import { readTournamentState } from "@/lib/tournament-storage";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getTournamentWheelState } from "@/lib/tournament-wheel";
import { LivePlayoffs } from "@/components/LivePlayoffs";

export default async function PlayoffsPage() {
  const ctx = await getTournamentContext();
  const [state, wheel] = await Promise.all([
    readTournamentState(ctx.groupMatches),
    getTournamentWheelState(),
  ]);
  const matches = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches).map((match) => ({
    ...match,
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
            Playoffs und Finals
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
            Acht Teams – Double Elimination.
          </h1>
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-xl shadow-black/24 sm:p-5">
          <LivePlayoffs initialMatches={matches} />
        </div>
      </section>
    </div>
  );
}
