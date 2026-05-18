/**
 * POST /api/tournament/teams
 *
 * Creates a new team in bot_state.teams. Owner-only. Body:
 *   { name: string, group?: "A"|"B", seed?: 1..4, accent?: string }
 *
 * The bot's /createteam slash command can also do this — this endpoint exists
 * so admins can create teams without leaving the web roster builder.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(60),
  group: z.enum(["A", "B"]).optional(),
  seed: z.coerce.number().int().min(1).max(4).optional(),
  accent: z.string().trim().max(120).optional(),
  captain: z.string().trim().max(40).optional(),
});

function teamKey(name: string): string {
  return name.trim().toLowerCase();
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
    return NextResponse.json({ message: "Ungültige Daten." }, { status: 400 });
  }

  const key = teamKey(parsed.data.name);
  const db = await getDb();
  const doc = await db
    .collection<{ _id: string; teams?: Record<string, unknown> }>("bot_state")
    .findOne({ _id: "default" });

  if (doc?.teams?.[key]) {
    return NextResponse.json(
      { message: `Team „${parsed.data.name}" existiert bereits.` },
      { status: 409 },
    );
  }

  // Conflict check on (group, seed) slot.
  if (parsed.data.group && parsed.data.seed) {
    const teamsObj = doc?.teams ?? {};
    for (const [otherKey, otherTeam] of Object.entries(teamsObj)) {
      const meta = (otherTeam as { meta?: { group?: string; seed?: number } }).meta;
      if (meta?.group === parsed.data.group && meta?.seed === parsed.data.seed) {
        return NextResponse.json(
          {
            message: `Gruppe ${parsed.data.group} Seed ${parsed.data.seed} ist bereits von „${otherKey}" belegt.`,
          },
          { status: 409 },
        );
      }
    }
  }

  const teamDoc: Record<string, unknown> = {
    name: parsed.data.name.trim(),
    players: [],
    playedChampions: [],
  };
  const meta: Record<string, unknown> = {};
  if (parsed.data.group) meta.group = parsed.data.group;
  if (parsed.data.seed) meta.seed = parsed.data.seed;
  if (parsed.data.accent) meta.accent = parsed.data.accent;
  if (Object.keys(meta).length > 0) teamDoc.meta = meta;

  await db
    .collection<{ _id: string }>("bot_state")
    .updateOne(
      { _id: "default" },
      { $set: { [`teams.${key}`]: teamDoc } },
      { upsert: true },
    );

  return NextResponse.json({ ok: true, key, name: parsed.data.name.trim() });
}
