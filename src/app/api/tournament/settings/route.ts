import { NextResponse } from "next/server";
import { applyTournamentInformation, tournamentInformationSchema } from "@/lib/tournament-information";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { getTournamentSettings, updateTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_MODES } from "@/lib/tournament-mode";
import { WISH_GROUP_MODES } from "@/lib/preference-group-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { getMatchControlContext } from "@/lib/match-control";
import { resolveTournamentCompletion } from "@/lib/tournament-completion";
import { DAY_ONE_FORMATS, PLAYOFF_FORMATS, SIDE_SELECTION_RULES, TIEBREAKERS, deriveStructure, reviewStructure } from "@/lib/tournament-structure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bestOfSchema = z.union([z.literal(1), z.literal(3), z.literal(5)]);

const schema = z.object({
	expectedVersion: z.number().int().min(0),
	tournamentInformation: tournamentInformationSchema.optional(),
	applicationsOpen: z.boolean().optional(),
	wishGroupMode: z.enum(WISH_GROUP_MODES).optional(),
	applicationOpenAt: z.iso.datetime({ offset: true }).nullable().optional(),
	applicationDeadlineOverride: z.boolean().optional(),
	applicationDeadline: z.iso.datetime({ offset: true }).optional(),
	tournamentLive: z.boolean().optional(),
	draftEnabled: z.boolean().optional(),
	tournamentMode: z.enum(TOURNAMENT_MODES).optional(),
	fearless: z
		.object({
			lockOpponentChampions: z.boolean(),
			scope: z.enum(["tournament", "series"]).optional().default("tournament"),
			variant: z.enum(["own", "match"]).optional().default("own"),
		})
		.optional(),
	ultimateBravery: z
		.object({
			startAt: z.iso.datetime({ offset: true }).nullable(),
			dayTwoStartAt: z.iso.datetime({ offset: true }).nullable(),
			teamCount: z.number().int().min(2).max(32),
			playersPerTeam: z.number().int().min(5).max(10),
			dayOneFormat: z.enum(DAY_ONE_FORMATS),
			groupCount: z.number().int().min(1).max(16),
			groupRoundRobinLegs: z.union([z.literal(1), z.literal(2)]),
			swissRounds: z.number().int().min(1).max(10),
			swissWinsToAdvance: z.union([z.literal(2), z.literal(3)]),
			swissRoundOneSeeding: z.enum(["random", "seeded"]),
			playInTeamCount: z.number().int().min(0).max(30),
			advanceTeamCount: z.number().int().min(2).max(32),
			format: z.enum(PLAYOFF_FORMATS),
			bestOf: z.object({ dayOne: bestOfSchema, playoffs: bestOfSchema, finals: bestOfSchema }),
			thirdPlaceMatch: z.boolean(),
			grandFinalReset: z.boolean(),
			tiebreakers: z.array(z.enum(TIEBREAKERS)).min(1).max(TIEBREAKERS.length),
			sideSelection: z.enum(SIDE_SELECTION_RULES),
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
		const config = deriveStructure(parsed.data.ultimateBravery);
		if (config.groupCount > config.teamCount || config.advanceTeamCount > config.teamCount) {
			return NextResponse.json({ message: "Gruppen und Playoff-Teams dürfen die Gesamtzahl der Teams nicht überschreiten." }, { status: 400 });
		}
		const review = reviewStructure(config);
		if (review.errors.length) return NextResponse.json({ message: review.errors.join(" ") }, { status: 400 });
		parsed.data.ultimateBravery = config;
	}

	const currentSettings = await getTournamentSettings();
	if (parsed.data.tournamentMode === "finished") {
		const completion = resolveTournamentCompletion((await getMatchControlContext()).matches);
		if (!completion) {
			return NextResponse.json(
				{ message: "Das Turnier kann erst beendet werden, wenn das Finale (oder ein nötiger Bracket Reset) mit einem vollständigen Ergebnis abgeschlossen ist." },
				{ status: 409 }
			);
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

	const settings = await updateTournamentSettings({
		patch: {
			activeTournament:
				parsed.data.tournamentMode || parsed.data.tournamentInformation
					? {
							...(parsed.data.tournamentInformation
								? applyTournamentInformation(currentSettings.activeTournament, parsed.data.tournamentInformation)
								: currentSettings.activeTournament),
							...(parsed.data.tournamentMode ? { mode: parsed.data.tournamentMode } : {}),
						}
					: undefined,
			applicationsOpen: parsed.data.applicationsOpen,
			wishGroupMode: parsed.data.wishGroupMode,
			applicationOpenAt: parsed.data.applicationOpenAt,
			applicationDeadlineOverride: parsed.data.applicationDeadlineOverride,
			applicationDeadline: parsed.data.applicationDeadline,
			tournamentLive: parsed.data.tournamentLive,
			draftEnabled: parsed.data.draftEnabled,
			fearless: parsed.data.fearless,
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
			tournamentInformation: parsed.data.tournamentInformation,
			wishGroupMode: parsed.data.wishGroupMode,
			applicationsOpen: parsed.data.applicationsOpen,
			applicationOpenAt: parsed.data.applicationOpenAt,
			applicationDeadlineOverride: parsed.data.applicationDeadlineOverride,
			applicationDeadline: parsed.data.applicationDeadline,
			tournamentLive: parsed.data.tournamentLive,
			draftEnabled: parsed.data.draftEnabled,
			tournamentMode: parsed.data.tournamentMode,
			fearless: parsed.data.fearless,
			ultimateBravery: parsed.data.ultimateBravery,
		},
	});
	await writeTournamentEvent({
		type: "settings.updated",
		targetType: "settings",
		targetId: "default",
		createdBy: session.user.discordHandle ?? discordId,
		payload: {
			wishGroupMode: parsed.data.wishGroupMode,
			tournamentInformation: parsed.data.tournamentInformation,
			applicationsOpen: parsed.data.applicationsOpen,
			applicationOpenAt: parsed.data.applicationOpenAt,
			applicationDeadlineOverride: parsed.data.applicationDeadlineOverride,
			applicationDeadline: parsed.data.applicationDeadline,
			tournamentLive: parsed.data.tournamentLive,
			draftEnabled: parsed.data.draftEnabled,
			tournamentMode: parsed.data.tournamentMode,
			fearless: parsed.data.fearless,
			ultimateBravery: parsed.data.ultimateBravery,
		},
	});

	return NextResponse.json({ settings, version: versionClaim.version });
}
