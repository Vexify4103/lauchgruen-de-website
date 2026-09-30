import { TournamentLink as Link } from "../TournamentLink";
import { redirect } from "next/navigation";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { getRosterPublicationStatus } from "@/lib/roster";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { readTournamentState } from "@/lib/tournament-storage";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { compactPoolLabel, getTournamentWheelState, remainingPoolsForTeam } from "@/lib/tournament-wheel";
import { getTournamentLiveStreams } from "@/lib/tournament-live-streams";
import { TournamentLiveRefresh } from "@/components/TournamentLiveRefresh";
import { TournamentLiveStreamLinks } from "@/components/TournamentLiveStreamLinks";
import { auth } from "@/lib/auth";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { CopyOverlayButton } from "./CopyOverlayButton";
import { getMatchControlContext } from "@/lib/match-control";
import { teamMatchRecord } from "@/lib/tournament-team-records";
import { getSwissStageState } from "@/lib/tournament-swiss";
import { computeUltimateBraverySwissSeeds } from "@/lib/ultimate-bravery-playoffs";
import { usesFearless, usesFlexibleEngine, usesUltimateBravery } from "@/lib/tournament-kind";
import { playedChampionsByTeam } from "@/lib/fearless";

function CrownIcon() {
	return (
		<svg aria-hidden viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
			<path d="M3 17h18l-1.5-9-4.5 4-3-6-3 6-4.5-4L3 17zm0 2h18v2H3v-2z" />
		</svg>
	);
}

