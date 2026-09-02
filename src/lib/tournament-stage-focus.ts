type StageStatus = "Locked" | "Scheduled" | "Pending" | "Live" | "Finished";

export function resolveSwissFocusRound(
	rounds: Array<{ round: number; pairings: Array<{ bye: boolean; winnerTeamKey?: string }> }>,
	configuredRounds: number
) {
	const current = rounds.find((round) => round.pairings.some((pairing) => !pairing.bye && !pairing.winnerTeamKey));
	if (current) return current.round;
	const latestRound = rounds.at(-1)?.round ?? 0;
	return Math.max(1, Math.min(configuredRounds, latestRound < configuredRounds ? latestRound + 1 : latestRound));
}

export function resolveBracketFocusMatchId(
	matches: Array<{ id: string; status: StageStatus; teamAName: string | null; teamBName: string | null }>
) {
	const active = matches.find((match) => match.status === "Live") ?? matches.find((match) => match.status === "Pending");
	if (active) return active.id;
	const ready = matches.find((match) => match.status === "Scheduled" && match.teamAName && match.teamBName);
	if (ready) return ready.id;
	return matches.every((match) => match.status === "Finished") ? (matches.find((match) => match.id === "gf")?.id ?? null) : null;
}

export function resolveGroupFocusMatchId(matches: Array<{ id: string; status: StageStatus }>) {
	return matches.find((match) => match.status === "Live")?.id ?? matches.find((match) => match.status === "Pending")?.id ?? null;
}
