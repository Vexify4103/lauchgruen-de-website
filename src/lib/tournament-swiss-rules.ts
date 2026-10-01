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

function recordDistance(records: Map<string, SwissRuleRecord>, first: SwissRuleTeam, second: SwissRuleTeam) {
	const a = records.get(first.key);
	const b = records.get(second.key);
	if (!a || !b) return Number.POSITIVE_INFINITY;
	return Math.abs(a.wins - b.wins) + Math.abs(a.losses - b.losses);
}

function sameRecord(records: Map<string, SwissRuleRecord>, first: SwissRuleTeam, second: SwissRuleTeam) {
	return recordDistance(records, first, second) === 0;
}

/**
 * Pairs every team without rematches while minimising the summed record distance, so teams only
 * leave their score pool when no rematch-free pairing inside the pools exists. Unlike a greedy
 * nearest-opponent search it never pairs two pools early and strands the rest of a pool.
 * The caller shuffles `teams` to randomise between equally good pairings.
 */
export function findClosestSwissRecordMatching<T extends SwissRuleTeam>(
	teams: T[],
	records: Map<string, SwissRuleRecord>,
	previousOpponents: Set<string>,
	nodeBudget = 250_000
): { pairs: Array<[T, T]>; cost: number } | null {
	if (teams.length % 2 !== 0 || teams.some((team) => !records.has(team.key))) return null;
	const ordered = [...teams].sort((a, b) => {
		const first = records.get(a.key)!;
		const second = records.get(b.key)!;
		return second.wins - first.wins || first.losses - second.losses;
	});
	let best: { pairs: Array<[T, T]>; cost: number } | null = null;
	let nodes = 0;
	function solve(remaining: T[], pairs: Array<[T, T]>, cost: number) {
		if (best?.cost === 0 || nodes > nodeBudget) return;
		nodes += 1;
		if (!remaining.length) {
			best = { pairs: [...pairs], cost };
			return;
		}
		const [first, ...rest] = remaining;
		const candidates = rest
			.filter((opponent) => !previousOpponents.has(opponentKey(first.key, opponent.key)))
			.map((opponent) => ({ opponent, distance: recordDistance(records, first, opponent) }))
			.sort((a, b) => a.distance - b.distance);
		for (const { opponent, distance } of candidates) {
			if (best && cost + distance >= best.cost) break;
			pairs.push([first, opponent]);
			solve(
				rest.filter((team) => team.key !== opponent.key),
				pairs,
				cost + distance
			);
			pairs.pop();
		}
	}
	solve(ordered, [], 0);
	return best;
}

export type SwissRoundPlan<T extends SwissRuleTeam> = {
	pairs: Array<[T, T]>;
	byeTeam: T | null;
	/** Pairings between different score pools. Empty for a clean Swiss round. */
	crossRecordPairs: Array<[T, T]>;
};

/**
 * Plans a full record-based Swiss round: picks the bye (fewest byes, then the weakest record) so the
 * score pools stay even, pairs inside each pool without rematches and only falls back to the
 * closest cross-pool pairing when the pools cannot be paired cleanly.
 */
export function planSwissRecordRound<T extends SwissRuleTeam>(input: {
	teams: T[];
	records: Map<string, SwissRuleRecord>;
	previousOpponents: Set<string>;
	byeCounts?: Map<string, number>;
	shuffle?: <V>(values: V[]) => V[];
}): SwissRoundPlan<T> | null {
	const shuffle = input.shuffle ?? (<V>(values: V[]) => values);
	const plan = (teams: T[], byeTeam: T | null): SwissRoundPlan<T> | null => {
		const exact = findExactSwissRecordMatching(shuffle(teams), input.records, input.previousOpponents);
		if (exact) return { pairs: exact, byeTeam, crossRecordPairs: [] };
		const closest = findClosestSwissRecordMatching(shuffle(teams), input.records, input.previousOpponents);
		if (!closest) return null;
		return { pairs: closest.pairs, byeTeam, crossRecordPairs: closest.pairs.filter(([first, second]) => !sameRecord(input.records, first, second)) };
	};
	if (input.teams.length % 2 === 0) return plan(input.teams, null);

	const byes = (team: T) => input.byeCounts?.get(team.key) ?? 0;
	const minimumByes = Math.min(...input.teams.map(byes));
	const byeCandidates = shuffle(input.teams.filter((team) => byes(team) === minimumByes)).sort((a, b) => {
		const first = input.records.get(a.key) ?? { wins: 0, losses: 0 };
		const second = input.records.get(b.key) ?? { wins: 0, losses: 0 };
		return first.wins - second.wins || second.losses - first.losses;
	});
	let fallback: SwissRoundPlan<T> | null = null;
	for (const byeTeam of byeCandidates) {
		const result = plan(
			input.teams.filter((team) => team.key !== byeTeam.key),
			byeTeam
		);
		if (!result) continue;
		if (!result.crossRecordPairs.length) return result;
		if (!fallback || result.crossRecordPairs.length < fallback.crossRecordPairs.length) fallback = result;
	}
	return fallback;
}

/**
 * Last line of defence before a round is stored: every team plays exactly once, nobody meets a
 * previous opponent and, unless explicitly allowed, both teams of a pairing share the same record.
 */
export function validateSwissRoundPlan<T extends SwissRuleTeam>(input: {
	teams: T[];
	pairs: Array<[T, T]>;
	byeTeam: T | null;
	records: Map<string, SwissRuleRecord>;
	previousOpponents: Set<string>;
	allowCrossRecord: boolean;
}): string[] {
	const problems: string[] = [];
	const expected = new Set(input.teams.map((team) => team.key));
	const seen = new Map<string, number>();
	const count = (key: string) => seen.set(key, (seen.get(key) ?? 0) + 1);
	if (input.byeTeam) count(input.byeTeam.key);
	for (const [first, second] of input.pairs) {
		count(first.key);
		count(second.key);
		if (first.key === second.key) problems.push(`${first.name} wurde gegen sich selbst gepaart.`);
		else if (input.previousOpponents.has(opponentKey(first.key, second.key))) problems.push(`${first.name} gegen ${second.name} wäre ein Rematch.`);
		else if (!input.allowCrossRecord && !sameRecord(input.records, first, second)) {
			const a = input.records.get(first.key);
			const b = input.records.get(second.key);
			problems.push(`${first.name} (${a ? recordLabel(a) : "?"}) und ${second.name} (${b ? recordLabel(b) : "?"}) stammen aus unterschiedlichen Bilanzgruppen.`);
		}
	}
	for (const [key, times] of seen) {
		if (!expected.has(key)) problems.push(`Team ${key} gehört nicht zu dieser Runde.`);
		else if (times > 1) problems.push(`Team ${key} wurde ${times}-mal eingeplant.`);
	}
	for (const key of expected) if (!seen.has(key)) problems.push(`Team ${key} fehlt in der Auslosung.`);
	return problems;
}
