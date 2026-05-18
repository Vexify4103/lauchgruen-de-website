/**
 * GET /api/tournament/bracket
 *
 * Returns the current resolved playoff bracket — used by the public playoffs
 * page to poll for live updates while admins enter scores. Cached for 5s on
 * the server / edge so a packed lobby of viewers doesn't hammer Mongo.
 */

import { NextResponse } from "next/server";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { readTournamentState } from "@/lib/tournament-storage";
import { getTournamentContext } from "@/lib/tournament-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getTournamentContext();
  const state = await readTournamentState(ctx.groupMatches);
  const matches = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);
  return NextResponse.json(
    { matches },
    {
      headers: {
        "Cache-Control": "public, max-age=5, s-maxage=5",
      },
    },
  );
}
