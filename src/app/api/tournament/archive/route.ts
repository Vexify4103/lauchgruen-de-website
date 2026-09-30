import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { ARCHIVE_CONFIRMATION } from "@/lib/tournament-archive-shared";
import { TOURNAMENT_KINDS } from "@/lib/tournament-kind";
import { archiveActiveTournament } from "@/lib/tournament-next";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const optionalUrl = z
	.url({ protocol: /^https?$/ })
	.max(500)
	.optional()
	.or(z.literal("").transform(() => undefined));

const schema = z.object({
	confirmation: z.literal(ARCHIVE_CONFIRMATION),
	note: z.string().trim().max(1200).optional(),
	vodUrl: optionalUrl,
	highlightUrl: optionalUrl,
	next: z.object({
		id: z
			.string()
			.trim()
			.min(3)
			.max(48)
			.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Nur Kleinbuchstaben, Zahlen und Bindestriche."),
		name: z.string().trim().min(3).max(80),
		season: z.string().trim().min(3).max(80),
		kind: z.enum(TOURNAMENT_KINDS),
	}),
});

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Ungültige Archiv-Daten." }, { status: 400 });
	}

	const actor = session.user.discordHandle ?? discordId;
	try {
		const result = await archiveActiveTournament({
			note: parsed.data.note || undefined,
			vodUrl: parsed.data.vodUrl,
			highlightUrl: parsed.data.highlightUrl,
			next: parsed.data.next,
			createdBy: actor,
		});
		await writeAuditLog({
			action: "tournament.archive",
			targetType: "settings",
			targetId: result.archive.id,
			summary: `${result.archive.title} archiviert; nächstes Turnier: ${parsed.data.next.name}.`,
			actorDiscordId: discordId,
			actorLabel: actor,
			metadata: { next: parsed.data.next, discordJobId: result.discordJobId, cleanupOperationCount: result.cleanupOperationCount },
		});
		await writeTournamentEvent({ type: "tournament.archived", targetType: "settings", targetId: result.archive.id, createdBy: actor });
		return NextResponse.json({ archiveId: result.archive.id, discordJobId: result.discordJobId, cleanupOperationCount: result.cleanupOperationCount });
	} catch (error) {
		return NextResponse.json({ message: error instanceof Error ? error.message : "Archivierung fehlgeschlagen." }, { status: 409 });
	}
}
