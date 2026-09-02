import {
	clearDiscordNickname,
	sendDiscordChannelMessage,
	sendDiscordDirectMessage,
	setDiscordMemberRole,
	setDiscordNickname,
	type DiscordDirectMessagePayload,
	type DiscordMessagePayload,
} from "@/lib/discord";
import { deleteDiscordTeamResources, provisionDiscordTeamResources, renameDiscordTeamResources } from "@/lib/discord-team-resources";
import { getDb } from "@/lib/mongo";

export type DiscordOperation =
	| {
			kind: "role";
			discordId: string;
			roleId: string;
			enabled: boolean;
			label?: string;
	  }
	| {
			kind: "nickname-set";
			discordId: string;
			displayName: string;
			riotId: string;
			label?: string;
	  }
	| {
			kind: "nickname-clear";
			discordId: string;
			label?: string;
	  }
	| {
			kind: "direct-message";
			discordId: string;
			message?: string;
			payload?: DiscordDirectMessagePayload;
			dedupeKey: string;
			label?: string;
	  }
	| {
			kind: "channel-message";
			channelId: string;
			roleId?: string;
			message?: string;
			payload?: DiscordMessagePayload;
			dedupeKey: string;
			label?: string;
	  }
	| {
			kind: "team-provision";
			teamKey: string;
			name: string;
			label?: string;
	  }
	| {
			kind: "team-rename";
			teamKey: string;
			name: string;
			roleId?: string;
			voiceChannelId?: string;
			textChannelId?: string;
			label?: string;
	  }
	| {
			kind: "team-delete";
			teamKey: string;
			roleId?: string;
			voiceChannelId?: string;
			textChannelId?: string;
			label?: string;
	  };

export type DiscordJob = {
	id: string;
	type: string;
	title: string;
	status: "queued" | "running" | "completed" | "failed";
	total: number;
	completed: number;
	failed: number;
	current?: string;
	warnings: string[];
	createdAt: string;
	updatedAt: string;
	finishedAt?: string;
	actorLabel?: string;
};

type DiscordJobDoc = Omit<DiscordJob, "id"> & {
	_id: string;
	operations: DiscordOperation[];
	failedOperations?: DiscordOperation[];
	expiresAt?: Date;
};

const COLLECTION = "discord_jobs";
const RECEIPT_COLLECTION = "discord_operation_receipts";
const COMPLETED_JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
const FAILED_JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MESSAGE_RECEIPT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const LOCK_COLLECTION = "discord_job_locks";
const LOCK_ID = "runner";
const LOCK_LEASE_MS = 2 * 60 * 1000;
let runnerActive = false;
let indexesReady: Promise<void> | null = null;

function publicJob(doc: DiscordJobDoc): DiscordJob {
	const { _id, operations: _operations, failedOperations: _failedOperations, ...rest } = doc;
	void _operations;
	void _failedOperations;
	return { id: _id, ...rest };
}

async function ensureDiscordJobIndexes() {
	if (!indexesReady) {
		indexesReady = (async () => {
			const db = await getDb();
			const jobs = db.collection<DiscordJobDoc>(COLLECTION);
			await jobs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "discord_jobs_expiry" });
			await db.collection(RECEIPT_COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "discord_operation_receipts_expiry" });

			// Remove completed jobs created before expiry dates were introduced.
			const now = Date.now();
			await jobs.deleteMany({
				$or: [
					{ status: "completed", finishedAt: { $lt: new Date(now - COMPLETED_JOB_RETENTION_MS).toISOString() } },
					{ status: "failed", finishedAt: { $lt: new Date(now - FAILED_JOB_RETENTION_MS).toISOString() } },
				],
			});
		})();
	}
	return indexesReady;
}

export async function enqueueDiscordJob(input: { type: string; title: string; operations: DiscordOperation[]; actorLabel?: string }): Promise<DiscordJob | null> {
	const operations = coalesceOperations(input.operations);
	if (operations.length === 0) return null;

	const now = new Date().toISOString();
	const doc: DiscordJobDoc = {
		_id: crypto.randomUUID(),
		type: input.type,
		title: input.title,
		status: "queued",
		total: operations.length,
		completed: 0,
		failed: 0,
		warnings: [],
		operations,
		createdAt: now,
		updatedAt: now,
		actorLabel: input.actorLabel,
	};
	const db = await getDb();
	await ensureDiscordJobIndexes();
	await removeSupersededQueuedOperations(db, operations);
	await db.collection<DiscordJobDoc>(COLLECTION).insertOne(doc);
	void startDiscordJobRunner();
	return publicJob(doc);
}

