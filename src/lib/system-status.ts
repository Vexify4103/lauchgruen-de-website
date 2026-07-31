import { getCommunityObsDiagnostics } from "@/lib/community-obs";
import { getDiscordQueueDiagnostics } from "@/lib/discord-job-queue";
import { getDb } from "@/lib/mongo";
import { getRiotOverlayDiagnostics } from "@/lib/riot";

export async function getSystemStatus() {
	const startedAt = Date.now();
	let mongo: { ok: boolean; latencyMs: number; message: string };
	try {
		await (await getDb()).command({ ping: 1 });
		mongo = { ok: true, latencyMs: Date.now() - startedAt, message: "MongoDB antwortet." };
	} catch (error) {
		mongo = { ok: false, latencyMs: Date.now() - startedAt, message: error instanceof Error ? error.message : "MongoDB nicht erreichbar." };
	}

	const discord = mongo.ok
		? await getDiscordQueueDiagnostics().catch(() => ({ queued: 0, running: 0, completed: 0, failed: 0, workerLeaseActive: false }))
		: { queued: 0, running: 0, completed: 0, failed: 0, workerLeaseActive: false };

	return {
		checkedAt: new Date().toISOString(),
		mongo,
		discord,
		overlays: getCommunityObsDiagnostics(),
		riot: getRiotOverlayDiagnostics(),
		twitch: {
			configured: Boolean(process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim()),
		},
		discordConfigured: Boolean(process.env.DISCORD_TOKEN?.trim() && process.env.DISCORD_GUILD_ID?.trim()),
	};
}
