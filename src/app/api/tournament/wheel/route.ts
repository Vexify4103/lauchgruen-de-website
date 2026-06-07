import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { writeAuditLog } from "@/lib/tournament-audit";
import {
  TOURNAMENT_OWNER_DISCORD_IDS,
  readTournamentState,
} from "@/lib/tournament-storage";
import { poolHistoryScopeForMatchId } from "@/lib/tournament-rules";
import {
  getTournamentWheelState,
  resetTournamentWheel,
  spinTournamentWheelForMatch,
} from "@/lib/tournament-wheel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("spin"),
    matchId: z.string().trim().min(1),
    teamAName: z.string().trim().min(1),
    teamBName: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("reset"),
  }),
]);

export async function GET() {
  const state = await getTournamentWheelState();
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Ungültige Wheel-Daten." }, { status: 400 });
  }

  try {
    const state = parsed.data.action === "reset"
      ? await resetTournamentWheel()
      : await spinAfterMatchGuard({
          matchId: parsed.data.matchId,
          teamAName: parsed.data.teamAName,
          teamBName: parsed.data.teamBName,
          spunBy: session.user.discordHandle ?? discordId,
        });
    await writeAuditLog({
      action: parsed.data.action === "reset" ? "wheel.reset" : "wheel.spin",
      targetType: "wheel",
      targetId: parsed.data.action === "reset" ? "az-2026" : parsed.data.matchId,
      summary: parsed.data.action === "reset"
        ? "A-Z wheel reset."
        : `Pools drawn for ${parsed.data.matchId}.`,
      actorDiscordId: discordId,
      actorLabel: session.user.discordHandle ?? discordId,
      metadata: parsed.data.action === "reset" ? undefined : {
        teamAName: parsed.data.teamAName,
        teamBName: parsed.data.teamBName,
      },
    });

    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Wheel konnte nicht gespeichert werden." },
      { status: 400 },
    );
  }
}

async function spinAfterMatchGuard(input: {
  matchId: string;
  teamAName: string;
  teamBName: string;
  spunBy?: string;
}) {
  const ctx = await getTournamentContext();
  const tournamentState = await readTournamentState(ctx.groupMatches);
  if (tournamentState.matches[input.matchId]?.status === "Finished") {
    throw new Error("Dieses Match ist bereits abgeschlossen.");
  }

  return spinTournamentWheelForMatch({
    ...input,
    scope: poolHistoryScopeForMatchId(input.matchId),
  });
}
