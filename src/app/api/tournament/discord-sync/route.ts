import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkDiscordMemberRole, setDiscordMemberRole } from "@/lib/discord";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { writeAuditLog } from "@/lib/tournament-audit";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const roleId = process.env.DISCORD_CAPTAINS_ROLE_ID?.trim();
	if (!roleId) {
		return NextResponse.json({ message: "DISCORD_CAPTAINS_ROLE_ID fehlt." }, { status: 400 });
	}

	const ctx = await getTournamentContext();
	const captains = [...new Set(ctx.teams.map((team) => team.captainRef?.discordId).filter((id): id is string => Boolean(id)))];
	const results = await Promise.all(
		captains.map(async (captainId) => {
			const before = await checkDiscordMemberRole({ discordId: captainId, roleId });
			if (before.status === "synced") {
				return { discordId: captainId, before, after: before, repaired: false };
			}
			const repair = await setDiscordMemberRole({
				discordId: captainId,
				roleId,
				enabled: true,
			});
			const after = repair.ok ? await checkDiscordMemberRole({ discordId: captainId, roleId }) : { status: "error" as const, message: repair.message };
			return { discordId: captainId, before, after, repaired: repair.ok };
		})
	);

	await writeAuditLog({
		action: "discord.captain_roles.repair",
		targetType: "discord",
		targetId: "captain-roles",
		summary: `Captain role repair ran for ${captains.length} captain(s).`,
		actorDiscordId: discordId,
		actorLabel: session.user.discordHandle ?? discordId,
		metadata: { results },
	});

	return NextResponse.json({ results });
}
