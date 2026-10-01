import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/tournament-audit";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { setStandingOverride } from "@/lib/tournament-standing-overrides";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
	key: z.string().regex(/^(group:[A-P]|swiss|playoffs)$/),
	order: z.array(z.string().min(1)).max(32).nullable(),
});

/** Records the staff decision for a tie that no configured tiebreaker splits. */
export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Reihenfolge." }, { status: 400 });
	if (parsed.data.order && new Set(parsed.data.order).size !== parsed.data.order.length)
		return NextResponse.json({ message: "Ein Team steht doppelt in der Reihenfolge." }, { status: 400 });
	const settings = await getTournamentSettings();
	const actor = session.user.discordHandle ?? discordId;
	const orders = await setStandingOverride({ tournamentId: settings.activeTournament.id, key: parsed.data.key, order: parsed.data.order, updatedBy: actor });
	await writeAuditLog({
		action: "standings.override",
		targetType: "stage",
		targetId: parsed.data.key,
		summary: parsed.data.order ? `Gleichstand entschieden: ${parsed.data.order.join(" > ")}.` : "Entscheidung zum Gleichstand entfernt.",
		actorDiscordId: discordId,
		actorLabel: actor,
		metadata: { key: parsed.data.key, order: parsed.data.order },
	});
	return NextResponse.json({ ok: true, orders });
}
