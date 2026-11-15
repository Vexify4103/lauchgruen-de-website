import type { SwissStageState } from "@/lib/tournament-swiss";

export type SwissRecord = { wins: number; losses: number };

/** True for the 8-team, 4-round Swiss where every team advances and decider matches set the seeds. */
export function isPlacementSwiss(config: { teamCount: number; advanceTeamCount: number; swissRounds: number }) {
	return config.teamCount === 8 && config.advanceTeamCount === 8 && config.swissRounds === 4;
}

/** Wins and losses of every team before each round, from the results of earlier rounds. */
export function recordsBeforeRounds(state: SwissStageState) {
	const running = new Map<string, SwissRecord>();
	const before = new Map<number, Map<string, SwissRecord>>();
	for (const round of [...state.rounds].sort((a, b) => a.round - b.round)) {
		before.set(round.round, new Map([...running].map(([key, value]) => [key, { ...value }])));
		for (const pairing of round.pairings) {
			const a = running.get(pairing.teamAKey) ?? { wins: 0, losses: 0 };
			running.set(pairing.teamAKey, a);
			if (pairing.bye) {
				a.wins += 1;
				continue;
			}
			if (!pairing.teamBKey) continue;
			const b = running.get(pairing.teamBKey) ?? { wins: 0, losses: 0 };
			running.set(pairing.teamBKey, b);
			if (!pairing.winnerTeamKey) continue;
			if (pairing.winnerTeamKey === pairing.teamAKey) {
				a.wins += 1;
				b.losses += 1;
			} else {
				b.wins += 1;
				a.losses += 1;
			}
		}
	}
	return { before, after: running };
}

/**
 * Seeds of the 8-team placement Swiss. Each decider fills its two seeds as soon as it has a winner,
 * so #1/#2 and #7/#8 show after round three while #3–#6 are still being played.
 */
export function placementSeeds(state: SwissStageState): Record<number, string> | undefined {
	const third = state.rounds.find((round) => round.round === 3);
	const fourth = state.rounds.find((round) => round.round === 4);
	const { before } = recordsBeforeRounds(state);
	const assignments = [
		{ round: third, record: "2-0", winnerSeed: 1, loserSeed: 2 },
		{ round: fourth, record: "2-1", winnerSeed: 3, loserSeed: 4 },
		{ round: fourth, record: "1-2", winnerSeed: 5, loserSeed: 6 },
		{ round: third, record: "0-2", winnerSeed: 7, loserSeed: 8 },
	];
	const seeds: Record<number, string> = {};
	for (const assignment of assignments) {
		if (!assignment.round) continue;
		const records = before.get(assignment.round.round);
		const pairing = assignment.round.pairings.find((entry) => {
			const record = records?.get(entry.teamAKey);
			return record && `${record.wins}-${record.losses}` === assignment.record;
		});
		if (!pairing?.teamBName || !pairing.winnerTeamKey) continue;
		seeds[assignment.winnerSeed] = pairing.winnerTeamKey === pairing.teamAKey ? pairing.teamAName : pairing.teamBName;
		seeds[assignment.loserSeed] = pairing.winnerTeamKey === pairing.teamAKey ? pairing.teamBName : pairing.teamAName;
	}
	return Object.keys(seeds).length ? seeds : undefined;
}

/**
 * Orders a record table by placement seeds: decided teams take their seed rank, the rest fill the
 * open ranks in their current order. A 2–1 team already fixed as #2 then sits above a 3–1 team on #3.
 */
export function orderBySeeds<Row extends { name: string; rank: number }>(rows: Row[], seeds: Record<number, string> | undefined): Row[] {
	if (!seeds) return rows;
	const seeded = new Map(Object.entries(seeds).map(([rank, name]) => [name, Number(rank)]));
	const open = rows.filter((row) => !seeded.has(row.name));
	const result: Row[] = [];
	for (let rank = 1; rank <= rows.length; rank += 1) {
		const name = seeds[rank];
		const row = name ? rows.find((entry) => entry.name === name) : open.shift();
		if (row) result.push({ ...row, rank });
	}
	return result.concat(open.map((row, index) => ({ ...row, rank: result.length + index + 1 })));
}
