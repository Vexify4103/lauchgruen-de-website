import { readTournamentState } from "@/lib/tournament-storage";
import { redirect } from "next/navigation";
import { playoffFormatLabel } from "@/lib/tournament-format";
import { getTournamentSettings, type TournamentSettings } from "@/lib/tournament-settings";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getTournamentWheelState } from "@/lib/tournament-wheel";
import { LivePlayoffs } from "@/components/LivePlayoffs";
import { getMatchControlContext } from "@/lib/match-control";

export default async function PlayoffsPage() {
	const settings = await getTournamentSettings();
	if (settings.activeTournament.id === "ultimate-bravery" && settings.ultimateBravery.format === "undecided") {
		return <UndecidedPlayoffsPage />;
	}
	if (settings.activeTournament.id !== "ultimate-bravery" && settings.activeTournament.mode !== "live") redirect("/tournament/archive/az-2026?view=playoffs");
	if (settings.activeTournament.id === "ultimate-bravery") {
		const control = await getMatchControlContext();
		const matches = control.matches.filter((match) => match.phase === "playoffs");
		return (
			<LivePlayoffPage
				matches={matches}
				teamCount={settings.ultimateBravery.advanceTeamCount}
				format={settings.ultimateBravery.format}
				dayOneFormat={settings.ultimateBravery.dayOneFormat}
				live={settings.activeTournament.mode === "live"}
			/>
		);
	}
	const ctx = await getTournamentContext();
	const [state, wheel] = await Promise.all([readTournamentState(ctx.groupMatches), getTournamentWheelState()]);
	const matches = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches).map((match) => ({
		...match,
		poolAssignment: wheel.currentAssignment?.matchId === match.id ? wheel.currentAssignment : (wheel.history.find((entry) => entry.matchId === match.id) ?? null),
	}));

	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-[1600px]">
				<div className="max-w-3xl">
					<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Playoffs und Finals</div>
					<h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">Acht Teams · Double Elimination.</h1>
				</div>

				<div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-xl shadow-black/24 sm:p-5">
					<LivePlayoffs initialMatches={matches} />
				</div>
			</section>
		</div>
	);
}

function LivePlayoffPage({
	matches,
	teamCount,
	format,
	dayOneFormat,
	live,
}: {
	matches: Parameters<typeof LivePlayoffs>[0]["initialMatches"];
	teamCount: number;
	format: TournamentSettings["ultimateBravery"]["format"];
	dayOneFormat: TournamentSettings["ultimateBravery"]["dayOneFormat"];
	live: boolean;
}) {
	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-[1600px]">
				<div className="flex max-w-4xl flex-wrap items-end justify-between gap-4">
					<div>
						<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Playoffs und Finals</div>
						<h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
							{teamCount} Teams · {playoffFormatLabel(format)}.
						</h1>
						<p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-100/64">
							{live
								? "Ergebnisse aktualisieren den vollständigen Bracket-Weg automatisch. Das höher gesetzte Team erhält die Seitenwahl."
								: `Der vollständige Weg für Tag 2 steht bereits fest. Die TBD-Plätze werden nach ${dayOneFormat === "swiss" ? "der Swiss Stage" : "der Gruppenphase"} automatisch mit den finalen Seeds gefüllt.`}
						</p>
					</div>
					{!live ? (
						<span className="rounded-full border border-amber-200/20 bg-amber-200/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">
							Bracket-Vorschau
						</span>
					) : null}
				</div>
				<div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-xl shadow-black/24 sm:p-5">
					<LivePlayoffs initialMatches={matches} autoRefresh={live} showPools={false} />
				</div>
			</section>
		</div>
	);
}

function UndecidedPlayoffsPage() {
	return (
		<div className="px-5 py-14 sm:py-20">
			<section className="mx-auto max-w-3xl rounded-[2.4rem] border border-amber-200/16 bg-gradient-to-br from-amber-200/[0.07] via-white/[0.035] to-cyan-200/[0.035] p-8 text-center shadow-2xl shadow-black/30 sm:p-12">
				<div className="text-xs font-black uppercase tracking-[0.3em] text-amber-100/64">Tag 2 · Planung</div>
				<h1 className="mt-4 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">Das Playoff-Format steht noch nicht fest.</h1>
				<p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-emerald-100/64 sm:text-base">
					Ob Single oder Double Elimination gespielt wird, entscheidet die Orga anhand der finalen Teamzahl. Bracket, Seeding und mögliche Freilose werden rechtzeitig
					veröffentlicht.
				</p>
			</section>
		</div>
	);
}
