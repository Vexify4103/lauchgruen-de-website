import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deriveWinner } from "@/lib/bracket-resolver";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { commitWheelAssignmentForMatch } from "@/lib/tournament-wheel";
import {
  TOURNAMENT_OWNER_DISCORD_IDS,
  readTournamentState,
  upsertMatch,
} from "@/lib/tournament-storage";

export const runtime = "nodejs";

const matchUpdateSchema = z.object({
  id: z.string().min(1),
  scoreA: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(0).max(99).optional(),
  ),
  scoreB: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(0).max(99).optional(),
  ),
  status: z.enum(["Scheduled", "Live", "Finished", "Locked", "Pending"]),
  // Winner is derived from scores on the server — accept but ignore.
});

async function requireOwner() {
  const session = await auth();
  const discordId = session?.user?.discordId;
  return Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
}

export async function GET() {
  const ctx = await getTournamentContext();
  const state = await readTournamentState(ctx.groupMatches);
  return NextResponse.json({ matches: state.matches });
}

export async function PATCH(request: Request) {
  if (!(await requireOwner())) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = matchUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Ungültige Match-Daten" }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const ctx = await getTournamentContext();
  const state = await readTournamentState(ctx.groupMatches);
  const winner = deriveWinner(
    parsed.data.id,
    parsed.data.scoreA,
    parsed.data.scoreB,
    state.matches,
    ctx.teams,
    ctx.groupMatches,
  );
  const match = await upsertMatch(parsed.data.id, {
    id: parsed.data.id,
    scoreA: parsed.data.scoreA,
    scoreB: parsed.data.scoreB,
    status: parsed.data.status,
    winner: winner ?? undefined,
    updatedAt,
  });
  if (parsed.data.status === "Finished") {
    await commitWheelAssignmentForMatch(parsed.data.id);
  }

  return NextResponse.json({ match });
}
