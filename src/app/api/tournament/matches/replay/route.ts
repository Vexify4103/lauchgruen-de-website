import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getMatchControlContext } from "@/lib/match-control";
import { getDb } from "@/lib/mongo";
import { evaluateReplay, replayFingerprint, type ReplayRoster } from "@/lib/replay-match";
import { gameIdFromReplayFileName, type ReplaySummary } from "@/lib/rofl";
import { getReplayAssets } from "@/lib/replay-assets";
import { writeAuditLog } from "@/lib/tournament-audit";
import { listMatchReports } from "@/lib/tournament-next";
import { createReplay, DuplicateReplayError, listReplays, setReplayStatus } from "@/lib/tournament-replays";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const shortText = z.string().trim().max(120);
const stat = z.number().finite().min(0).max(1_000_000);
const playerSchema = z.object({
	riotIdName: shortText,
	riotIdTag: shortText,
	puuid: shortText,
	champion: shortText,
	team: z.union([z.literal(100), z.literal(200)]),
	win: z.boolean(),
	position: z.enum(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY", ""]),
	kills: stat,
	deaths: stat,
	assists: stat,
	gold: stat,
	creepScore: stat,
	damageToChampions: stat,
	visionScore: stat,
	level: stat,
	items: z.array(stat).max(7).optional(),
	summonerSpells: z.array(stat).max(2).optional(),
	perks: z.array(stat).max(6).optional(),
	primaryStyle: stat.optional(),
	subStyle: stat.optional(),
	controlWardsPlaced: stat.optional(),
	wardsPlaced: stat.optional(),
	wardsKilled: stat.optional(),
	damageTaken: stat.optional(),
});
const summarySchema = z.object({
	gameVersion: shortText.nullable(),
	durationSeconds: z.number().int().min(1).max(4 * 60 * 60),
	players: z.array(playerSchema).min(1).max(12),
	winningTeam: z.union([z.literal(100), z.literal(200)]).nullable(),
});
const uploadSchema = z.object({
	matchId: z.string().min(1).max(80),
	fileName: z.string().trim().max(160),
	sha256: z.string().regex(/^[a-f0-9]{64}$/),
	summary: summarySchema,
});
const reviewSchema = z.object({ id: z.string().uuid(), status: z.enum(["applied", "rejected"]) });

type StoredRosterTeam = { name: string; players?: Array<{ riotId?: string; puuid?: string }> };

async function rostersFor(teamAName: string, teamBName: string): Promise<{ teamA: ReplayRoster; teamB: ReplayRoster }> {
	const doc = await (await getDb()).collection<{ _id: string; teams?: Record<string, StoredRosterTeam> }>("bot_state").findOne({ _id: "default" });
	const teams = Object.values(doc?.teams ?? {});
	const roster = (name: string): ReplayRoster => {
		const team = teams.find((entry) => entry.name.toLocaleLowerCase("de-DE") === name.toLocaleLowerCase("de-DE"));
		// Subs are part of the roster: a sub who played still proves the replay belongs to this team.
		const players = (team?.players ?? [])
			.filter((player) => player.riotId)
			.map((player) => ({ riotId: player.riotId!, puuid: player.puuid?.startsWith("manual-") ? undefined : player.puuid }));
		return { name, players };
	};
	return { teamA: roster(teamAName), teamB: roster(teamBName) };
}

async function sessionUser() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) return null;
	return { discordId, label: session.user.discordHandle ?? discordId, owner: TOURNAMENT_OWNER_DISCORD_IDS.has(discordId) };
}

