import { readTournamentState } from "@/lib/tournament-storage";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { LivePlayoffs } from "@/components/LivePlayoffs";

export default async function PlayoffsPage() {
  const ctx = await getTournamentContext();
  const state = await readTournamentState(ctx.groupMatches);
  const matches = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
            Playoffs und Finals
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
            Sechs Teams. Double Elimination. Bracket Reset live.
          </h1>
          <p className="mt-4 text-sm leading-7 text-emerald-100/68">
            Die Top-vier-Seeds eröffnen das Upper Bracket. Seeds fünf und sechs
            starten im Lower Bracket und treffen auf die Verlierer aus dem Upper
            Bracket. Der Lower-Bracket-Sieger fordert den Upper-Bracket-Champion
            im Grand Final — mit möglichem Reset, falls die Lower-Seite Set 1
            gewinnt.
          </p>
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-xl shadow-black/24 sm:p-5">
          <LivePlayoffs initialMatches={matches} />
        </div>
      </section>
    </div>
  );
}
