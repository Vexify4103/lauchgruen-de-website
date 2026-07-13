import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { listDiscordJobs, retryFailedDiscordJob } from "@/lib/discord-job-queue";
import { writeAuditLog } from "@/lib/tournament-audit";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const retrySchema = z.object({ jobId: z.string().uuid() });

async function ownerSession() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	return discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId) ? { session, discordId } : null;
}

export async function GET() {
	const owner = await ownerSession();
	if (!owner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	return NextResponse.json({ jobs: await listDiscordJobs(10) });
}

export async function POST(request: Request) {
	const owner = await ownerSession();
	if (!owner) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = retrySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültiger Discord-Job." }, { status: 400 });
	const job = await retryFailedDiscordJob(parsed.data.jobId, owner.session.user.discordHandle ?? owner.discordId);
	if (!job) return NextResponse.json({ message: "Der Job hat keine wiederholbaren Fehler." }, { status: 409 });
	await writeAuditLog({
		action: "discord.job.retry",
		targetType: "discord_job",
		targetId: parsed.data.jobId,
		summary: `Failed Discord operations retried as ${job.id}.`,
		actorDiscordId: owner.discordId,
		actorLabel: owner.session.user.discordHandle ?? owner.discordId,
		metadata: { retryJobId: job.id, operations: job.total },
	});
	return NextResponse.json({ job });
}
