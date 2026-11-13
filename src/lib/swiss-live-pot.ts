import type { SwissStageState, SwissTeam } from "@/lib/tournament-swiss";
import type { SwissPotState } from "@/lib/swiss-pot-draw";

/** Rebuild from the authoritative match winners, never from a second copy of the results. */
export function swissStageToPotState(state: SwissStageState, teams: SwissTeam[], seededOrder?: string[]): SwissPotState {
	return {
		teams,
		seededOrder,
		events: state.drawEvents ?? [],
		rounds: state.rounds.map((round) => ({
			round: round.round,
			complete: round.complete,
			pools: round.drawPools ?? [],
			pairings: round.pairings.map((pair) => {
				if (pair.bye || !pair.teamBKey) throw new Error("Die Acht-Team-Topfziehung unterstützt keine Freilose.");
				return {
					id: pair.id,
					teamAKey: pair.teamAKey,
					teamBKey: pair.teamBKey,
					recordA: pair.recordA ?? "0-0",
					recordB: pair.recordB ?? "0-0",
					bye: false,
					winnerTeamKey: pair.winnerTeamKey,
				};
			}),
		})),
	};
}
