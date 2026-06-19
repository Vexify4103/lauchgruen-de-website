import { getChampionPools } from "@/lib/champion-pools";
import { getMatchControlContext } from "@/lib/match-control";
import { getDraftState } from "@/lib/tournament-draft";
import { bonusBanSideForMatch } from "@/lib/tournament-rules";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { DraftSpectatorClient, type DraftViewerPerspective } from "./spectate/DraftSpectatorClient";

export async function DraftViewerPage({ id, perspective }: { id: string; perspective: DraftViewerPerspective }) {
	const [ctx, pools, draft, settings] = await Promise.all([getMatchControlContext(), getChampionPools(), getDraftState(id), getTournamentSettings()]);
	const match = ctx.matches.find((entry) => entry.id === id);
	if (!match) {
		return (
			<div className="px-5 py-10 sm:py-14">
				<section className="mx-auto max-w-3xl rounded-[2rem] border border-amber-200/18 bg-amber-200/8 p-6 text-amber-50">Match nicht gefunden.</section>
			</div>
		);
	}
	if (!settings.draftEnabled) {
		return (
			<div className="px-5 py-10 sm:py-14">
				<section className="mx-auto max-w-3xl rounded-[2rem] border border-amber-200/18 bg-amber-200/8 p-6 text-amber-50">
					<div className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/70">Draft-Ansicht pausiert</div>
					<h1 className="mt-3 text-3xl font-black">Champ Select ist aktuell deaktiviert.</h1>
					<p className="mt-3 text-sm leading-7 text-amber-50/72">Die Ansicht ist wieder erreichbar, sobald der Draft-Schalter aktiv ist.</p>
				</section>
			</div>
		);
	}

	const teamA = ctx.teams.find((team) => team.name === match.teamAName);
	const teamB = ctx.teams.find((team) => team.name === match.teamBName);
	const blueTeam = match.blueSide === "teamA" ? teamA : teamB;
	const redTeam = match.blueSide === "teamA" ? teamB : teamA;
	const bluePool = match.blueSide === "teamA" ? match.poolAssignment?.teamAPool : match.poolAssignment?.teamBPool;
	const redPool = match.blueSide === "teamA" ? match.poolAssignment?.teamBPool : match.poolAssignment?.teamAPool;

	return (
		<div className="px-3 py-3 sm:px-5 sm:py-4">
			<section className="mx-auto w-full max-w-[118rem]">
				<DraftSpectatorClient
					match={match}
					draft={draft}
					perspective={perspective}
					blueTeamLabel={blueTeam?.name ?? (match.blueSide === "teamA" ? match.teamALabel : match.teamBLabel)}
					redTeamLabel={redTeam?.name ?? (match.blueSide === "teamA" ? match.teamBLabel : match.teamALabel)}
					blueChampions={bluePool ? (pools.find((pool) => pool.pool === bluePool)?.champions ?? []) : []}
					redChampions={redPool ? (pools.find((pool) => pool.pool === redPool)?.champions ?? []) : []}
					extraBanSide={bonusBanSideForMatch(match)}
				/>
			</section>
		</div>
	);
}
