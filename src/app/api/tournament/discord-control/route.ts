import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { listDiscordGuildMembers, type DiscordGuildMemberSummary } from "@/lib/discord";
import { enqueueDiscordJob, type DiscordOperation } from "@/lib/discord-job-queue";
import { getDb } from "@/lib/mongo";
import { writeAuditLog } from "@/lib/tournament-audit";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredTeam = {
	name: string;
	roleId?: string;
	players?: Array<{ discordId?: string }>;
	meta?: { captain?: { discordId?: string } };
};

type BotStateDoc = { _id: string; teams?: Record<string, StoredTeam> };
type Action = "sync" | "repair" | "end-phase" | "remove-access";
const bodySchema = z.object({ action: z.enum(["sync", "repair", "end-phase", "remove-access"]), confirmation: z.string().optional() });

async function ownerSession() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	return discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId) ? { session, discordId } : null;
}

async function loadControlState() {
	const [botDoc, settings, guildResult] = await Promise.all([
		(await getDb()).collection<BotStateDoc>("bot_state").findOne({ _id: "default" }),
		getTournamentSettings(),
		listDiscordGuildMembers(),
	]);
	if (!guildResult.ok) return { error: guildResult.message } as const;
	const teams = Object.values(botDoc?.teams ?? {});
	const tournamentRoleId = process.env.DISCORD_TOURNAMENT_ROLE_ID?.trim();
	const captainRoleId = process.env.DISCORD_CAPTAINS_ROLE_ID?.trim() || process.env.CAPTAIN_ROLE_ID?.trim();
	const cleanupDate = settings.ultimateBravery.dayTwoStartAt
		? new Date(new Date(settings.ultimateBravery.dayTwoStartAt).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
		: null;
	return { teams, members: guildResult.members, tournamentRoleId, captainRoleId, cleanupDate } as const;
}

function roleHolders(members: DiscordGuildMemberSummary[], roleId?: string) {
	return new Set(roleId ? members.filter((member) => member.roles.includes(roleId)).map((member) => member.id) : []);
}

function buildOperations(state: Exclude<Awaited<ReturnType<typeof loadControlState>>, { error: string }>, action: Action) {
	const operations: DiscordOperation[] = [];
	const currentPlayers = new Set(
		state.teams
			.flatMap((team) => team.players ?? [])
			.map((player) => player.discordId)
			.filter((id): id is string => Boolean(id))
	);
	const expectedCaptains = new Set(state.teams.map((team) => team.meta?.captain?.discordId).filter((id): id is string => Boolean(id)));
	const force = action === "repair";

	if (action === "sync" || action === "repair") {
		if (state.tournamentRoleId) {
			const holders = roleHolders(state.members, state.tournamentRoleId);
			for (const discordId of currentPlayers) {
				if (force || !holders.has(discordId))
					operations.push({ kind: "role", discordId, roleId: state.tournamentRoleId, enabled: true, label: `${discordId}: Turnierrolle vergeben` });
			}
		}
		for (const team of state.teams) {
			if (!team.roleId) continue;
			const expected = new Set((team.players ?? []).map((player) => player.discordId).filter((id): id is string => Boolean(id)));
			const holders = roleHolders(state.members, team.roleId);
			for (const discordId of expected)
				if (force || !holders.has(discordId))
					operations.push({ kind: "role", discordId, roleId: team.roleId, enabled: true, label: `${discordId}: Teamrolle ${team.name} vergeben` });
			for (const discordId of holders)
				if (!expected.has(discordId))
					operations.push({ kind: "role", discordId, roleId: team.roleId, enabled: false, label: `${discordId}: veraltete Teamrolle ${team.name} entfernen` });
		}
		if (state.captainRoleId) {
			const holders = roleHolders(state.members, state.captainRoleId);
			for (const discordId of expectedCaptains)
				if (force || !holders.has(discordId))
					operations.push({ kind: "role", discordId, roleId: state.captainRoleId, enabled: true, label: `${discordId}: Captain-Rolle vergeben` });
			for (const discordId of holders)
				if (!expectedCaptains.has(discordId))
					operations.push({ kind: "role", discordId, roleId: state.captainRoleId, enabled: false, label: `${discordId}: veraltete Captain-Rolle entfernen` });
		}
	}

	if (action === "end-phase") {
		for (const team of state.teams) {
			if (!team.roleId) continue;
			for (const discordId of roleHolders(state.members, team.roleId))
				operations.push({ kind: "role", discordId, roleId: team.roleId, enabled: false, label: `${discordId}: Teamrolle ${team.name} entfernen` });
		}
		if (state.captainRoleId)
			for (const discordId of roleHolders(state.members, state.captainRoleId))
				operations.push({ kind: "role", discordId, roleId: state.captainRoleId, enabled: false, label: `${discordId}: Captain-Rolle entfernen` });
	}

	if (action === "remove-access" && state.tournamentRoleId) {
		for (const discordId of roleHolders(state.members, state.tournamentRoleId))
			operations.push({ kind: "role", discordId, roleId: state.tournamentRoleId, enabled: false, label: `${discordId}: Turnierzugang entfernen` });
	}

	return operations;
}

export async function GET() {
	const owner = await ownerSession();
	if (!owner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const state = await loadControlState();
	if ("error" in state) return NextResponse.json({ message: state.error }, { status: 502 });
	return NextResponse.json({
		configured: {
			tournamentRole: Boolean(state.tournamentRoleId),
			captainRole: Boolean(state.captainRoleId),
			teamRoles: state.teams.filter((team) => Boolean(team.roleId)).length,
			teams: state.teams.length,
		},
		counts: {
			rosterPlayers: new Set(
				state.teams
					.flatMap((team) => team.players ?? [])
					.map((player) => player.discordId)
					.filter(Boolean)
			).size,
			tournamentAccess: roleHolders(state.members, state.tournamentRoleId).size,
			sync: buildOperations(state, "sync").length,
			repair: buildOperations(state, "repair").length,
			endPhase: buildOperations(state, "end-phase").length,
			removeAccess: buildOperations(state, "remove-access").length,
		},
		cleanupRecommendedAt: state.cleanupDate,
	});
}

export async function POST(request: Request) {
	const owner = await ownerSession();
	if (!owner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Discord-Aktion." }, { status: 400 });
	if (parsed.data.action === "remove-access" && parsed.data.confirmation !== "TURNIERZUGANG ENTFERNEN")
		return NextResponse.json({ message: "Bestätigung stimmt nicht überein." }, { status: 400 });
	const state = await loadControlState();
	if ("error" in state) return NextResponse.json({ message: state.error }, { status: 502 });
	if (!state.tournamentRoleId && (parsed.data.action === "sync" || parsed.data.action === "repair" || parsed.data.action === "remove-access"))
		return NextResponse.json({ message: "DISCORD_TOURNAMENT_ROLE_ID fehlt." }, { status: 400 });
	const labels: Record<Action, string> = {
		sync: "Roster-Rollen synchronisieren",
		repair: "Alle Discord-Rollen reparieren",
		"end-phase": "Aktive Turnierphase beenden",
		"remove-access": "Turnierzugang entfernen",
	};
	const operations = buildOperations(state, parsed.data.action);
	const job = await enqueueDiscordJob({
		type: `discord-control-${parsed.data.action}`,
		title: labels[parsed.data.action],
		operations,
		actorLabel: owner.session.user.discordHandle ?? owner.discordId,
	});
	await writeAuditLog({
		action: `discord.control.${parsed.data.action}`,
		targetType: "discord",
		targetId: parsed.data.action,
		summary: `${labels[parsed.data.action]} queued with ${operations.length} operation(s).`,
		actorDiscordId: owner.discordId,
		actorLabel: owner.session.user.discordHandle ?? owner.discordId,
		metadata: { discordJobId: job?.id, operations: operations.length },
	});
	return NextResponse.json({ ok: true, queued: operations.length, job });
}
