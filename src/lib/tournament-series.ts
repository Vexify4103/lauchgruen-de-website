import { winsNeeded, type SideSelectionRule } from "@/lib/tournament-structure";

export type SeriesSide = "teamA" | "teamB";

/** One recorded game of a Bo3/Bo5 series. Bo1 matches keep using the match-level fields. */
export type SeriesGame = {
	number: number;
	winner: SeriesSide;
	durationSeconds?: number;
	teamAChampions?: string[];
	teamBChampions?: string[];
	blueSide?: SeriesSide;
	recordedAt: string;
	recordedBy?: string;
};

export function seriesScore(games: Pick<SeriesGame, "winner">[]): { scoreA: number; scoreB: number } {
	return {
		scoreA: games.filter((game) => game.winner === "teamA").length,
		scoreB: games.filter((game) => game.winner === "teamB").length,
	};
}

/** The side that won the series, or null while it is still running (or no score exists). */
export function seriesWinnerSide(scoreA: number | undefined, scoreB: number | undefined, bestOf: number): SeriesSide | null {
	if (scoreA === undefined || scoreB === undefined || scoreA === scoreB) return null;
	const needed = winsNeeded(bestOf);
	if (Math.max(scoreA, scoreB) < needed) return null;
	return scoreA > scoreB ? "teamA" : "teamB";
}

/** A final score for a best-of series: the winner reached the required wins, the loser did not. */
export function validateSeriesScore(scoreA: number, scoreB: number, bestOf: number): string | null {
	const needed = winsNeeded(bestOf);
	const high = Math.max(scoreA, scoreB);
	const low = Math.min(scoreA, scoreB);
	if (bestOf === 1) return scoreA !== scoreB ? null : "Ein Ergebnis benötigt zwei unterschiedliche Scores.";
	if (high !== needed || low >= needed) return `In einer Bo${bestOf}-Serie gewinnt, wer zuerst ${needed} Spiele gewinnt (zum Beispiel ${needed}:${Math.max(0, needed - 1)}).`;
	return null;
}

/** Wins recorded so far can never exceed what the series allows. */
export function canRecordAnotherGame(games: Pick<SeriesGame, "winner">[], bestOf: number): boolean {
	const { scoreA, scoreB } = seriesScore(games);
	return Math.max(scoreA, scoreB) < winsNeeded(bestOf) && games.length < bestOf;
}

/**
 * Blue side for the next game. `null` means a team chooses (the admin records the choice).
 * `coinFlip` is only used for game 1 of the coin-flip rule so the result can be stored.
 */
export function automaticBlueSide(input: { rule: SideSelectionRule; games: Pick<SeriesGame, "blueSide" | "winner">[]; coinFlip?: () => SeriesSide }): SeriesSide | null {
	const previous = input.games.at(-1);
	switch (input.rule) {
		case "alternate":
			return previous?.blueSide ? (previous.blueSide === "teamA" ? "teamB" : "teamA") : input.games.length % 2 === 0 ? "teamA" : "teamB";
		case "coin-flip":
			if (!previous) return (input.coinFlip ?? (() => (Math.random() < 0.5 ? "teamA" : "teamB")))();
			return previous.blueSide === "teamA" ? "teamB" : "teamA";
		case "higher-seed":
		case "loser-picks":
			return null;
	}
}

/** Which team picks the side for the next game, when the rule leaves it to a team. */
export function sideChooser(input: { rule: SideSelectionRule; games: Pick<SeriesGame, "winner">[]; higherSeedSide: SeriesSide | null }): SeriesSide | null {
	const previous = input.games.at(-1);
	if (input.rule === "loser-picks" && previous) return previous.winner === "teamA" ? "teamB" : "teamA";
	if (input.rule === "higher-seed" || input.rule === "loser-picks") return input.higherSeedSide;
	return null;
}

/** Every champion a team played in the recorded games plus the running game's picks. */
export function seriesChampions(input: { games?: SeriesGame[]; teamAChampions?: string[]; teamBChampions?: string[]; includeCurrent: boolean }) {
	const teamA = new Set<string>();
	const teamB = new Set<string>();
	for (const game of input.games ?? []) {
		for (const champion of game.teamAChampions ?? []) teamA.add(champion);
		for (const champion of game.teamBChampions ?? []) teamB.add(champion);
	}
	if (input.includeCurrent) {
		for (const champion of input.teamAChampions ?? []) teamA.add(champion);
		for (const champion of input.teamBChampions ?? []) teamB.add(champion);
	}
	return { teamA: [...teamA], teamB: [...teamB] };
}

/** Durations of the games a side won; Bo1 matches fall back to the match duration. */
export function wonGameDurations(input: { games?: SeriesGame[]; side: SeriesSide; matchWinnerSide: SeriesSide | null; gameDurationSeconds?: number }): number[] {
	if (input.games?.length) {
		return input.games.flatMap((game) => (game.winner === input.side && game.durationSeconds !== undefined ? [game.durationSeconds] : []));
	}
	return input.matchWinnerSide === input.side && input.gameDurationSeconds !== undefined ? [input.gameDurationSeconds] : [];
}
