import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getMatchControlContext } from "@/lib/match-control";
import { createMatchReport, upsertCaptainCheckIn } from "@/lib/tournament-next";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("check-in"), matchId: z.string().min(1), rosterConfirmed: z.literal(true), rulesConfirmed: z.literal(true) }),
	z.object({
		action: z.literal("report"),
		matchId: z.string().min(1),
		declaredWinner: z.boolean(),
		gameDuration: z.string().trim().max(12).optional(),
		screenshotUrl: z.string().url().optional().or(z.literal("")),
		note: z.string().trim().max(1200).optional(),
	}),
]);

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) return NextResponse.json({ message: "Bitte mit Discord anmelden." }, { status: 401 });
	const parsed = actionSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Daten." }, { status: 400 });

	const context = await getMatchControlContext();
	const match = context.matches.find((entry) => entry.id === parsed.data.matchId);
	if (!match) return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	const team = context.teams.find((entry) => entry.captainRef?.discordId === discordId && (entry.name === match.teamAName || entry.name === match.teamBName));
	if (!team && !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nur der Captain dieses Matches darf das ausführen." }, { status: 403 });
	const teamName = team?.name ?? match.teamAName ?? "Orga";

	if (parsed.data.action === "check-in") {
		const checkIn = await upsertCaptainCheckIn({
			matchId: match.id,
			teamName,
			captainDiscordId: discordId,
			rosterConfirmed: true,
			rulesConfirmed: true,
			checkedAt: new Date().toISOString(),
		});
		return NextResponse.json({ checkIn });
	}

	const report = await createMatchReport({
		matchId: match.id,
		teamName,
		captainDiscordId: discordId,
		declaredWinner: parsed.data.declaredWinner,
		gameDuration: parsed.data.gameDuration || undefined,
		screenshotUrl: parsed.data.screenshotUrl || undefined,
		note: parsed.data.note || undefined,
	});
	return NextResponse.json({ report });
}
