import Image from "next/image";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAllChampions } from "@/lib/champion-pools";
import { playedChampionsByTeam } from "@/lib/fearless";
import { getMatchControlContext } from "@/lib/match-control";
import { getRosterPublicationStatus } from "@/lib/roster";
import { usesFearless } from "@/lib/tournament-kind";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TournamentLiveRefresh } from "@/components/TournamentLiveRefresh";

export const metadata: Metadata = { title: "Fearless-Sperren" };

export default async function FearlessPage() {
	const [settings, roster] = await Promise.all([getTournamentSettings(), getRosterPublicationStatus()]);
	if (!usesFearless(settings.activeTournament) || !roster.published) redirect("/tournament");
	const [control, champions] = await Promise.all([getMatchControlContext(), getAllChampions()]);
	const played = playedChampionsByTeam(control.matches);
	const byName = new Map(champions.map((champion) => [champion.name, champion]));
	const roundByMatch = new Map(control.matches.map((match) => [match.id, match.round]));
	const teams = [...control.teams].sort((a, b) => (played.get(b.name)?.length ?? 0) - (played.get(a.name)?.length ?? 0) || a.name.localeCompare(b.name, "de"));
	const lockOpponents = settings.fearless.lockOpponentChampions;

	return (
		<>
			{settings.activeTournament.mode === "live" ? <TournamentLiveRefresh /> : null}
			<section className="page-section compact-top" aria-labelledby="fearless-title">
				<div className="section-title compact">
					<p>Fearless</p>
					<h2 id="fearless-title">Verbrauchte Champions.</h2>
					<span>
						{lockOpponents
							? "Jedes Team kann weder seine eigenen gespielten Champions noch die seines aktuellen Gegners picken. Die Liste zeigt, was jedes Team bereits gespielt hat."
							: "Jeder Champion, den ein Team im Turnier gespielt hat, ist für dieses Team bis zum Ende gesperrt. Andere Teams dürfen ihn weiterhin picken."}
					</span>
				</div>
				<div className="roster-grid">
					{teams.map((team) => {
						const locks = [...(played.get(team.name) ?? [])].sort((a, b) => a.champion.localeCompare(b.champion, "de"));
						return (
							<article key={team.id} id={`team-${team.id}`} className="roster-card scroll-mt-40">
								<header className="roster-card-header">
									<div className="roster-card-title">
										<h3>{team.name}</h3>
									</div>
									<span className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-bold tabular-nums">{locks.length} gesperrt</span>
								</header>
								{locks.length === 0 ? (
									<p className="mt-5 text-sm text-[var(--muted)]">Noch kein Champion verbraucht.</p>
								) : (
									<ul className="!mt-5 grid grid-cols-5 gap-2 sm:grid-cols-6" aria-label={`Gesperrte Champions von ${team.name}`}>
										{locks.map((lock) => {
											const champion = byName.get(lock.champion);
											const round = roundByMatch.get(lock.matchId);
											return (
												<li key={lock.champion} className="!block !border-0 !p-0" title={`${lock.champion}${round ? ` · ${round}` : ""}`}>
													<div className="relative aspect-square overflow-hidden rounded-lg border border-[var(--line)] bg-black/30 grayscale-[35%]">
														{champion ? <Image src={champion.imageUrl} alt="" fill sizes="56px" className="object-cover" /> : null}
													</div>
													<span className="mt-1 block truncate text-center text-[10px] font-bold text-[var(--muted)]">{lock.champion}</span>
												</li>
											);
										})}
									</ul>
								)}
							</article>
						);
					})}
				</div>
			</section>
		</>
	);
}
