import { readTournamentState } from "@/lib/tournament-storage";
import { redirect } from "next/navigation";
import { getTournamentSettings, type TournamentSettings } from "@/lib/tournament-settings";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getTournamentWheelState } from "@/lib/tournament-wheel";
import { LivePlayoffs } from "@/components/LivePlayoffs";
import { SwissPlayoffSeedBracket } from "@/components/SwissStageBoard";

export default async function PlayoffsPage() {
	const settings = await getTournamentSettings();
	if (settings.activeTournament.id === "ultimate-bravery" && settings.ultimateBravery.format === "undecided") {
		return <UndecidedPlayoffsPage />;
	}
	if (
		settings.activeTournament.id === "ultimate-bravery" &&
		settings.ultimateBravery.dayOneFormat === "swiss" &&
		settings.ultimateBravery.teamCount === 8 &&
		settings.ultimateBravery.advanceTeamCount === 8
	) {
		return <SwissPlayoffPreview format={settings.ultimateBravery.format} />;
	}
	if (settings.activeTournament.id !== "ultimate-bravery" && settings.activeTournament.mode !== "live") redirect("/tournament/archive/az-2026?view=playoffs");
	if (settings.activeTournament.id === "ultimate-bravery" && settings.activeTournament.mode !== "live") return <GenericPlayoffPreview settings={settings} />;
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
					<h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">Acht Teams – Double Elimination.</h1>
				</div>

				<div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-xl shadow-black/24 sm:p-5">
					<LivePlayoffs initialMatches={matches} />
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

function SwissPlayoffPreview({ format }: { format: TournamentSettings["ultimateBravery"]["format"] }) {
	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-7xl">
				<div className="max-w-3xl">
					<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Playoffs · Swiss-Seeding</div>
					<h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">Acht Seeds. Ein Bracket.</h1>
					<p className="mt-4 text-sm leading-7 text-emerald-100/64">
						Alle acht Teams qualifizieren sich. Ihre Platzierung aus der Swiss Stage bestimmt die erste Playoff-Paarung und die obere beziehungsweise untere
						Bracket-Hälfte.
					</p>
				</div>
				<div className="mt-8">
					<SwissPlayoffSeedBracket format={format} />
				</div>
			</section>
		</div>
	);
}

function GenericPlayoffPreview({ settings }: { settings: Awaited<ReturnType<typeof getTournamentSettings>> }) {
	const config = settings.ultimateBravery;
	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-5xl">
				<div className="rounded-[2.4rem] border border-white/10 bg-white/[0.045] p-7 shadow-xl shadow-black/20">
					<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Playoff-Planung</div>
					<h1 className="mt-3 text-4xl font-black text-emerald-50">
						{config.advanceTeamCount} Teams · {config.format === "double-elimination" ? "Double" : "Single"} Elimination.
					</h1>
					<p className="mt-4 text-sm leading-7 text-emerald-100/64">
						Das konkrete Seeding erscheint hier, sobald Tag 1 vollständig konfiguriert und die Teilnehmer feststehen.
					</p>
				</div>
			</section>
		</div>
	);
}
