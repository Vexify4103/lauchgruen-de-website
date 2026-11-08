import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendDiscordDirectMessage } from "@/lib/discord";
import { getDb } from "@/lib/mongo";
import { rosterPublicationMessage, teamWelcomeMessage } from "@/lib/roster-messages";
import { writeAuditLog } from "@/lib/tournament-audit";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewTeam = { name: string; roleId?: string; voiceChannelId?: string; textChannelId?: string; meta?: { captain?: { discordId?: string } } };

/**
 * Sends the roster messages only to the admin who asks: the team welcome post and both DM variants.
 * Sent directly, outside the job queue, so no receipt blocks the real welcome post and nobody is pinged.
 */
export async function POST() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });

	const [botDoc, settings] = await Promise.all([
		(await getDb()).collection<{ _id: string; teams?: Record<string, PreviewTeam> }>("bot_state").findOne({ _id: "default" }),
		getTournamentSettings(),
	]);
	const teams = Object.entries(botDoc?.teams ?? {});
	// A real team shows real channel links; without one the preview uses a sample name.
	const [teamKey, team] = teams.find(([, entry]) => entry.textChannelId) ?? teams[0] ?? ["beispiel", { name: "Beispielteam" } as PreviewTeam];
	const channels = { textChannelId: team.textChannelId, voiceChannelId: team.voiceChannelId };
	const placement = { teamKey, teamName: team.name, role: "Mid" as const, isCaptain: false };

	const messages = [
		{
			label: "Begrüßung im Teamchannel",
			payload: teamWelcomeMessage({
				teamName: team.name,
				roleId: team.roleId,
				captainId: team.meta?.captain?.discordId ?? discordId,
				voiceChannelId: team.voiceChannelId,
				tournamentName: settings.activeTournament.name,
				dayOneStartAt: settings.ultimateBravery.startAt,
				dayTwoStartAt: settings.ultimateBravery.dayTwoStartAt,
			}),
		},
		{ label: "DM für Spieler", payload: rosterPublicationMessage(placement, channels) },
		{ label: "DM für Captains", payload: rosterPublicationMessage({ ...placement, isCaptain: true }, channels) },
	];

	const failed: string[] = [];
	for (const message of messages) {
		const preview = { ...message.payload, content: `🧪 **Vorschau: ${message.label}**\n${message.payload.content ?? ""}` };
		const result = await sendDiscordDirectMessage({ discordId, payload: preview });
		if (!result.ok) failed.push(`${message.label}: ${result.message}`);
	}

	await writeAuditLog({
		action: "discord.preview",
		targetType: "discord",
		targetId: discordId,
		summary: `Vorschau der Roster-Nachrichten an ${session.user.discordHandle ?? discordId} gesendet.`,
		actorDiscordId: discordId,
		actorLabel: session.user.discordHandle ?? discordId,
		metadata: { team: team.name, failed },
	});
	if (failed.length) return NextResponse.json({ message: failed.join(" · ") }, { status: 502 });
	return NextResponse.json({ ok: true, team: team.name, sent: messages.length });
}
