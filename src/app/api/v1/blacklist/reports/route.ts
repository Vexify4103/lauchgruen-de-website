import { authenticatePartner, partnerError, partnerJson } from "@/lib/partner-api-auth";
import { partnerReportSchema, toPublicReport } from "@/lib/partner-api";
import { createPartnerReport, listPartnerReports } from "@/lib/partner-api-store";
import { writeAuditLog } from "@/lib/tournament-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The calling partner's own reports with their review status. */
export async function GET(request: Request) {
	const auth = await authenticatePartner(request);
	if ("response" in auth) return auth.response;
	const reports = (await listPartnerReports({ keyId: auth.partner.id })).map(toPublicReport);
	return partnerJson({ reports, count: reports.length });
}

/** A partner suggests a ban. It lands in the owner review queue; nothing is banned yet. */
export async function POST(request: Request) {
	const auth = await authenticatePartner(request);
	if ("response" in auth) return auth.response;
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== "object") return partnerError(400, "invalid_json", "Body muss gültiges JSON sein.");
	const parsed = partnerReportSchema.safeParse(body);
	if (!parsed.success) return partnerError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Ungültige Meldung.");

	const result = await createPartnerReport(auth.partner, parsed.data);
	if (!result.ok) return partnerError(result.status, "too_many_pending", result.message);
	if (!result.duplicate) {
		await writeAuditLog({
			action: "partner-report.create",
			targetType: "blacklist-report",
			targetId: result.report.id,
			summary: `${auth.partner.partnerName} meldet ${result.report.riotId ?? result.report.discordId}`,
			actorLabel: `partner:${auth.partner.partnerName}`,
		}).catch(() => undefined);
	}
	return partnerJson({ report: toPublicReport(result.report), duplicate: result.duplicate }, { status: result.duplicate ? 200 : 202 });
}
