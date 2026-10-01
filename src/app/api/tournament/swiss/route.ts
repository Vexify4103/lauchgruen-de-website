import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
	drawNextSwissMatchup,
	getSwissStageState,
	listSwissAudit,
	listSwissTeams,
	resetLatestSwissRound,
	resetSwissStage,
	setSwissPairingWinner,
	SwissCrossRecordError,
} from "@/lib/tournament-swiss";
import { buildSwissTestTeams, SWISS_TEST_ID } from "@/lib/tournament-swiss-test";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { writeAuditLog } from "@/lib/tournament-audit";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { PLAY_IN_GROUP, getTournamentContext } from "@/lib/tournament-runtime";
import { mainEventTeamCount } from "@/lib/tournament-structure";
import type { TournamentSettings } from "@/lib/tournament-settings";

const isSwissFormat = (format: TournamentSettings["ultimateBravery"]["dayOneFormat"]) => format === "swiss" || format === "swiss-elimination";

/** Day-1 Swiss teams: play-in losers and teams still waiting in the play-in are left out. */
async function swissParticipants() {
	const ctx = await getTournamentContext();
	const teams = ctx.teams.filter((team) => team.group !== PLAY_IN_GROUP && team.storageKey);
	return {
		teams: teams.map((team) => ({ key: team.storageKey!, name: team.name })),
		seededOrder: [...teams].sort((a, b) => a.seed - b.seed).map((team) => team.storageKey!),
		seedListComplete: ctx.groupSetupComplete,
	};
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
	action: z.enum(["draw", "redraw", "reset", "result"]),
	confirmation: z.string().optional(),
	test: z.boolean().optional(),
	pairingId: z.string().optional(),
	winnerTeamKey: z.string().optional(),
	allowCrossRecord: z.boolean().optional(),
});
export async function GET(request: Request) {
	const searchParams = new URL(request.url).searchParams;
	const test = searchParams.get("test") === "1";
	if (searchParams.get("audit") === "1") {
		const session = await auth();
		const discordId = session?.user?.discordId;
		if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
		const settings = await getTournamentSettings();
		return NextResponse.json({ audit: await listSwissAudit(settings.activeTournament.id, 30) });
	}
	if (test) {
		const session = await auth();
		const discordId = session?.user?.discordId;
		if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
		const settings = await getTournamentSettings();
		const teams = buildSwissTestTeams(settings.ultimateBravery.teamCount, await listSwissTeams());
		return NextResponse.json({ state: await getSwissStageState(SWISS_TEST_ID), teams, configuredRounds: settings.ultimateBravery.swissRounds, enabled: true, test: true });
	}
	const settings = await getTournamentSettings();
	const [state, participants] = await Promise.all([getSwissStageState(settings.activeTournament.id), swissParticipants()]);
	return NextResponse.json({
		state,
		teams: participants.teams,
		configuredRounds: settings.ultimateBravery.swissRounds,
		enabled: isSwissFormat(settings.ultimateBravery.dayOneFormat),
	});
}

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = actionSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Swiss-Aktion." }, { status: 400 });
	const settings = await getTournamentSettings();
	const test = parsed.data.test === true;
	if (!test && !isSwissFormat(settings.ultimateBravery.dayOneFormat))
		return NextResponse.json({ message: "Swiss ist aktuell nicht als Tag-1-Format ausgewählt." }, { status: 409 });
	const tournamentId = test ? SWISS_TEST_ID : settings.activeTournament.id;
	const matchPrefix = test ? SWISS_TEST_ID : "swiss";
	const testTeams = test ? buildSwissTestTeams(settings.ultimateBravery.teamCount, await listSwissTeams()) : undefined;

	if (parsed.data.action === "result") {
		if (!test || !parsed.data.pairingId || !parsed.data.winnerTeamKey) return NextResponse.json({ message: "Ungültiges Testergebnis." }, { status: 400 });
		try {
			return NextResponse.json({ ok: true, state: await setSwissPairingWinner(tournamentId, parsed.data.pairingId, parsed.data.winnerTeamKey) });
		} catch (error) {
			return NextResponse.json({ message: error instanceof Error ? error.message : "Testergebnis konnte nicht gespeichert werden." }, { status: 409 });
		}
	}

	if (parsed.data.action === "reset") {
		if (parsed.data.confirmation !== "SWISS ZURÜCKSETZEN") return NextResponse.json({ message: "Bestätigung stimmt nicht überein." }, { status: 400 });
		await resetSwissStage(tournamentId, matchPrefix);
		if (!test)
			await writeAuditLog({
				action: "swiss.reset",
				targetType: "stage",
				targetId: tournamentId,
				summary: "Swiss-Auslosung zurückgesetzt.",
				actorDiscordId: discordId,
				actorLabel: session.user.discordHandle ?? discordId,
			});
		return NextResponse.json({ ok: true, state: await getSwissStageState(tournamentId) });
	}

	if (parsed.data.action === "redraw") {
		if (parsed.data.confirmation !== "RUNDE NEU AUSLOSEN") return NextResponse.json({ message: "Bestätigung stimmt nicht überein." }, { status: 400 });
		try {
			const state = await resetLatestSwissRound(tournamentId);
			if (!test)
				await writeAuditLog({
					action: "swiss.round_reset",
					targetType: "stage",
					targetId: tournamentId,
					summary: "Aktuelle, noch nicht gestartete Swiss-Runde zur erneuten Auslosung entfernt.",
					actorDiscordId: discordId,
					actorLabel: session.user.discordHandle ?? discordId,
				});
			return NextResponse.json({ ok: true, state });
		} catch (error) {
			return NextResponse.json({ message: error instanceof Error ? error.message : "Aktuelle Runde konnte nicht zurückgesetzt werden." }, { status: 409 });
		}
	}

	const config = settings.ultimateBravery;
	const participants = test ? null : await swissParticipants();
	if (participants && participants.teams.length !== mainEventTeamCount(config)) {
		return NextResponse.json(
			{
				message:
					config.playInTeamCount > 0
						? `Die Swiss Stage startet erst, wenn das Play-in entschieden ist (${participants.teams.length} von ${mainEventTeamCount(config)} Teams stehen fest).`
						: `Für die Swiss Stage sind ${mainEventTeamCount(config)} Teams geplant, angelegt sind ${participants.teams.length}.`,
			},
			{ status: 409 }
		);
	}
	if (participants && config.swissRoundOneSeeding === "seeded" && !participants.seedListComplete) {
		return NextResponse.json({ message: "Runde 1 wird nach Setzliste gepaart. Veröffentliche zuerst die Setzliste im Roster-Builder." }, { status: 409 });
	}
	try {
		const result = await drawNextSwissMatchup({
			tournamentId,
			maximumRounds: config.swissRounds,
			drawnBy: session.user.discordHandle ?? discordId,
			teams: testTeams ?? participants?.teams,
			matchPrefix,
			persistMatches: !test,
			pairByRecord: true,
			placementSwiss: config.dayOneFormat === "swiss" && mainEventTeamCount(config) === 8 && config.advanceTeamCount === 8 && config.swissRounds === 4,
			requireCompletedRound: true,
			syncMatchResults: !test,
			allowCrossRecord: parsed.data.allowCrossRecord === true,
			bestOf: config.bestOf.dayOne,
			eliminationThreshold: config.dayOneFormat === "swiss-elimination" ? config.swissWinsToAdvance : undefined,
			roundOneOrder: participants && config.swissRoundOneSeeding === "seeded" ? participants.seededOrder : undefined,
		});
		if (!test)
			await writeAuditLog({
				action: "swiss.matchup_revealed",
				targetType: "match",
				targetId: result.pairing.id,
				summary: `Swiss-Paarung ${result.pairing.teamAName} vs ${result.pairing.teamBName ?? "Freilos"} in Runde ${result.round.round} enthüllt.`,
				actorDiscordId: discordId,
				actorLabel: session.user.discordHandle ?? discordId,
				metadata: { pairing: result.pairing, roundComplete: result.round.complete, crossRecordApproved: parsed.data.allowCrossRecord === true },
			});
		return NextResponse.json({ ok: true, ...result });
	} catch (error) {
		if (error instanceof SwissCrossRecordError) {
			return NextResponse.json({ code: error.code, message: error.message, round: error.round, crossRecordPairs: error.crossRecordPairs }, { status: 409 });
		}
		return NextResponse.json({ message: error instanceof Error ? error.message : "Swiss-Runde konnte nicht ausgelost werden." }, { status: 409 });
	}
}
