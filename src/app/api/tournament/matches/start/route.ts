import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getMatchControlContext } from "@/lib/match-control";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { poolHistoryScopeForMatchId } from "@/lib/tournament-rules";
import { spinTournamentWheelForMatch } from "@/lib/tournament-wheel";
import { TOURNAMENT_OWNER_DISCORD_IDS, upsertMatch } from "@/lib/tournament-storage";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { enqueueDiscordJob } from "@/lib/discord-job-queue";
import { buildMatchReadyDiscordOperations } from "@/lib/tournament-match-ready";
import { usesFlexibleEngine, usesUltimateBravery } from "@/lib/tournament-kind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
	id: z.string().trim().min(1),
	action: z.enum(["start", "notify"]).optional().default("start"),
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
		return NextResponse.json({ message: "Match-ID fehlt." }, { status: 400 });
	}

	const [ctx, settings] = await Promise.all([getMatchControlContext(), getTournamentSettings()]);
	const match = ctx.matches.find((entry) => entry.id === parsed.data.id);
	if (!match) {
		return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	}
	if (!match.teamAName || !match.teamBName) {
		return NextResponse.json({ message: "Dieses Match hat noch keine zwei Teams." }, { status: 409 });
	}
	if (match.status === "Finished") {
		return NextResponse.json({ message: "Dieses Match ist bereits abgeschlossen." }, { status: 409 });
	}
	// Flexible-engine tournaments release a match (status Pending) and ping both team channels.
	// A-Z matches draw pools instead and stay Scheduled until the captains ready up.
	const releaseFlow = usesFlexibleEngine(settings.activeTournament);
	const ultimateBravery = usesUltimateBravery(settings.activeTournament);
	const releasedWhat = ultimateBravery ? "Rolls" : "Champ Select";
	const matchAlreadyActive = match.status === "Pending" || match.status === "Live";
	const notificationRetry = releaseFlow && (parsed.data.action === "notify" || matchAlreadyActive);
	if (!releaseFlow && parsed.data.action === "notify") {
		return NextResponse.json({ message: "Teamnachrichten sind für A-Z-Turniere nicht verfügbar." }, { status: 409 });
	}
	if (parsed.data.action === "notify" && !matchAlreadyActive) {
		return NextResponse.json(
			{ message: `Gib ${releasedWhat === "Rolls" ? "die Rolls" : "den Champ Select"} zuerst frei, bevor du Teamnachrichten erneut prüfst.` },
			{ status: 409 }
		);
	}
	if (!notificationRetry && match.status !== "Scheduled") {
		return NextResponse.json({ message: "Nur ein geplantes Match kann freigegeben werden." }, { status: 409 });
	}

	let drewPools = false;
	if (!releaseFlow && !match.poolAssignment) {
		await spinTournamentWheelForMatch({
			matchId: match.id,
			teamAName: match.teamAName,
			teamBName: match.teamBName,
			scope: poolHistoryScopeForMatchId(match.id),
			spunBy: session.user.discordHandle ?? discordId,
		});
		drewPools = true;
	}

	const updated = notificationRetry
		? { id: match.id, status: match.status }
		: await upsertMatch(match.id, {
				id: match.id,
				teamAName: match.teamAName,
				teamBName: match.teamBName,
				status: releaseFlow ? "Pending" : "Scheduled",
				updatedAt: new Date().toISOString(),
			});
	const discordWarnings: string[] = [];
	let discordJob = null;
	if (releaseFlow) {
		const teamA = ctx.teams.find((team) => team.name === match.teamAName);
		const teamB = ctx.teams.find((team) => team.name === match.teamBName);
		const dedupeScope = `${settings.activeTournament.id}:${settings.ultimateBravery.startAt ?? "current"}`;
		const notificationPlan =
			teamA && teamB
				? buildMatchReadyDiscordOperations({
						teamA,
						teamB,
						matchId: match.id,
						round: match.round,
						time: match.time,
						dedupeScope,
						flow: ultimateBravery ? "rolls" : "draft",
					})
				: null;
		const operations = notificationPlan?.operations ?? [];
		if (!notificationPlan || notificationPlan.missingTeamCount > 0) {
			const missingTeamCount = notificationPlan?.missingTeamCount ?? 2;
			discordWarnings.push(`${missingTeamCount} Teamnachricht${missingTeamCount === 1 ? "" : "en"} übersprungen: Teamrolle oder Textkanal fehlt.`);
		}
		try {
			discordJob = await enqueueDiscordJob({
				type: "match-ready",
				title: `Champ Select freigegeben: ${match.teamALabel} vs ${match.teamBLabel}`,
				operations,
				actorLabel: session.user.discordHandle ?? discordId,
			});
		} catch (error) {
			console.error("[match-ready] Discord-Teamnachrichten konnten nicht eingereiht werden.", error);
			discordWarnings.push(`Discord-Teamnachrichten konnten nicht eingereiht werden. ${releasedWhat} ist trotzdem freigegeben.`);
		}
	}
	await writeAuditLog({
		action: notificationRetry ? "match.notify" : "match.prepare",
		targetType: "match",
		targetId: match.id,
		summary: notificationRetry
			? "Discord-Teamnachrichten für ein laufendes Match wurden erneut geprüft."
			: releaseFlow
				? `${releasedWhat} wurde für beide Teams freigegeben.`
				: drewPools
					? "Match prepared and pools were drawn."
					: "Match prepared.",
		actorDiscordId: discordId,
		actorLabel: session.user.discordHandle ?? discordId,
		metadata: { drewPools, ultimateBravery, teamAName: match.teamAName, teamBName: match.teamBName, discordNotificationsQueued: discordJob?.total ?? 0, discordWarnings },
	});
	await writeTournamentEvent({
		type: notificationRetry ? "match.notifications.queued" : "match.prepared",
		targetType: "match",
		targetId: match.id,
		createdBy: session.user.discordHandle ?? discordId,
		payload: {
			drewPools,
			ultimateBravery,
			teamAName: match.teamAName,
			teamBName: match.teamBName,
			discordNotificationsQueued: discordJob?.total ?? 0,
		},
	});

	return NextResponse.json({
		match: updated,
		drewPools,
		discordJob,
		discordWarnings,
		message:
			releaseFlow && discordJob
				? `${notificationRetry ? "Teamnachrichten geprüft" : `${releasedWhat} freigegeben`}. ${discordJob.total}/2 Teamnachrichten wurden in die Discord-Queue gestellt.${discordWarnings.length ? ` ${discordWarnings.join(" ")}` : ""}`
				: releaseFlow
					? `${notificationRetry ? "Teamnachrichten geprüft" : `${releasedWhat} freigegeben`}. ${discordWarnings.join(" ")}`
					: undefined,
	});
}
