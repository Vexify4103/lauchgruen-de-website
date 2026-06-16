import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import {
  clearTestApplicants,
  clearTestTeams,
  seedTestApplicants,
  seedTestTeams,
} from "@/lib/test-data";
import { claimAdminVersion } from "@/lib/admin-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireOwner() {
  const session = await auth();
  const discordId = session?.user?.discordId;
  return {
    ok: Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)),
    session,
    discordId,
  };
}

export async function POST(request: Request) {
  const owner = await requireOwner();
  if (!owner.ok) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as
    | { count?: number; expectedVersion?: number }
    | null;
  if (!Number.isInteger(body?.expectedVersion) || (body?.expectedVersion ?? -1) < 0) {
    return NextResponse.json({ message: "Ungültige Roster-Version." }, { status: 400 });
  }
  const versionClaim = await claimAdminVersion({
    resource: "roster",
    expectedVersion: body!.expectedVersion!,
    updatedBy: owner.session?.user.discordHandle ?? owner.discordId,
  });
  if (!versionClaim.ok) {
    return NextResponse.json(versionClaim.conflict, { status: 409 });
  }
  const count = Math.max(1, Math.min(80, body?.count ?? 40));
  const [appsInserted, teamsResult] = await Promise.all([
    seedTestApplicants(count),
    seedTestTeams(),
  ]);
  return NextResponse.json({
    ok: true,
    applicants: appsInserted,
    teamsInserted: teamsResult.inserted,
    teamsSkipped: teamsResult.skipped,
    teamsAlreadyFull: teamsResult.alreadyFull,
    version: versionClaim.version,
  });
}

export async function DELETE(request: Request) {
  const owner = await requireOwner();
  if (!owner.ok) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as
    | { expectedVersion?: number }
    | null;
  if (!Number.isInteger(body?.expectedVersion) || (body?.expectedVersion ?? -1) < 0) {
    return NextResponse.json({ message: "Ungültige Roster-Version." }, { status: 400 });
  }
  const versionClaim = await claimAdminVersion({
    resource: "roster",
    expectedVersion: body!.expectedVersion!,
    updatedBy: owner.session?.user.discordHandle ?? owner.discordId,
  });
  if (!versionClaim.ok) {
    return NextResponse.json(versionClaim.conflict, { status: 409 });
  }
  const [apps, teams] = await Promise.all([clearTestApplicants(), clearTestTeams()]);
  return NextResponse.json({
    ok: true,
    applications: apps.applications,
    verified: apps.verified,
    teamsRemoved: teams.teamsRemoved,
    playersStripped: teams.playersStripped,
    teamKeysRemoved: teams.teamKeysRemoved,
    version: versionClaim.version,
  });
}