async function removeSupersededQueuedOperations(db: Awaited<ReturnType<typeof getDb>>, incoming: DiscordOperation[]) {
	const replaceableKeys = new Set(
		incoming
			.filter(
				(operation) =>
					operation.kind === "role" ||
					operation.kind === "nickname-set" ||
					operation.kind === "nickname-clear" ||
					operation.kind === "direct-message" ||
					operation.kind === "channel-message"
			)
			.map(operationKey)
	);
	if (replaceableKeys.size === 0) return;
	const collection = db.collection<DiscordJobDoc>(COLLECTION);
	const queued = await collection.find({ status: "queued" }).toArray();
	for (const job of queued) {
		const operations = job.operations.filter((operation) => !replaceableKeys.has(operationKey(operation)));
		if (operations.length === job.operations.length) continue;
		await collection.updateOne(
			{ _id: job._id, status: "queued" },
			{ $set: { operations, total: operations.length, updatedAt: new Date().toISOString(), current: operations.length ? job.current : "Durch neueren Discord-Job ersetzt." } }
		);
	}
}

function operationKey(operation: DiscordOperation) {
	if (operation.kind === "role") return `role:${operation.discordId}:${operation.roleId}`;
	if (operation.kind === "nickname-set" || operation.kind === "nickname-clear") return `nickname:${operation.discordId}`;
	if (operation.kind === "direct-message") return `dm:${operation.dedupeKey}`;
	if (operation.kind === "channel-message") return `channel-message:${operation.dedupeKey}`;
	return `team:${operation.teamKey}`;
}

function operationSubject(operation: DiscordOperation) {
	if ("discordId" in operation) return operation.discordId;
	if (operation.kind === "channel-message") return operation.channelId;
	return operation.teamKey;
}

function coalesceOperations(operations: DiscordOperation[]) {
	const latest = new Map<string, DiscordOperation>();
	for (const operation of operations) latest.set(operationKey(operation), operation);
	return [...latest.values()];
}

export async function getDiscordJob(id: string): Promise<DiscordJob | null> {
	const db = await getDb();
	const doc = await db.collection<DiscordJobDoc>(COLLECTION).findOne({ _id: id });
	return doc ? publicJob(doc) : null;
}

export async function listDiscordJobs(limit = 8): Promise<DiscordJob[]> {
	const db = await getDb();
	await ensureDiscordJobIndexes();
	const docs = await db
		.collection<DiscordJobDoc>(COLLECTION)
		.find({})
		.sort({ createdAt: -1 })
		.limit(Math.max(1, Math.min(limit, 25)))
		.toArray();
	if (docs.some((job) => job.status === "queued")) void startDiscordJobRunner();
	return docs.map(publicJob);
}

export async function getDiscordQueueDiagnostics() {
	const db = await getDb();
	await ensureDiscordJobIndexes();
	const [queued, running, completed, failed, lock] = await Promise.all([
		db.collection<DiscordJobDoc>(COLLECTION).countDocuments({ status: "queued" }),
		db.collection<DiscordJobDoc>(COLLECTION).countDocuments({ status: "running" }),
		db.collection<DiscordJobDoc>(COLLECTION).countDocuments({ status: "completed" }),
		db.collection<DiscordJobDoc>(COLLECTION).countDocuments({ status: "failed" }),
		db.collection<{ _id: string; owner: string; expiresAt: Date }>(LOCK_COLLECTION).findOne({ _id: LOCK_ID }),
	]);
	return {
		queued,
		running,
		completed,
		failed,
		workerLeaseActive: Boolean(lock && lock.expiresAt.getTime() > Date.now()),
	};
}

export async function retryFailedDiscordJob(id: string, actorLabel?: string): Promise<DiscordJob | null> {
	const db = await getDb();
	const source = await db.collection<DiscordJobDoc>(COLLECTION).findOne({ _id: id });
	if (!source || source.status !== "failed" || !source.failedOperations?.length) return null;
	return enqueueDiscordJob({
		type: `${source.type}-retry`,
		title: `${source.title} · Fehler wiederholen`,
		operations: source.failedOperations,
		actorLabel,
	});
}

async function acquireRunnerLease(owner: string) {
	const db = await getDb();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + LOCK_LEASE_MS);
	const locks = db.collection<{ _id: string; owner: string; expiresAt: Date }>(LOCK_COLLECTION);
	const claimed = await locks.updateOne({ _id: LOCK_ID, $or: [{ expiresAt: { $lte: now } }, { owner }] }, { $set: { owner, expiresAt } });
	if (claimed.matchedCount > 0) return true;
	try {
		await locks.insertOne({ _id: LOCK_ID, owner, expiresAt });
		return true;
	} catch {
		return false;
	}
}

async function renewRunnerLease(owner: string) {
	const db = await getDb();
	await db
		.collection<{ _id: string; owner: string; expiresAt: Date }>(LOCK_COLLECTION)
		.updateOne({ _id: LOCK_ID, owner }, { $set: { expiresAt: new Date(Date.now() + LOCK_LEASE_MS) } });
}