function opggMultiSearchUrl(riotIds: string[]) {
	const uniqueIds = [...new Set(riotIds.filter(Boolean))];
	const params = new URLSearchParams({
		summoners: uniqueIds.length > 0 ? `${uniqueIds.join(", ")},` : "",
	});
	return `https://op.gg/lol/multisearch/euw?${params.toString()}`;
}

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ twitchPreview?: string }> }) {
	const [settings, publication] = await Promise.all([getTournamentSettings(), getRosterPublicationStatus()]);
	const live = settings.activeTournament.mode === "live";
	if (!usesFlexibleEngine(settings.activeTournament) && settings.activeTournament.mode !== "live") redirect("/tournament/archive/az-2026?view=teams");
	if (!publication.published) return <TeamsNotPublished tournamentName={settings.activeTournament.name} />;
	const isAzTournament = !usesFlexibleEngine(settings.activeTournament);
	const previewRequested = (await searchParams).twitchPreview === "1";
	const session = previewRequested ? await auth() : null;
	const previewEnabled = Boolean(session?.user?.discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(session.user.discordId));
	const ctx = await getTournamentContext();
	const { teams } = ctx;
	const [wheel, state] = await Promise.all([getTournamentWheelState(), readTournamentState(ctx.groupMatches)]);
	const control = isAzTournament ? null : await getMatchControlContext();
	const swissSeeds =
		!isAzTournament && settings.ultimateBravery.dayOneFormat === "swiss"
			? computeUltimateBraverySwissSeeds(await getSwissStageState(settings.activeTournament.id), teams, settings.ultimateBravery.swissRounds)
			: {};
	const currentAssignment = wheel.currentAssignment;
	const poolFor = (matchId: string) =>
		wheel.currentAssignment?.matchId === matchId ? wheel.currentAssignment : (wheel.history.find((entry) => entry.matchId === matchId) ?? null);
	const allMatches = control
		? control.matches.map((match) => ({
				id: match.id,
				teamA: match.teamALabel,
				teamB: match.teamBLabel,
				round: match.round,
				status: match.status,
				poolAssignment: match.poolAssignment,
			}))
		: [
				...ctx.groupMatches.map((match) => ({
					id: match.id,
					teamA: match.teamA,
					teamB: match.teamB,
					round: match.round,
					status: state.matches[match.id]?.status ?? match.status,
					poolAssignment: poolFor(match.id),
				})),
				...resolvePlayoffMatches(state.matches, teams, ctx.groupMatches).map((match) => ({
					id: match.id,
					teamA: match.teamALabel,
					teamB: match.teamBLabel,
					round: match.round,
					status: state.matches[match.id]?.status ?? match.status,
					poolAssignment: poolFor(match.id),
				})),
			];
	const ownerTeam = previewEnabled ? (teams.find((team) => team.players.some((player) => player.discordId === session?.user?.discordId)) ?? null) : null;
	const previewMatch =
		previewEnabled && ownerTeam
			? (allMatches.find((match) => match.status !== "Finished" && (match.teamA === ownerTeam.name || match.teamB === ownerTeam.name)) ?? null)
			: null;
	const liveMatches = allMatches.filter((match) => match.status === "Live");
	const displayedLiveMatches =
		previewMatch && !liveMatches.some((match) => match.id === previewMatch.id)
			? [{ ...previewMatch, preview: true }, ...liveMatches.map((match) => ({ ...match, preview: false }))]
			: liveMatches.map((match) => ({ ...match, preview: false }));
	const liveStreams = live
		? await getTournamentLiveStreams(
				teams,
				displayedLiveMatches.flatMap((match) => [match.teamA, match.teamB]),
				{ previewOffline: previewEnabled }
			)
		: [];
	const fearlessPlayed = usesFearless(settings.activeTournament) && control ? playedChampionsByTeam(control.matches) : null;
	const stageSeedLabel = (team: (typeof teams)[number]) => {
		if (settings.ultimateBravery.dayOneFormat === "swiss" && !isAzTournament) {
			const finalSeed = Object.entries(swissSeeds).find(([, name]) => name === team.name)?.[0];
			return finalSeed ? `#${finalSeed}` : null;
		}
		return isAzTournament || settings.ultimateBravery.dayOneFormat === "groups" ? `${team.group}${team.seed}` : null;
	};
	return (
		<>
			{live ? <TournamentLiveRefresh /> : null}
			<section className="page-section compact-top" aria-labelledby="teams-title">
				{previewEnabled ? (
					<div className="alert mb-6 flex flex-wrap items-center justify-between gap-3">
						<span>Admin-Vorschau: Verbundene Offline-Kanäle werden testweise angezeigt.</span>
						<div className="flex flex-wrap gap-2">
							<Link href="/tournament/schedule?twitchPreview=1" className="button ghost small">
								Im Zeitplan testen
							</Link>
							<Link href="/tournament/teams" className="button ghost small">
								Vorschau beenden
							</Link>
						</div>
					</div>
				) : null}
				<div className="section-title compact">
					<p>Rosters</p>
					<h2 id="teams-title">Das Line-up.</h2>
					<span>Die Teamaufteilung wurde von der Turnierleitung veröffentlicht. Jeder Spielername verlinkt direkt auf OP.GG und DPM.</span>
				</div>

				{displayedLiveMatches.length > 0 ? (
					<div className="content-panel tight mb-6 border-[color-mix(in_srgb,var(--live)_35%,var(--line))]">
						<p className="eyebrow !mb-4" data-tone="live">
							<i />
							Gerade live
						</p>
						<div className="grid gap-3 md:grid-cols-2">
							{displayedLiveMatches.map((match) => {
								const matchStreams = liveStreams.filter((stream) => stream.teamName === match.teamA || stream.teamName === match.teamB);
								const draftVisible = Boolean(match.poolAssignment) || (!isAzTournament && !usesUltimateBravery(settings.activeTournament));
								return (
									<div key={match.id} className="rounded-2xl border border-[var(--line)] bg-black/20 p-4">
										<div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{match.preview ? "Live-Vorschau" : match.round}</div>
										<div className="mt-1 font-display text-xl font-semibold tracking-tight">
											{match.teamA} <span className="text-[var(--muted)]">vs</span> {match.teamB}
										</div>
										{match.poolAssignment ? (
											<p className="mt-2 text-xs font-bold text-[var(--accent)]">
												Pools {compactPoolLabel(match.poolAssignment.teamAPool)} · {compactPoolLabel(match.poolAssignment.teamBPool)}
											</p>
										) : null}
										<TournamentLiveStreamLinks streams={matchStreams} />
										{draftVisible ? (
											<Link href={`/tournament/champ-select/${match.id}/spectate`} className="button ghost small mt-3">
												Draft ansehen
											</Link>
										) : null}
									</div>
								);
							})}
						</div>
					</div>
				) : null}

				{isAzTournament ? (
					<div className="content-panel tight mb-6">
						<p className="panel-kicker">A-Z Wheel</p>
						<h3 className="mt-2 font-display text-2xl font-semibold tracking-tight">
							{currentAssignment
								? `${currentAssignment.teamAName}: ${compactPoolLabel(currentAssignment.teamAPool)} vs ${currentAssignment.teamBName}: ${compactPoolLabel(currentAssignment.teamBPool)}`
								: "Noch kein Match-Pool gezogen"}
						</h3>
						<p className="mt-2 text-sm leading-6 text-[var(--muted)]">
							Jeder Spin gilt nur für ein Match. Sobald das Match beendet ist, wandern die Pools in die Team-Historie.
						</p>
					</div>
				) : null}

				<div className="roster-grid">
					{teams.map((team) => {
						const teamStreams = liveStreams.filter((stream) => stream.teamName === team.name);
						const lockedCount = fearlessPlayed?.get(team.name)?.length ?? 0;
						return (
							<article key={team.id} className="roster-card flex flex-col">
								<header className="roster-card-header">
									<div className="roster-card-title">
										{stageSeedLabel(team) ? (
											<span title={settings.ultimateBravery.dayOneFormat === "swiss" ? "Playoff-Seed" : "Gruppe und Seed"}>{stageSeedLabel(team)}</span>
										) : null}
										<h3>{team.name}</h3>
									</div>
									<span title="Siege und Niederlagen" className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-bold tabular-nums">
										{control ? teamMatchRecord(team.name, control.matches) : team.record}
									</span>
								</header>
								{!team.captainRef ? <p className="mt-2 text-xs text-[var(--muted)]">Captain: {team.captain}</p> : null}
								<TournamentLiveStreamLinks streams={teamStreams} />
								<ul>
									{team.players.map((player) => {
										const isCaptain = !!team.captainRef && team.captainRef.riotId === player.riotId;
										return (
											<li key={`${team.id}-${player.riotId}`}>
												<div className="min-w-0">
													<div className="flex min-w-0 flex-wrap items-center gap-1.5">
														<a href={player.opggUrl} target="_blank" rel="noreferrer" className="truncate text-sm font-bold hover:text-[var(--accent)]">
															{player.name}
														</a>
														{isCaptain ? (
															<span
																className="inline-flex rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[var(--accent)]"
																title="Team-Captain"
															>
																<CrownIcon />
																<span className="sr-only">Captain</span>
															</span>
														) : null}
														{player.verified === false ? (
															<span className="rounded-full border border-amber-200/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-100">
																Nicht verifiziert
															</span>
														) : null}
													</div>
													<div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
														<span className="truncate">{player.riotId}</span>
														<a
															href={player.dpmUrl}
															target="_blank"
															rel="noreferrer"
															className="font-bold hover:text-[var(--text)]"
															aria-label={`${player.name} auf DPM`}
														>
															DPM
														</a>
													</div>
													<TournamentLiveStreamLinks streams={teamStreams.filter((stream) => stream.riotId === player.riotId)} compact />
												</div>
												<small>{player.role}</small>
											</li>
										);
									})}
								</ul>
								<div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
									<a
										href={opggMultiSearchUrl(team.players.map((player) => player.riotId))}
										target="_blank"
										rel="noreferrer"
										className="button ghost small"
										aria-label={`${team.name} auf OP.GG öffnen`}
									>
										Team OP.GG <span aria-hidden="true">↗</span>
									</a>
									<CopyOverlayButton teamId={team.id} />
									{fearlessPlayed ? (
										<Link href={`/tournament/fearless#team-${team.id}`} className="ml-auto text-xs font-bold text-[var(--muted)] hover:text-[var(--accent)]">
											{lockedCount} gesperrt
										</Link>
									) : null}
								</div>
								{isAzTournament ? (
									<TeamPoolHistory
										teamName={team.name}
										groupPools={wheel.usedPoolsByTeam[team.name] ?? []}
										playoffPools={wheel.playoffUsedPoolsByTeam[team.name] ?? []}
										matchPools={wheel.history
											.filter((entry) => entry.teamAName === team.name || entry.teamBName === team.name)
											.map((entry) => ({
												matchId: entry.matchId,
												opponent: entry.teamAName === team.name ? entry.teamBName : entry.teamAName,
												pool: entry.teamAName === team.name ? entry.teamAPool : entry.teamBPool,
											}))}
										groupRemaining={remainingPoolsForTeam(wheel, team.name, "early").length}
										playoffRemaining={remainingPoolsForTeam(wheel, team.name, "finals").length}
									/>
								) : null}
							</article>
						);
					})}
				</div>
			</section>
		</>
	);
}

