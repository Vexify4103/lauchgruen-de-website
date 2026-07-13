import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { drawNextSwissMatchup, getSwissStageState, listSwissTeams, resetSwissStage, setSwissPairingWinner } from "@/lib/tournament-swiss";
import { buildSwissTestTeams, SWISS_TEST_ID } from "@/lib/tournament-swiss-test";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { writeAuditLog } from "@/lib/tournament-audit";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
	action: z.enum(["draw", "reset", "result"]),
	confirmation: z.string().optional(),
	test: z.boolean().optional(),
	pairingId: z.string().optional(),
	winnerTeamKey: z.string().optional(),
});
export async function GET(request: Request) {
	const test = new URL(request.url).searchParams.get("test") === "1";
	if (test) {
		const session = await auth();
		const discordId = session?.user?.discordId;
		if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
		const settings = await getTournamentSettings();
		const teams = buildSwissTestTeams(settings.ultimateBravery.teamCount, await listSwissTeams());
		return NextResponse.json({ state: await getSwissStageState(SWISS_TEST_ID), teams, configuredRounds: settings.ultimateBravery.swissRounds, enabled: true, test: true });
	}
	const settings = await getTournamentSettings();
	const [state, teams] = await Promise.all([getSwissStageState(settings.activeTournament.id), listSwissTeams()]);
	return NextResponse.json({ state, teams, configuredRounds: settings.ultimateBravery.swissRounds, enabled: settings.ultimateBravery.dayOneFormat === "swiss" });
}

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = actionSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Swiss-Aktion." }, { status: 400 });
	const settings = await getTournamentSettings();
	const test = parsed.data.test === true;
	if (!test && settings.ultimateBravery.dayOneFormat !== "swiss") return NextResponse.json({ message: "Swiss ist aktuell nicht als Tag-1-Format ausgewählt." }, { status: 409 });
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

	try {
		const result = await drawNextSwissMatchup({
			tournamentId,
			maximumRounds: settings.ultimateBravery.swissRounds,
			drawnBy: session.user.discordHandle ?? discordId,
			teams: testTeams,
			matchPrefix,
			persistMatches: !test,
			pairByRecord: true,
			requireCompletedRound: true,
			syncMatchResults: !test,
		});
		if (!test)
			await writeAuditLog({
				action: "swiss.matchup_revealed",
				targetType: "match",
				targetId: result.pairing.id,
				summary: `Swiss-Paarung ${result.pairing.teamAName} vs ${result.pairing.teamBName ?? "Freilos"} in Runde ${result.round.round} enthüllt.`,
				actorDiscordId: discordId,
				actorLabel: session.user.discordHandle ?? discordId,
				metadata: { pairing: result.pairing, roundComplete: result.round.complete },
			});
		return NextResponse.json({ ok: true, ...result });
	} catch (error) {
		return NextResponse.json({ message: error instanceof Error ? error.message : "Swiss-Runde konnte nicht ausgelost werden." }, { status: 409 });
	}
}
