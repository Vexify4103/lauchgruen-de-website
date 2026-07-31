import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { clearTestApplicants, seedTestApplicants, startTestRosterMode, stopTestRosterMode } from "@/lib/test-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireOwner() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	return {
		ok: Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)),
		session,
		discordId,
	};
}

export async function POST(request: Request) {
	const owner = await requireOwner();
	if (!owner.ok) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const body = (await request.json().catch(() => null)) as { count?: number; confirmation?: string } | null;
	if (body?.confirmation !== "TESTDATEN ANLEGEN") {
		return NextResponse.json({ message: "Bestätigung für das Anlegen der Testdaten fehlt." }, { status: 400 });
	}
	const count = 40;
	const [appsInserted, rosterResult] = await Promise.all([seedTestApplicants(count), startTestRosterMode()]);

	return NextResponse.json({
		ok: true,
		applicants: appsInserted,
		teamsInserted: rosterResult.teamsInserted,
		playersInserted: rosterResult.playersInserted,
		originalTeamsSaved: rosterResult.originalTeamsSaved,
		alreadyActive: rosterResult.alreadyActive,
	});
}

export async function DELETE(request: Request) {
	const owner = await requireOwner();
	if (!owner.ok) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}
	const body = (await request.json().catch(() => null)) as { confirmation?: string } | null;
	if (body?.confirmation !== "TESTDATEN LÖSCHEN") {
		return NextResponse.json({ message: "Bestätigung für das Löschen der Testdaten fehlt." }, { status: 400 });
	}

	const [apps, teams] = await Promise.all([clearTestApplicants(), stopTestRosterMode()]);

	return NextResponse.json({
		ok: true,
		applications: apps.applications,
		verified: apps.verified,
		teamsRemoved: teams.teamsRemoved,
		playersStripped: teams.playersStripped,
		teamKeysRemoved: teams.teamKeysRemoved,
		restored: teams.restored,
		restoredTeams: teams.restoredTeams,
	});
}
