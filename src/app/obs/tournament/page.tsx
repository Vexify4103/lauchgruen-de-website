import {
  computeGroupStandings,
  resolvePlayoffMatches,
} from "@/lib/bracket-resolver";
import { readTournamentState } from "@/lib/tournament-storage";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getTournamentWheelState, type WheelMatchAssignment } from "@/lib/tournament-wheel";
import { TournamentTeamOverlay } from "@/components/obs/TournamentTeamOverlay";
import type { ObsTeamResponse, OverlayMatch } from "@/app/api/tournament/obs/route";

export const dynamic = "force-dynamic";

export default async function ObsTournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const params = await searchParams;
  const teamId = params.team?.toLowerCase();
  const ctx = await getTournamentContext();
  if (!teamId) return <ObsHelp teams={ctx.teams} />;
  const team = ctx.teams.find((t) => t.id === teamId);
  if (!team) return <ObsHelp teams={ctx.teams} message={`Unbekanntes Team: ${teamId}`} />;

  // Build the initial payload server-side so first paint shows real data
  // (no flash of skeleton in OBS).
  const initial = await buildInitial(team.id, ctx);
  if (!initial) return <ObsHelp teams={ctx.teams} message="Turnier-Daten nicht verfügbar." />;

  return <TournamentTeamOverlay initial={initial} teamId={teamId} />;
}

async function buildInitial(
  teamId: string,
  ctx: Awaited<ReturnType<typeof getTournamentContext>>,
): Promise<ObsTeamResponse | null> {
  const team = ctx.teams.find((t) => t.id === teamId);
  if (!team) return null;
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
  const resolved = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);

  const groupSize = standings[team.group].length;
  const allPlayed = standings[team.group].every(
    (s) => s.played === (groupSize - 1) * 2,
  );
  let playoffSlot: string | null = null;
  if (standing && allPlayed && !standing.tiebreakerRequired && standing.rank <= 4) {
    playoffSlot = `Gruppe ${team.group} #${standing.rank}`;
  }

  const live = resolved.find(
    (m) => (m.teamAName === team.name || m.teamBName === team.name) && m.status === "Live",
  );
  const currentMatch: OverlayMatch | null = live
    ? toOverlay(live, team.name, poolFor(live.id))
    : null;

  return {
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
    currentMatch,
    nextMatch: null,
    recentResult: null,
    playoffSlot,
  };
}

function toOverlay(
  m: ReturnType<typeof resolvePlayoffMatches>[number],
  teamName: string,
  poolAssignment: WheelMatchAssignment | null,
): OverlayMatch {
  const selfIsA = m.teamAName === teamName;
  return {
    id: m.id,
    opponent: (selfIsA ? m.teamBName : m.teamAName) ?? "TBD",
    scoreSelf: selfIsA ? m.scoreA : m.scoreB,
    scoreOpponent: selfIsA ? m.scoreB : m.scoreA,
    status: m.status,
    bracket: m.bracket,
    round: m.round,
    time: m.time,
    poolSelf: selfIsA ? poolAssignment?.teamAPool : poolAssignment?.teamBPool,
    poolOpponent: selfIsA ? poolAssignment?.teamBPool : poolAssignment?.teamAPool,
  };
}

function ObsHelp({
  teams,
  message,
}: {
  teams: Awaited<ReturnType<typeof getTournamentContext>>["teams"];
  message?: string;
}) {
  return (
    <div className="min-h-screen bg-emerald-950/80 p-6 font-mono text-sm text-emerald-100">
      <div className="rounded-2xl border border-white/10 bg-black/60 p-5">
        <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/72">
          OBS Turnier-Overlay
        </div>
        {message ? (
          <div className="mt-3 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-red-100">
            {message}
          </div>
        ) : null}
        <div className="mt-3 text-emerald-100/72">
          Browser-Source in OBS hinzufügen:
        </div>
        <ul className="mt-3 space-y-1 text-emerald-100/80">
          <li>
            URL:{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5">
              /obs/tournament?team=&lt;team-id&gt;
            </code>
          </li>
          <li>Empfohlene Größe: 480 × 200</li>
          <li>Custom CSS: leer lassen — Hintergrund ist bereits transparent.</li>
        </ul>
        <div className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-lime-200/60">
          Verfügbare Team-IDs
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {teams.map((t) => (
            <code
              key={t.id}
              className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
            >
              {t.id}
            </code>
          ))}
        </div>
      </div>
    </div>
  );
}
