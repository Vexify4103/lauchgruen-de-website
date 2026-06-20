import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { getMatchControlContext } from "@/lib/match-control";
import { getTournamentContext } from "@/lib/tournament-runtime";
import {
	createMatchReport,
	getFeedbackDashboard,
	listMatchReports,
	listTournamentArchives,
	listTournamentTemplates,
	archiveAzTournamentAndPrepareUltimateBravery,
	updateFeedbackDashboard,
	upsertCaptainCheckIn,
	upsertTournamentArchive,
	upsertTournamentTemplate,
} from "@/lib/tournament-next";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("check-in"), matchId: z.string().min(1), rosterConfirmed: z.literal(true), rulesConfirmed: z.literal(true) }),
	z.object({
		action: z.literal("report"),
		matchId: z.string().min(1),
		declaredWinner: z.boolean(),
		gameDuration: z.string().trim().max(12).optional(),
		screenshotUrl: z.string().url().optional().or(z.literal("")),
		note: z.string().trim().max(1200).optional(),
	}),
	z.object({
		action: z.literal("template"),
		name: z.string().trim().min(2).max(80),
		game: z.string().trim().min(2).max(40),
		format: z.string().trim().min(2).max(120),
		teamCount: z.coerce.number().int().min(2).max(64),
		groupCount: z.coerce.number().int().min(0).max(16),
		doubleRoundRobin: z.boolean(),
		draftMode: z.enum(["tournament", "none"]),
		poolMode: z.enum(["az", "none"]),
		notes: z.string().trim().max(2000),
	}),
	z.object({
		action: z.literal("archive-current"),
		title: z.string().trim().min(2).max(100),
		season: z.string().trim().min(2).max(100),
		dateLabel: z.string().trim().min(2).max(100),
		format: z.string().trim().min(2).max(200),
		championTeam: z.string().trim().min(2).max(100).optional(),
		finalistTeam: z.string().trim().min(2).max(100).optional(),
		note: z.string().trim().max(2000).optional(),
		vodUrl: z.string().url().optional().or(z.literal("")),
		highlightUrl: z.string().url().optional().or(z.literal("")),
	}),
	z.object({
		action: z.literal("archive-and-transition"),
		confirmation: z.literal("ARCHIVIEREN"),
		championTeam: z.string().trim().min(2).max(100),
		finalistTeam: z.string().trim().min(2).max(100).optional(),
		note: z.string().trim().max(2000).optional(),
		vodUrl: z.string().url().optional().or(z.literal("")),
		highlightUrl: z.string().url().optional().or(z.literal("")),
	}),
	z.object({
		action: z.literal("feedback"),
		formUrl: z.string().url(),
		responses: z.coerce.number().int().min(0).max(100000),
		overallRating: z.coerce.number().min(0).max(10).optional(),
		balanceRating: z.coerce.number().min(0).max(10).optional(),
		draftRating: z.coerce.number().min(0).max(10).optional(),
		websiteRating: z.coerce.number().min(0).max(10).optional(),
		organisationRating: z.coerce.number().min(0).max(10).optional(),
		highlights: z.string().trim().max(2000).optional(),
		actions: z.string().trim().max(2000).optional(),
	}),
]);

