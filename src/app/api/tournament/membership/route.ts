import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDiscordGuildMember } from "@/lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	const session = await auth();
	const discordId = session?.user?.discordId;

	if (!discordId) {
		return NextResponse.json({ member: false, message: "Bitte zuerst mit Discord anmelden." }, { status: 401 });
	}

	const liveGuildMember = await isDiscordGuildMember(discordId);
	const member = liveGuildMember ?? session.user.discordInGuild ?? !process.env.DISCORD_GUILD_ID;

	return NextResponse.json({
		member,
		checkedLive: liveGuildMember !== null,
		message: member
			? "Discord-Mitgliedschaft bestätigt."
			: liveGuildMember === null
				? "Mitgliedschaft konnte nicht live geprüft werden. Prüfe DISCORD_TOKEN und DISCORD_GUILD_ID."
				: "Du bist noch nicht auf dem Lauchgruen Discord.",
	});
}
