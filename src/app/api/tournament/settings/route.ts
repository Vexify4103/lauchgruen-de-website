import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { getTournamentSettings, updateTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
	expectedVersion: z.number().int().min(0),
	applicationsOpen: z.boolean().optional(),
	applicationDeadlineOverride: z.boolean().optional(),
	applicationDeadline: z.iso.datetime({ offset: true }).optional(),
	tournamentLive: z.boolean().optional(),
	draftEnabled: z.boolean().optional(),
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
			applicationsOpen: parsed.data.applicationsOpen,
			applicationDeadlineOverride: parsed.data.applicationDeadlineOverride,
			applicationDeadline: parsed.data.applicationDeadline,
			tournamentLive: parsed.data.tournamentLive,
			draftEnabled: parsed.data.draftEnabled,
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
			applicationDeadlineOverride: parsed.data.applicationDeadlineOverride,
			applicationDeadline: parsed.data.applicationDeadline,
			tournamentLive: parsed.data.tournamentLive,
			draftEnabled: parsed.data.draftEnabled,
		},
	});
	await writeTournamentEvent({
		type: "settings.updated",
		targetType: "settings",
		targetId: "default",
		createdBy: session.user.discordHandle ?? discordId,
		payload: {
			applicationsOpen: parsed.data.applicationsOpen,
			applicationDeadlineOverride: parsed.data.applicationDeadlineOverride,
			applicationDeadline: parsed.data.applicationDeadline,
			tournamentLive: parsed.data.tournamentLive,
			draftEnabled: parsed.data.draftEnabled,
		},
	});

	return NextResponse.json({ settings, version: versionClaim.version });
}