/** Staff list the replays and the plain captain reports of one match. */
export async function GET(request: Request) {
	const user = await sessionUser();
	if (!user?.owner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const matchId = new URL(request.url).searchParams.get("matchId");
	if (!matchId) return NextResponse.json({ message: "matchId fehlt." }, { status: 400 });
	const [replays, reports, assets] = await Promise.all([listReplays(matchId), listMatchReports(matchId), getReplayAssets()]);
	return NextResponse.json({ replays, reports, assets });
}

/** A captain of the match (or staff) uploads the metadata the browser read from a .rofl file. */
export async function POST(request: Request) {
	const user = await sessionUser();
	if (!user) return NextResponse.json({ message: "Bitte mit Discord anmelden." }, { status: 401 });
	const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Die Replay-Daten sind unvollständig." }, { status: 400 });

	const context = await getMatchControlContext();
	const match = context.matches.find((entry) => entry.id === parsed.data.matchId);
	if (!match) return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	if (!match.teamAName || !match.teamBName) return NextResponse.json({ message: "Dieses Match hat noch keine zwei Teams." }, { status: 409 });
	const captainTeam = context.teams.find((team) => team.captainRef?.discordId === user.discordId && (team.name === match.teamAName || team.name === match.teamBName));
	if (!captainTeam && !user.owner) return NextResponse.json({ message: "Nur die Captains dieses Matches können eine Replay hochladen." }, { status: 403 });
	if (match.status === "Finished") return NextResponse.json({ message: "Dieses Match ist bereits abgeschlossen." }, { status: 409 });

	// The server re-runs every check itself; the browser's reading of the file is only input.
	const summary = parsed.data.summary as ReplaySummary;
	const rosters = await rostersFor(match.teamAName, match.teamBName);
	const evaluation = evaluateReplay({
		replay: summary,
		teamA: rosters.teamA,
		teamB: rosters.teamB,
		blueSide: match.blueSide,
		draft: { teamA: match.teamAChampions ?? [], teamB: match.teamBChampions ?? [] },
		previousGames: match.games.map((game) => ({ teamA: game.teamAChampions ?? [], teamB: game.teamBChampions ?? [] })),
	});
	if (evaluation.verdict === "reject") {
		return NextResponse.json({ message: evaluation.problems[0] ?? "Diese Replay gehört nicht zu diesem Match.", evaluation }, { status: 422 });
	}

	const fileGame = gameIdFromReplayFileName(parsed.data.fileName);
	try {
		const replay = await createReplay({
			matchId: match.id,
			gameNumber: match.games.length + 1,
			uploadedBy: user.discordId,
			uploaderLabel: captainTeam ? `${user.label} · ${captainTeam.name}` : user.label,
			fileName: parsed.data.fileName,
			...(fileGame ? { gameId: fileGame.gameId, platform: fileGame.platform } : {}),
			sha256: parsed.data.sha256,
			fingerprint: replayFingerprint(summary),
			summary,
			evaluation,
		});
		await writeAuditLog({
			action: "match.replay_uploaded",
			targetType: "match",
			targetId: match.id,
			summary: `Replay für ${match.teamAName} vs ${match.teamBName} (Spiel ${replay.gameNumber}) hochgeladen: ${evaluation.verdict === "ok" ? "passt" : "zur Prüfung"}.`,
			actorDiscordId: user.discordId,
			actorLabel: user.label,
			metadata: { replayId: replay.id, verdict: evaluation.verdict, problems: evaluation.problems, gameId: replay.gameId },
		});
		return NextResponse.json({ replay: { id: replay.id, gameNumber: replay.gameNumber, status: replay.status }, evaluation });
	} catch (error) {
		if (error instanceof DuplicateReplayError) return NextResponse.json({ message: error.message }, { status: 409 });
		throw error;
	}
}

/** Staff mark an upload as applied (after saving the result) or rejected. */
export async function PATCH(request: Request) {
	const user = await sessionUser();
	if (!user?.owner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Daten." }, { status: 400 });
	const replay = await setReplayStatus(parsed.data.id, parsed.data.status, user.label);
	if (!replay) return NextResponse.json({ message: "Replay nicht gefunden oder bereits geprüft." }, { status: 409 });
	await writeAuditLog({
		action: parsed.data.status === "applied" ? "match.replay_applied" : "match.replay_rejected",
		targetType: "match",
		targetId: replay.matchId,
		summary: `Replay für Spiel ${replay.gameNumber} ${parsed.data.status === "applied" ? "übernommen" : "abgelehnt"}.`,
		actorDiscordId: user.discordId,
		actorLabel: user.label,
		metadata: { replayId: replay.id },
	});
	return NextResponse.json({ replay });
}
