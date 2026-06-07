import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getChampionPools } from "@/lib/champion-pools";
import { getMatchControlContext } from "@/lib/match-control";
import { writeAuditLog } from "@/lib/tournament-audit";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { bonusBanSideForMatch } from "@/lib/tournament-rules";
import {
  createDraftSequence,
  forceDraftReady,
  getDraftState,
  handleDraftTimeout,
  lockDraftAction,
  markDraftReady,
  nextDraftTurn,
  resetDraftState,
  setDraftPendingSelection,
  undoLastDraftAction,
  type DraftSide,
} from "@/lib/tournament-draft";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  matchId: z.string().trim().min(1),
  champion: z.string().trim().min(1),
});

const postSchema = z.object({
  matchId: z.string().trim().min(1),
  action: z.enum(["ready", "timeout", "forceReady", "reset", "undo", "select"]),
  champion: z.string().trim().min(1).optional(),
});

export async function GET(request: Request) {
  const matchId = new URL(request.url).searchParams.get("matchId")?.trim();
  if (!matchId) {
    return NextResponse.json({ message: "matchId fehlt." }, { status: 400 });
  }
  return NextResponse.json({ draft: await getDraftState(matchId) });
}

export async function POST(request: Request) {
  const settings = await getTournamentSettings();
  if (!settings.draftEnabled) {
    return NextResponse.json(
      { message: "Champ Select ist aktuell pausiert." },
      { status: 423 },
    );
  }

  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId) {
    return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Ungültige Draft-Aktion." }, { status: 400 });
  }

  const isOwner = TOURNAMENT_OWNER_DISCORD_IDS.has(discordId);

  if (parsed.data.action === "reset" || parsed.data.action === "undo" || parsed.data.action === "forceReady") {
    if (!isOwner) {
      return NextResponse.json({ message: "Nur Admins dürfen Draft Overrides nutzen." }, { status: 403 });
    }
    try {
      const updatedBy = session.user.discordHandle ?? discordId;
      const draft = parsed.data.action === "reset"
        ? await resetDraftState({
            matchId: parsed.data.matchId,
            resetBy: updatedBy,
            reason: "Draft wurde von einem Admin zurückgesetzt.",
          })
        : parsed.data.action === "undo"
          ? await undoLastDraftAction({ matchId: parsed.data.matchId, updatedBy })
          : await forceDraftReady({ matchId: parsed.data.matchId, readyBy: updatedBy });
      await writeAuditLog({
        action: `draft.${parsed.data.action}`,
        targetType: "draft",
        targetId: parsed.data.matchId,
        summary: `Draft ${parsed.data.action} by admin.`,
        actorDiscordId: discordId,
        actorLabel: updatedBy,
      });
      return NextResponse.json({ draft });
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Draft Override fehlgeschlagen." },
        { status: 400 },
      );
    }
  }

  if (parsed.data.action === "timeout") {
    const ctx = await getMatchControlContext();
    const match = ctx.matches.find((entry) => entry.id === parsed.data.matchId);
    try {
      const draft = await handleDraftTimeout({
        matchId: parsed.data.matchId,
        triggeredBy: session.user.discordHandle ?? discordId,
        extraBanSide: match ? bonusBanSideForMatch(match) : null,
      });
      return NextResponse.json({ draft });
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Timeout konnte nicht verarbeitet werden." },
        { status: 400 },
      );
    }
  }

  const ctx = await getMatchControlContext();
  const match = ctx.matches.find((entry) => entry.id === parsed.data.matchId);
  if (!match) {
    return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
  }

  if (parsed.data.action === "select") {
    if (!parsed.data.champion) {
      return NextResponse.json({ message: "Champion fehlt." }, { status: 400 });
    }
    if (!match.poolAssignment) {
      return NextResponse.json({ message: "Für dieses Match wurden noch keine Pools gezogen." }, { status: 400 });
    }

    const [pools, currentDraft] = await Promise.all([
      getChampionPools(),
      getDraftState(parsed.data.matchId),
    ]);
    const extraBanSide = bonusBanSideForMatch(match);
    const sequence = createDraftSequence(extraBanSide);
    const turn = nextDraftTurn(currentDraft, sequence);
    if (!turn) {
      return NextResponse.json({ message: "Draft ist bereits abgeschlossen." }, { status: 400 });
    }

    const teamName = teamNameForDraftSide(match, turn.side);
    const team = ctx.teams.find((entry) => entry.name === teamName);
    if (!isOwner && (!team || team.captainRef?.discordId !== discordId)) {
      return NextResponse.json({ message: "Nur der Captain des aktuellen Teams darf Champion-Hover senden." }, { status: 403 });
    }

    const allowed = allowedChampionsForTurn({
      side: turn.side,
      kind: turn.kind,
      bluePool: poolForDraftSide(match, "teamA"),
      redPool: poolForDraftSide(match, "teamB"),
      pools,
    });
    if (!allowed.has(parsed.data.champion)) {
      return NextResponse.json(
        {
          message:
            turn.kind === "ban"
              ? "Bans müssen aus dem gegnerischen Pool kommen."
              : "Picks müssen aus deinem eigenen Pool kommen.",
        },
        { status: 400 },
      );
    }

    try {
      const draft = await setDraftPendingSelection({
        matchId: parsed.data.matchId,
        side: turn.side,
        kind: turn.kind,
        champion: parsed.data.champion,
        selectedBy: session.user.discordHandle ?? discordId,
        extraBanSide,
      });
      return NextResponse.json({ draft });
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Champion-Hover konnte nicht gespeichert werden." },
        { status: 400 },
      );
    }
  }

  const side = captainDraftSideForUser(ctx.teams, match, discordId);
  if (!side) {
    return NextResponse.json({ message: "Nur Captains dieses Matches können ready klicken." }, { status: 403 });
  }

  try {
    const draft = await markDraftReady({
      matchId: parsed.data.matchId,
      side,
      readyBy: session.user.discordHandle ?? discordId,
    });
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Ready konnte nicht gespeichert werden." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const settings = await getTournamentSettings();
  if (!settings.draftEnabled) {
    return NextResponse.json(
      { message: "Champ Select ist aktuell pausiert." },
      { status: 423 },
    );
  }

  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId) {
    return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Ungültige Draft-Daten." }, { status: 400 });
  }

  const [ctx, pools, currentDraft] = await Promise.all([
    getMatchControlContext(),
    getChampionPools(),
    getDraftState(parsed.data.matchId),
  ]);
  const match = ctx.matches.find((entry) => entry.id === parsed.data.matchId);
  if (!match) {
    return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
  }
  if (!match.poolAssignment) {
    return NextResponse.json({ message: "Für dieses Match wurden noch keine Pools gezogen." }, { status: 400 });
  }

  const extraBanSide = bonusBanSideForMatch(match);
  const sequence = createDraftSequence(extraBanSide);
  const turn = nextDraftTurn(currentDraft, sequence);
  if (!turn) {
    return NextResponse.json({ message: "Draft ist bereits abgeschlossen." }, { status: 400 });
  }

  const teamName = teamNameForDraftSide(match, turn.side);
  const team = ctx.teams.find((entry) => entry.name === teamName);
  const isOwner = TOURNAMENT_OWNER_DISCORD_IDS.has(discordId);
  if (!isOwner && (!team || team.captainRef?.discordId !== discordId)) {
    return NextResponse.json({ message: "Nur der Captain des aktuellen Teams darf diesen Turn locken." }, { status: 403 });
  }

  const allowed = allowedChampionsForTurn({
    side: turn.side,
    kind: turn.kind,
    bluePool: poolForDraftSide(match, "teamA"),
    redPool: poolForDraftSide(match, "teamB"),
    pools,
  });
  if (!allowed.has(parsed.data.champion)) {
    return NextResponse.json(
      {
        message:
          turn.kind === "ban"
            ? "Bans müssen aus dem gegnerischen Pool kommen."
            : "Picks müssen aus deinem eigenen Pool kommen.",
      },
      { status: 400 },
    );
  }

  try {
    const draft = await lockDraftAction({
      matchId: parsed.data.matchId,
      side: turn.side,
      kind: turn.kind,
      champion: parsed.data.champion,
      lockedBy: session.user.discordHandle ?? discordId,
      extraBanSide,
    });
    await writeAuditLog({
      action: isOwner ? "draft.admin_lock" : "draft.lock",
      targetType: "draft",
      targetId: parsed.data.matchId,
      summary: `${turn.kind} locked: ${parsed.data.champion}.`,
      actorDiscordId: discordId,
      actorLabel: session.user.discordHandle ?? discordId,
      metadata: { side: turn.side, kind: turn.kind, champion: parsed.data.champion },
    });
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Draft konnte nicht gespeichert werden." },
      { status: 400 },
    );
  }
}

