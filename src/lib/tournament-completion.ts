export type TournamentCompletionMatch = {
	id: string;
	status: string;
	teamAName: string | null;
	teamBName: string | null;
	scoreA?: number;
	scoreB?: number;
	winner?: string;
};

export type TournamentCompletion = {
	championTeamName: string;
	finalistTeamName: string;
	teamAName: string;
	teamBName: string;
	scoreA: number;
	scoreB: number;
};

export function resolveTournamentCompletion(matches: TournamentCompletionMatch[]): TournamentCompletion | null {
	const final = matches.find((match) => match.id === "gf");
	if (!final || final.status !== "Finished" || !final.teamAName || !final.teamBName) return null;
	if (!((final.scoreA === 1 && final.scoreB === 0) || (final.scoreA === 0 && final.scoreB === 1))) return null;

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