function isOwner(discordId: string | undefined) {
	return Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const resource = url.searchParams.get("resource");
	if (resource === "archives") return NextResponse.json({ archives: await listTournamentArchives() });
	if (resource === "feedback") {
		const session = await auth();
		if (!isOwner(session?.user?.discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
		return NextResponse.json({ feedback: await getFeedbackDashboard() });
	}
	if (resource === "reports") {
		const session = await auth();
		if (!isOwner(session?.user?.discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
		return NextResponse.json({ reports: await listMatchReports(url.searchParams.get("matchId") ?? undefined) });
	}
	const session = await auth();
	if (!isOwner(session?.user?.discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	if (resource === "templates") return NextResponse.json({ templates: await listTournamentTemplates() });
	return NextResponse.json({ message: "Unbekannte Ressource." }, { status: 400 });
}

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) return NextResponse.json({ message: "Bitte mit Discord anmelden." }, { status: 401 });
	const body = await request.json().catch(() => null);
	const parsed = actionSchema.safeParse(body);
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Daten." }, { status: 400 });
	const action = parsed.data;
	const ctx = await getMatchControlContext();

	if (action.action === "check-in" || action.action === "report") {
		const match = ctx.matches.find((entry) => entry.id === action.matchId);
		if (!match) return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
		const team = ctx.teams.find((entry) => entry.captainRef?.discordId === discordId && (entry.name === match.teamAName || entry.name === match.teamBName));
		if (!team && !isOwner(discordId)) return NextResponse.json({ message: "Nur der Captain dieses Matches darf das ausführen." }, { status: 403 });
		const teamName = team?.name ?? match.teamAName ?? "Orga";
		if (action.action === "check-in") {
			const checkIn = await upsertCaptainCheckIn({ matchId: match.id, teamName, captainDiscordId: discordId, rosterConfirmed: true, rulesConfirmed: true, checkedAt: new Date().toISOString() });
			return NextResponse.json({ checkIn });
		}
		const report = await createMatchReport({
			matchId: match.id,
			teamName,
			captainDiscordId: discordId,
			declaredWinner: action.declaredWinner,
			gameDuration: action.gameDuration || undefined,
			screenshotUrl: action.screenshotUrl || undefined,
			note: action.note || undefined,
		});
		return NextResponse.json({ report });
	}

	if (!isOwner(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	if (action.action === "template") {
		const { action: _action, ...template } = action;
		void _action;
		return NextResponse.json({ template: await upsertTournamentTemplate({ ...template, createdBy: session.user.discordHandle ?? discordId }) });
	}
	if (action.action === "feedback") {
		const { action: _action, ...feedback } = action;
		void _action;
		return NextResponse.json({ feedback: await updateFeedbackDashboard({ ...feedback, updatedBy: session.user.discordHandle ?? discordId }) });
	}
	if (action.action === "archive-and-transition") {
		try {
			const result = await archiveAzTournamentAndPrepareUltimateBravery({
				championTeam: action.championTeam,
				finalistTeam: action.finalistTeam || undefined,
				note: action.note || undefined,
				vodUrl: action.vodUrl || undefined,
				highlightUrl: action.highlightUrl || undefined,
				createdBy: session.user.discordHandle ?? discordId,
			});
			return NextResponse.json(result);
		} catch (error) {
			return NextResponse.json({ message: error instanceof Error ? error.message : "Archivierung fehlgeschlagen." }, { status: 409 });
		}
	}

	const runtime = await getTournamentContext();
	const resolved = resolvePlayoffMatches(ctx.stored, ctx.teams, runtime.groupMatches);
	const final = resolved.find((match) => match.id === "gf" && match.winner) ?? resolved.find((match) => match.winner && match.round === "Grand Final");
	const championTeam = action.championTeam || final?.winner;
	if (!championTeam) return NextResponse.json({ message: "Bitte wähle den Gewinner aus oder speichere zuerst das Grand-Final-Ergebnis." }, { status: 409 });
	const champion = ctx.teams.find((team) => team.name === championTeam);
	const derivedFinalist = final?.teamAName === championTeam ? final.teamBName : final?.teamAName;
	const archive = await upsertTournamentArchive({
		id: "az-2026",
		title: action.title,
		season: action.season,
		dateLabel: action.dateLabel,
		format: action.format,
		championTeam,
		finalistTeam: action.finalistTeam || derivedFinalist || undefined,
		championRoster: champion?.players.map((player) => player.riotId) ?? [],
		note: action.note || undefined,
		vodUrl: action.vodUrl || undefined,
		highlightUrl: action.highlightUrl || undefined,
		createdBy: session.user.discordHandle ?? discordId,
	});
	return NextResponse.json({ archive });
}
