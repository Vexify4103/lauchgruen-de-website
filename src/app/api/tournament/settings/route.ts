import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { getTournamentSettings, updateTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_MODES } from "@/lib/tournament-mode";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
	expectedVersion: z.number().int().min(0),
	applicationsOpen: z.boolean().optional(),
	applicationOpenAt: z.iso.datetime({ offset: true }).nullable().optional(),
	applicationDeadlineOverride: z.boolean().optional(),
	applicationDeadline: z.iso.datetime({ offset: true }).optional(),
	tournamentLive: z.boolean().optional(),
	draftEnabled: z.boolean().optional(),
	tournamentMode: z.enum(TOURNAMENT_MODES).optional(),
	ultimateBravery: z
		.object({
			startAt: z.iso.datetime({ offset: true }).nullable(),
			dayTwoStartAt: z.iso.datetime({ offset: true }).nullable(),
			teamCount: z.number().int().min(2).max(32),
			playersPerTeam: z.number().int().min(5).max(10),
			dayOneFormat: z.enum(["undecided", "groups", "swiss"]),
			groupCount: z.number().int().min(1).max(16),
			groupRoundRobinLegs: z.union([z.literal(1), z.literal(2)]),
			swissRounds: z.number().int().min(1).max(10),
			advanceTeamCount: z.number().int().min(2).max(32),
			format: z.enum(["undecided", "double-elimination", "single-elimination"]),
			minimumSummonerLevel: z.number().int().min(1).max(1000),
			rerollsPerPlayer: z.number().int().min(0).max(5),
			prizePool: z.string().trim().min(1).max(4000),
		})
		.optional(),
});

export async function GET() {
	return NextResponse.json({ settings: await getTournamentSettings() });
}

export async function PATCH(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Settings." }, { status: 400 });
	}
	if (parsed.data.ultimateBravery) {
		const config = parsed.data.ultimateBravery;
		if (config.groupCount > config.teamCount || config.advanceTeamCount > config.teamCount) {
			return NextResponse.json({ message: "Gruppen und Playoff-Teams dürfen die Gesamtzahl der Teams nicht überschreiten." }, { status: 400 });
		}
	}

	const versionClaim = await claimAdminVersion({
		resource: "settings",
		expectedVersion: parsed.data.expectedVersion,
		updatedBy: session.user.discordHandle ?? discordId,
	});
	if (!versionClaim.ok) {
		return NextResponse.json(versionClaim.conflict, { status: 409 });
	}

	const currentSettings = await getTournamentSettings();
	const settings = await updateTournamentSettings({
		patch: {
			activeTournament: parsed.data.tournamentMode ? { ...currentSettings.activeTournament, mode: parsed.data.tournamentMode } : undefined,
			applicationsOpen: parsed.data.applicationsOpen,
			applicationOpenAt: parsed.data.applicationOpenAt,
			applicationDeadlineOverride: parsed.data.applicationDeadlineOverride,
			applicationDeadline: parsed.data.applicationDeadline,
			tournamentLive: parsed.data.tournamentLive,
			draftEnabled: parsed.data.draftEnabled,
			ultimateBravery: parsed.data.ultimateBravery,
		},
		updatedBy: session.user.discordHandle ?? discordId,
	});
	await writeAuditLog({
		action: "settings.update",
		targetType: "settings",
		targetId: "default",
		summary: "Tournament settings updated.",
		actorDiscordId: discordId,
		actorLabel: session.user.discordHandle ?? discordId,
		metadata: {
			applicationsOpen: parsed.data.applicationsOpen,
			applicationOpenAt: parsed.data.applicationOpenAt,
			applicationDeadlineOverride: parsed.data.applicationDeadlineOverride,
			applicationDeadline: parsed.data.applicationDeadline,
			tournamentLive: parsed.data.tournamentLive,
			draftEnabled: parsed.data.draftEnabled,
			tournamentMode: parsed.data.tournamentMode,
			ultimateBravery: parsed.data.ultimateBravery,
		},
	});
	await writeTournamentEvent({
		type: "settings.updated",
		targetType: "settings",
		targetId: "default",
		createdBy: session.user.discordHandle ?? discordId,
		payload: {
			applicationsOpen: parsed.data.applicationsOpen,
			applicationOpenAt: parsed.data.applicationOpenAt,
			applicationDeadlineOverride: parsed.data.applicationDeadlineOverride,
			applicationDeadline: parsed.data.applicationDeadline,
			tournamentLive: parsed.data.tournamentLive,
			draftEnabled: parsed.data.draftEnabled,
			tournamentMode: parsed.data.tournamentMode,
			ultimateBravery: parsed.data.ultimateBravery,
		},
	});

	return NextResponse.json({ settings, version: versionClaim.version });
}
