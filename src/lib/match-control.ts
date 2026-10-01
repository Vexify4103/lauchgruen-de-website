import { resolvePlayoffMatches, type ResolvedPlayoffMatch } from "@/lib/bracket-resolver";
import type { BracketLayout, BracketStage } from "@/lib/bracket-engine";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { readTournamentState, type StoredTournamentMatch } from "@/lib/tournament-storage";
import { getTournamentWheelState, type WheelMatchAssignment } from "@/lib/tournament-wheel";
import type { GroupMatch, TournamentTeam } from "@/lib/tournament-data";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { usesFlexibleEngine } from "@/lib/tournament-kind";
import type { SeriesGame } from "@/lib/tournament-series";
import { buildFlexibleStages, type FlexibleStages } from "@/lib/tournament-stages";

export type ControlMatch = {
	id: string;
	phase: "play-in" | "groups" | "playoffs";
	/** Flexible engine: which best-of setting applies. */
	stage?: BracketStage;
	bracket?: "Upper" | "Lower" | "Grand";
	round: string;
	time: string;
	teamAName: string | null;
	teamBName: string | null;
	teamALabel: string;
	teamBLabel: string;
	status: NonNullable<StoredTournamentMatch["status"]>;
	scoreA?: number;
	scoreB?: number;
	gameDurationSeconds?: number;
	teamAChampions?: string[];
	teamBChampions?: string[];
	blueSide: "teamA" | "teamB";
	isCasted?: boolean;
	winner?: string;
	adminNote?: string;
	/** Team that picks the side for the next game, if the side rule leaves it to a team. */
	sideSelectionTeamName?: string;
	sideSelectionSeed?: number;
	bestOf: number;
	games: SeriesGame[];
	group?: string;
	layout?: BracketLayout;
	sources?: { teamA?: string; teamB?: string };
	/** Bracket reset that is only played when the lower-bracket finalist wins the grand final. */
	conditional?: boolean;
	poolAssignment: WheelMatchAssignment | null;
};

export type MatchControlContext = {
	teams: TournamentTeam[];
	matches: ControlMatch[];
	stored: Record<string, StoredTournamentMatch>;
	/** Only for the flexible kinds. */
	stages: FlexibleStages | null;
};

function poolForMatch(history: WheelMatchAssignment[], current: WheelMatchAssignment | null, matchId: string) {
	return current?.matchId === matchId ? current : (history.find((entry) => entry.matchId === matchId) ?? null);
}

function groupToControlMatch(match: GroupMatch, stored: StoredTournamentMatch | undefined, assignment: WheelMatchAssignment | null): ControlMatch {
	return {
		id: match.id,
		phase: "groups",
		round: match.round,
		time: match.time,
		teamAName: match.teamA,
		teamBName: match.teamB,
		teamALabel: match.teamA,
		teamBLabel: match.teamB,
		status: stored?.status ?? match.status,
		scoreA: stored?.scoreA,
		scoreB: stored?.scoreB,
		gameDurationSeconds: stored?.gameDurationSeconds,
		teamAChampions: stored?.teamAChampions ?? [],
		teamBChampions: stored?.teamBChampions ?? [],
		blueSide: stored?.blueSide ?? "teamA",
		isCasted: stored?.isCasted ?? false,
		winner: stored?.winner,
		adminNote: stored?.adminNote,
		bestOf: 1,
		games: [],
		poolAssignment: assignment,
	};
}

function playoffToControlMatch(match: ResolvedPlayoffMatch, stored: StoredTournamentMatch | undefined, assignment: WheelMatchAssignment | null): ControlMatch {
	return {
		id: match.id,
		phase: "playoffs",
		round: match.round,
		time: match.time,
		teamAName: match.teamAName,
		teamBName: match.teamBName,
		teamALabel: match.teamALabel,
		teamBLabel: match.teamBLabel,
		status: match.status,
		scoreA: stored?.scoreA,
		scoreB: stored?.scoreB,
		gameDurationSeconds: stored?.gameDurationSeconds,
		teamAChampions: stored?.teamAChampions ?? [],
		teamBChampions: stored?.teamBChampions ?? [],
		blueSide: stored?.blueSide ?? "teamA",
		isCasted: stored?.isCasted ?? false,
		winner: stored?.winner ?? match.winner ?? undefined,
		adminNote: stored?.adminNote,
		bestOf: 1,
		games: [],
		poolAssignment: assignment,
	};
}

export async function getMatchControlContext(): Promise<MatchControlContext> {
	const [ctx, settings] = await Promise.all([getTournamentContext(), getTournamentSettings()]);
	const [state, wheel] = await Promise.all([readTournamentState(ctx.groupMatches), getTournamentWheelState()]);
	const assignment = (matchId: string) => poolForMatch(wheel.history, wheel.currentAssignment, matchId);
	if (usesFlexibleEngine(settings.activeTournament)) {
		const { matches, stages } = await buildFlexibleStages({ settings, ctx, stored: state.matches, assignment });
		return { teams: ctx.teams, stored: state.matches, matches, stages };
	}
	const playoffs = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);
	return {
		teams: ctx.teams,
		stored: state.matches,
		stages: null,
		matches: [
			...ctx.groupMatches.map((match) => groupToControlMatch(match, state.matches[match.id], assignment(match.id))),
			...playoffs.map((match) => playoffToControlMatch(match, state.matches[match.id], assignment(match.id))),
		],
	};
}

export function findTeamByName(teams: TournamentTeam[], name: string | null | undefined) {
	if (!name) return null;
	return teams.find((team) => team.name === name) ?? null;
}
