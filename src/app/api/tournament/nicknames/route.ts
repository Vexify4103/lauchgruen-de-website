import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enqueueDiscordJob, type DiscordOperation } from "@/lib/discord-job-queue";
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

	let skipped = 0;
	const operations: DiscordOperation[] = [];

	for (const player of players) {
		if (!player.discordId) {
			skipped += 1;
			continue;
		}
		const application = applicationByDiscordId.get(player.discordId);
		operations.push({
			kind: "nickname-set",
			discordId: player.discordId,
			displayName: application?.displayName ?? "",
			riotId: player.riotId,
			label: `${player.riotId}: Nickname setzen`,
		});
	}
	const job = await enqueueDiscordJob({
		type: "nickname-sync",
		title: "Turnier-Nicknames setzen",
		operations,
		actorLabel: session.user.discordHandle ?? discordId,
	});

	return NextResponse.json({
		ok: true,
		queued: operations.length,
		skipped,
		discordJobId: job?.id,
	});
}

export async function DELETE() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const db = await getDb();
	const botDoc = await db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" });
	const players = Object.values(botDoc?.teams ?? {}).flatMap((team) => (team.players ?? []).filter((player) => player.discordId));
	const uniqueDiscordIds = [...new Set(players.map((player) => player.discordId).filter((id): id is string => Boolean(id)))];

	const operations: DiscordOperation[] = uniqueDiscordIds.map((targetDiscordId) => ({
		kind: "nickname-clear",
		discordId: targetDiscordId,
		label: `${targetDiscordId}: Nickname entfernen`,
	}));
	const job = await enqueueDiscordJob({
		type: "nickname-clear",
		title: "Turnier-Nicknames entfernen",
		operations,
		actorLabel: session.user.discordHandle ?? discordId,
	});

	return NextResponse.json({
		ok: true,
		queued: operations.length,
		discordJobId: job?.id,
	});
}