function captainDraftSideForUser(
  teams: Awaited<ReturnType<typeof getMatchControlContext>>["teams"],
  match: {
    blueSide: "teamA" | "teamB";
    teamAName: string | null;
    teamBName: string | null;
  },
  discordId: string,
): DraftSide | null {
  const blueName = match.blueSide === "teamA" ? match.teamAName : match.teamBName;
  const redName = match.blueSide === "teamA" ? match.teamBName : match.teamAName;
  const blueTeam = teams.find((entry) => entry.name === blueName);
  const redTeam = teams.find((entry) => entry.name === redName);
  if (blueTeam?.captainRef?.discordId === discordId) return "teamA";
  if (redTeam?.captainRef?.discordId === discordId) return "teamB";
  return null;
}

function allowedChampionsForTurn({
  side,
  kind,
  bluePool,
  redPool,
  pools,
}: {
  side: DraftSide;
  kind: "ban" | "pick";
  bluePool: string;
  redPool: string;
  pools: Awaited<ReturnType<typeof getChampionPools>>;
}) {
  const ownPool = side === "teamA" ? bluePool : redPool;
  const enemyPool = side === "teamA" ? redPool : bluePool;
  const pool = kind === "pick" ? ownPool : enemyPool;
  return new Set(
    (pools.find((entry) => entry.pool === pool)?.champions ?? []).map((champion) => champion.name),
  );
}

function teamNameForDraftSide(
  match: { blueSide: "teamA" | "teamB"; teamAName: string | null; teamBName: string | null },
  side: DraftSide,
) {
  const blueName = match.blueSide === "teamA" ? match.teamAName : match.teamBName;
  const redName = match.blueSide === "teamA" ? match.teamBName : match.teamAName;
  return side === "teamA" ? blueName : redName;
}

function poolForDraftSide(
  match: {
    blueSide: "teamA" | "teamB";
    poolAssignment: { teamAPool: string; teamBPool: string } | null;
  },
  side: DraftSide,
) {
  const bluePool = match.blueSide === "teamA"
    ? match.poolAssignment?.teamAPool
    : match.poolAssignment?.teamBPool;
  const redPool = match.blueSide === "teamA"
    ? match.poolAssignment?.teamBPool
    : match.poolAssignment?.teamAPool;
  return side === "teamA" ? bluePool ?? "" : redPool ?? "";
}
