import { readTournamentState } from "@/lib/tournament-storage";
import { redirect } from "next/navigation";
import { playoffFormatLabel } from "@/lib/tournament-format";
import { getTournamentSettings, type TournamentSettings } from "@/lib/tournament-settings";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getTournamentWheelState } from "@/lib/tournament-wheel";
import { LivePlayoffs } from "@/components/LivePlayoffs";
import { getMatchControlContext } from "@/lib/match-control";
import { EmptyState, PageIntro } from "@/components/site/PageIntro";
import { usesFlexibleEngine } from "@/lib/tournament-kind";

export default async function PlayoffsPage() {
	const settings = await getTournamentSettings();
	if (usesFlexibleEngine(settings.activeTournament) && settings.ultimateBravery.format === "undecided") {
		return <UndecidedPlayoffsPage />;
	}
	if (!usesFlexibleEngine(settings.activeTournament) && settings.activeTournament.mode !== "live") redirect("/tournament/archive/az-2026?view=playoffs");
	if (usesFlexibleEngine(settings.activeTournament)) {
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
		<section className="page-section compact-top wide">
			<PageIntro kicker="Playoffs und Finals" title="Acht Teams · Double Elimination." />
			<div className="content-panel tight !p-3 sm:!p-5">
				<LivePlayoffs initialMatches={matches} />
			</div>
		</section>
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
		<section className="page-section compact-top wide">
			<PageIntro
				kicker="Tag 2 · Playoffs und Finals"
				title={`${teamCount} Teams · ${playoffFormatLabel(format)}.`}
				aside={
					!live ? (
						<span className="inline-flex rounded-full border border-[var(--line)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--amber)]">
							Bracket-Vorschau
						</span>
					) : null
				}
			>
				{live
					? "Ergebnisse aktualisieren den vollständigen Bracket-Weg automatisch. Das höher gesetzte Team erhält die Seitenwahl."
					: `Der vollständige Weg für Tag 2 steht bereits fest. Die offenen Plätze werden nach ${dayOneFormat === "swiss" ? "der Swiss Stage" : "der Gruppenphase"} automatisch mit den finalen Seeds gefüllt.`}
			</PageIntro>
			<div className="content-panel tight !p-3 sm:!p-5">
				<LivePlayoffs initialMatches={matches} autoRefresh={live} showPools={false} />
			</div>
		</section>
	);
}

function UndecidedPlayoffsPage() {
	return (
		<section className="page-section compact-top">
			<EmptyState title="Das Playoff-Format steht noch nicht fest.">
				Ob Single oder Double Elimination gespielt wird, entscheidet die Orga anhand der finalen Teamzahl. Bracket, Seeding und mögliche Freilose werden rechtzeitig
				veröffentlicht.
			</EmptyState>
		</section>
	);
}
