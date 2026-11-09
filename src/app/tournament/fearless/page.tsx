import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAllChampions } from "@/lib/champion-pools";
import { lockedChampionsByTeam } from "@/lib/fearless";
import { getMatchControlContext } from "@/lib/match-control";
import { getRosterPublicationStatus } from "@/lib/roster";
import { usesFearless } from "@/lib/tournament-kind";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TournamentLiveRefresh } from "@/components/TournamentLiveRefresh";
import { FearlessBoard, type FearlessGame, type FearlessTeam } from "./FearlessBoard";

export const metadata: Metadata = { title: "Fearless-Sperren" };

export default async function FearlessPage() {
	const [settings, roster] = await Promise.all([getTournamentSettings(), getRosterPublicationStatus()]);
	if (!usesFearless(settings.activeTournament) || !roster.published) redirect("/tournament");
	const [control, champions] = await Promise.all([getMatchControlContext(), getAllChampions()]);
	const matchFearless = settings.fearless.variant === "match";
	const played = lockedChampionsByTeam(control.matches, settings.fearless.variant);
	const matchOrder = new Map(control.matches.map((match, index) => [match.id, index]));
	const matchById = new Map(control.matches.map((match) => [match.id, match]));
	const lockOpponents = settings.fearless.lockOpponentChampions;

	// One row per game, in match order: the team's own picks, then the picks it faced.
	const teams: FearlessTeam[] = control.teams
		.map((team) => {
			const games = new Map<string, FearlessGame>();
			let ownCount = 0;
			let facedCount = 0;
			for (const lock of played.get(team.name) ?? []) {
				const key = `${lock.matchId}|${lock.round ?? ""}`;
				const match = matchById.get(lock.matchId);
				const opponent = match ? (match.teamAName === team.name ? match.teamBName : match.teamAName) : null;
				const game = games.get(key) ?? { key, round: lock.round ?? match?.round ?? lock.matchId, opponent, own: [], faced: [] };
				if (lock.source === "own") {
					game.own.push(lock.champion);
					ownCount += 1;
				} else {
					game.faced.push(lock.champion);
					facedCount += 1;
				}
				games.set(key, game);
			}
			const ordered = [...games.values()].sort(
				(a, b) => (matchOrder.get(a.key.split("|")[0]) ?? 0) - (matchOrder.get(b.key.split("|")[0]) ?? 0) || a.round.localeCompare(b.round, "de")
			);
			return { id: team.id, name: team.name, ownCount, facedCount, games: ordered };
		})
		.sort((a, b) => b.ownCount + b.facedCount - (a.ownCount + a.facedCount) || a.name.localeCompare(b.name, "de"));
	const images = Object.fromEntries(champions.map((champion) => [champion.name, champion.imageUrl]));

	return (
		<>
			{settings.activeTournament.mode === "live" ? <TournamentLiveRefresh /> : null}
			<section className="page-section compact-top" aria-labelledby="fearless-title">
				<div className="section-title compact">
					<p>Fearless</p>
					<h2 id="fearless-title">Verbrauchte Champions.</h2>
					<span>
						{matchFearless
							? "Alles, was in den Spielen eines Teams gepickt wurde, ist für dieses Team gesperrt, auch die Picks seiner Gegner."
							: lockOpponents
								? "Jedes Team kann weder seine eigenen gespielten Champions noch die seines aktuellen Gegners picken."
								: "Jeder Champion, den ein Team gespielt hat, ist für dieses Team bis zum Turnierende gesperrt."}
					</span>
				</div>
				<FearlessBoard teams={teams} images={images} showFaced={matchFearless} />
			</section>
		</>
	);
}
