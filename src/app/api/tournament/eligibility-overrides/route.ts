import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/tournament-audit";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS, deleteEligibilityOverride, listEligibilityOverrides, upsertEligibilityOverride } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z
	.object({
		discordId: z.string().trim().min(1).optional(),
		riotId: z.string().trim().min(3).optional(),
		kind: z.enum(["regular", "exception"]),
		note: z.string().trim().min(3).max(500),
		bypassMinimumSummonerLevel: z.literal(true),
		expectedVersion: z.number().int().min(0),
	})
	.refine((value) => value.discordId || value.riotId, {
		message: "Discord-ID oder Riot-ID erforderlich.",
	});

async function requireOwner() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return null;
	return session;
}

export async function GET() {
	if (!(await requireOwner())) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}
	const settings = await getTournamentSettings();
	return NextResponse.json({
		entries: await listEligibilityOverrides(),
		activeTournamentId: settings.activeTournament.id,
		activeTournamentName: settings.activeTournament.name,
	});
}

export async function POST(request: Request) {
	const session = await requireOwner();
	if (!session) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const parsed = postSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ message: "Bitte gib eine Identität, eine Kategorie und einen nachvollziehbaren Grund an." }, { status: 400 });
	}

	const versionClaim = await claimAdminVersion({
		resource: "eligibility-overrides",
		expectedVersion: parsed.data.expectedVersion,
		updatedBy: session.user.discordHandle ?? session.user.discordId,
	});
	if (!versionClaim.ok) {
		return NextResponse.json(versionClaim.conflict, { status: 409 });
	}

	const settings = await getTournamentSettings();
	const entry = await upsertEligibilityOverride({
		discordId: parsed.data.discordId,
		riotId: parsed.data.riotId,
		kind: parsed.data.kind,
		tournamentId: settings.activeTournament.id,
		requirements: ["minimum-summoner-level"],
		note: parsed.data.note,
		createdBy: session.user.discordHandle ?? session.user.discordId,
	});

	await writeAuditLog({
		action: "eligibility-override.upsert",
		targetType: "eligibility-override",
		targetId: entry.id,
		summary: `${entry.kind === "regular" ? "Dauergast" : "Ausnahme"} freigegeben: ${entry.discordId ?? entry.riotId}.`,
		actorDiscordId: session.user.discordId,
		actorLabel: session.user.discordHandle ?? session.user.discordId,
		metadata: {
			kind: entry.kind,
			tournamentId: entry.tournamentId,
			requirements: entry.requirements,
		},
	});

	return NextResponse.json({ entry, version: versionClaim.version });
}

export async function DELETE(request: Request) {
	const session = await requireOwner();
	if (!session) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const searchParams = new URL(request.url).searchParams;
	const id = searchParams.get("id")?.trim();
	const expectedVersion = Number(searchParams.get("expectedVersion"));
	if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
		return NextResponse.json({ message: "Freigabe-ID fehlt." }, { status: 400 });
	}

	const versionClaim = await claimAdminVersion({
		resource: "eligibility-overrides",
		expectedVersion,
		updatedBy: session.user.discordHandle ?? session.user.discordId,
	});
	if (!versionClaim.ok) {
		return NextResponse.json(versionClaim.conflict, { status: 409 });
	}

	await deleteEligibilityOverride(id);
	await writeAuditLog({
		action: "eligibility-override.delete",
		targetType: "eligibility-override",
		targetId: id,
		summary: `Teilnahme-Freigabe entfernt: ${id}.`,
		actorDiscordId: session.user.discordId,
		actorLabel: session.user.discordHandle ?? session.user.discordId,
	});
	return NextResponse.json({ ok: true, version: versionClaim.version });
}