function TeamsNotPublished({ tournamentName }: { tournamentName: string }) {
	return (
		<section className="page-section compact-top">
			<div className="empty-state">
				<span aria-hidden="true">✦</span>
				<h2>Die Teams stehen noch nicht fest.</h2>
				<p>Die Turnierleitung arbeitet an einer fairen Einteilung für {tournamentName}. Sobald das Roster veröffentlicht ist, erscheinen hier alle Teams.</p>
				<Link href="/tournament" className="button ghost small mt-6">
					Zur Turnierübersicht
				</Link>
			</div>
		</section>
	);
}

function TeamPoolHistory({
	teamName,
	groupPools,
	playoffPools,
	matchPools,
	groupRemaining,
	playoffRemaining,
}: {
	teamName: string;
	groupPools: string[];
	playoffPools: string[];
	matchPools: Array<{
		matchId: string;
		opponent: string;
		pool: string;
	}>;
	groupRemaining: number;
	playoffRemaining: number;
}) {
	return (
		<div className="mt-5 rounded-2xl border border-lime-200/12 bg-lime-200/[0.045] p-4">
			<div className="flex items-center justify-between gap-3">
				<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/60">Gespielte A-Z Pools von {teamName}</div>
				<div className="text-xs font-black text-emerald-100/46">Reset ab Upper Final / Lower Semi-Final</div>
			</div>

			<PoolHistoryRow label={`Bis Final-Reset · ${groupRemaining} übrig`} pools={groupPools} />
			<PoolHistoryRow label={`Finalblock · ${playoffRemaining} übrig`} pools={playoffPools} />
			{matchPools.length > 0 ? (
				<div className="mt-4 grid gap-2">
					<div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/42">Match-Historie</div>
					{matchPools.slice(0, 5).map((entry) => (
						<div
							key={`${entry.matchId}-${entry.pool}`}
							className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/18 px-3 py-2 text-xs font-bold text-emerald-100/62"
						>
							<span className="min-w-0 truncate">
								{entry.matchId} vs {entry.opponent}
							</span>
							<span className="rounded-full border border-lime-200/18 bg-lime-200/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-lime-50">
								{compactPoolLabel(entry.pool)}
							</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

function PoolHistoryRow({ label, pools }: { label: string; pools: string[] }) {
	return (
		<div className="mt-3">
			<div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/42">{label}</div>
			{pools.length === 0 ? (
				<p className="mt-2 text-sm italic text-emerald-100/40">Noch kein Pool abgeschlossen.</p>
			) : (
				<div className="mt-2 flex flex-wrap gap-2">
					{pools.map((pool) => (
						<span key={pool} className="rounded-full border border-lime-200/20 bg-lime-200/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-lime-50/80">
							{compactPoolLabel(pool)}
						</span>
					))}
				</div>
			)}
		</div>
	);
}
