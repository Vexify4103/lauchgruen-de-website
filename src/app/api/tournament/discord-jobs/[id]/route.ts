import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDiscordJob } from "@/lib/discord-job-queue";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const { id } = await params;
	const job = await getDiscordJob(id);
	if (!job) {
		return NextResponse.json({ message: "Job nicht gefunden." }, { status: 404 });
	}

	return NextResponse.json({ job });
}
