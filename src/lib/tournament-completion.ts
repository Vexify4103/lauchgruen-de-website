import { winsNeeded } from "@/lib/tournament-structure";

export type TournamentCompletionMatch = {
	id: string;
	status: string;
	teamAName: string | null;
	teamBName: string | null;
	scoreA?: number;
	scoreB?: number;
	winner?: string;
	/** Series length of this match; 1 when omitted. */
	bestOf?: number;
};

export type TournamentCompletion = {
	championTeamName: string;
	finalistTeamName: string;
	teamAName: string;
	teamBName: string;
	scoreA: number;
	scoreB: number;
};

/**
 * The title is decided by the grand final, or by its bracket reset when the lower-bracket finalist
 * forced one. The score has to be a complete series: 1:0 in a Bo1, 2:x in a Bo3, 3:x in a Bo5.
 */
export function resolveTournamentCompletion(matches: TournamentCompletionMatch[]): TournamentCompletion | null {
	const reset = matches.find((match) => match.id === "gf-2" && match.teamAName && match.teamBName);
	const final = reset ?? matches.find((match) => match.id === "gf");
	if (!final || final.status !== "Finished" || !final.teamAName || !final.teamBName) return null;
	if (final.scoreA === undefined || final.scoreB === undefined) return null;
	const needed = winsNeeded(final.bestOf ?? 1);
	const high = Math.max(final.scoreA, final.scoreB);
	const low = Math.min(final.scoreA, final.scoreB);
	if (high !== needed || low >= needed) return null;

	const championTeamName = final.scoreA > final.scoreB ? final.teamAName : final.teamBName;
	if (final.winner && final.winner !== championTeamName) return null;

	return {
		championTeamName,
		finalistTeamName: championTeamName === final.teamAName ? final.teamBName : final.teamAName,
		teamAName: final.teamAName,
		teamBName: final.teamBName,
		scoreA: final.scoreA,
		scoreB: final.scoreB,
	};
}
