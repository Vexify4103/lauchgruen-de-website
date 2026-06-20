import { clearDiscordNickname, setDiscordMemberRole, setDiscordNickname } from "@/lib/discord";
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
	expiresAt?: Date;
};

const COLLECTION = "discord_jobs";
const COMPLETED_JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
const FAILED_JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
let runnerActive = false;
let indexesReady: Promise<void> | null = null;

function publicJob(doc: DiscordJobDoc): DiscordJob {
	const { _id, operations: _operations, ...rest } = doc;
	void _operations;
	return { id: _id, ...rest };
}

async function ensureDiscordJobIndexes() {
	if (!indexesReady) {
		indexesReady = (async () => {
			const db = await getDb();
			const jobs = db.collection<DiscordJobDoc>(COLLECTION);
			await jobs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "discord_jobs_expiry" });

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

export async function enqueueDiscordJob(input: {
	type: string;
	title: string;
	operations: DiscordOperation[];
	actorLabel?: string;
}): Promise<DiscordJob | null> {
	if (input.operations.length === 0) return null;

	const now = new Date().toISOString();
	const doc: DiscordJobDoc = {
		_id: crypto.randomUUID(),
		type: input.type,
		title: input.title,
		status: "queued",
		total: input.operations.length,
		completed: 0,
		failed: 0,
		warnings: [],
		operations: input.operations,
		createdAt: now,
		updatedAt: now,
		actorLabel: input.actorLabel,
	};
	const db = await getDb();
	await ensureDiscordJobIndexes();
	await db.collection<DiscordJobDoc>(COLLECTION).insertOne(doc);
	void startDiscordJobRunner();
	return publicJob(doc);
}

export async function getDiscordJob(id: string): Promise<DiscordJob | null> {
	const db = await getDb();
	const doc = await db.collection<DiscordJobDoc>(COLLECTION).findOne({ _id: id });
	return doc ? publicJob(doc) : null;
}

async function startDiscordJobRunner() {
	if (runnerActive) return;
	runnerActive = true;
	try {
		const db = await getDb();
		await ensureDiscordJobIndexes();
		const staleSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
		await db.collection<DiscordJobDoc>(COLLECTION).updateMany(
			{ status: "running", updatedAt: { $lt: staleSince } },
			{ $set: { status: "queued", current: "Job wird nach Server-Neustart fortgesetzt.", updatedAt: new Date().toISOString() } }
		);
		while (true) {
			const now = new Date().toISOString();
			const job = await db.collection<DiscordJobDoc>(COLLECTION).findOneAndUpdate(
				{ status: "queued" },
				{ $set: { status: "running", updatedAt: now } },
				{ sort: { createdAt: 1 }, returnDocument: "after" }
			);
			if (!job) return;
			await runDiscordJob(job);
		}
	} finally {
		runnerActive = false;
	}
}

async function runDiscordJob(job: DiscordJobDoc) {
	const db = await getDb();
	let completed = job.completed;
	let failed = job.failed;
	const warnings = [...job.warnings];

	for (const operation of job.operations.slice(job.completed)) {
		const current = operation.label ?? operation.discordId;
		await db.collection<DiscordJobDoc>(COLLECTION).updateOne({ _id: job._id }, { $set: { current, updatedAt: new Date().toISOString() } });

		const result = await runDiscordOperation(operation);
		completed += 1;
		if (!result.ok) {
			failed += 1;
			warnings.push(`${current}: ${result.message}`);
		}

		await db.collection<DiscordJobDoc>(COLLECTION).updateOne(
			{ _id: job._id },
			{
				$set: {
					completed,
					failed,
					warnings: warnings.slice(-20),
					updatedAt: new Date().toISOString(),
				},
			}
		);
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

	const result = await clearDiscordNickname(operation.discordId);
	return result.ok ? { ok: true } : result;
}
