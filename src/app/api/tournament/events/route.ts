import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listTournamentEvents } from "@/lib/tournament-events";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canReadEvents(request: Request) {
  const token = process.env.TOURNAMENT_EVENTS_TOKEN?.trim();
  if (token) {
    const authHeader = request.headers.get("authorization") ?? "";
    const headerToken = request.headers.get("x-tournament-events-token") ?? "";
    if (authHeader === `Bearer ${token}` || headerToken === token) return true;
  }

  const session = await auth();
  const discordId = session?.user?.discordId;
  return Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
}

export async function GET(request: Request) {
  if (!(await canReadEvents(request))) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const url = new URL(request.url);
  const after = url.searchParams.get("after")?.trim() || undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const events = await listTournamentEvents({ after, limit });

  return NextResponse.json({
    events,
    cursor: events.at(-1)?.createdAt ?? after ?? null,
  });
}
