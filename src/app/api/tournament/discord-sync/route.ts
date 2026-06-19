import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkDiscordMemberRole } from "@/lib/discord";
import { enqueueDiscordJob, type DiscordOperation } from "@/lib/discord-job-queue";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { writeAuditLog } from "@/lib/tournament-audit";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCaptainRoleStatuses() {
	const roleId = process.env.DISCORD_CAPTAINS_ROLE_ID?.trim();
	const ctx = await getTournamentContext();
	const statuses = [];
	for (const team of ctx.teams.filter((entry) => entry.captainRef?.discordId)) {
		const discordId = team.captainRef?.discordId ?? "";
		const result = await checkDiscordMemberRole({ discordId, roleId });
		statuses.push({
			teamName: team.name,
			captainLabel: team.captainRef?.riotId ?? team.captain ?? "Captain",
			discordId,
			status: result.status,
			message: result.message,
		});
	}
	return statuses;
}

export async function GET() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	return NextResponse.json({ statuses: await getCaptainRoleStatuses() });
}

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
	const results = [];
	const operations: DiscordOperation[] = [];
	for (const captainId of captains) {
		const before = await checkDiscordMemberRole({ discordId: captainId, roleId });
		if (before.status === "synced") {
			results.push({ discordId: captainId, before, queued: false });
			continue;
		}
		operations.push({
			kind: "role",
			discordId: captainId,
			roleId,
			enabled: true,
			label: `${captainId}: Captain-Rolle reparieren`,
		});
		results.push({ discordId: captainId, before, queued: true });
	}
	const job = await enqueueDiscordJob({
		type: "captain-role-repair",
		title: "Captain-Rollen reparieren",
		operations,
		actorLabel: session.user.discordHandle ?? discordId,
	});

	await writeAuditLog({
		action: "discord.captain_roles.repair",
		targetType: "discord",
		targetId: "captain-roles",
		summary: `Captain role repair queued ${operations.length}/${captains.length} captain role operation(s).`,
		actorDiscordId: discordId,
		actorLabel: session.user.discordHandle ?? discordId,
		metadata: { results, discordJobId: job?.id },
	});

	return NextResponse.json({ results, queued: operations.length, discordJobId: job?.id });
}
