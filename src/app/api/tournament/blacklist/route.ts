import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import {
  TOURNAMENT_OWNER_DISCORD_IDS,
  addBlacklistEntry,
  deleteBlacklistEntry,
  listBlacklistEntries,
} from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  discordId: z.string().trim().min(1).optional(),
  riotId: z.string().trim().min(3).optional(),
  reason: z.string().trim().min(3).max(500),
  expectedVersion: z.number().int().min(0),
}).refine((value) => value.discordId || value.riotId, {
  message: "Discord-ID oder Riot-ID erforderlich.",
});

async function requireOwner() {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return null;
  return session;
}

export async function GET() {
  if (!(await requireOwner())) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }
  return NextResponse.json({ entries: await listBlacklistEntries() });
}

export async function POST(request: Request) {
  const session = await requireOwner();
  if (!session) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Ungültige Blacklist-Daten." }, { status: 400 });
  }

  const versionClaim = await claimAdminVersion({
    resource: "blacklist",
    expectedVersion: parsed.data.expectedVersion,
    updatedBy: session.user.discordHandle ?? session.user.discordId,
  });
  if (!versionClaim.ok) {
    return NextResponse.json(versionClaim.conflict, { status: 409 });
  }

  const entry = await addBlacklistEntry({
    discordId: parsed.data.discordId,
    riotId: parsed.data.riotId,
    reason: parsed.data.reason,
    createdBy: session.user.discordHandle ?? session.user.discordId,
  });
  return NextResponse.json({ entry, version: versionClaim.version });
}

export async function DELETE(request: Request) {
  const session = await requireOwner();
  if (!session) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get("id")?.trim();
  const expectedVersion = Number(searchParams.get("expectedVersion"));
  if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return NextResponse.json({ message: "id fehlt." }, { status: 400 });
  }
  const versionClaim = await claimAdminVersion({
    resource: "blacklist",
    expectedVersion,
    updatedBy: session.user.discordHandle ?? session.user.discordId,
  });
  if (!versionClaim.ok) {
    return NextResponse.json(versionClaim.conflict, { status: 409 });
  }
  await deleteBlacklistEntry(id);
  return NextResponse.json({ ok: true, version: versionClaim.version });
}
