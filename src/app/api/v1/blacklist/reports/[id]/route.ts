import { authenticatePartner, partnerError, partnerJson } from "@/lib/partner-api-auth";
import { toPublicReport } from "@/lib/partner-api";
import { findPartnerReport, withdrawPartnerReport } from "@/lib/partner-api-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const auth = await authenticatePartner(request);
	if ("response" in auth) return auth.response;
	const { id } = await params;
	const report = await findPartnerReport(id);
	if (!report || report.keyId !== auth.partner.id) return partnerError(404, "not_found", "Meldung nicht gefunden.");
	return partnerJson({ report: toPublicReport(report) });
}

/** Withdraws an own report while it is still pending. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const auth = await authenticatePartner(request);
	if ("response" in auth) return auth.response;
	const { id } = await params;
	const report = await withdrawPartnerReport(auth.partner.id, id);
	if (report) return partnerJson({ report: toPublicReport(report) });
	const existing = await findPartnerReport(id);
	if (!existing || existing.keyId !== auth.partner.id) return partnerError(404, "not_found", "Meldung nicht gefunden.");
	return partnerError(409, "already_reviewed", `Meldung ist schon ${existing.status === "withdrawn" ? "zurückgezogen" : "bearbeitet"} und kann nicht mehr zurückgezogen werden.`);
}
