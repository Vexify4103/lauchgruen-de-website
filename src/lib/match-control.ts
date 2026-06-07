import {
  resolvePlayoffMatches,
  type ResolvedPlayoffMatch,
} from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { readTournamentState, type StoredTournamentMatch } from "@/lib/tournament-storage";
import { getTournamentWheelState, type WheelMatchAssignment } from "@/lib/tournament-wheel";
import type { GroupMatch, TournamentTeam } from "@/lib/tournament-data";

export type ControlMatch = {
  id: string;
  phase: "groups" | "playoffs";
  round: string;
  time: string;
  teamAName: string | null;
  teamBName: string | null;
  teamALabel: string;
  teamBLabel: string;
  status: StoredTournamentMatch["status"];
  scoreA?: number;
  scoreB?: number;
  teamAChampions?: string[];
  teamBChampions?: string[];
  blueSide: "teamA" | "teamB";
  winner?: string;
  poolAssignment: WheelMatchAssignment | null;
};

export type MatchControlContext = {
  teams: TournamentTeam[];
  matches: ControlMatch[];
  stored: Record<string, StoredTournamentMatch>;
};

function poolForMatch(
  history: WheelMatchAssignment[],
  current: WheelMatchAssignment | null,
  matchId: string,
) {
  return current?.matchId === matchId
    ? current
    : history.find((entry) => entry.matchId === matchId) ?? null;
}

function groupToControlMatch(
  match: GroupMatch,
  stored: StoredTournamentMatch | undefined,
  assignment: WheelMatchAssignment | null,
): ControlMatch {
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
    teamAChampions: stored?.teamAChampions ?? [],
    teamBChampions: stored?.teamBChampions ?? [],
    blueSide: stored?.blueSide ?? "teamA",
    winner: stored?.winner,
    poolAssignment: assignment,
  };
}

function playoffToControlMatch(
  match: ResolvedPlayoffMatch,
  stored: StoredTournamentMatch | undefined,
  assignment: WheelMatchAssignment | null,
): ControlMatch {
  return {
    id: match.id,
    phase: "playoffs",
    round: match.round,
    time: match.time,
    teamAName: match.teamAName,
    teamBName: match.teamBName,
    teamALabel: match.teamALabel,
    teamBLabel: match.teamBLabel,
    status: stored?.status ?? match.status,
    scoreA: stored?.scoreA,
    scoreB: stored?.scoreB,
    teamAChampions: stored?.teamAChampions ?? [],
    teamBChampions: stored?.teamBChampions ?? [],
    blueSide: stored?.blueSide ?? "teamA",
    winner: stored?.winner ?? match.winner ?? undefined,
    poolAssignment: assignment,
  };
}

export async function getMatchControlContext(): Promise<MatchControlContext> {
  const ctx = await getTournamentContext();
  const [state, wheel] = await Promise.all([
    readTournamentState(ctx.groupMatches),
    getTournamentWheelState(),
  ]);
  const playoffs = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);
  const assignment = (matchId: string) =>
    poolForMatch(wheel.history, wheel.currentAssignment, matchId);

  return {
    teams: ctx.teams,
    stored: state.matches,
    matches: [
      ...ctx.groupMatches.map((match) =>
        groupToControlMatch(match, state.matches[match.id], assignment(match.id)),
      ),
      ...playoffs.map((match) =>
        playoffToControlMatch(match, state.matches[match.id], assignment(match.id)),
      ),
    ],
  };
}

export function findTeamByName(teams: TournamentTeam[], name: string | null | undefined) {
  if (!name) return null;
  return teams.find((team) => team.name === name) ?? null;
}
