import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { resolveUltimateBraveryMatchPlayers, type UltimateBraveryMatchPlayer } from "@/lib/ultimate-bravery-match";
import { getUltimateBraveryDraftStatus } from "@/lib/ultimate-bravery-state";
import { resolveUltimateBraveryActionTarget } from "@/lib/ultimate-bravery-access";
import { ULTIMATE_BRAVERY_TEST_MATCH_ID } from "@/lib/ultimate-bravery-test";
import { writeAuditLog } from "@/lib/tournament-audit";
import { getMatchControlContext } from "@/lib/match-control";
import {
	confirmUltimateBraveryRoll,
	createUltimateBraveryRoll,
	getUltimateBraveryRoll,
	hideUltimateBraveryBuild,
	listUltimateBraveryRolls,
	requestUltimateBraveryReroll,
	resetUltimateBraveryMatch,
} from "@/lib/ultimate-bravery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
	action: z.enum(["roll", "reroll", "confirm", "request-reroll", "admin-reroll", "admin-reset"]),
	matchId: z.string().min(1),
	playerDiscordId: z.string().min(1).optional(),
	confirmation: z.string().optional(),
});

function draftPayload(players: UltimateBraveryMatchPlayer[], rolls: Awaited<ReturnType<typeof listUltimateBraveryRolls>>, viewerTeam: string, adminView = false) {
	const status = getUltimateBraveryDraftStatus(players, rolls);
	return {
		rolls: adminView
			? rolls
			: rolls.filter((roll) => status.allLocked || roll.teamName === viewerTeam).map((roll) => (roll.teamName === viewerTeam ? roll : hideUltimateBraveryBuild(roll))),
		...status,
	};
}

export async function GET(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) return NextResponse.json({ message: "Bitte zuerst mit Discord anmelden." }, { status: 401 });
	const url = new URL(request.url);
	const matchId = url.searchParams.get("matchId")?.trim();
	if (!matchId) return NextResponse.json({ message: "Match-ID fehlt." }, { status: 400 });
	const players = await resolveUltimateBraveryMatchPlayers(matchId);
	if (!players) return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	const isOwner = TOURNAMENT_OWNER_DISCORD_IDS.has(discordId);
	const adminView = isOwner && url.searchParams.get("admin") === "1";
	const requestedPerspective = url.searchParams.get("perspective")?.trim();
	const simulatedViewer =
		isOwner && matchId === ULTIMATE_BRAVERY_TEST_MATCH_ID && requestedPerspective ? players.find((player) => player.discordId === requestedPerspective) : undefined;
	const viewer = simulatedViewer ?? players.find((player) => player.discordId === discordId);
	if (!viewer && !adminView) return NextResponse.json({ message: "Du spielst in diesem Match nicht mit." }, { status: 403 });
	const viewerTeam = viewer?.teamName ?? players[0]?.teamName ?? "";
	return NextResponse.json({ ...draftPayload(players, await listUltimateBraveryRolls(matchId), viewerTeam, adminView), viewerTeam, adminView });
}

