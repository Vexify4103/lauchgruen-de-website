import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  applyRoster,
  isPlayerRole,
  type PlayerRole,
  type RosterSavePayload,
} from "@/lib/roster";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { claimAdminVersion } from "@/lib/admin-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const playerSlotSchema = z.object({
  discordId: z.string().min(1),
  role: z
    .string()
    .nullable()
    .transform((value) => (value && isPlayerRole(value) ? (value as PlayerRole) : null)),
});

const payloadSchema = z.object({
  expectedVersion: z.number().int().min(0),
  teamPlayers: z.record(z.string(), z.array(playerSlotSchema)),
  captains: z.record(z.string(), z.string().nullable()).optional(),
  manualPlayers: z
    .record(
      z.string(),
      z.object({
        discordUsername: z.string().trim().min(1).max(64),
        riotId: z
          .string()
          .trim()
          .min(3)
          .max(64)
          .refine((value) => /^.+#[^#]+$/.test(value), {
            message: "Die Riot-ID muss Name#Tag enthalten.",
          }),
      }),
    )
    .optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  const discordId = session?.user?.discordId;
  if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
    return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Ungültige Daten." }, { status: 400 });
  }

  const payload: RosterSavePayload = parsed.data;
  const versionClaim = await claimAdminVersion({
    resource: "roster",
    expectedVersion: parsed.data.expectedVersion,
    updatedBy: session.user.discordHandle ?? discordId,
  });
  if (!versionClaim.ok) {
    return NextResponse.json(versionClaim.conflict, { status: 409 });
  }
  const result = await applyRoster(payload);
  if (result.errors.length > 0) {
    return NextResponse.json({ message: "Roster abgelehnt", errors: result.errors }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    applied: result.applied,
    teamsUpdated: result.teamsUpdated,
    warnings: result.warnings,
    version: versionClaim.version,
  });
}
