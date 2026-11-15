import { NextResponse } from "next/server";
import { createRateLimiter, readBearerKey } from "@/lib/partner-api";
import { verifyPartnerApiKey, type PartnerApiKey } from "@/lib/partner-api-store";

const hit = createRateLimiter();
// Runs before the key lookup, so requests with wrong keys cannot hammer the database.
const hitByClient = createRateLimiter(120);

function clientAddress(request: Request) {
	return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const NO_STORE = { "Cache-Control": "no-store" };

export function partnerJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
	return NextResponse.json(body, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

export function partnerError(status: number, code: string, message: string, headers?: Record<string, string>) {
	return partnerJson({ error: { code, message } }, { status, headers });
}

/** Checks the Bearer key and the per-key rate limit. Returns the partner or a ready error response. */
export async function authenticatePartner(request: Request): Promise<{ partner: PartnerApiKey } | { response: Response }> {
	const clientRetryAfter = hitByClient(clientAddress(request));
	if (clientRetryAfter > 0) {
		return { response: partnerError(429, "rate_limited", "Zu viele Anfragen. Bitte kurz warten.", { "Retry-After": String(clientRetryAfter) }) };
	}
	const rawKey = readBearerKey(request.headers.get("authorization"));
	if (!rawKey) {
		return { response: partnerError(401, "unauthorized", "API-Key fehlt oder ist ungültig. Header: Authorization: Bearer <key>") };
	}
	const partner = await verifyPartnerApiKey(rawKey);
	if (!partner) return { response: partnerError(401, "unauthorized", "API-Key fehlt oder ist ungültig.") };
	const retryAfter = hit(partner.id);
	if (retryAfter > 0) {
		return { response: partnerError(429, "rate_limited", "Zu viele Anfragen. Bitte kurz warten.", { "Retry-After": String(retryAfter) }) };
	}
	return { partner };
}
