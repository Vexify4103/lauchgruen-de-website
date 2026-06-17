import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { setDiscordMemberRole } from "@/lib/discord";
import { getDb } from "@/lib/mongo";
import { isPlayerRole, type PlayerRole } from "@/lib/roster";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BotStoredPlayer = {
	riotId: string;
	puuid: string;
	discordId?: string;
	role?: PlayerRole;
};

type BotTeam = {
	name: string;
	players: BotStoredPlayer[];
	roleId?: string;
};

type BotStateDoc = {
	_id: string;
	teams?: Record<string, BotTeam>;
};

type VerifiedDoc = {
	_id: string;
	discordId: string;
	riotId: string;
	puuid: string;
};

const schema = z.object({
	teamKey: z.string().trim().min(1),
	incomingDiscordId: z.string().trim().min(1),
	outgoingDiscordId: z.string().trim().optional(),
	role: z
		.string()
		.trim()
		.transform((value) => (isPlayerRole(value) ? value : "Sub")),
	expectedVersion: z.number().int().min(0),
});

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Substitute-Daten." }, { status: 400 });
	}

	const db = await getDb();
	const botCol = db.collection<BotStateDoc>("bot_state");
	const doc = await botCol.findOne({ _id: "default" });
	const teams = doc?.teams ?? {};
	const target = teams[parsed.data.teamKey];
	if (!target) {
		return NextResponse.json({ message: "Team nicht gefunden." }, { status: 404 });
	}

	const verified = await db.collection<VerifiedDoc>("verified_riot_accounts").findOne({ _id: parsed.data.incomingDiscordId });
	if (!verified) {
		return NextResponse.json({ message: "Incoming player hat keinen verifizierten Riot Account." }, { status: 409 });
	}

	const versionClaim = await claimAdminVersion({
		resource: "roster",
		expectedVersion: parsed.data.expectedVersion,
		updatedBy: session.user.discordHandle ?? discordId,
	});
	if (!versionClaim.ok) {
		return NextResponse.json(versionClaim.conflict, { status: 409 });
	}

	const previousIncomingTeams = Object.entries(teams)
		.filter(([, team]) => (team.players ?? []).some((player) => player.discordId === parsed.data.incomingDiscordId))
		.map(([teamKey, team]) => ({ teamKey, team }));

	for (const team of Object.values(teams)) {
		team.players = (team.players ?? []).filter((player) => player.discordId !== parsed.data.incomingDiscordId);
	}

	target.players = (target.players ?? []).filter((player) => (parsed.data.outgoingDiscordId ? player.discordId !== parsed.data.outgoingDiscordId : true));
	target.players.push({
		discordId: verified.discordId,
		riotId: verified.riotId,
		puuid: verified.puuid,
		role: parsed.data.role,
	});

	await botCol.updateOne({ _id: "default" }, { $set: { teams } }, { upsert: true });

	const roleWarnings: string[] = [];
	const tournamentRoleId = process.env.DISCORD_TOURNAMENT_ROLE_ID?.trim();
	if (!tournamentRoleId) {
		roleWarnings.push("Turnierrolle nicht synchronisiert: DISCORD_TOURNAMENT_ROLE_ID fehlt.");
	} else {
		const addRole = await setDiscordMemberRole({
			discordId: verified.discordId,
			roleId: tournamentRoleId,
			enabled: true,
		});
		if (!addRole.ok) roleWarnings.push(addRole.message);

		const outgoingDiscordId = parsed.data.outgoingDiscordId;
		const outgoingStillAssigned = outgoingDiscordId && Object.values(teams).some((team) => team.players.some((player) => player.discordId === outgoingDiscordId));
		if (outgoingDiscordId && !outgoingStillAssigned) {
			const removeRole = await setDiscordMemberRole({
				discordId: outgoingDiscordId,
				roleId: tournamentRoleId,
				enabled: false,
			});
			if (!removeRole.ok) roleWarnings.push(removeRole.message);
		}
	}

	const targetTeamRoleId = target.roleId?.trim();
	if (targetTeamRoleId) {
		const addTeamRole = await setDiscordMemberRole({
			discordId: verified.discordId,
			roleId: targetTeamRoleId,
			enabled: true,
		});
		if (!addTeamRole.ok) {
			roleWarnings.push(`Team „${target.name}“: ${addTeamRole.message}`);
		}
	} else {
		roleWarnings.push(`Team-Rolle für „${target.name}“ fehlt. Der Substitute wurde nur dem Roster zugewiesen.`);
	}

	for (const previous of previousIncomingTeams) {
		if (previous.teamKey === parsed.data.teamKey) continue;
		const previousRoleId = previous.team.roleId?.trim();
		if (!previousRoleId) continue;
		const removeOldTeamRole = await setDiscordMemberRole({
			discordId: verified.discordId,
			roleId: previousRoleId,
			enabled: false,
		});
		if (!removeOldTeamRole.ok) {
			roleWarnings.push(`Altes Team „${previous.team.name}“: ${removeOldTeamRole.message}`);
		}
	}

	const outgoingDiscordId = parsed.data.outgoingDiscordId;
	if (outgoingDiscordId && targetTeamRoleId) {
		const removeOutgoingTeamRole = await setDiscordMemberRole({
			discordId: outgoingDiscordId,
			roleId: targetTeamRoleId,
			enabled: false,
		});
		if (!removeOutgoingTeamRole.ok) {
			roleWarnings.push(`Team „${target.name}“: ${removeOutgoingTeamRole.message}`);
		}
	}
	await writeAuditLog({
		action: "team.substitute",
		targetType: "team",
		targetId: parsed.data.teamKey,
		summary: `Substitute added to ${target.name}.`,
		actorDiscordId: discordId,
		actorLabel: session.user.discordHandle ?? discordId,
		metadata: {
			incomingDiscordId: verified.discordId,
			outgoingDiscordId: parsed.data.outgoingDiscordId || null,
			role: parsed.data.role,
		},
	});
	await writeTournamentEvent({
		type: "team.substitute",
		targetType: "team",
		targetId: parsed.data.teamKey,
		createdBy: session.user.discordHandle ?? discordId,
		payload: {
			teamName: target.name,
			incomingDiscordId: verified.discordId,
			incomingRiotId: verified.riotId,
			outgoingDiscordId: parsed.data.outgoingDiscordId || null,
			role: parsed.data.role,
		},
	});

	return NextResponse.json({
		ok: true,
		teamKey: parsed.data.teamKey,
		incomingDiscordId: verified.discordId,
		outgoingDiscordId: parsed.data.outgoingDiscordId || null,
		role: parsed.data.role,
		warnings: roleWarnings,
		version: versionClaim.version,
	});
}
