/**
 * Rules that apply whenever a match result changes, for a single game (Bo1 form) and for series
 * (game by game) alike: the Swiss history must stay consistent, a bracket match that already started
 * with this winner blocks a change, and a decided match updates Swiss and the champion pool wheel.
 */
import type { ControlMatch, MatchControlContext } from "@/lib/match-control";
import type { TournamentSettings } from "@/lib/tournament-settings";
import { clearSwissPairingWinner, getSwissStageState, setSwissPairingWinner, type SwissPairing } from "@/lib/tournament-swiss";
import { commitWheelAssignmentForMatch } from "@/lib/tournament-wheel";

export type MatchSide = "teamA" | "teamB";

export type SwissLink = { pairing: SwissPairing | null; locked: boolean };

/** The Swiss pairing behind a match and whether later rounds were already drawn from its result. */
export async function swissLinkFor(matchId: string, settings: TournamentSettings): Promise<SwissLink> {
	const format = settings.structure.dayOneFormat;
	if (format !== "swiss" && format !== "swiss-elimination") return { pairing: null, locked: false };
	const swiss = await getSwissStageState(settings.activeTournament.id);
	const pairing = swiss.rounds.flatMap((round) => round.pairings).find((entry) => entry.id === matchId && !entry.bye) ?? null;
	return { pairing, locked: Boolean(pairing && pairing.round < (swiss.rounds.at(-1)?.round ?? 0)) };
}

function swissKey(pairing: SwissPairing, side: MatchSide) {
	return side === "teamA" ? pairing.teamAKey : pairing.teamBKey!;
}

/**
 * Returns a German error message when the result may not change, otherwise null.
 * `nextWinner` is the winner after the change, or null when the result is being removed.
 */
export function resultChangeBlocked(input: { match: ControlMatch; control: MatchControlContext; swiss: SwissLink; nextWinner: MatchSide | null }): string | null {
	const { match, swiss, nextWinner } = input;
	const currentWinner: MatchSide | null = match.winner ? (match.winner === match.teamAName ? "teamA" : "teamB") : null;
	if (currentWinner === nextWinner) return null;

	// Later Swiss rounds were paired from the stored winner; flipping or removing it corrupts every record after it.
	if (swiss.locked && swiss.pairing?.winnerTeamKey) {
		const nextKey = nextWinner ? swissKey(swiss.pairing, nextWinner) : null;
		if (nextKey !== swiss.pairing.winnerTeamKey) {
			return "Die nächste Swiss-Runde wurde bereits ausgelost; dieses Ergebnis kann nicht mehr geändert werden. Setze zuerst die neueste Runde zurück.";
		}
	}

	// A bracket match fed by this winner that is already running would keep the wrong team.
	if (match.winner) {
		const dependent = input.control.matches.find(
			(entry) =>
				entry.id !== match.id &&
				(entry.teamAName === match.winner || entry.teamBName === match.winner) &&
				(entry.sources?.teamA === match.id || entry.sources?.teamB === match.id) &&
				entry.status !== "Scheduled" &&
				entry.status !== "Locked"
		);
		if (dependent) return `${dependent.round} läuft bereits mit dem Sieger dieses Matches.`;
	}
	return null;
}

/** Side effects once a match is decided: Swiss record and the champion pool wheel. */
export async function afterMatchDecided(input: { matchId: string; winner: MatchSide; swiss: SwissLink; settings: TournamentSettings }) {
	const { swiss } = input;
	if (swiss.pairing) {
		const key = swissKey(swiss.pairing, input.winner);
		// Re-saving an older Swiss match (duration, champions) keeps its winner; only a real change is written.
		if (key !== swiss.pairing.winnerTeamKey) await setSwissPairingWinner(input.settings.activeTournament.id, swiss.pairing.id, key);
	}
	await commitWheelAssignmentForMatch(input.matchId);
}

/** Side effects when a decided match is reopened (last game of a series undone). */
export async function afterMatchReopened(input: { swiss: SwissLink; settings: TournamentSettings }) {
	if (input.swiss.pairing?.winnerTeamKey) await clearSwissPairingWinner(input.settings.activeTournament.id, input.swiss.pairing.id);
}
