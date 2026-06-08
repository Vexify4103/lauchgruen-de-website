import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getMatchControlContext } from "@/lib/match-control";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { poolHistoryScopeForMatchId } from "@/lib/tournament-rules";
import { spinTournamentWheelForMatch } from "@/lib/tournament-wheel";
import { TOURNAMENT_OWNER_DISCORD_IDS, upsertMatch } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Match-ID fehlt." }, { status: 400 });
  }

  const [ctx, settings] = await Promise.all([
    getMatchControlContext(),
    getTournamentSettings(),
  ]);
  if (!settings.tournamentLive) {
    return NextResponse.json(
      { message: "Turniermodus ist noch auf Vorbereitung. Stelle ihn im Admin-Dashboard zuerst auf Live." },
      { status: 409 },
    );
  }

  const match = ctx.matches.find((entry) => entry.id === parsed.data.id);
  if (!match) {
    return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
  }
  if (!match.teamAName || !match.teamBName) {
    return NextResponse.json({ message: "Dieses Match hat noch keine zwei Teams." }, { status: 409 });
  }
  if (match.status === "Finished") {
    return NextResponse.json({ message: "Dieses Match ist bereits abgeschlossen." }, { status: 409 });
  }

  let drewPools = false;
  if (!match.poolAssignment) {
    await spinTournamentWheelForMatch({
      matchId: match.id,
      teamAName: match.teamAName,
      teamBName: match.teamBName,
      scope: poolHistoryScopeForMatchId(match.id),
      spunBy: session.user.discordHandle ?? discordId,
    });
    drewPools = true;
  }

  const updated = await upsertMatch(match.id, {
    id: match.id,
    status: "Live",
    updatedAt: new Date().toISOString(),
  });
  await writeAuditLog({
    action: "match.start",
    targetType: "match",
    targetId: match.id,
    summary: drewPools ? "Match started and pools were drawn." : "Match started.",
    actorDiscordId: discordId,
    actorLabel: session.user.discordHandle ?? discordId,
    metadata: { drewPools, teamAName: match.teamAName, teamBName: match.teamBName },
  });
  await writeTournamentEvent({
    type: "match.started",
    targetType: "match",
    targetId: match.id,
    createdBy: session.user.discordHandle ?? discordId,
    payload: {
      drewPools,
      teamAName: match.teamAName,
      teamBName: match.teamBName,
    },
  });

  return NextResponse.json({ match: updated, drewPools });
}
