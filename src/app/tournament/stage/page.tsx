import { TournamentLink as Link } from "../TournamentLink";
import { redirect } from "next/navigation";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { readTournamentState } from "@/lib/tournament-storage";
import { computeGroupStandings } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { compactPoolLabel, getTournamentWheelState } from "@/lib/tournament-wheel";
import { formatGameDuration } from "@/lib/match-duration";
import { GroupStagePlan } from "@/components/SwissStageBoard";
import { getSwissStageState } from "@/lib/tournament-swiss";
import { SwissStageLiveView } from "@/components/SwissStageLiveView";
import { StageMatchAutoFocus } from "@/components/StageMatchAutoFocus";
import { resolveGroupFocusMatchId } from "@/lib/tournament-stage-focus";
import { usesFlexibleEngine } from "@/lib/tournament-kind";
import { EmptyState, PageIntro } from "@/components/site/PageIntro";
import { getMatchControlContext } from "@/lib/match-control";
import { PLAY_IN_GROUP } from "@/lib/tournament-runtime";
import { mainEventTeamCount } from "@/lib/tournament-structure";
import { DirectPlayoffsStage, FlexibleGroupsStage, GslStage, PlayInSection } from "./FlexibleStageViews";

export default async function GroupsPage() {
	const settings = await getTournamentSettings();
	if (!usesFlexibleEngine(settings.activeTournament) && settings.activeTournament.mode !== "live") redirect("/tournament/archive/az-2026?view=groups");
	if (usesFlexibleEngine(settings.activeTournament)) {
		const config = settings.ultimateBravery;
		if (config.dayOneFormat === "undecided") return <UndecidedStagePage />;
		const control = await getMatchControlContext();
		const stages = control.stages!;
		const playIn = config.playInTeamCount > 0 ? <PlayInSection stages={stages} matches={control.matches} config={config} /> : null;
		const dayOneTeams = control.teams.filter((team) => team.group !== PLAY_IN_GROUP).map((team) => team.name);
		const running = ["live", "finished"].includes(settings.activeTournament.mode);
		switch (config.dayOneFormat) {
			case "swiss":
			case "swiss-elimination":
				return (
					<>
						{playIn}
						<SwissStagePage settings={settings} teamNames={dayOneTeams} swissState={stages.dayOne.swiss ?? (await getSwissStageState(settings.activeTournament.id))} />
					</>
				);
			case "none":
				return (
					<>
						{playIn}
						<DirectPlayoffsStage stages={stages} config={config} />
					</>
				);
			case "gsl":
				return (
					<>
						{playIn}
						<GslStage stages={stages} matches={control.matches.filter((match) => match.phase === "groups")} config={config} />
					</>
				);
			case "groups":
				return (
					<>
						{playIn}
						{running && stages.dayOne.groups.some((group) => group.standings) ? (
							<FlexibleGroupsStage stages={stages} matches={control.matches.filter((match) => match.phase === "groups")} config={config} />
						) : (
							<GroupStagePlanningPage settings={settings} teamNames={dayOneTeams} />
						)}
					</>
				);
		}
	}
	const ctx = await getTournamentContext();
	const [state, wheel] = await Promise.all([readTournamentState(ctx.groupMatches), getTournamentWheelState()]);
	const standings = computeGroupStandings(state.matches, ctx.teams, ctx.groupMatches);
	const matchesWithScores = ctx.groupMatches.map((match) => ({
		...match,
		...(state.matches[match.id] ?? {}),
		poolAssignment: wheel.currentAssignment?.matchId === match.id ? wheel.currentAssignment : (wheel.history.find((entry) => entry.matchId === match.id) ?? null),
	}));
	const focusedGroupMatchId = resolveGroupFocusMatchId(matchesWithScores);
	const groups = [...new Set(ctx.teams.map((team) => team.group))].sort((a, b) => a.localeCompare(b));
	const config = settings.ultimateBravery;
	const configuredGroupStage = usesFlexibleEngine(settings.activeTournament);
	const totalMatches = ctx.groupMatches.length;
	const gamesPerTeam = ctx.teams.length > 0 ? Math.round((totalMatches * 2) / ctx.teams.length) : 0;

	return (
		<>
			<StageMatchAutoFocus matchId={focusedGroupMatchId} />
			<section className="page-section compact-top">
				<PageIntro
					kicker="Gruppenphase"
					title={
						configuredGroupStage
							? `${groups.length} ${groups.length === 1 ? "Gruppe" : "Gruppen"}. ${config.advanceTeamCount === config.teamCount ? "Alle ziehen weiter." : `Top ${config.advanceTeamCount} ziehen weiter.`}`
							: "Zwei Vierergruppen. Alle ziehen weiter."
					}
				>
					{configuredGroupStage
						? `${totalMatches} BO1-Spiele insgesamt, ${gamesPerTeam} pro Team ${config.groupRoundRobinLegs === 2 ? "mit Hin- und Rückrunde" : "in einer einfachen Round-Robin-Runde"}. Die Abschlusstabelle bestimmt die Playoff-Seeds #1 bis #${config.advanceTeamCount}.`
						: "Zwölf BO1-Spiele pro Gruppe, also sechs Spiele pro Team mit Hin- und Rückrunde. Die Gruppensieger überspringen die erste Upper-Bracket-Runde."}
				</PageIntro>
				<p className="alert mb-8 max-w-4xl">
					<strong>Platzierung:</strong> Zuerst zählt die Sieg-Niederlagen-Bilanz. Bei Gleichstand zählen die direkten Siege zwischen den betroffenen Teams. Bleibt auch
					dieser Vergleich gleich, gewinnt das Team mit der niedrigeren durchschnittlichen Spielzeit seiner Siege innerhalb dieses direkten Vergleichs.
				</p>

				<div className={`mt-8 grid gap-5 ${groups.length > 1 ? "lg:grid-cols-2" : "grid-cols-1"}`}>
					{groups.map((group) => {
						const groupStandings = standings[group];
						const matches = matchesWithScores.filter((match) => match.group === group);

						return (
							<article key={group} className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
								<div className="flex items-center justify-between gap-4">
									<div>
										<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/60">Gruppe</div>
										<h2 className="mt-2 text-4xl font-black text-lime-100">{group}</h2>
									</div>
									<div className="rounded-2xl border border-white/10 bg-black/18 px-4 py-2 text-sm font-black text-emerald-100/70">
										{matches.length} Matches ·{" "}
										{groupStandings[0]
											? matches.filter((match) => match.teamA === groupStandings[0].team.name || match.teamB === groupStandings[0].team.name).length
											: 0}{" "}
										pro Team
									</div>
								</div>

								<div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
									<div className="grid grid-cols-[2rem_1fr_3rem_3rem_4rem_5rem] gap-2 bg-white/[0.06] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-lime-200/62">
										<span>#</span>
										<span>Team</span>
										<span className="text-right">W-L</span>
										<span className="text-right">DV</span>
										<span className="text-right">Ø Sieg</span>
										<span className="text-right">Ø DV-Sieg</span>
									</div>
									{groupStandings.map((standing) => {
										const rankStyle =
											standing.rank === 1
												? "border-lime-200/22 bg-gradient-to-r from-lime-200/16 via-emerald-300/8 to-transparent shadow-[inset_3px_0_0_rgb(190_242_100/0.8)]"
												: standing.rank === groupStandings.length
													? "border-orange-300/18 bg-gradient-to-r from-orange-400/12 via-amber-300/[0.04] to-transparent shadow-[inset_3px_0_0_rgb(251_146_60/0.72)]"
													: "border-white/8 bg-black/8";
										const rankTone =
											standing.rank === 1 ? "text-lime-100" : standing.rank === groupStandings.length ? "text-orange-200" : "text-emerald-100/72";
										return (
											<div key={standing.team.id} className={`grid grid-cols-[2rem_1fr_3rem_3rem_4rem_5rem] gap-2 border-t px-4 py-3 text-sm ${rankStyle}`}>
												<span className={`font-black ${rankTone}`}>{standing.rank}</span>
												<span className="min-w-0">
													<span className="block truncate font-bold text-emerald-50">{standing.team.name}</span>
													<span className={`mt-0.5 block text-[9px] font-black uppercase tracking-[0.15em] ${rankTone}`}>
														{configuredGroupStage
															? groupPlacementLabel(standing.rank, config.advanceTeamCount, config.format)
															: standing.rank === 1
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
												<span className="text-right font-bold text-emerald-100/70">{standing.headToHeadWins}</span>
												<span className="text-right font-bold text-emerald-100/60" title="Durchschnitt aller gespeicherten Siegzeiten dieses Teams.">
													{standing.avgRecordedWinTimeSeconds === null ? "–" : formatGameDuration(Math.round(standing.avgRecordedWinTimeSeconds))}
												</span>
												<span className="text-right font-bold text-emerald-100/60">
													{standing.avgWinTimeSeconds === null ? "–" : formatGameDuration(Math.round(standing.avgWinTimeSeconds))}
												</span>
												{standing.tiebreakerRequired ? (
													<span className="col-span-6 mt-1 rounded-xl border border-amber-200/18 bg-amber-200/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">
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
												data-stage-match-id={match.id}
												className={`rounded-2xl border p-4 ${
													isLive ? "border-red-300/34 bg-red-500/12 shadow-lg shadow-red-950/20" : "border-white/10 bg-black/18"
												}`}
											>
												<div className="flex flex-wrap items-center justify-between gap-3">
													<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">{match.round}</div>
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
														{match.scoreA !== undefined && match.scoreB !== undefined ? `${match.scoreA}:${match.scoreB}` : "vs."}
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
															<span className="text-emerald-100/56">Spielzeit: {formatGameDuration(match.gameDurationSeconds)}</span>
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
		</>
	);
}

function UndecidedStagePage() {
	return (
		<section className="page-section compact-top">
			<EmptyState title="Das Format für Tag 1 steht noch nicht fest.">
				Welches Format an Tag 1 gespielt wird, entscheidet die Orga anhand der finalen Teamzahl. Der vollständige Ablauf wird rechtzeitig vor dem Turnier veröffentlicht.
			</EmptyState>
		</section>
	);
}

function SwissStagePage({
	settings,
	teamNames,
	swissState,
}: {
	settings: Awaited<ReturnType<typeof getTournamentSettings>>;
	teamNames: string[];
	swissState: Awaited<ReturnType<typeof getSwissStageState>>;
}) {
	const config = settings.ultimateBravery;
	return (
		<>
			<section className="page-section compact-top wide">
				<PageIntro kicker={config.dayOneFormat === "swiss-elimination" ? "Tag 1 · Swiss mit Ausscheiden" : "Tag 1 · Swiss Stage"} title="Jede Runde verändert den Weg.">
					Jede Runde wird zufällig innerhalb derselben Bilanz ausgelost. Ein Team trifft während der gesamten Swiss Stage nie zweimal auf denselben Gegner.{" "}
					{config.dayOneFormat === "swiss-elimination"
						? `${config.swissWinsToAdvance} Siege bringen ein Team in die Playoffs, ${config.swissWinsToAdvance} Niederlagen bedeuten das Aus; so erreichen ${config.advanceTeamCount} von ${mainEventTeamCount(config)} Teams Tag 2.`
						: `Nach ${config.swissRounds} Runden ziehen ${config.advanceTeamCount >= mainEventTeamCount(config) ? "alle" : `die besten ${config.advanceTeamCount} von`} ${mainEventTeamCount(config)} Teams in die Playoffs ein.`}
				</PageIntro>
				<SwissStageLiveView initialState={swissState} config={{ ...config, teamCount: mainEventTeamCount(config) }} teamNames={teamNames} live={settings.tournamentLive} />
				{swissState.seedingMethod === "results-and-average-win-duration" ? (
					<div className="mx-auto mt-5 max-w-4xl rounded-2xl border border-amber-200/18 bg-amber-200/[0.055] px-5 py-4 text-center text-xs font-bold leading-6 text-amber-50/72">
						Hinweis der Turnierleitung: Bei der Swiss-Auslosung ist uns ein Fehler unterlaufen. Für ein möglichst faires Seeding wurden alle tatsächlich gespielten
						Ergebnisse berücksichtigt; ab Seed #3 entschieden zuerst die Anzahl der Siege und danach die durchschnittliche Dauer der gewonnenen Spiele.
					</div>
				) : null}
				{teamNames.length === 0 ? (
					<div className="mx-auto mt-5 max-w-3xl rounded-2xl border border-amber-200/16 bg-amber-200/[0.06] px-5 py-4 text-center text-sm font-bold leading-6 text-amber-50/76">
						Die Grafik zeigt aktuell den geplanten Ablauf. Teamnamen und Paarungen erscheinen, sobald die Roster veröffentlicht und die jeweilige Runde freigegeben
						wurde.
					</div>
				) : null}
			</section>
		</>
	);
}

function GroupStagePlanningPage({ settings, teamNames }: { settings: Awaited<ReturnType<typeof getTournamentSettings>>; teamNames: string[] }) {
	const config = settings.ultimateBravery;
	return (
		<>
			<section className="page-section compact-top">
				<PageIntro kicker="Tag 1 · Gruppenphase" title={`${config.groupCount} ${config.groupCount === 1 ? "Gruppe" : "Gruppen"}. Ein gemeinsames Ziel.`}>
					{mainEventTeamCount(config)} Teams spielen {config.groupRoundRobinLegs === 2 ? "eine Hin- und Rückrunde" : "einmal gegeneinander"}. Die besten{" "}
					{config.advanceTeamCount} Teams erreichen die Playoffs an Tag 2.
				</PageIntro>
				<div>
					<GroupStagePlan config={config} teamNames={teamNames} />
				</div>
				{teamNames.length === 0 ? (
					<div className="mt-5 rounded-2xl border border-amber-200/16 bg-amber-200/[0.06] px-5 py-4 text-sm font-bold leading-6 text-amber-50/76">
						Aktuelle Planung: Die Teamnamen werden nach Abschluss der Bewerbungen und Veröffentlichung der Roster eingesetzt.
					</div>
				) : null}
			</section>
		</>
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

function groupPlacementLabel(rank: number, advancing: number, format: Awaited<ReturnType<typeof getTournamentSettings>>["ultimateBravery"]["format"]) {
	if (rank > advancing) return "Ausgeschieden";
	if (format === "double-elimination-light" && advancing === 6) {
		return rank <= 4 ? `Playoff-Seed #${rank} · Start im Upper Bracket` : `Playoff-Seed #${rank} · Start im Lower Bracket`;
	}
	return `Playoff-Seed #${rank}`;
}
