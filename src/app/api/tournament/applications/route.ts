import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { isDiscordGuildMember } from "@/lib/discord";
import { writeAuditLog } from "@/lib/tournament-audit";
import {
  TOURNAMENT_APPLICATION_DEADLINE_LABEL,
  areTournamentApplicationsOpen,
  isTournamentApplicationDeadlinePassed,
} from "@/lib/tournament-application-deadline";
import { getTournamentSettings } from "@/lib/tournament-settings";
import {
  TOURNAMENT_OWNER_DISCORD_IDS,
  deleteApplicationsByDiscordId,
  findApplication,
  findBlacklistMatch,
  getVerifiedAccount,
  listApplications,
  upsertApplication,
  type TournamentApplication,
} from "@/lib/tournament-storage";

export const runtime = "nodejs";

const applicationSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  mainRole: z.string().trim().min(1).max(20),
  preferredRoles: z.array(z.string().trim().min(1)).min(1).max(6),
  availableAllDates: z.literal(true),
  notes: z.string().trim().max(1500).optional().default(""),
  acceptedRules: z.literal(true),
  acceptedDataStorage: z.literal(true),
});

const applicationPatchSchema = z.object({
  id: z.string().trim().min(1),
  expectedVersion: z.number().int().min(0),
  displayName: z.string().trim().min(2).max(60).optional(),
  mainRole: z.string().trim().min(1).max(20).optional(),
  preferredRoles: z.array(z.string().trim().min(1).max(20)).min(1).max(6).optional(),
  notes: z.string().trim().max(1500).optional(),
});

function applicationId(puuid: string, discordId: string) {
  return `${puuid}|${discordId}`;
}

export async function POST(request: Request) {
  const settings = await getTournamentSettings();
  if (!areTournamentApplicationsOpen(settings.applicationsOpen)) {
    return NextResponse.json(
      {
        message: isTournamentApplicationDeadlinePassed()
          ? `Der Bewerbungsschluss war am ${TOURNAMENT_APPLICATION_DEADLINE_LABEL}.`
          : "Bewerbungen sind aktuell geschlossen.",
      },
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

  const liveGuildMember = await isDiscordGuildMember(discordId);
  const isGuildMember =
    liveGuildMember ?? (session.user.discordInGuild ?? !process.env.DISCORD_GUILD_ID);
  if (!isGuildMember) {
    return NextResponse.json(
      { message: "Bitte tritt zuerst dem Lauchgruen Discord bei, bevor du dich bewirbst." },
      { status: 403 },
    );
  }

  const verified = await getVerifiedAccount(discordId);
  if (!verified) {
    return NextResponse.json(
      { message: "Verifiziere zuerst deinen Riot-Account, bevor du die Bewerbung absendest." },
      { status: 412 },
    );
  }
  const blacklistMatch = await findBlacklistMatch({
    discordId,
    riotId: verified.riotId,
  });
  if (blacklistMatch) {
    return NextResponse.json(
      {
        message:
          "Dieser Discord- oder Riot-Account ist für Lauchgruen-Turniere gesperrt. Bitte melde dich beim Orga-Team, falls du glaubst, dass das ein Fehler ist.",
      },
      { status: 403 },
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
    mainRole: parsed.data.mainRole,
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
  const session = await auth();
  const discordId = session?.user?.discordId;
  const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));

  if (!isOwner && (!adminToken || token !== adminToken)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const applications = await listApplications();
  return NextResponse.json({ applications });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = applicationPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Ungültige Bewerbungsdaten." }, { status: 400 });
  }

  const existing = await findApplication(parsed.data.id);
  if (!existing) {
    return NextResponse.json({ message: "Bewerbung nicht gefunden." }, { status: 404 });
  }

  const versionClaim = await claimAdminVersion({
    resource: `application:${existing.id}`,
    expectedVersion: parsed.data.expectedVersion,
    updatedBy: session.user.discordHandle ?? discordId,
  });
  if (!versionClaim.ok) {
    return NextResponse.json(versionClaim.conflict, { status: 409 });
  }

  const nextApplication: TournamentApplication = {
    ...existing,
    ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
    ...(parsed.data.mainRole !== undefined ? { mainRole: parsed.data.mainRole } : {}),
    ...(parsed.data.preferredRoles !== undefined ? { preferredRoles: parsed.data.preferredRoles } : {}),
    ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    updatedAt: new Date().toISOString(),
  };

  await upsertApplication(nextApplication);
  await writeAuditLog({
    action: "application.update",
    targetType: "application",
    targetId: existing.id,
    summary: `Bewerbung bearbeitet: ${existing.displayName} -> ${nextApplication.displayName}.`,
    actorDiscordId: discordId,
    actorLabel: session.user.discordHandle ?? discordId,
    metadata: {
      displayName: nextApplication.displayName,
      mainRole: nextApplication.mainRole,
      preferredRoles: nextApplication.preferredRoles,
    },
  });

  return NextResponse.json({
    application: nextApplication,
    version: versionClaim.version,
  });
}

/** Admin-only: removes tournament applications while preserving the Riot link. */
export async function DELETE(request: Request) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const targetDiscordId = searchParams.get("discordId")?.trim();
  const applicationId = searchParams.get("id")?.trim();
  const expectedVersion = Number(searchParams.get("expectedVersion"));
  if (
    !targetDiscordId
    || !applicationId
    || !Number.isInteger(expectedVersion)
    || expectedVersion < 0
  ) {
    return NextResponse.json(
      { message: "Bewerbungs-ID, Discord-ID und Version sind erforderlich." },
      { status: 400 },
    );
  }

  const versionClaim = await claimAdminVersion({
    resource: `application:${applicationId}`,
    expectedVersion,
    updatedBy: session.user.discordHandle ?? discordId,
  });
  if (!versionClaim.ok) {
    return NextResponse.json(versionClaim.conflict, { status: 409 });
  }

  const deletedCount = await deleteApplicationsByDiscordId(targetDiscordId);
  await writeAuditLog({
    action: "application.delete",
    targetType: "application",
    targetId: targetDiscordId,
    summary: "Bewerbung entfernt; verifizierte Riot-Verknüpfung wurde beibehalten.",
    actorDiscordId: discordId,
    actorLabel: session.user.discordHandle ?? discordId,
    metadata: { deletedCount, preservedRiotLink: true },
  });

  return NextResponse.json({
    ok: true,
    deletedCount,
    preservedRiotLink: true,
    version: versionClaim.version,
  });
}
