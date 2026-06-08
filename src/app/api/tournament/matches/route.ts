import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { deriveWinner } from "@/lib/bracket-resolver";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { commitWheelAssignmentForMatch } from "@/lib/tournament-wheel";
import { getTournamentSettings } from "@/lib/tournament-settings";
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
  teamAChampions: z.array(z.string().trim().min(1)).optional(),
  teamBChampions: z.array(z.string().trim().min(1)).optional(),
  blueSide: z.enum(["teamA", "teamB"]).optional(),
  adminNote: z.string().trim().max(1000).optional(),
  // Winner is derived from scores on the server — accept but ignore.
});

async function requireOwner() {
  const session = await auth();
  const discordId = session?.user?.discordId;
  return {
    ok: Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)),
    session,
    discordId,
  };
}

export async function GET() {
  const ctx = await getTournamentContext();
  const state = await readTournamentState(ctx.groupMatches);
  return NextResponse.json({ matches: state.matches });
}

export async function PATCH(request: Request) {
  const owner = await requireOwner();
  if (!owner.ok) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = matchUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Ungültige Match-Daten" }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const [ctx, settings] = await Promise.all([
    getTournamentContext(),
    getTournamentSettings(),
  ]);
  const state = await readTournamentState(ctx.groupMatches);
  const currentStatus = state.matches[parsed.data.id]?.status;
  if (parsed.data.status === "Live" && currentStatus !== "Live" && !settings.tournamentLive) {
    return NextResponse.json(
      { message: "Turniermodus ist noch auf Vorbereitung. Stelle ihn im Admin-Dashboard zuerst auf Live." },
      { status: 409 },
    );
  }
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
    teamAChampions: parsed.data.teamAChampions,
    teamBChampions: parsed.data.teamBChampions,
    blueSide: parsed.data.blueSide,
    adminNote: parsed.data.adminNote,
    status: parsed.data.status,
    winner: winner ?? undefined,
    updatedAt,
  });
  if (parsed.data.status === "Finished") {
    await commitWheelAssignmentForMatch(parsed.data.id);
  }
  await writeAuditLog({
    action: "match.update",
    targetType: "match",
    targetId: parsed.data.id,
    summary: `Match ${parsed.data.id} saved as ${parsed.data.status}.`,
    actorDiscordId: owner.discordId,
    actorLabel: owner.session?.user.discordHandle ?? owner.discordId,
    metadata: {
      scoreA: parsed.data.scoreA,
      scoreB: parsed.data.scoreB,
      status: parsed.data.status,
      blueSide: parsed.data.blueSide,
      winner,
      adminNote: parsed.data.adminNote,
    },
  });
  await writeTournamentEvent({
    type: parsed.data.status === "Finished" ? "match.finished" : "match.updated",
    targetType: "match",
    targetId: parsed.data.id,
    createdBy: owner.session?.user.discordHandle ?? owner.discordId,
    payload: {
      scoreA: parsed.data.scoreA,
      scoreB: parsed.data.scoreB,
      status: parsed.data.status,
      blueSide: parsed.data.blueSide,
      winner,
      adminNote: parsed.data.adminNote,
    },
  });

  return NextResponse.json({ match });
}
