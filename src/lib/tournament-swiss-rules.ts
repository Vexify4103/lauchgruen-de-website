export type SwissRuleTeam = { key: string; name: string };
export type SwissRuleRecord = { wins: number; losses: number };
export type SwissRulePairing = { teamAKey: string; teamBKey: string | null; recordA?: string; recordB?: string };
export type SwissRuleResultPairing = SwissRulePairing & { bye: boolean; winnerTeamKey?: string };

export function computeSwissRecords<T extends SwissRuleTeam>(teams: T[], rounds: Array<{ pairings: SwissRuleResultPairing[] }>) {
	const records = new Map<string, SwissRuleRecord>(teams.map((team) => [team.key, { wins: 0, losses: 0 }]));
	for (const round of rounds) {
		for (const pairing of round.pairings) {
			if (pairing.bye) {
				const record = records.get(pairing.teamAKey);
				if (record) record.wins += 1;
				continue;
			}
			if (!pairing.winnerTeamKey) continue;
			const loserKey = pairing.winnerTeamKey === pairing.teamAKey ? pairing.teamBKey : pairing.teamAKey;
			const winner = records.get(pairing.winnerTeamKey);
			const loser = loserKey ? records.get(loserKey) : undefined;
			if (winner) winner.wins += 1;
			if (loser) loser.losses += 1;
		}
	}
	return records;
}

function opponentKey(first: string, second: string) {
	return [first, second].sort().join(":");
}

function recordLabel(record: SwissRuleRecord) {
	return `${record.wins}-${record.losses}`;
}

function pairWithoutRematches<T extends SwissRuleTeam>(teams: T[], previousOpponents: Set<string>): Array<[T, T]> | null {
	if (teams.length === 0) return [];
	if (teams.length % 2 !== 0) return null;
	const [first, ...rest] = teams;
	for (const opponent of rest) {
		if (previousOpponents.has(opponentKey(first.key, opponent.key))) continue;
		const tail = pairWithoutRematches(
			rest.filter((team) => team.key !== opponent.key),
			previousOpponents
		);
		if (tail) return [[first, opponent], ...tail];
	}
	return null;
}

export function findExactSwissRecordMatching<T extends SwissRuleTeam>(teams: T[], records: Map<string, SwissRuleRecord>, previousOpponents: Set<string>): Array<[T, T]> | null {
	const pools = new Map<string, T[]>();
	for (const team of teams) {
		const record = records.get(team.key);
		if (!record) return null;
		const label = recordLabel(record);
		pools.set(label, [...(pools.get(label) ?? []), team]);
	}

	const result: Array<[T, T]> = [];
	for (const pool of pools.values()) {
		const matching = pairWithoutRematches(pool, previousOpponents);
		if (!matching) return null;
		result.push(...matching);
	}
	return result;
}

export function placementSwissCandidates<T extends SwissRuleTeam>(teams: T[], previousPairings: SwissRulePairing[], nextRound: number): T[] {
	if (nextRound !== 4) return teams;
	const middleTeamKeys = new Set(
		previousPairings
			.filter((pairing) => pairing.recordA === "1-1" && pairing.recordB === "1-1")
			.flatMap((pairing) => [pairing.teamAKey, ...(pairing.teamBKey ? [pairing.teamBKey] : [])])
	);
	return teams.filter((team) => middleTeamKeys.has(team.key));
}
