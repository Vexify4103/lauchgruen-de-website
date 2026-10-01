import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { parseGameDuration } from "@/lib/match-duration";
import { getMatchControlContext } from "@/lib/match-control";
import { writeAuditLog } from "@/lib/tournament-audit";
import { resetDraftState } from "@/lib/tournament-draft";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { usesUltimateBravery } from "@/lib/tournament-kind";
import { automaticBlueSide, canRecordAnotherGame, seriesScore, seriesWinnerSide, type SeriesGame } from "@/lib/tournament-series";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS, upsertMatch } from "@/lib/tournament-storage";
import { clearSwissPairingWinner, getSwissStageState, setSwissPairingWinner } from "@/lib/tournament-swiss";
import { archiveUltimateBraveryGameRolls } from "@/lib/ultimate-bravery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("record"),
		id: z.string().min(1),
		expectedVersion: z.number().int().min(0),
		winner: z.enum(["teamA", "teamB"]),
		gameDuration: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().optional()),
	}),
	z.object({ action: z.literal("undo"), id: z.string().min(1), expectedVersion: z.number().int().min(0) }),
]);

/**
 * Records one game of a Bo3/Bo5 series. Until the series is decided the next game is prepared right away:
 * champ select and Ultimate Bravery rolls start fresh and the side rule picks the next blue side.
 */
