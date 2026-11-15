import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { TournamentBlacklistEntry } from "@/lib/tournament-storage";

/** Pure helpers for the partner blacklist API (/api/v1). No database access here, so tests can import it directly. */

export const PARTNER_KEY_PREFIX = "lgk_";
export const PARTNER_RATE_LIMIT_PER_MINUTE = 60;
export const PARTNER_MAX_PENDING_REPORTS = 50;

export function generatePartnerApiKey(): { key: string; prefix: string; keyHash: string } {
	const key = `${PARTNER_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
	return { key, prefix: key.slice(0, PARTNER_KEY_PREFIX.length + 6), keyHash: hashPartnerApiKey(key) };
}

export function hashPartnerApiKey(key: string): string {
	return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Reads `Authorization: Bearer <key>`; returns null for anything that cannot be one of our keys. */
export function readBearerKey(header: string | null): string | null {
	const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
	const key = match?.[1];
	if (!key || !key.startsWith(PARTNER_KEY_PREFIX) || key.length < 20 || key.length > 200) return null;
	return key;
}

const discordIdSchema = z
	.string()
	.trim()
	.regex(/^\d{17,20}$/, "discordId muss eine Discord-ID mit 17 bis 20 Ziffern sein.");
const riotIdSchema = z
	.string()
	.trim()
	.regex(/^[^#]{3,16}#[^#\s]{2,5}$/u, "riotId muss das Format Name#TAG haben.")
	.transform((value) => value.toLowerCase());

export const partnerReportSchema = z
	.object({
		discordId: discordIdSchema.optional(),
		riotId: riotIdSchema.optional(),
		reason: z.string().trim().min(10, "reason braucht mindestens 10 Zeichen.").max(1000),
		evidenceUrl: z.string().trim().url("evidenceUrl muss eine gültige URL sein.").max(500).optional(),
	})
	.strict()
	.refine((value) => value.discordId || value.riotId, { message: "discordId oder riotId ist erforderlich." });

export type PartnerReportInput = z.infer<typeof partnerReportSchema>;

export const partnerCheckSchema = z
	.object({ discordId: discordIdSchema.optional(), riotId: riotIdSchema.optional() })
	.refine((value) => value.discordId || value.riotId, { message: "discordId oder riotId ist erforderlich." });

export type PublicBlacklistEntry = {
	riotId: string | null;
	discordId: string | null;
	reason: string;
	since: string;
};

/** Builds the public shape field by field so internal fields (reason, createdBy, …) can never leak. */
export function toPublicBlacklistEntry(entry: TournamentBlacklistEntry): PublicBlacklistEntry {
	return {
		riotId: entry.riotId ?? null,
		discordId: entry.discordId ?? null,
		reason: entry.publicReason?.trim() || "Gesperrt",
		since: entry.createdAt,
	};
}

export type PartnerReportStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export type PartnerReport = {
	id: string;
	keyId: string;
	partnerName: string;
	discordId?: string;
	riotId?: string;
	reason: string;
	evidenceUrl?: string;
	status: PartnerReportStatus;
	createdAt: string;
	reviewedAt?: string;
	reviewedBy?: string;
};

export function toPublicReport(report: PartnerReport) {
	return {
		id: report.id,
		discordId: report.discordId ?? null,
		riotId: report.riotId ?? null,
		reason: report.reason,
		evidenceUrl: report.evidenceUrl ?? null,
		status: report.status,
		createdAt: report.createdAt,
		reviewedAt: report.reviewedAt ?? null,
	};
}

/**
 * Fixed-window limiter per key. In memory is enough: the site runs as one process.
 * Returns the seconds to wait when the key is over the limit, otherwise 0.
 */
export function createRateLimiter(limit = PARTNER_RATE_LIMIT_PER_MINUTE, windowMs = 60_000) {
	const windows = new Map<string, { start: number; count: number }>();
	return function hit(key: string, now = Date.now()): number {
		const current = windows.get(key);
		if (!current || now - current.start >= windowMs) {
			windows.set(key, { start: now, count: 1 });
			if (windows.size > 1000) {
				for (const [id, window] of windows) if (now - window.start >= windowMs) windows.delete(id);
			}
			return 0;
		}
		current.count++;
		return current.count > limit ? Math.ceil((current.start + windowMs - now) / 1000) : 0;
	};
}

/**
 * Accepting a partner report must never wipe an existing ban: keeps the existing
 * reason and sharing, only fills a missing ID and notes the partner.
 */
export function mergeReportIntoEntry(existing: TournamentBlacklistEntry, report: Pick<PartnerReport, "discordId" | "riotId" | "partnerName">): TournamentBlacklistEntry {
	const note = `Partner: ${report.partnerName}`;
	return {
		...existing,
		discordId: existing.discordId ?? report.discordId,
		riotId: existing.riotId ?? report.riotId,
		reason: existing.reason.includes(note) ? existing.reason : `${existing.reason} · ${note}`,
	};
}
