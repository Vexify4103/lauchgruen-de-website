import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/tournament-audit";
import { createPlayIn, resetPlayIn } from "@/lib/tournament-play-in";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { PLAY_IN_RESET_CONFIRMATION } from "@/lib/tournament-structure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("create"), teamKeys: z.array(z.string().min(1)).min(2).max(30) }),
	z.object({ action: z.literal("reset"), confirmation: z.string() }),
]);

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Play-in-Aktion." }, { status: 400 });
	const settings = await getTournamentSettings();
	const tournamentId = settings.activeTournament.id;
	const actor = session.user.discordHandle ?? discordId;

	try {
		if (parsed.data.action === "reset") {
			if (parsed.data.confirmation !== PLAY_IN_RESET_CONFIRMATION) return NextResponse.json({ message: "Bestätigung stimmt nicht überein." }, { status: 400 });
			await resetPlayIn(tournamentId);
			await writeAuditLog({
				action: "play-in.reset",
				targetType: "stage",
				targetId: tournamentId,
				summary: "Play-in zurückgesetzt.",
				actorDiscordId: discordId,
				actorLabel: actor,
			});
			return NextResponse.json({ ok: true });
		}
		if (parsed.data.teamKeys.length !== settings.ultimateBravery.playInTeamCount) {
			return NextResponse.json({ message: `Für das Play-in sind ${settings.ultimateBravery.playInTeamCount} Teams eingestellt.` }, { status: 400 });
		}
		const ctx = await getTournamentContext();
		const byKey = new Map(ctx.teams.flatMap((team) => (team.storageKey ? [[team.storageKey, team] as const] : [])));
		const unknown = parsed.data.teamKeys.filter((key) => !byKey.has(key));
		if (unknown.length) return NextResponse.json({ message: `Unbekannte Teams: ${unknown.join(", ")}` }, { status: 404 });
		const teams = parsed.data.teamKeys.map((key) => ({ key, name: byKey.get(key)!.name }));
		const state = await createPlayIn({ tournamentId, teams, createdBy: actor });
		await writeAuditLog({
			action: "play-in.create",
			targetType: "stage",
			targetId: tournamentId,
			summary: `Play-in mit ${teams.length} Teams erstellt.`,
			actorDiscordId: discordId,
			actorLabel: actor,
			metadata: { pairs: state.pairs },
		});
		return NextResponse.json({ ok: true, state });
	} catch (error) {
		return NextResponse.json({ message: error instanceof Error ? error.message : "Play-in-Aktion fehlgeschlagen." }, { status: 409 });
	}
}
