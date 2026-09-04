type TeamMatchResult = {
	id: string;
	teamAName: string | null;
	teamBName: string | null;
	status?: string;
	scoreA?: number;
	scoreB?: number;
};

export function teamMatchRecord(teamName: string, matches: TeamMatchResult[]): string {
	let wins = 0;
	let losses = 0;
	const seen = new Set<string>();
	for (const match of matches) {
		if (seen.has(match.id) || match.status !== "Finished" || !match.teamAName || !match.teamBName) continue;
		if (match.scoreA === undefined || match.scoreB === undefined || match.scoreA === match.scoreB) continue;
		if (match.teamAName !== teamName && match.teamBName !== teamName) continue;
		seen.add(match.id);
		const winner = match.scoreA > match.scoreB ? match.teamAName : match.teamBName;
		if (winner === teamName) wins += 1;
		else losses += 1;
	}
	return `${wins}-${losses}`;
}
