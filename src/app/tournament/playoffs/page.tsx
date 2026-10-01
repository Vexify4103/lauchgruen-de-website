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
import { StandingsTable } from "@/components/StandingsTable";
import { PLAYOFF_FORMAT_DETAILS, SIDE_SELECTION_LABELS, bestOfLabel } from "@/lib/tournament-structure";
import type { StandingsResult } from "@/lib/tournament-standings";

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
				config={settings.ultimateBravery}
				table={control.stages?.playoffs.table ?? null}
				pendingReason={control.stages?.dayOne.pendingReason ?? null}
				live={settings.activeTournament.mode === "live"}
				preview={!["live", "finished"].includes(settings.activeTournament.mode)}
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
	config,
	table,
	pendingReason,
	live,
	preview,
}: {
	matches: Parameters<typeof LivePlayoffs>[0]["initialMatches"];
	config: TournamentSettings["ultimateBravery"];
	table: StandingsResult | null;
	pendingReason: string | null;
	live: boolean;
	preview: boolean;
}) {
	const roundRobin = config.format === "round-robin";
	const series =
		config.bestOf.playoffs === config.bestOf.finals
			? `Alle Playoff-Matches ${bestOfLabel(config.bestOf.playoffs)}.`
			: `Playoffs ${bestOfLabel(config.bestOf.playoffs)}, Finale ${bestOfLabel(config.bestOf.finals)}.`;
	const bracketMatches = roundRobin ? matches.filter((match) => match.id === "gf") : matches;
	const tableMatches = roundRobin ? matches.filter((match) => match.id !== "gf") : [];
	return (
		<section className="page-section compact-top wide">
			<PageIntro
				kicker="Tag 2 · Playoffs und Finals"
				title={`${config.advanceTeamCount} Teams · ${playoffFormatLabel(config.format)}.`}
				aside={
					preview ? (
						<span className="inline-flex rounded-full border border-[var(--line)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--amber)]">
							Bracket-Vorschau
						</span>
					) : null
				}
			>
				{PLAYOFF_FORMAT_DETAILS[config.format]} {series} Seitenwahl: {SIDE_SELECTION_LABELS[config.sideSelection]}.{preview && pendingReason ? ` ${pendingReason}` : ""}
			</PageIntro>
			{roundRobin ? (
				<div className="mb-6 grid gap-4">
					<StandingsTable
						kicker="Playoff-Tabelle"
						title="Jeder gegen jeden"
						standings={table}
						advancing={2}
						showGames={config.bestOf.playoffs > 1}
						full
						emptyText="Die Tabelle füllt sich mit den ersten Playoff-Ergebnissen."
					/>
					<div className="content-panel tight">
						<h2 className="filter-label">
							<span>Playoff-Matches</span>
							<i>{tableMatches.length}</i>
						</h2>
						<ul className="grid gap-2 sm:grid-cols-2">
							{tableMatches.map((match) => (
								<li key={match.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
									<span className="font-bold">
										{match.teamALabel} <span className="text-[var(--muted)]">vs</span> {match.teamBLabel}
									</span>
									<span className="tabular-nums text-[var(--muted)]">
										{match.scoreA !== undefined && match.scoreB !== undefined ? `${match.scoreA}:${match.scoreB}` : match.round.replace(/ · Match \d+$/, "")}
									</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			) : null}
			<div className="content-panel tight !p-3 sm:!p-5">
				<LivePlayoffs initialMatches={bracketMatches} autoRefresh={live && !roundRobin} showPools={false} />
			</div>
		</section>
	);
}

function UndecidedPlayoffsPage() {
	return (
		<section className="page-section compact-top">
			<EmptyState title="Das Playoff-Format steht noch nicht fest.">
				Welches Bracket gespielt wird, entscheidet die Orga anhand der finalen Teamzahl. Bracket, Seeding, Serienlänge und mögliche Freilose werden rechtzeitig
				veröffentlicht.
			</EmptyState>
		</section>
	);
}
