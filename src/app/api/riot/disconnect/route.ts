import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findApplicationByDiscordId, clearRiotLink } from "@/lib/tournament-storage";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { formatTournamentApplicationDeadlineLabel, isTournamentApplicationDeadlinePassed } from "@/lib/tournament-application-deadline";

export const runtime = "nodejs";

export async function POST() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
	}
	const [application, settings] = await Promise.all([findApplicationByDiscordId(discordId), getTournamentSettings()]);
	if (application && isTournamentApplicationDeadlinePassed(new Date(), settings.applicationDeadlineOverride, settings.applicationDeadline)) {
		return NextResponse.json(
			{
				message: `Deine aktive Bewerbung kann nach dem Bewerbungsschluss am ${formatTournamentApplicationDeadlineLabel(settings.applicationDeadline)} nur durch das Orga-Team entfernt werden. Deshalb bleibt auch die zugehörige Riot-Verknüpfung gesperrt.`,
			},
			{ status: 403 }
		);
	}
	await clearRiotLink(discordId);
	return NextResponse.json({ ok: true });
}
