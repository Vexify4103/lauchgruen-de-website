import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { publishRoster } from "@/lib/roster";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { writeAuditLog } from "@/lib/tournament-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
	repairDiscordRoles: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const parsed = schema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Daten." }, { status: 400 });

	try {
		const result = await publishRoster(parsed.data);
		await writeAuditLog({
			action: parsed.data.repairDiscordRoles ? "roster.discord-repair" : "roster.publish",
			targetType: "roster",
			targetId: "active",
			summary: parsed.data.repairDiscordRoles
				? "Discord-Rollen des veröffentlichten Rosters zur Reparatur eingeplant."
				: result.published
					? `Roster mit ${result.players} Spielern veröffentlicht.`
					: "Roster-Publikation ohne Änderungen aufgerufen.",
			actorDiscordId: discordId,
			actorLabel: session.user.discordHandle ?? discordId,
			metadata: {
				players: result.players,
				changedPlacements: result.changedPlacements,
				dmQueued: result.dmQueued,
				dmOptedOut: result.dmOptedOut,
				discordJobId: result.discordJobId,
			},
		});
		return NextResponse.json({ ok: true, ...result });
	} catch (error) {
		return NextResponse.json({ message: error instanceof Error ? error.message : "Roster konnte nicht veröffentlicht werden." }, { status: 409 });
	}
}
