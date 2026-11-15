import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { listPartnerReports, reviewPartnerReport } from "@/lib/partner-api-store";
import { writeAuditLog } from "@/lib/tournament-audit";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accepting a report changes the blacklist, so the decision shares the blacklist version.
const RESOURCE = "blacklist";
const postSchema = z.object({
	id: z.string().trim().min(1),
	accept: z.boolean(),
	reason: z.string().trim().max(500).optional(),
	shared: z.boolean().optional(),
	publicReason: z.string().trim().max(120).optional(),
	expectedVersion: z.number().int().min(0),
});

async function requireOwner() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return null;
	return session;
}

export async function GET() {
	if (!(await requireOwner())) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	return NextResponse.json({ reports: await listPartnerReports({ status: "pending" }) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
	const session = await requireOwner();
	if (!session) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = postSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Entscheidung." }, { status: 400 });
	const actor = session.user.discordHandle ?? session.user.discordId;
	const claim = await claimAdminVersion({ resource: RESOURCE, expectedVersion: parsed.data.expectedVersion, updatedBy: actor });
	if (!claim.ok) return NextResponse.json(claim.conflict, { status: 409 });

	const { expectedVersion, ...decision } = parsed.data;
	void expectedVersion;
	const result = await reviewPartnerReport({ ...decision, reviewedBy: actor ?? "owner" });
	if (!result.ok) return NextResponse.json({ message: result.message, version: claim.version }, { status: result.status });
	const player = result.report.riotId ?? result.report.discordId;
	await writeAuditLog({
		action: decision.accept ? "partner-report.accept" : "partner-report.reject",
		targetType: "blacklist-report",
		targetId: result.report.id,
		summary: `${decision.accept ? "Angenommen" : "Abgelehnt"}: ${player} (gemeldet von ${result.report.partnerName})`,
		actorDiscordId: session.user.discordId,
		actorLabel: actor,
		metadata: { alreadyBanned: Boolean(result.alreadyBanned) },
	}).catch(() => undefined);
	return NextResponse.json({ report: result.report, entry: result.entry ?? null, alreadyBanned: Boolean(result.alreadyBanned), version: claim.version });
}
