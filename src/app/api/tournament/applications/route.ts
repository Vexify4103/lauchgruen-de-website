import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  findApplication,
  getVerifiedAccount,
  listApplications,
  upsertApplication,
  type TournamentApplication,
} from "@/lib/tournament-storage";

export const runtime = "nodejs";

const applicationSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  preferredRoles: z.array(z.string().trim().min(1)).min(1).max(6),
  lastSeasonRank: z.string().trim().min(2).max(40),
  availableAllDates: z.literal(true),
  notes: z.string().trim().max(1500).optional().default(""),
  acceptedRules: z.literal(true),
  acceptedDataStorage: z.literal(true),
});

function applicationId(puuid: string, discordId: string) {
  return `${puuid}|${discordId}`;
}

export async function POST(request: Request) {
  if (process.env.TOURNAMENT_APPLICATIONS_ENABLED === "false") {
    return NextResponse.json(
      { message: "Bewerbungen sind aktuell geschlossen." },
      { status: 403 },
    );
  }

  const session = await auth();
  const discordId = session?.user?.discordId;
  const discordHandle = session?.user?.discordHandle;

  if (!discordId || !discordHandle) {
    return NextResponse.json(
      { message: "Bitte zuerst mit Discord anmelden, bevor du dich bewirbst." },
      { status: 401 },
    );
  }

  const verified = await getVerifiedAccount(discordId);
  if (!verified) {
    return NextResponse.json(
      { message: "Verifiziere zuerst deinen Riot-Account, bevor du die Bewerbung absendest." },
      { status: 412 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = applicationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Bitte fülle alle Pflichtfelder aus und akzeptiere die Regeln." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const id = applicationId(verified.puuid, discordId);
  const existing = await findApplication(id);

  const nextApplication: TournamentApplication = {
    ...parsed.data,
    id,
    discordId,
    discordHandle,
    discordUsername: session.user.discordUsername,
    riotId: verified.riotId,
    riotPuuid: verified.puuid,
    riotVerifiedAt: verified.verifiedAt,
    currentRankAuto: verified.currentRankAuto,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await upsertApplication(nextApplication);

  return NextResponse.json({
    message: existing
      ? "Bewerbung aktualisiert. Danke, dass du die Infos aktuell hältst."
      : "Bewerbung gespeichert. Willkommen in der Warteliste.",
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const adminToken = process.env.TOURNAMENT_ADMIN_TOKEN;

  if (!adminToken || token !== adminToken) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const applications = await listApplications();
  return NextResponse.json({ applications });
}
