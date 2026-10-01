/**
 * Table standings for round-robin groups, Swiss stages and round-robin playoffs.
 *
 * Teams are ordered by wins (and fewer losses), then by the configured tiebreakers in order.
 * The direct comparison is recomputed inside every smaller tie, as usual in round-robin rules.
 * A tie that no criterion splits stays open until the tournament staff records an order.
 */
import { seriesWinnerSide, wonGameDurations, type SeriesGame } from "@/lib/tournament-series";
import type { Tiebreaker } from "@/lib/tournament-structure";

export type StandingMatch = {
	id: string;
	teamAName: string | null;
	teamBName: string | null;
	scoreA?: number;
	scoreB?: number;
	bestOf: number;
	games?: SeriesGame[];
	gameDurationSeconds?: number;
	/** A bye counts as a win without an opponent. */
	bye?: boolean;
};

export type StandingRow = {
	name: string;
	seed?: number;
	played: number;
	wins: number;
	losses: number;
	gamesWon: number;
	gamesLost: number;
	gameDifference: number;
	buchholz: number;
	avgWinSeconds: number | null;
	opponents: string[];
	rank: number;
	/** Teams this one is still tied with after every criterion (only relevant once the table is complete). */
	tiedWith: string[];
	/** The order of this tie came from a staff decision. */
	decidedByStaff: boolean;
};

export type StandingsResult = {
	rows: StandingRow[];
	complete: boolean;
	/** True when the table is complete but at least one tie still needs a staff decision. */
	tiebreakerRequired: boolean;
};

type Outcome = { winner: string; loser: string; winnerGames: number; loserGames: number };

function outcomeOf(match: StandingMatch): Outcome | null {
	if (!match.teamAName || !match.teamBName) return null;
	const side = seriesWinnerSide(match.scoreA, match.scoreB, match.bestOf);
	if (!side) return null;
	const winnerName = side === "teamA" ? match.teamAName : match.teamBName;
	const loserName = side === "teamA" ? match.teamBName : match.teamAName;
	const winnerGames = side === "teamA" ? match.scoreA! : match.scoreB!;
	const loserGames = side === "teamA" ? match.scoreB! : match.scoreA!;
	return { winner: winnerName, loser: loserName, winnerGames, loserGames };
}

