import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getMatchControlContext } from "@/lib/match-control";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import {
	confirmUltimateBraveryRoll,
	createUltimateBraveryRoll,
	hideUltimateBraveryBuild,
	listUltimateBraveryRolls,
	resetUltimateBraveryTestDraft,
	ULTIMATE_BRAVERY_TEST_PLAYERS,
} from "@/lib/ultimate-bravery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
	action: z.enum(["roll", "reroll", "confirm", "reset-test"]),
	matchId: z.string().min(1),
	playerDiscordId: z.string().min(1).optional(),
});

type DraftPlayer = { discordId: string; name: string; riotId: string; role: string; teamName: string };

async function resolvePlayers(matchId: string): Promise<DraftPlayer[] | null> {
	if (matchId === "ub-test") return [...ULTIMATE_BRAVERY_TEST_PLAYERS];
	const context = await getMatchControlContext();
	const match = context.matches.find((entry) => entry.id === matchId);
	if (!match) return null;
	return context.teams
		.filter((team) => team.name === match.teamAName || team.name === match.teamBName)
		.flatMap((team) =>
			team.players.flatMap((player) =>
				player.discordId ? [{ discordId: player.discordId, name: player.name, riotId: player.riotId, role: player.role, teamName: team.name }] : []
			)
		);
}

function draftPayload(players: DraftPlayer[], rolls: Awaited<ReturnType<typeof listUltimateBraveryRolls>>, viewerTeam: string) {
	const allLocked = players.length > 0 && players.every((player) => rolls.some((roll) => roll.discordId === player.discordId && roll.status === "locked"));
	return {
		rolls: rolls.filter((roll) => allLocked || roll.teamName === viewerTeam).map((roll) => (roll.teamName === viewerTeam ? roll : hideUltimateBraveryBuild(roll))),
		allLocked,
		lockedCount: players.filter((player) => rolls.some((roll) => roll.discordId === player.discordId && roll.status === "locked")).length,
		totalPlayers: players.length,
	};
}

export async function GET(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) return NextResponse.json({ message: "Bitte zuerst mit Discord anmelden." }, { status: 401 });
	const url = new URL(request.url);
	const matchId = url.searchParams.get("matchId")?.trim();
	if (!matchId) return NextResponse.json({ message: "Match-ID fehlt." }, { status: 400 });
	const players = await resolvePlayers(matchId);
	if (!players) return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	const isOwner = TOURNAMENT_OWNER_DISCORD_IDS.has(discordId);
	const viewer = players.find((player) => player.discordId === discordId);
	if (!viewer && !(isOwner && matchId === "ub-test")) return NextResponse.json({ message: "Du spielst in diesem Match nicht mit." }, { status: 403 });
	const requestedTeam = url.searchParams.get("viewerTeam");
	const viewerTeam = isOwner && matchId === "ub-test" && players.some((player) => player.teamName === requestedTeam) ? requestedTeam! : (viewer?.teamName ?? "Team Alpha");
	return NextResponse.json({ ...draftPayload(players, await listUltimateBraveryRolls(matchId), viewerTeam), viewerTeam });
}

export async function POST(request: Request) {
	const session = await auth();
	const actorDiscordId = session?.user?.discordId;
	if (!actorDiscordId) return NextResponse.json({ message: "Bitte zuerst mit Discord anmelden." }, { status: 401 });
	const parsed = actionSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Roll-Anfrage." }, { status: 400 });
	const players = await resolvePlayers(parsed.data.matchId);
	if (!players) return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	const isTestOwner = parsed.data.matchId === "ub-test" && TOURNAMENT_OWNER_DISCORD_IDS.has(actorDiscordId);
	if (parsed.data.action === "reset-test") {
		if (!isTestOwner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
		await resetUltimateBraveryTestDraft();
		return NextResponse.json({ message: "Test-Draft vollständig zurückgesetzt." });
	}
	const targetDiscordId = isTestOwner && parsed.data.playerDiscordId ? parsed.data.playerDiscordId : actorDiscordId;
	const player = players.find((entry) => entry.discordId === targetDiscordId);
	if (!player || (!isTestOwner && targetDiscordId !== actorDiscordId)) return NextResponse.json({ message: "Du darfst nur deinen eigenen Roll bearbeiten." }, { status: 403 });
	const settings = await getTournamentSettings();

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
		rolledBy: session.user.discordHandle ?? actorDiscordId,
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
