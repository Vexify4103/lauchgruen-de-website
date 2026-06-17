import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setDiscordNickname } from "@/lib/discord";
import { getDb } from "@/lib/mongo";
import { TOURNAMENT_OWNER_DISCORD_IDS, listApplications } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredPlayer = {
	riotId: string;
	discordId?: string;
};

type StoredTeam = {
	players?: StoredPlayer[];
};

type BotStateDoc = {
	_id: string;
	teams?: Record<string, StoredTeam>;
};

export async function POST() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const db = await getDb();
	const [botDoc, applications] = await Promise.all([db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" }), listApplications()]);
	const applicationByDiscordId = new Map(applications.map((application) => [application.discordId, application]));
	const players = Object.values(botDoc?.teams ?? {}).flatMap((team) => (team.players ?? []).filter((player) => player.discordId));

	const stats = {
		renamed: 0,
		failed: 0,
		skipped: 0,
	};
	const warnings: string[] = [];

	for (const player of players) {
		if (!player.discordId) {
			stats.skipped += 1;
			continue;
		}
		const application = applicationByDiscordId.get(player.discordId);
		const result = await setDiscordNickname({
			discordId: player.discordId,
			displayName: application?.displayName ?? "",
			riotId: player.riotId,
		});
		if (result.ok) {
			stats.renamed += 1;
		} else {
			stats.failed += 1;
			warnings.push(`${player.riotId}: ${result.message}`);
		}
	}

	return NextResponse.json({
		ok: true,
		...stats,
		warnings,
	});
}
