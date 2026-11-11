import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getMatchControlContext } from "@/lib/match-control";
import { codeVisibleFor, currentGameNumber, ensureTournamentCode, retireTournamentCode, riotTournamentApi } from "@/lib/riot-tournament";
import { writeAuditLog } from "@/lib/tournament-audit";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ matchId: z.string().trim().min(1), renew: z.boolean().optional() });

/** Admin: create the code for the current game when the automatic try failed, or replace it (`renew`) for a remake. */
export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	if (!riotTournamentApi()) return NextResponse.json({ message: "Turniercodes sind nicht aktiviert (RIOT_TOURNAMENT_API)." }, { status: 409 });
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Match-ID fehlt." }, { status: 400 });

	const [ctx, settings] = await Promise.all([getMatchControlContext(), getTournamentSettings()]);
	const match = ctx.matches.find((entry) => entry.id === parsed.data.matchId);
	if (!match) return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	if (!codeVisibleFor(match)) return NextResponse.json({ message: "Codes gibt es nur für freigegebene oder laufende Matches." }, { status: 409 });

	const actor = session.user.discordHandle ?? discordId;
	const gameNumber = currentGameNumber(match);
	try {
		if (parsed.data.renew) await retireTournamentCode(settings, match.id, gameNumber);
		const code = await ensureTournamentCode({ settings, matchId: match.id, gameNumber, actor });
		await writeAuditLog({
			action: "match.tournament_code",
			targetType: "match",
			targetId: match.id,
			summary: `Turniercode für Spiel ${gameNumber} ${parsed.data.renew ? "ersetzt (Remake)" : "erzeugt"}.`,
			actorDiscordId: discordId,
			actorLabel: actor,
			metadata: { gameNumber, api: code?.api },
		});
		return NextResponse.json({ ok: true, gameNumber, code: code?.code ?? null });
	} catch (error) {
		return NextResponse.json({ message: error instanceof Error ? error.message : "Code konnte nicht erzeugt werden." }, { status: 502 });
	}
}
