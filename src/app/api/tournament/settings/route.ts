import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/tournament-audit";
import { getTournamentSettings, updateTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  applicationsOpen: z.boolean().optional(),
  tournamentLive: z.boolean().optional(),
  draftEnabled: z.boolean().optional(),
});

export async function GET() {
  return NextResponse.json({ settings: await getTournamentSettings() });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Ungueltige Settings." }, { status: 400 });
  }

  const settings = await updateTournamentSettings({
    patch: parsed.data,
    updatedBy: session.user.discordHandle ?? discordId,
  });
  await writeAuditLog({
    action: "settings.update",
    targetType: "settings",
    targetId: "default",
    summary: "Tournament settings updated.",
    actorDiscordId: discordId,
    actorLabel: session.user.discordHandle ?? discordId,
    metadata: parsed.data,
  });

  return NextResponse.json({ settings });
}
