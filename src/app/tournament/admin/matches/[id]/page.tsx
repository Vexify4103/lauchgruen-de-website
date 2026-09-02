import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getChampionPools } from "@/lib/champion-pools";
import { getDraftState } from "@/lib/tournament-draft";
import { loadRosterSnapshot } from "@/lib/roster";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { findTeamByName, getMatchControlContext } from "@/lib/match-control";
import { bonusBanSideForMatch } from "@/lib/tournament-rules";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { MatchControlRoomClient } from "./MatchControlRoomClient";
import { getAdminVersions } from "@/lib/admin-version";
import { resolveUltimateBraveryMatchPlayers } from "@/lib/ultimate-bravery-match";
import { listUltimateBraveryRolls } from "@/lib/ultimate-bravery";
import { ULTIMATE_BRAVERY_TEST_MATCH_ID } from "@/lib/ultimate-bravery-test";
import { getUltimateBraveryDraftStatus } from "@/lib/ultimate-bravery-state";
import { UltimateBraveryMatch } from "../../../matches/[id]/UltimateBraveryMatch";

export default async function MatchControlRoomPage({ params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		redirect("/tournament/admin");
	}

	const { id } = await params;
	if (id === ULTIMATE_BRAVERY_TEST_MATCH_ID) {
		const [settings, players, rolls] = await Promise.all([getTournamentSettings(), resolveUltimateBraveryMatchPlayers(id), listUltimateBraveryRolls(id)]);
		if (!players) notFound();
		const draftStatus = getUltimateBraveryDraftStatus(players, rolls);
		const { allLocked } = draftStatus;
		return (
			<div className="px-5 py-6 sm:py-8">
				<section className="mx-auto w-full max-w-7xl">
					<UltimateBraveryMatch
						matchId={id}
						players={players}
						initialRolls={rolls}
						currentDiscordId={discordId}
						viewerTeam={players[0]?.teamName ?? "Team Alpha"}
						initialAllLocked={allLocked}
						initialLockedCount={draftStatus.lockedCount}
						rerollLimit={settings.ultimateBravery.rerollsPerPlayer}
						testMode
						adminMode
					/>
				</section>
			</div>
		);
	}
	const [ctx, pools, draft, roster, settings, versions] = await Promise.all([
		getMatchControlContext(),
		getChampionPools(),
		getDraftState(id),
		loadRosterSnapshot(),
		getTournamentSettings(),
		getAdminVersions([`match:${id}`, "roster"]),
	]);
	const match = ctx.matches.find((entry) => entry.id === id);
	if (!match) notFound();
	const groupRound = match.phase === "groups" ? /^[ab]-r(\d+)-\d+$/.exec(match.id)?.[1] : null;
	const parallelMatches = ctx.matches.filter(
		(entry) =>
			entry.id !== match.id &&
			entry.phase === match.phase &&
			(groupRound ? /^[ab]-r(\d+)-\d+$/.exec(entry.id)?.[1] === groupRound : entry.round === match.round) &&
			entry.teamAName &&
			entry.teamBName
	);
	const ultimateBravery = settings.activeTournament.id === "ultimate-bravery";
	const [ultimateBraveryPlayers, ultimateBraveryRolls] = ultimateBravery ? await Promise.all([resolveUltimateBraveryMatchPlayers(id), listUltimateBraveryRolls(id)]) : [null, []];
	const ultimateBraveryStatus = ultimateBraveryPlayers ? getUltimateBraveryDraftStatus(ultimateBraveryPlayers, ultimateBraveryRolls) : null;

	return (
		<div className="px-5 py-6 sm:py-8">
			<section className="mx-auto w-full max-w-7xl">
				{ultimateBravery && ultimateBraveryPlayers ? (
					<div className="mb-5">
						<UltimateBraveryMatch
							matchId={id}
							players={ultimateBraveryPlayers}
							initialRolls={ultimateBraveryRolls}
							currentDiscordId={discordId}
							viewerTeam={ultimateBraveryPlayers[0]?.teamName ?? ""}
							initialAllLocked={ultimateBraveryStatus?.allLocked ?? false}
							initialLockedCount={ultimateBraveryStatus?.lockedCount ?? 0}
							rerollLimit={settings.ultimateBravery.rerollsPerPlayer}
							adminMode
							readOnly={match.status === "Finished"}
						/>
					</div>
				) : null}
				<MatchControlRoomClient
					match={match}
					teamA={findTeamByName(ctx.teams, match.teamAName)}
					teamB={findTeamByName(ctx.teams, match.teamBName)}
					pools={pools}
					draft={draft}
					extraBanSide={bonusBanSideForMatch(match)}
					roster={roster}
					draftEnabled={settings.draftEnabled}
					parallelMatches={parallelMatches}
					initialVersion={versions[`match:${id}`] ?? 0}
					initialRosterVersion={versions.roster ?? 0}
					ultimateBravery={ultimateBravery}
				/>
			</section>
		</div>
	);
}
