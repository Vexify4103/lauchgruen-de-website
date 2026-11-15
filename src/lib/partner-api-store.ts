import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongo";
import { PARTNER_MAX_PENDING_REPORTS, generatePartnerApiKey, hashPartnerApiKey, mergeReportIntoEntry, type PartnerReport, type PartnerReportInput } from "@/lib/partner-api";
import { addBlacklistEntry, findBlacklistMatch, replaceBlacklistEntry, type TournamentBlacklistEntry } from "@/lib/tournament-storage";

const KEYS = "tournament_api_keys";
const REPORTS = "tournament_blacklist_reports";
const LAST_USED_WRITE_MS = 60_000;

export type PartnerApiKey = {
	id: string;
	partnerName: string;
	prefix: string;
	createdAt: string;
	createdBy?: string;
	lastUsedAt?: string;
	revokedAt?: string;
};

type KeyDoc = PartnerApiKey & { _id: string; keyHash: string };
type ReportDoc = PartnerReport & { _id: string };

let indexesReady: Promise<unknown> | null = null;

async function collections() {
	const db = await getDb();
	const keys = db.collection<KeyDoc>(KEYS);
	const reports = db.collection<ReportDoc>(REPORTS);
	indexesReady ??= Promise.all([
		keys.createIndex({ keyHash: 1 }, { unique: true }),
		reports.createIndex({ keyId: 1, createdAt: -1 }),
		reports.createIndex({ status: 1, createdAt: -1 }),
	]).catch((error) => {
		indexesReady = null;
		throw error;
	});
	await indexesReady;
	return { keys, reports };
}

function publicKey(doc: KeyDoc): PartnerApiKey {
	return {
		id: doc.id,
		partnerName: doc.partnerName,
		prefix: doc.prefix,
		createdAt: doc.createdAt,
		createdBy: doc.createdBy,
		lastUsedAt: doc.lastUsedAt,
		revokedAt: doc.revokedAt,
	};
}

function stripReport(doc: ReportDoc): PartnerReport {
	const { _id, ...rest } = doc;
	void _id;
	return rest;
}

export async function listPartnerApiKeys(): Promise<PartnerApiKey[]> {
	const { keys } = await collections();
	return (await keys.find({}, { sort: { createdAt: -1 } }).toArray()).map(publicKey);
}

/** Creates a key; the raw key is returned only here and never stored. */
export async function createPartnerApiKey(input: { partnerName: string; createdBy?: string }): Promise<{ key: string; apiKey: PartnerApiKey }> {
	const { keys } = await collections();
	const generated = generatePartnerApiKey();
	const id = randomUUID();
	const doc: KeyDoc = {
		_id: id,
		id,
		partnerName: input.partnerName.trim(),
		prefix: generated.prefix,
		keyHash: generated.keyHash,
		createdAt: new Date().toISOString(),
		createdBy: input.createdBy,
	};
	await keys.insertOne(doc);
	return { key: generated.key, apiKey: publicKey(doc) };
}

export async function revokePartnerApiKey(id: string): Promise<PartnerApiKey | null> {
	const { keys } = await collections();
	const doc = await keys.findOneAndUpdate({ _id: id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date().toISOString() } }, { returnDocument: "after" });
	return doc ? publicKey(doc) : null;
}

/** Resolves a raw key to its active partner, or null. Updates lastUsedAt at most once a minute. */
export async function verifyPartnerApiKey(rawKey: string): Promise<PartnerApiKey | null> {
	const { keys } = await collections();
	const doc = await keys.findOne({ keyHash: hashPartnerApiKey(rawKey) });
	if (!doc || doc.revokedAt) return null;
	const now = Date.now();
	if (!doc.lastUsedAt || now - Date.parse(doc.lastUsedAt) > LAST_USED_WRITE_MS) {
		await keys.updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date(now).toISOString() } }).catch(() => undefined);
	}
	return publicKey(doc);
}

export type CreateReportResult = { ok: true; report: PartnerReport; duplicate: boolean } | { ok: false; status: 429; message: string };

