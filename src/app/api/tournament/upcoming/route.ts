/**
 * PATCH /api/tournament/upcoming
 *
 * Owner-only. Changes name, season, type and id of the announced tournament while it is a teaser.
 * Body: { id, name, season, kind, expectedVersion }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { slugifyTournamentId } from "@/lib/tournament-archive-shared";
import { writeAuditLog } from "@/lib/tournament-audit";
import { TOURNAMENT_KINDS } from "@/lib/tournament-kind";
import { updateUpcomingTournament } from "@/lib/tournament-next";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
	id: z.string().trim().min(3).max(48),
	name: z.string().trim().min(2).max(160),
	season: z.string().trim().min(2).max(80),
	kind: z.enum(TOURNAMENT_KINDS),
	expectedVersion: z.number().int().min(0),
});

export async function PATCH(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Bitte Name, Saison, ID und Turnierart ausfüllen." }, { status: 400 });
	const id = slugifyTournamentId(parsed.data.id);
	if (id.length < 3) return NextResponse.json({ message: "Die ID braucht mindestens 3 Zeichen (a–z, 0–9, -)." }, { status: 400 });

	const actor = session.user.discordHandle ?? discordId;
	const claim = await claimAdminVersion({ resource: "settings", expectedVersion: parsed.data.expectedVersion, updatedBy: actor });
	if (!claim.ok) return NextResponse.json(claim.conflict, { status: 409 });

	try {
		const settings = await updateUpcomingTournament({ id, name: parsed.data.name, season: parsed.data.season, kind: parsed.data.kind, updatedBy: actor });
		await writeAuditLog({
			action: "tournament.upcoming-update",
			targetType: "settings",
			targetId: id,
			summary: `Angekündigtes Turnier geändert: ${parsed.data.name} (${id}, ${parsed.data.kind}).`,
			actorDiscordId: discordId,
			actorLabel: actor,
		}).catch(() => undefined);
		return NextResponse.json({ settings, version: claim.version });
	} catch (error) {
		return NextResponse.json({ message: error instanceof Error ? error.message : "Speichern fehlgeschlagen.", version: claim.version }, { status: 400 });
	}
}