export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Spieldaten." }, { status: 400 });
	const actor = session.user.discordHandle ?? discordId;

	const [control, settings] = await Promise.all([getMatchControlContext(), getTournamentSettings()]);
	const match = control.matches.find((entry) => entry.id === parsed.data.id);
	if (!match) return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	if (!match.teamAName || !match.teamBName) return NextResponse.json({ message: "Dieses Match hat noch keine zwei Teams." }, { status: 409 });
	if (match.bestOf < 2) return NextResponse.json({ message: "Einzelspiele werden direkt über das Ergebnis gespeichert." }, { status: 409 });

	const swissFormat = settings.ultimateBravery.dayOneFormat === "swiss" || settings.ultimateBravery.dayOneFormat === "swiss-elimination";
	const swiss = swissFormat ? await getSwissStageState(settings.activeTournament.id) : null;
	const swissPairing = swiss?.rounds.flatMap((round) => round.pairings).find((pairing) => pairing.id === match.id && !pairing.bye);
	const swissLocked = Boolean(swissPairing && swissPairing.round < (swiss?.rounds.at(-1)?.round ?? 0));
	const now = new Date().toISOString();

	if (parsed.data.action === "record") {
		if (match.status === "Finished" || !canRecordAnotherGame(match.games, match.bestOf)) {
			return NextResponse.json({ message: "Diese Serie ist bereits entschieden." }, { status: 409 });
		}
		const durationSeconds = parsed.data.gameDuration === undefined ? undefined : parseGameDuration(parsed.data.gameDuration);
		if (durationSeconds === null) return NextResponse.json({ message: "Die Spielzeit muss im Format mm:ss eingetragen werden." }, { status: 400 });
		const game: SeriesGame = {
			number: match.games.length + 1,
			winner: parsed.data.winner,
			...(durationSeconds !== undefined ? { durationSeconds } : {}),
			teamAChampions: match.teamAChampions ?? [],
			teamBChampions: match.teamBChampions ?? [],
			blueSide: match.blueSide,
			recordedAt: now,
			recordedBy: actor,
		};
		const games = [...match.games, game];
		const { scoreA, scoreB } = seriesScore(games);
		const decided = seriesWinnerSide(scoreA, scoreB, match.bestOf);
		if (decided && swissLocked && swissPairing?.winnerTeamKey && swissPairing.winnerTeamKey !== (decided === "teamA" ? swissPairing.teamAKey : swissPairing.teamBKey)) {
			return NextResponse.json({ message: "Die nächste Swiss-Runde wurde bereits ausgelost; dieses Ergebnis würde sie ungültig machen." }, { status: 409 });
		}

		const versionClaim = await claimAdminVersion({ resource: `match:${match.id}`, expectedVersion: parsed.data.expectedVersion, updatedBy: actor });
		if (!versionClaim.ok) return NextResponse.json(versionClaim.conflict, { status: 409 });

		const totalDuration = games.every((entry) => entry.durationSeconds !== undefined) ? games.reduce((total, entry) => total + (entry.durationSeconds ?? 0), 0) : undefined;
		if (decided) {
			await upsertMatch(match.id, {
				id: match.id,
				teamAName: match.teamAName,
				teamBName: match.teamBName,
				games,
				scoreA,
				scoreB,
				gameDurationSeconds: totalDuration,
				status: "Finished",
				winner: decided === "teamA" ? match.teamAName : match.teamBName,
				updatedAt: now,
			});
			if (swissPairing) await setSwissPairingWinner(settings.activeTournament.id, swissPairing.id, decided === "teamA" ? swissPairing.teamAKey : swissPairing.teamBKey!);
		} else {
			const nextBlue = automaticBlueSide({ rule: settings.ultimateBravery.sideSelection, games }) ?? match.blueSide;
			await upsertMatch(match.id, {
				id: match.id,
				teamAName: match.teamAName,
				teamBName: match.teamBName,
				games,
				scoreA,
				scoreB,
				gameDurationSeconds: undefined,
				teamAChampions: undefined,
				teamBChampions: undefined,
				blueSide: nextBlue,
				status: "Pending",
				updatedAt: now,
			});
			await resetDraftState({ matchId: match.id, resetBy: actor, reason: `Spiel ${game.number + 1} der Serie` });
			if (usesUltimateBravery(settings.activeTournament)) await archiveUltimateBraveryGameRolls(match.id, game.number);
		}
		const winnerName = parsed.data.winner === "teamA" ? match.teamAName : match.teamBName;
		await writeAuditLog({
			action: "match.game_recorded",
			targetType: "match",
			targetId: match.id,
			summary: `Spiel ${game.number} (Bo${match.bestOf}) an ${winnerName}; Serie ${scoreA}:${scoreB}${decided ? " – entschieden" : ""}.`,
			actorDiscordId: discordId,
			actorLabel: actor,
			metadata: { game, scoreA, scoreB, decided },
		});
		await writeTournamentEvent({
			type: decided ? "match.finished" : "match.game_recorded",
			targetType: "match",
			targetId: match.id,
			createdBy: actor,
			payload: { game: game.number, scoreA, scoreB, winner: winnerName },
		});
		return NextResponse.json({ ok: true, games, scoreA, scoreB, decided: Boolean(decided), version: versionClaim.version });
	}

	// Undo the last recorded game.
	const last = match.games.at(-1);
	if (!last) return NextResponse.json({ message: "Es wurde noch kein Spiel erfasst." }, { status: 409 });
	if (match.winner && swissLocked) {
		return NextResponse.json({ message: "Die nächste Swiss-Runde wurde bereits ausgelost; dieses Ergebnis kann nicht mehr zurückgenommen werden." }, { status: 409 });
	}
	const dependent = match.winner
		? control.matches.find(
				(entry) =>
					entry.id !== match.id &&
					(entry.teamAName === match.winner || entry.teamBName === match.winner) &&
					(entry.sources?.teamA === match.id || entry.sources?.teamB === match.id) &&
					entry.status !== "Scheduled" &&
					entry.status !== "Locked"
			)
		: undefined;
	if (dependent) return NextResponse.json({ message: `${dependent.round} läuft bereits mit dem Sieger dieser Serie.` }, { status: 409 });

	const versionClaim = await claimAdminVersion({ resource: `match:${match.id}`, expectedVersion: parsed.data.expectedVersion, updatedBy: actor });
	if (!versionClaim.ok) return NextResponse.json(versionClaim.conflict, { status: 409 });
	const games = match.games.slice(0, -1);
	const { scoreA, scoreB } = seriesScore(games);
	await upsertMatch(match.id, {
		id: match.id,
		games,
		scoreA: games.length ? scoreA : undefined,
		scoreB: games.length ? scoreB : undefined,
		gameDurationSeconds: undefined,
		teamAChampions: last.teamAChampions,
		teamBChampions: last.teamBChampions,
		blueSide: last.blueSide ?? match.blueSide,
		status: "Live",
		winner: undefined,
		updatedAt: now,
	});
	if (swissPairing && match.winner) await clearSwissPairingWinner(settings.activeTournament.id, swissPairing.id);
	await writeAuditLog({
		action: "match.game_undone",
		targetType: "match",
		targetId: match.id,
		summary: `Spiel ${last.number} wurde zurückgenommen; Serie wieder ${scoreA}:${scoreB}.`,
		actorDiscordId: discordId,
		actorLabel: actor,
		metadata: { removed: last },
	});
	return NextResponse.json({ ok: true, games, scoreA, scoreB, decided: false, version: versionClaim.version });
}
