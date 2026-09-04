import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { enqueueDiscordJob, type DiscordOperation } from "@/lib/discord-job-queue";
import { getMatchControlContext } from "@/lib/match-control";
import { getDb } from "@/lib/mongo";
import type { PlayerRole } from "@/lib/roster";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { deleteUltimateBraveryRoll, getUltimateBraveryRoll } from "@/lib/ultimate-bravery";

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
	matchId: z.string().trim().min(1),
	teamKey: z.string().trim().min(1),
	incomingDiscordId: z.string().trim().min(1),
	outgoingDiscordId: z.string().trim().optional(),
	role: z.enum(["Top", "Jungle", "Mid", "Bot", "Support"]),
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

	const [db, matchContext] = await Promise.all([getDb(), getMatchControlContext()]);
	const botCol = db.collection<BotStateDoc>("bot_state");
	const doc = await botCol.findOne({ _id: "default" });
	const teams = doc?.teams ?? {};
	const target = teams[parsed.data.teamKey];
	if (!target) {
		return NextResponse.json({ message: "Team nicht gefunden." }, { status: 404 });
	}
	const match = matchContext.matches.find((entry) => entry.id === parsed.data.matchId);
	if (!match || (match.teamAName !== target.name && match.teamBName !== target.name)) {
		return NextResponse.json({ message: "Dieses Team gehört nicht zum ausgewählten Match." }, { status: 409 });
	}
	if (match.status === "Finished") {
		return NextResponse.json({ message: "Ein abgeschlossenes Match kann nicht mehr umbesetzt werden." }, { status: 409 });
	}

	const incomingInTarget = (target.players ?? []).find((player) => player.discordId === parsed.data.incomingDiscordId);
	if (incomingInTarget && incomingInTarget.role !== "Sub") {
		return NextResponse.json({ message: "Der Incoming-Spieler ist in diesem Team bereits aktiv aufgestellt." }, { status: 409 });
	}
	if (parsed.data.outgoingDiscordId === parsed.data.incomingDiscordId) {
		return NextResponse.json({ message: "Incoming und auszuwechselnder Spieler müssen unterschiedlich sein." }, { status: 400 });
	}
	const outgoingPlayer = parsed.data.outgoingDiscordId ? (target.players ?? []).find((player) => player.discordId === parsed.data.outgoingDiscordId) : undefined;
	if (parsed.data.outgoingDiscordId && (!outgoingPlayer || outgoingPlayer.role === "Sub")) {
		return NextResponse.json({ message: "Der auszuwechselnde Spieler muss aktuell in der aktiven Fünferaufstellung stehen." }, { status: 409 });
	}
	const activePlayersWithoutIncoming = (target.players ?? []).filter((player) => player.discordId !== parsed.data.incomingDiscordId && player.role !== "Sub");
	if (!outgoingPlayer && activePlayersWithoutIncoming.length >= 5) {
		return NextResponse.json({ message: "Bitte wähle den aktiven Spieler aus, den der Substitute in diesem Match ersetzt." }, { status: 409 });
	}

	const verified = await db.collection<VerifiedDoc>("verified_riot_accounts").findOne({ _id: parsed.data.incomingDiscordId });
	if (!verified) {
		return NextResponse.json({ message: "Incoming player hat keinen verifizierten Riot Account." }, { status: 409 });
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

	const removedRoll = parsed.data.outgoingDiscordId ? await getUltimateBraveryRoll(parsed.data.matchId, parsed.data.outgoingDiscordId) : null;
	const incomingRoll = await getUltimateBraveryRoll(parsed.data.matchId, parsed.data.incomingDiscordId);
	await Promise.all([
		...(parsed.data.outgoingDiscordId ? [deleteUltimateBraveryRoll(parsed.data.matchId, parsed.data.outgoingDiscordId)] : []),
		...(incomingRoll && (incomingRoll.teamName !== target.name || incomingRoll.role !== parsed.data.role)
			? [deleteUltimateBraveryRoll(parsed.data.matchId, parsed.data.incomingDiscordId)]
			: []),
	]);

	const roleWarnings: string[] = [];
	const roleOperations: DiscordOperation[] = [];
	const tournamentRoleId = process.env.DISCORD_TOURNAMENT_ROLE_ID?.trim();
	if (!tournamentRoleId) {
		roleWarnings.push("Turnierrolle nicht synchronisiert: DISCORD_TOURNAMENT_ROLE_ID fehlt.");
	} else {
		roleOperations.push({ kind: "role", discordId: verified.discordId, roleId: tournamentRoleId, enabled: true, label: `${verified.riotId}: Turnierrolle vergeben` });
	}

	const targetTeamRoleId = target.roleId?.trim();
	if (targetTeamRoleId) {
		roleOperations.push({
			kind: "role",
			discordId: verified.discordId,
			roleId: targetTeamRoleId,
			enabled: true,
			label: `${verified.riotId}: Teamrolle ${target.name} vergeben`,
		});
	} else {
		roleWarnings.push(`Team-Rolle für „${target.name}“ fehlt. Der Substitute wurde nur dem Roster zugewiesen.`);
	}

	for (const previous of previousIncomingTeams) {
		if (previous.teamKey === parsed.data.teamKey) continue;
		const previousRoleId = previous.team.roleId?.trim();
		if (!previousRoleId) continue;
		roleOperations.push({
			kind: "role",
			discordId: verified.discordId,
			roleId: previousRoleId,
			enabled: false,
			label: `${verified.riotId}: alte Teamrolle ${previous.team.name} entfernen`,
		});
	}

	const outgoingDiscordId = parsed.data.outgoingDiscordId;
	if (outgoingDiscordId && targetTeamRoleId) {
		roleOperations.push({
			kind: "role",
			discordId: outgoingDiscordId,
			roleId: targetTeamRoleId,
			enabled: false,
			label: `${outgoingDiscordId}: Teamrolle ${target.name} entfernen`,
		});
	}
	const discordJob = await enqueueDiscordJob({
		type: "emergency-substitute",
		title: `Notfall-Substitute: ${target.name}`,
		operations: roleOperations,
		actorLabel: session.user.discordHandle ?? discordId,
	});
	await writeAuditLog({
		action: "team.substitute",
		targetType: "team",
		targetId: parsed.data.teamKey,
		summary: `Substitute added to ${target.name}.`,
		actorDiscordId: discordId,
		actorLabel: session.user.discordHandle ?? discordId,
		metadata: {
			matchId: parsed.data.matchId,
			incomingDiscordId: verified.discordId,
			outgoingDiscordId: parsed.data.outgoingDiscordId || null,
			role: parsed.data.role,
			removedRollChampion: removedRoll?.champion.name ?? null,
		},
	});
	await writeTournamentEvent({
		type: "team.substitute",
		targetType: "team",
		targetId: parsed.data.teamKey,
		createdBy: session.user.discordHandle ?? discordId,
		payload: {
			matchId: parsed.data.matchId,
			teamName: target.name,
			incomingDiscordId: verified.discordId,
			incomingRiotId: verified.riotId,
			outgoingDiscordId: parsed.data.outgoingDiscordId || null,
			role: parsed.data.role,
		},
	});

	return NextResponse.json({
		ok: true,
		matchId: parsed.data.matchId,
		teamKey: parsed.data.teamKey,
		incomingDiscordId: verified.discordId,
		outgoingDiscordId: parsed.data.outgoingDiscordId || null,
		role: parsed.data.role,
		discordJob,
		warnings: roleWarnings,
	});
}
