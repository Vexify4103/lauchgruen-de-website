import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { clearTestApplicants, clearTestTeams, seedTestApplicants, seedTestTeams } from "@/lib/test-data";

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

	const body = (await request.json().catch(() => null)) as { count?: number } | null;
	const count = Math.max(1, Math.min(80, body?.count ?? 40));
	const [appsInserted, teamsResult] = await Promise.all([seedTestApplicants(count), seedTestTeams()]);

	return NextResponse.json({
		ok: true,
		applicants: appsInserted,
		teamsInserted: teamsResult.inserted,
		teamsSkipped: teamsResult.skipped,
		teamsAlreadyFull: teamsResult.alreadyFull,
	});
}

export async function DELETE() {
	const owner = await requireOwner();
	if (!owner.ok) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const [apps, teams] = await Promise.all([clearTestApplicants(), clearTestTeams()]);

	return NextResponse.json({
		ok: true,
		applications: apps.applications,
		verified: apps.verified,
		teamsRemoved: teams.teamsRemoved,
		playersStripped: teams.playersStripped,
		teamKeysRemoved: teams.teamKeysRemoved,
	});
}
