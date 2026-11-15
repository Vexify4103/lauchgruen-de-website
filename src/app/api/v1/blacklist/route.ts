import { authenticatePartner, partnerJson } from "@/lib/partner-api-auth";
import { toPublicBlacklistEntry } from "@/lib/partner-api";
import { listSharedBlacklistEntries } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full current list of shared bans. Partners replace their copy on every sync. */
export async function GET(request: Request) {
	const auth = await authenticatePartner(request);
	if ("response" in auth) return auth.response;
	const entries = (await listSharedBlacklistEntries()).map(toPublicBlacklistEntry);
	return partnerJson({ entries, count: entries.length, generatedAt: new Date().toISOString() });
}
