import { NextResponse } from "next/server";
import { z } from "zod";
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

  const entry = await addBlacklistEntry({
    ...parsed.data,
    createdBy: session.user.discordHandle ?? session.user.discordId,
  });
  return NextResponse.json({ entry });
}

export async function DELETE(request: Request) {
  if (!(await requireOwner())) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ message: "id fehlt." }, { status: 400 });
  }
  await deleteBlacklistEntry(id);
  return NextResponse.json({ ok: true });
}
