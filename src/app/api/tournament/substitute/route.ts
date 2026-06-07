import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { isPlayerRole, type PlayerRole } from "@/lib/roster";
import { writeAuditLog } from "@/lib/tournament-audit";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BotStoredPlayer = {
  riotId: string;
  puuid: string;
  discordId?: string;
  role?: PlayerRole;
};

type BotTeam = {
  name: string;
  players: BotStoredPlayer[];
};

type BotStateDoc = {
  _id: string;
  teams?: Record<string, BotTeam>;
};

type VerifiedDoc = {
  _id: string;
  discordId: string;
  riotId: string;
  puuid: string;
};

const schema = z.object({
  teamKey: z.string().trim().min(1),
  incomingDiscordId: z.string().trim().min(1),
  outgoingDiscordId: z.string().trim().optional(),
  role: z.string().trim().transform((value) => (isPlayerRole(value) ? value : "Sub")),
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
    return NextResponse.json({ message: "Ungültige Substitute-Daten." }, { status: 400 });
  }

  const db = await getDb();
  const botCol = db.collection<BotStateDoc>("bot_state");
  const doc = await botCol.findOne({ _id: "default" });
  const teams = doc?.teams ?? {};
  const target = teams[parsed.data.teamKey];
  if (!target) {
    return NextResponse.json({ message: "Team nicht gefunden." }, { status: 404 });
  }

  const verified = await db
    .collection<VerifiedDoc>("verified_riot_accounts")
    .findOne({ _id: parsed.data.incomingDiscordId });
  if (!verified) {
    return NextResponse.json({ message: "Incoming player hat keinen verifizierten Riot Account." }, { status: 409 });
  }

  for (const team of Object.values(teams)) {
    team.players = (team.players ?? []).filter(
      (player) => player.discordId !== parsed.data.incomingDiscordId,
    );
  }

  target.players = (target.players ?? []).filter((player) =>
    parsed.data.outgoingDiscordId
      ? player.discordId !== parsed.data.outgoingDiscordId
      : true,
  );
  target.players.push({
    discordId: verified.discordId,
    riotId: verified.riotId,
    puuid: verified.puuid,
    role: parsed.data.role,
  });

  await botCol.updateOne(
    { _id: "default" },
    { $set: { teams } },
    { upsert: true },
  );
  await writeAuditLog({
    action: "team.substitute",
    targetType: "team",
    targetId: parsed.data.teamKey,
    summary: `Substitute added to ${target.name}.`,
    actorDiscordId: discordId,
    actorLabel: session.user.discordHandle ?? discordId,
    metadata: {
      incomingDiscordId: verified.discordId,
      outgoingDiscordId: parsed.data.outgoingDiscordId || null,
      role: parsed.data.role,
    },
  });

  return NextResponse.json({
    ok: true,
    teamKey: parsed.data.teamKey,
    incomingDiscordId: verified.discordId,
    outgoingDiscordId: parsed.data.outgoingDiscordId || null,
    role: parsed.data.role,
  });
}