export async function POST(request: Request) {
	const session = await auth();
	const actorDiscordId = session?.user?.discordId;
	if (!actorDiscordId) return NextResponse.json({ message: "Bitte zuerst mit Discord anmelden." }, { status: 401 });
	const parsed = actionSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Roll-Anfrage." }, { status: 400 });
	const players = await resolveUltimateBraveryMatchPlayers(parsed.data.matchId);
	if (!players) return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	const isOwner = TOURNAMENT_OWNER_DISCORD_IDS.has(actorDiscordId);
	if (parsed.data.action === "admin-reset") {
		if (!isOwner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
		if (parsed.data.confirmation !== "ROLLS ZURÜCKSETZEN") return NextResponse.json({ message: "Bestätigung stimmt nicht überein." }, { status: 400 });
		await resetUltimateBraveryMatch(parsed.data.matchId);
		await writeAuditLog({
			action: "ultimate-bravery.reset",
			targetType: "match",
			targetId: parsed.data.matchId,
			summary: `Alle Ultimate-Bravery-Rolls für ${parsed.data.matchId} wurden zurückgesetzt.`,
			actorDiscordId,
			actorLabel: session.user.discordHandle ?? actorDiscordId,
		});
		return NextResponse.json({ message: "Alle Rolls dieses Matches wurden zurückgesetzt." });
	}
	if (parsed.data.matchId !== ULTIMATE_BRAVERY_TEST_MATCH_ID) {
		const match = (await getMatchControlContext()).matches.find((entry) => entry.id === parsed.data.matchId);
		if (!match || (match.status !== "Pending" && match.status !== "Live")) {
			return NextResponse.json({ message: "Die Turnierleitung hat die Rolls für dieses Match noch nicht freigegeben." }, { status: 409 });
		}
	}

	const adminAction = parsed.data.action === "admin-reroll";
	const ownerTestAction = parsed.data.matchId === ULTIMATE_BRAVERY_TEST_MATCH_ID && isOwner;
	if (adminAction && !isOwner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const targetDiscordId = resolveUltimateBraveryActionTarget({
		actorDiscordId,
		requestedPlayerDiscordId: parsed.data.playerDiscordId,
		adminAction: adminAction || ownerTestAction,
		isOwner,
	});
	if (!targetDiscordId) return NextResponse.json({ message: "Spieler fehlt." }, { status: 400 });
	const player = players.find((entry) => entry.discordId === targetDiscordId);
	if (!player || (!adminAction && !ownerTestAction && targetDiscordId !== actorDiscordId)) {
		return NextResponse.json({ message: "Du darfst nur deinen eigenen Roll bearbeiten." }, { status: 403 });
	}
	if (parsed.data.matchId === ULTIMATE_BRAVERY_TEST_MATCH_ID && players.some((entry) => !entry.discordId)) {
		return NextResponse.json({ message: "Der Proberaum startet erst, wenn alle zehn Spielerplätze belegt sind." }, { status: 409 });
	}
	const settings = await getTournamentSettings();
	const actorLabel = session.user.discordHandle ?? actorDiscordId;

	if (parsed.data.action === "request-reroll") {
		const roll = await requestUltimateBraveryReroll({
			matchId: parsed.data.matchId,
			discordId: targetDiscordId,
			requestedBy: actorLabel,
			rerollLimit: settings.ultimateBravery.rerollsPerPlayer,
		});
		await writeAuditLog({
			action: "ultimate-bravery.reroll-requested",
			targetType: "match",
			targetId: parsed.data.matchId,
			summary: `${player.name} hat einen Ausnahme-Reroll angefragt.`,
			actorDiscordId,
			actorLabel,
			metadata: { playerDiscordId: targetDiscordId, teamName: player.teamName, champion: roll.champion.name },
		});
		return NextResponse.json({ roll, message: "Ausnahme angefragt. Ein Admin sieht jetzt eine deutliche Warnung." });
	}

	if (parsed.data.action === "admin-reroll") {
		if (parsed.data.confirmation !== "AUSNAHME-REROLL") return NextResponse.json({ message: "Bestätigung stimmt nicht überein." }, { status: 400 });
		const existing = await getUltimateBraveryRoll(parsed.data.matchId, targetDiscordId);
		if (!existing?.rerollRequestedAt) return NextResponse.json({ message: "Für diesen Spieler liegt keine offene Ausnahme-Anfrage vor." }, { status: 409 });
		const roll = await createUltimateBraveryRoll({
			matchId: parsed.data.matchId,
			discordId: targetDiscordId,
			teamName: player.teamName,
			riotId: player.riotId,
			role: player.role,
			rolledBy: actorLabel,
			rerollLimit: settings.ultimateBravery.rerollsPerPlayer,
			reroll: true,
			force: true,
		});
		await writeAuditLog({
			action: "ultimate-bravery.admin-reroll",
			targetType: "match",
			targetId: parsed.data.matchId,
			summary: `Ausnahme-Reroll für ${player.name} durch Admin ausgeführt.`,
			actorDiscordId,
			actorLabel,
			metadata: { playerDiscordId: targetDiscordId, teamName: player.teamName, previousChampion: existing.champion.name, champion: roll.champion.name },
		});
		return NextResponse.json({ roll, remaining: 0, message: `Ausnahme-Reroll für ${player.name} ausgeführt und automatisch bestätigt.` });
	}

	if (parsed.data.action === "confirm") {
		const roll = await confirmUltimateBraveryRoll(parsed.data.matchId, targetDiscordId);
		if (!roll) return NextResponse.json({ message: "Bitte zuerst würfeln." }, { status: 409 });
		return NextResponse.json({ roll, message: "Champion und Build bestätigt." });
	}

	const roll = await createUltimateBraveryRoll({
		matchId: parsed.data.matchId,
		discordId: targetDiscordId,
		teamName: player.teamName,
		riotId: player.riotId,
		role: player.role,
		rolledBy: actorLabel,
		rerollLimit: settings.ultimateBravery.rerollsPerPlayer,
		reroll: parsed.data.action === "reroll",
	});
	const remaining = Math.max(0, settings.ultimateBravery.rerollsPerPlayer - roll.rerollsUsed);
	return NextResponse.json({
		roll,
		remaining,
		message:
			roll.status === "locked"
				? "Letzter Reroll verbraucht: automatisch bestätigt."
				: parsed.data.action === "reroll"
					? `Neu gewürfelt. Noch ${remaining} Reroll${remaining === 1 ? "" : "s"}.`
					: "Dein Roll ist bereit.",
	});
}