export function computeStandings(input: {
	teams: Array<{ name: string; seed?: number }>;
	matches: StandingMatch[];
	tiebreakers: Tiebreaker[];
	/** Staff decision for ties that no criterion splits: team names from best to worst. */
	override?: string[];
}): StandingsResult {
	const rows = new Map<string, StandingRow>(
		input.teams.map((team) => [
			team.name,
			{
				name: team.name,
				seed: team.seed,
				played: 0,
				wins: 0,
				losses: 0,
				gamesWon: 0,
				gamesLost: 0,
				gameDifference: 0,
				buchholz: 0,
				avgWinSeconds: null,
				opponents: [],
				rank: 0,
				tiedWith: [],
				decidedByStaff: false,
			},
		])
	);
	const directWins = new Map<string, number>();
	const winDurations = new Map<string, number[]>();
	let complete = true;

	for (const match of input.matches) {
		if (match.bye) {
			const row = match.teamAName ? rows.get(match.teamAName) : undefined;
			if (row) row.wins += 1;
			continue;
		}
		const outcome = outcomeOf(match);
		const teamA = match.teamAName ? rows.get(match.teamAName) : undefined;
		const teamB = match.teamBName ? rows.get(match.teamBName) : undefined;
		if (!outcome || !teamA || !teamB) {
			if (teamA || teamB) complete = false;
			continue;
		}
		const winnerRow = rows.get(outcome.winner)!;
		const loserRow = rows.get(outcome.loser)!;
		winnerRow.played += 1;
		loserRow.played += 1;
		winnerRow.wins += 1;
		loserRow.losses += 1;
		winnerRow.gamesWon += outcome.winnerGames;
		winnerRow.gamesLost += outcome.loserGames;
		loserRow.gamesWon += outcome.loserGames;
		loserRow.gamesLost += outcome.winnerGames;
		winnerRow.opponents.push(loserRow.name);
		loserRow.opponents.push(winnerRow.name);
		directWins.set(`${outcome.winner}>${outcome.loser}`, (directWins.get(`${outcome.winner}>${outcome.loser}`) ?? 0) + 1);
		const winnerSide = outcome.winner === match.teamAName ? "teamA" : "teamB";
		const durations = wonGameDurations({ games: match.games, side: winnerSide, matchWinnerSide: winnerSide, gameDurationSeconds: match.gameDurationSeconds });
		winDurations.set(outcome.winner, [...(winDurations.get(outcome.winner) ?? []), ...durations]);
		// A losing side in a series can still have won single games.
		if (match.games?.length) {
			const loserSide = winnerSide === "teamA" ? "teamB" : "teamA";
			const loserDurations = wonGameDurations({ games: match.games, side: loserSide, matchWinnerSide: winnerSide });
			winDurations.set(outcome.loser, [...(winDurations.get(outcome.loser) ?? []), ...loserDurations]);
		}
	}

	for (const row of rows.values()) {
		row.gameDifference = row.gamesWon - row.gamesLost;
		row.buchholz = row.opponents.reduce((total, opponent) => total + (rows.get(opponent)?.wins ?? 0), 0);
		const durations = winDurations.get(row.name) ?? [];
		row.avgWinSeconds = durations.length ? durations.reduce((total, seconds) => total + seconds, 0) / durations.length : null;
	}

	const criterionValue = (criterion: Tiebreaker, row: StandingRow, tied: StandingRow[]): number | null => {
		switch (criterion) {
			case "head-to-head":
				return tied.reduce((total, other) => total + (other.name === row.name ? 0 : (directWins.get(`${row.name}>${other.name}`) ?? 0)), 0);
			case "game-difference":
				return row.gameDifference;
			case "buchholz":
				return row.buchholz;
			case "win-duration":
				// Faster wins rank higher; teams without a recorded win rank last.
				return row.avgWinSeconds === null ? null : -row.avgWinSeconds;
			case "seed":
				return row.seed === undefined ? null : -row.seed;
		}
	};

	const override = input.override ?? [];
	const unresolvedTies: StandingRow[][] = [];

	function rankTie(tied: StandingRow[], criterionIndex: number): StandingRow[] {
		if (tied.length <= 1) return tied;
		for (let index = criterionIndex; index < input.tiebreakers.length; index += 1) {
			const criterion = input.tiebreakers[index];
			const values = new Map(tied.map((row) => [row.name, criterionValue(criterion, row, tied)]));
			const distinct = [...new Set(tied.map((row) => values.get(row.name) ?? Number.NEGATIVE_INFINITY))].sort((a, b) => b - a);
			if (distinct.length <= 1) continue;
			// Split into buckets and restart the criteria inside every smaller tie.
			return distinct.flatMap((value) =>
				rankTie(
					tied.filter((row) => (values.get(row.name) ?? Number.NEGATIVE_INFINITY) === value),
					0
				)
			);
		}
		const staffOrder = tied.every((row) => override.includes(row.name));
		if (staffOrder) {
			for (const row of tied) row.decidedByStaff = true;
			return [...tied].sort((a, b) => override.indexOf(a.name) - override.indexOf(b.name));
		}
		unresolvedTies.push(tied);
		return [...tied].sort((a, b) => a.name.localeCompare(b.name, "de"));
	}

	const byRecord = [...rows.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
	const ordered: StandingRow[] = [];
	for (let index = 0; index < byRecord.length; ) {
		const start = byRecord[index];
		const tied = byRecord.filter((row) => row.wins === start.wins && row.losses === start.losses);
		ordered.push(...rankTie(tied, 0));
		index += tied.length;
	}
	for (const tie of unresolvedTies) for (const row of tie) row.tiedWith = tie.filter((other) => other.name !== row.name).map((other) => other.name);
	ordered.forEach((row, index) => (row.rank = index + 1));
	return { rows: ordered, complete, tiebreakerRequired: complete && unresolvedTies.length > 0 };
}

/**
 * Whether an open tie matters for the next stage: ties inside the ranks that advance change seeds
 * or qualification; ties further down (between eliminated teams) do not.
 */
export function openTieBlocks(rows: StandingRow[], relevantRanks: number): boolean {
	return rows.some((row) => row.tiedWith.length > 0 && row.rank <= relevantRanks);
}
