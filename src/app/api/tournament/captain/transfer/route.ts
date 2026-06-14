import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { setDiscordMemberRole } from "@/lib/discord";
import { getMatchControlContext } from "@/lib/match-control";
import { getDb } from "@/lib/mongo";
import { getDraftState } from "@/lib/tournament-draft";
import { writeAuditLog } from "@/lib/tournament-audit";
import { listApplications } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  teamKey: z.string().trim().min(1),
  targetDiscordId: z.string().trim().min(1),
});

type StoredPlayer = {
  discordId?: string;
  riotId: string;
  puuid: string;
};

type StoredCaptain = {
  discordId: string;
  discordUsername?: string;
  riotId: string;
  puuid: string;
  assignedAt: string;
};

type StoredTeam = {
  name: string;
  players?: StoredPlayer[];
  meta?: {
    captain?: StoredCaptain;
  };
};

type BotStateDoc = {
  _id: string;
  teams?: Record<string, StoredTeam>;
};

function captainRoleId() {
  return (
    process.env.DISCORD_CAPTAINS_ROLE_ID?.trim()
    || process.env.CAPTAIN_ROLE_ID?.trim()
    || ""
  );
}

export async function POST(request: Request) {
  const session = await auth();
  const currentDiscordId = session?.user?.discordId;
  if (!currentDiscordId) {
    return NextResponse.json({ message: "Bitte zuerst anmelden." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Ungültige Daten." }, { status: 400 });
  }

  const db = await getDb();
  const collection = db.collection<BotStateDoc>("bot_state");
  const botState = await collection.findOne({ _id: "default" });
  const teams = botState?.teams ?? {};
  const team = teams[parsed.data.teamKey];
  if (!team || team.meta?.captain?.discordId !== currentDiscordId) {
    return NextResponse.json(
      { message: "Du bist nicht der aktuelle Captain dieses Teams." },
      { status: 403 },
    );
  }

  if (parsed.data.targetDiscordId === currentDiscordId) {
    return NextResponse.json(
      { message: "Du bist bereits Captain dieses Teams." },
      { status: 400 },
    );
  }

  const targetPlayer = (team.players ?? []).find(
    (player) => player.discordId === parsed.data.targetDiscordId,
  );
  if (!targetPlayer) {
    return NextResponse.json(
      { message: "Der ausgewählte Spieler gehört nicht zu deinem Team." },
      { status: 400 },
    );
  }
  const targetAlreadyCaptainsAnotherTeam = Object.entries(teams).some(
    ([key, entry]) =>
      key !== parsed.data.teamKey
      && entry.meta?.captain?.discordId === parsed.data.targetDiscordId,
  );
  if (targetAlreadyCaptainsAnotherTeam) {
    return NextResponse.json(
      { message: "Der ausgewählte Spieler ist bereits Captain eines anderen Teams." },
      { status: 409 },
    );
  }

  const matchContext = await getMatchControlContext();
  const unfinishedMatches = matchContext.matches.filter(
    (match) =>
      match.status !== "Finished"
      && match.status !== "Live"
      && (match.teamAName === team.name || match.teamBName === team.name),
  );
  const draftStates = await Promise.all(
    unfinishedMatches.map((match) => getDraftState(match.id)),
  );
  const activeDraft = draftStates.find(
    (draft) =>
      draft.actions.length > 0
      || Boolean(draft.pendingSelection)
      || Boolean(draft.readyBy.teamA)
      || Boolean(draft.readyBy.teamB),
  );
  if (activeDraft) {
    return NextResponse.json(
      {
        message:
          `Captain kann nicht übertragen werden, solange der Draft ${activeDraft.matchId} läuft oder bereits ein Team ready ist.`,
      },
      { status: 409 },
    );
  }

  const roleId = captainRoleId();
  if (!roleId) {
    return NextResponse.json(
      {
        message:
          "Captain-Rolle ist nicht konfiguriert. DISCORD_CAPTAINS_ROLE_ID fehlt.",
      },
      { status: 503 },
    );
  }

  const addRole = await setDiscordMemberRole({
    discordId: parsed.data.targetDiscordId,
    roleId,
    enabled: true,
  });
  if (!addRole.ok) {
    return NextResponse.json(
      {
        message:
          `Die neue Discord-Captain-Rolle konnte nicht vergeben werden. ${addRole.message}`,
      },
      { status: 502 },
    );
  }

  const applications = await listApplications();
  const targetApplication = applications.find(
    (application) => application.discordId === parsed.data.targetDiscordId,
  );
  const nextCaptain: StoredCaptain = {
    discordId: parsed.data.targetDiscordId,
    discordUsername:
      targetApplication?.discordUsername
      ?? targetApplication?.discordHandle,
    riotId: targetPlayer.riotId,
    puuid: targetPlayer.puuid,
    assignedAt: new Date().toISOString(),
  };

  const update = await collection.updateOne(
    {
      _id: "default",
      [`teams.${parsed.data.teamKey}.meta.captain.discordId`]: currentDiscordId,
    },
    {
      $set: {
        [`teams.${parsed.data.teamKey}.meta.captain`]: nextCaptain,
      },
    },
  );
  if (update.modifiedCount !== 1) {
    await setDiscordMemberRole({
      discordId: parsed.data.targetDiscordId,
      roleId,
      enabled: false,
    });
    return NextResponse.json(
      {
        message:
          "Die Captain-Zuordnung wurde zwischenzeitlich geändert. Bitte lade die Seite neu.",
      },
      { status: 409 },
    );
  }

  const refreshed = await collection.findOne({ _id: "default" });
  const oldCaptainStillAssigned = Object.values(refreshed?.teams ?? {}).some(
    (entry) => entry.meta?.captain?.discordId === currentDiscordId,
  );
  const warnings: string[] = [];
  if (!oldCaptainStillAssigned) {
    const removeRole = await setDiscordMemberRole({
      discordId: currentDiscordId,
      roleId,
      enabled: false,
    });
    if (!removeRole.ok) warnings.push(removeRole.message);
  }

  try {
    await writeAuditLog({
      action: "team.captain_transferred",
      targetType: "team",
      targetId: parsed.data.teamKey,
      summary:
        `${session.user.discordHandle ?? currentDiscordId} hat den Captain von `
        + `${team.name} an ${targetApplication?.displayName ?? targetPlayer.riotId} übertragen.`,
      actorDiscordId: currentDiscordId,
      actorLabel: session.user.discordHandle ?? currentDiscordId,
      metadata: {
        previousCaptainDiscordId: currentDiscordId,
        nextCaptainDiscordId: parsed.data.targetDiscordId,
        nextCaptainRiotId: targetPlayer.riotId,
        warnings,
      },
    });
  } catch {
    warnings.push("Die Übergabe war erfolgreich, konnte aber nicht im Audit-Log gespeichert werden.");
  }

  return NextResponse.json({
    ok: true,
    nextCaptain: {
      discordId: nextCaptain.discordId,
      displayName: targetApplication?.displayName ?? targetPlayer.riotId,
    },
    warnings,
  });
}