export async function createPartnerReport(partner: PartnerApiKey, input: PartnerReportInput): Promise<CreateReportResult> {
	const { reports } = await collections();
	const sameplayer: Array<Record<string, string>> = [];
	if (input.discordId) sameplayer.push({ discordId: input.discordId });
	if (input.riotId) sameplayer.push({ riotId: input.riotId });
	const existing = await reports.findOne({ keyId: partner.id, status: "pending", $or: sameplayer });
	if (existing) return { ok: true, report: stripReport(existing), duplicate: true };

	const pending = await reports.countDocuments({ keyId: partner.id, status: "pending" });
	if (pending >= PARTNER_MAX_PENDING_REPORTS) {
		return { ok: false, status: 429, message: `Zu viele offene Meldungen (maximal ${PARTNER_MAX_PENDING_REPORTS}). Bitte wartet, bis wir sie geprüft haben.` };
	}

	const id = randomUUID();
	const report: PartnerReport = {
		id,
		keyId: partner.id,
		partnerName: partner.partnerName,
		...(input.discordId ? { discordId: input.discordId } : {}),
		...(input.riotId ? { riotId: input.riotId } : {}),
		reason: input.reason,
		...(input.evidenceUrl ? { evidenceUrl: input.evidenceUrl } : {}),
		status: "pending",
		createdAt: new Date().toISOString(),
	};
	await reports.insertOne({ _id: id, ...report });
	return { ok: true, report, duplicate: false };
}

export async function listPartnerReports(filter: { keyId?: string; status?: PartnerReport["status"] } = {}, limit = 200): Promise<PartnerReport[]> {
	const { reports } = await collections();
	const query: Record<string, string> = {};
	if (filter.keyId) query.keyId = filter.keyId;
	if (filter.status) query.status = filter.status;
	return (await reports.find(query, { sort: { createdAt: -1 }, limit }).toArray()).map(stripReport);
}

export async function findPartnerReport(id: string): Promise<PartnerReport | null> {
	const { reports } = await collections();
	const doc = await reports.findOne({ _id: id });
	return doc ? stripReport(doc) : null;
}

/** Partner withdraws its own pending report. */
export async function withdrawPartnerReport(keyId: string, id: string): Promise<PartnerReport | null> {
	const { reports } = await collections();
	const doc = await reports.findOneAndUpdate(
		{ _id: id, keyId, status: "pending" },
		{ $set: { status: "withdrawn", reviewedAt: new Date().toISOString() } },
		{ returnDocument: "after" }
	);
	return doc ? stripReport(doc) : null;
}

export type ReviewResult = { ok: true; report: PartnerReport; entry?: TournamentBlacklistEntry; alreadyBanned?: boolean } | { ok: false; status: 404 | 409; message: string };

/**
 * Owner decision on a pending report. Accept bans the player; an existing ban is merged,
 * never replaced, so its internal reason and sharing stay as they are.
 */
export async function reviewPartnerReport(input: {
	id: string;
	accept: boolean;
	reviewedBy: string;
	reason?: string;
	shared?: boolean;
	publicReason?: string;
}): Promise<ReviewResult> {
	const { reports } = await collections();
	// Claim the report first, so a parallel withdraw or second review can never leave a ban behind a 409.
	const reviewed = await reports.findOneAndUpdate(
		{ _id: input.id, status: "pending" },
		{ $set: { status: input.accept ? "accepted" : "rejected", reviewedAt: new Date().toISOString(), reviewedBy: input.reviewedBy } },
		{ returnDocument: "after" }
	);
	if (!reviewed) {
		const exists = await reports.findOne({ _id: input.id }, { projection: { _id: 1 } });
		return exists ? { ok: false, status: 409, message: "Meldung wurde schon bearbeitet." } : { ok: false, status: 404, message: "Meldung nicht gefunden." };
	}
	if (!input.accept) return { ok: true, report: stripReport(reviewed) };

	try {
		const existing = await findBlacklistMatch({ discordId: reviewed.discordId, riotId: reviewed.riotId });
		if (existing) {
			const entry = mergeReportIntoEntry(existing, reviewed);
			await replaceBlacklistEntry(entry);
			return { ok: true, report: stripReport(reviewed), entry, alreadyBanned: true };
		}
		const entry = await addBlacklistEntry({
			discordId: reviewed.discordId,
			riotId: reviewed.riotId,
			reason: `${input.reason?.trim() || reviewed.reason} · Partner: ${reviewed.partnerName}`,
			createdBy: `partner:${reviewed.partnerName} (bestätigt von ${input.reviewedBy})`,
			shared: input.shared,
			publicReason: input.publicReason,
		});
		return { ok: true, report: stripReport(reviewed), entry, alreadyBanned: false };
	} catch (error) {
		// The ban was not written: put the report back so the owner can retry.
		await reports.updateOne({ _id: input.id }, { $set: { status: "pending" }, $unset: { reviewedAt: "", reviewedBy: "" } });
		throw error;
	}
}
