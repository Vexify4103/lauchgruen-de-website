/**
 * GET /api/tournament/obs?team=<team-id>
 *
 * Compact JSON for the OBS team overlay. Cached briefly so a streamer with
 * the source open doesn't hammer Mongo.
 */

import { NextResponse } from "next/server";
import { type GroupMatch } from "@/lib/tournament-data";
import {
  computeGroupStandings,
  resolvePlayoffMatches,
} from "@/lib/bracket-resolver";
import { readTournamentState } from "@/lib/tournament-storage";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getTournamentWheelState, type WheelMatchAssignment } from "@/lib/tournament-wheel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ObsTeamResponse = {
  team: {
    id: string;
    name: string;
    group: "A" | "B";
    accent: string;
    seed: number;
  };
  standing: {
    rank: number;
    wins: number;
    losses: number;
    played: number;
    pointDiff: number;
    pointsFor: number;
  };
  groupSize: number;
  currentMatch: OverlayMatch | null;
  nextMatch: OverlayMatch | null;
  playoffSlot: string | null;
  recentResult: OverlayMatch | null;
};

export type OverlayMatch = {
  id: string;
  opponent: string;
  scoreSelf?: number;
  scoreOpponent?: number;
  status: string;
  bracket: "Group" | "Upper" | "Lower" | "Grand";
  round: string;
  time: string;
  poolSelf?: string;
  poolOpponent?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamId = url.searchParams.get("team")?.toLowerCase();
  if (!teamId) {
    return NextResponse.json({ message: "Query-Parameter 'team' erforderlich." }, { status: 400 });
  }
  const ctx = await getTournamentContext();
  const team = ctx.teams.find((t) => t.id === teamId);
  if (!team) {
    return NextResponse.json({ message: `Unbekanntes Team: ${teamId}` }, { status: 404 });
  }

  const [state, wheel] = await Promise.all([
    readTournamentState(ctx.groupMatches),
    getTournamentWheelState(),
  ]);
  const poolFor = (matchId: string) =>
    wheel.currentAssignment?.matchId === matchId
      ? wheel.currentAssignment
      : wheel.history.find((entry) => entry.matchId === matchId) ?? null;
  const standings = computeGroupStandings(state.matches, ctx.teams, ctx.groupMatches);
  const standing = standings[team.group].find((s) => s.team.id === team.id);
  const groupSize = standings[team.group].length;

  const teamGroupMatches: GroupMatch[] = ctx.groupMatches.filter(
    (m) => m.group === team.group && (m.teamA === team.name || m.teamB === team.name),
  );

  // Find current / next / most-recent match across groups + playoffs.
  const allRelevant: Array<{
    base:
      | { kind: "group"; match: GroupMatch }
      | { kind: "playoff"; teamA: string | null; teamB: string | null; round: string; bracket: "Upper" | "Lower" | "Grand"; id: string; time: string; defaultStatus: string };
    storedStatus: string;
    scoreA?: number;
    scoreB?: number;
    teamAName: string | null;
    teamBName: string | null;
    poolAssignment: WheelMatchAssignment | null;
  }> = [];

  for (const match of teamGroupMatches) {
    const stored = state.matches[match.id];
    allRelevant.push({
      base: { kind: "group", match },
      storedStatus: stored?.status ?? match.status,
      scoreA: stored?.scoreA,
      scoreB: stored?.scoreB,
      teamAName: match.teamA,
      teamBName: match.teamB,
      poolAssignment: poolFor(match.id),
    });
  }

  const resolvedPlayoff = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);
  for (const r of resolvedPlayoff) {
    if (r.teamAName !== team.name && r.teamBName !== team.name) continue;
    allRelevant.push({
      base: {
        kind: "playoff",
        id: r.id,
        teamA: r.teamAName,
        teamB: r.teamBName,
        round: r.round,
        bracket: r.bracket,
        time: r.time,
        defaultStatus: r.status,
      },
      storedStatus: r.status,
      scoreA: r.scoreA,
      scoreB: r.scoreB,
      teamAName: r.teamAName,
      teamBName: r.teamBName,
      poolAssignment: poolFor(r.id),
    });
  }

  const teamName = team.name;
  function toOverlay(entry: (typeof allRelevant)[number]): OverlayMatch {
    const selfIsA = entry.teamAName === teamName;
    const opponent = (selfIsA ? entry.teamBName : entry.teamAName) ?? "TBD";
    const bracket =
      entry.base.kind === "group" ? ("Group" as const) : entry.base.bracket;
    const round =
      entry.base.kind === "group" ? entry.base.match.round : entry.base.round;
    const id = entry.base.kind === "group" ? entry.base.match.id : entry.base.id;
    const time =
      entry.base.kind === "group" ? entry.base.match.time : entry.base.time;
    return {
      id,
      opponent,
      scoreSelf: selfIsA ? entry.scoreA : entry.scoreB,
      scoreOpponent: selfIsA ? entry.scoreB : entry.scoreA,
      status: entry.storedStatus,
      bracket,
      round,
      time,
      poolSelf: selfIsA ? entry.poolAssignment?.teamAPool : entry.poolAssignment?.teamBPool,
      poolOpponent: selfIsA ? entry.poolAssignment?.teamBPool : entry.poolAssignment?.teamAPool,
    };
  }

  const liveEntry = allRelevant.find((e) => e.storedStatus === "Live");
  const upcoming = allRelevant.find(
    (e) =>
      e.storedStatus !== "Finished" &&
      e.storedStatus !== "Live" &&
      (e.scoreA === undefined || e.scoreB === undefined),
  );
  // Latest finished match (last in tournament-data declaration order with scores).
  const finishedEntries = allRelevant.filter(
    (e) => e.scoreA !== undefined && e.scoreB !== undefined,
  );
  const recent = finishedEntries[finishedEntries.length - 1] ?? null;

  // Find what playoff slot they could fill (if group is done).
  let playoffSlot: string | null = null;
  if (standing) {
    const rank = standing.rank;
    const allPlayed = standings[team.group].every(
      (s) => s.played === (groupSize - 1) * 2,
    );
    if (allPlayed && !standing.tiebreakerRequired && rank <= 4) {
      // Map group rank → overall seed using the same logic as the resolver
      playoffSlot = `Gruppe ${team.group} #${rank}`;
    }
  }

  const response: ObsTeamResponse = {
    team: {
      id: team.id,
      name: team.name,
      group: team.group,
      accent: team.accent,
      seed: team.seed,
    },
    standing: {
      rank: standing?.rank ?? 0,
      wins: standing?.wins ?? 0,
      losses: standing?.losses ?? 0,
      played: standing?.played ?? 0,
      pointDiff: standing?.pointDiff ?? 0,
      pointsFor: standing?.pointsFor ?? 0,
    },
    groupSize,
    currentMatch: liveEntry ? toOverlay(liveEntry) : null,
    nextMatch: upcoming ? toOverlay(upcoming) : null,
    recentResult: recent ? toOverlay(recent) : null,
    playoffSlot,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=5, s-maxage=5" },
  });
}