async function releaseRunnerLease(owner: string) {
	const db = await getDb();
	await db.collection<{ _id: string; owner: string; expiresAt: Date }>(LOCK_COLLECTION).deleteOne({ _id: LOCK_ID, owner });
}

async function startDiscordJobRunner() {
	if (runnerActive) return;
	runnerActive = true;
	const owner = crypto.randomUUID();
	try {
		if (!(await acquireRunnerLease(owner))) return;
		const db = await getDb();
		await ensureDiscordJobIndexes();
		const staleSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
		await db
			.collection<DiscordJobDoc>(COLLECTION)
			.updateMany(
				{ status: "running", updatedAt: { $lt: staleSince } },
				{ $set: { status: "queued", current: "Job wird nach Server-Neustart fortgesetzt.", updatedAt: new Date().toISOString() } }
			);
		while (true) {
			const now = new Date().toISOString();
			const job = await db
				.collection<DiscordJobDoc>(COLLECTION)
				.findOneAndUpdate({ status: "queued" }, { $set: { status: "running", updatedAt: now } }, { sort: { createdAt: 1 }, returnDocument: "after" });
			if (!job) return;
			await runDiscordJob(job, owner);
		}
	} finally {
		await releaseRunnerLease(owner).catch(() => undefined);
		runnerActive = false;
	}
}

async function runDiscordJob(job: DiscordJobDoc, leaseOwner: string) {
	const db = await getDb();
	let completed = job.completed;
	let failed = job.failed;
	const warnings = [...job.warnings];
	const failedOperations: DiscordOperation[] = [...(job.failedOperations ?? [])];

	for (const operation of job.operations.slice(job.completed)) {
		const current = operation.label ?? operationSubject(operation);
		await db.collection<DiscordJobDoc>(COLLECTION).updateOne({ _id: job._id }, { $set: { current, updatedAt: new Date().toISOString() } });

		const result = await runDiscordOperation(operation);
		completed += 1;
		if (!result.ok) {
			failed += 1;
			warnings.push(`${current}: ${result.message}`);
			failedOperations.push(operation);
		}

		await db.collection<DiscordJobDoc>(COLLECTION).updateOne(
			{ _id: job._id },
			{
				$set: {
					completed,
					failed,
					warnings: warnings.slice(-20),
					failedOperations,
					updatedAt: new Date().toISOString(),
				},
			}
		);
		await renewRunnerLease(leaseOwner);
	}

	const finishedAt = new Date();
	const retentionMs = failed > 0 ? FAILED_JOB_RETENTION_MS : COMPLETED_JOB_RETENTION_MS;
	await db.collection<DiscordJobDoc>(COLLECTION).updateOne(
		{ _id: job._id },
		{
			$set: {
				status: failed > 0 ? "failed" : "completed",
				current: "",
				completed,
				failed,
				warnings: warnings.slice(-20),
				failedOperations,
				updatedAt: new Date().toISOString(),
				finishedAt: finishedAt.toISOString(),
				expiresAt: new Date(finishedAt.getTime() + retentionMs),
			},
		}
	);
}

async function runDiscordOperation(operation: DiscordOperation): Promise<{ ok: true } | { ok: false; message: string }> {
	if (operation.kind === "role") {
		return setDiscordMemberRole({
			discordId: operation.discordId,
			roleId: operation.roleId,
			enabled: operation.enabled,
		});
	}

	if (operation.kind === "nickname-set") {
		const result = await setDiscordNickname({
			discordId: operation.discordId,
			displayName: operation.displayName,
			riotId: operation.riotId,
		});
		return result.ok ? { ok: true } : result;
	}

	if (operation.kind === "nickname-clear") {
		const result = await clearDiscordNickname(operation.discordId);
		return result.ok ? { ok: true } : result;
	}
	if (operation.kind === "direct-message") return sendDiscordDirectMessage(operation);
	if (operation.kind === "channel-message") {
		const db = await getDb();
		const receiptId = `channel-message:${operation.dedupeKey}`;
		const receipts = db.collection<{ _id: string; sentAt: string; expiresAt: Date }>(RECEIPT_COLLECTION);
		if (await receipts.findOne({ _id: receiptId })) return { ok: true };
		const result = await sendDiscordChannelMessage(operation);
		if (result.ok) {
			const sentAt = new Date();
			await receipts.updateOne(
				{ _id: receiptId },
				{ $set: { sentAt: sentAt.toISOString(), expiresAt: new Date(sentAt.getTime() + MESSAGE_RECEIPT_RETENTION_MS) } },
				{ upsert: true }
			);
		}
		return result;
	}
	if (operation.kind === "team-provision") return provisionDiscordTeamResources(operation.teamKey, operation.name);
	if (operation.kind === "team-rename") return renameDiscordTeamResources(operation);
	return deleteDiscordTeamResources(operation);
}
