import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAdminVersion } from "@/lib/admin-version";
import { auth } from "@/lib/auth";
import { createPartnerApiKey, listPartnerApiKeys, revokePartnerApiKey } from "@/lib/partner-api-store";
import { writeAuditLog } from "@/lib/tournament-audit";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESOURCE = "partner-api-keys";
const postSchema = z.object({ partnerName: z.string().trim().min(2).max(80), expectedVersion: z.number().int().min(0) });

async function requireOwner() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return null;
	return session;
}

const forbidden = () => NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });

export async function GET() {
	if (!(await requireOwner())) return forbidden();
	return NextResponse.json({ keys: await listPartnerApiKeys() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
	const session = await requireOwner();
	if (!session) return forbidden();
	const parsed = postSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Partnername fehlt (2 bis 80 Zeichen)." }, { status: 400 });
	const actor = session.user.discordHandle ?? session.user.discordId;
	const claim = await claimAdminVersion({ resource: RESOURCE, expectedVersion: parsed.data.expectedVersion, updatedBy: actor });
	if (!claim.ok) return NextResponse.json(claim.conflict, { status: 409 });

	const { key, apiKey } = await createPartnerApiKey({ partnerName: parsed.data.partnerName, createdBy: actor });
	await writeAuditLog({
		action: "partner-api-key.create",
		targetType: "partner-api-key",
		targetId: apiKey.id,
		summary: `API-Key für ${apiKey.partnerName} erstellt (${apiKey.prefix}…)`,
		actorDiscordId: session.user.discordId,
		actorLabel: actor,
	}).catch(() => undefined);
	// The raw key is in this response only; the database stores its hash.
	return NextResponse.json({ key, apiKey, version: claim.version }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
	const session = await requireOwner();
	if (!session) return forbidden();
	const params = new URL(request.url).searchParams;
	const id = params.get("id")?.trim();
	const rawVersion = params.get("expectedVersion");
	const expectedVersion = Number(rawVersion);
	if (!id || !rawVersion || !Number.isInteger(expectedVersion) || expectedVersion < 0) return NextResponse.json({ message: "id fehlt." }, { status: 400 });
	const actor = session.user.discordHandle ?? session.user.discordId;
	const claim = await claimAdminVersion({ resource: RESOURCE, expectedVersion, updatedBy: actor });
	if (!claim.ok) return NextResponse.json(claim.conflict, { status: 409 });

	const apiKey = await revokePartnerApiKey(id);
	if (!apiKey) return NextResponse.json({ message: "Key nicht gefunden oder schon gesperrt.", version: claim.version }, { status: 404 });
	await writeAuditLog({
		action: "partner-api-key.revoke",
		targetType: "partner-api-key",
		targetId: apiKey.id,
		summary: `API-Key für ${apiKey.partnerName} gesperrt (${apiKey.prefix}…)`,
		actorDiscordId: session.user.discordId,
		actorLabel: actor,
	}).catch(() => undefined);
	return NextResponse.json({ apiKey, version: claim.version });
}
