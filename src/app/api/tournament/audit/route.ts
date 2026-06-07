import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteAuditLogEntries } from "@/lib/tournament-audit";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const deletedCount = await deleteAuditLogEntries();
  return NextResponse.json({ deleted: true, deletedCount });
}
