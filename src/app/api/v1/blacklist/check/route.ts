import { authenticatePartner, partnerError, partnerJson } from "@/lib/partner-api-auth";
import { partnerCheckSchema, toPublicBlacklistEntry } from "@/lib/partner-api";
import { findBlacklistMatch } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Checks one player. Only shared bans count, so private bans cannot be probed. */
export async function GET(request: Request) {
	const auth = await authenticatePartner(request);
	if ("response" in auth) return auth.response;
	const params = new URL(request.url).searchParams;
	const parsed = partnerCheckSchema.safeParse({
		discordId: params.get("discordId") || undefined,
		riotId: params.get("riotId") || undefined,
	});
	if (!parsed.success) return partnerError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Ungültige Anfrage.");
	const match = await findBlacklistMatch({ ...parsed.data, sharedOnly: true });
	return partnerJson({ banned: Boolean(match), entry: match ? toPublicBlacklistEntry(match) : null });
}
