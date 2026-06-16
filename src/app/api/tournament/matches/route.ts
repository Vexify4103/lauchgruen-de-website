import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { deriveWinner } from "@/lib/bracket-resolver";
import { parseGameDuration } from "@/lib/match-duration";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { getTournamentContext } from "@/lib/tournament-runtime";
import {
  TOURNAMENT_OWNER_DISCORD_IDS,
  readTournamentState,
  upsertMatch,
} from "@/lib/tournament-storage";
import { commitWheelAssignmentForMatch } from "@/lib/tournament-wheel";

export const runtime = "nodejs";

const matchUpdateSchema = z.object({
  id: z.string().min(1),
  expectedVersion: z.number().int().min(0),
  scoreA: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(0).max(99).optional(),
  ),
  scoreB: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(0).max(99).optional(),
  ),
  gameDuration: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().optional(),
  ),
  teamAChampions: z.array(z.string().trim().min(1)).optional(),
  teamBChampions: z.array(z.string().trim().min(1)).optional(),
  blueSide: z.enum(["teamA", "teamB"]).optional(),
  adminNote: z.string().trim().max(1000).optional(),
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
    return NextResponse.json({ message: "Ungültige Match-Daten." }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const ctx = await getTournamentContext();
  const state = await readTournamentState(ctx.groupMatches);
  const isGroupMatch = ctx.groupMatches.some((match) => match.id === parsed.data.id);
  const currentStatus = state.matches[parsed.data.id]?.status ?? "Scheduled";
  const hasAnyScore =
    parsed.data.scoreA !== undefined || parsed.data.scoreB !== undefined;
  const hasFinalScore =
    parsed.data.scoreA !== undefined
    && parsed.data.scoreB !== undefined
    && parsed.data.scoreA !== parsed.data.scoreB;
  const nextStatus = hasFinalScore ? "Finished" : currentStatus;
  const gameDurationSeconds = parsed.data.gameDuration === undefined
    ? undefined
    : parseGameDuration(parsed.data.gameDuration);

  if (gameDurationSeconds === null) {
    return NextResponse.json(
      { message: "Die Spielzeit muss im Format mm:ss eingetragen werden." },
      { status: 400 },
    );
  }
  if (hasAnyScore && !hasFinalScore) {
    return NextResponse.json(
      { message: "Ein Ergebnis benötigt zwei unterschiedliche Scores." },
      { status: 400 },
    );
  }
  if (isGroupMatch && hasFinalScore && gameDurationSeconds === undefined) {
    return NextResponse.json(
      { message: "Für ein abgeschlossenes Gruppenspiel wird die Spielzeit benötigt." },
      { status: 400 },
    );
  }

  const versionClaim = await claimAdminVersion({
    resource: `match:${parsed.data.id}`,
    expectedVersion: parsed.data.expectedVersion,
    updatedBy: owner.session?.user.discordHandle ?? owner.discordId,
  });
  if (!versionClaim.ok) {
    return NextResponse.json(versionClaim.conflict, { status: 409 });
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
    gameDurationSeconds,
    ...(parsed.data.teamAChampions !== undefined
      ? { teamAChampions: parsed.data.teamAChampions }
      : {}),
    ...(parsed.data.teamBChampions !== undefined
      ? { teamBChampions: parsed.data.teamBChampions }
      : {}),
    ...(parsed.data.blueSide !== undefined
      ? { blueSide: parsed.data.blueSide }
      : {}),
    ...(parsed.data.adminNote !== undefined
      ? { adminNote: parsed.data.adminNote }
      : {}),
    status: nextStatus,
    winner: winner ?? undefined,
    updatedAt,
  });

  if (nextStatus === "Finished") {
    await commitWheelAssignmentForMatch(parsed.data.id);
  }
  await writeAuditLog({
    action: "match.update",
    targetType: "match",
    targetId: parsed.data.id,
    summary: `Match ${parsed.data.id} saved as ${nextStatus}.`,
    actorDiscordId: owner.discordId,
    actorLabel: owner.session?.user.discordHandle ?? owner.discordId,
    metadata: {
      scoreA: parsed.data.scoreA,
      scoreB: parsed.data.scoreB,
      gameDurationSeconds,
      status: nextStatus,
      blueSide: parsed.data.blueSide,
      winner,
      adminNote: parsed.data.adminNote,
    },
  });
  await writeTournamentEvent({
    type: nextStatus === "Finished" ? "match.finished" : "match.updated",
    targetType: "match",
    targetId: parsed.data.id,
    createdBy: owner.session?.user.discordHandle ?? owner.discordId,
    payload: {
      scoreA: parsed.data.scoreA,
      scoreB: parsed.data.scoreB,
      gameDurationSeconds,
      status: nextStatus,
      blueSide: parsed.data.blueSide,
      winner,
      adminNote: parsed.data.adminNote,
    },
  });

  return NextResponse.json({ match, version: versionClaim.version });
}
