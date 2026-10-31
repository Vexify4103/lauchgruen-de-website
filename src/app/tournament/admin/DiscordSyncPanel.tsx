"use client";

import { LoadingIndicator } from "@/components/LoadingIndicator";

import { useEffect, useState, useTransition } from "react";

export type CaptainRoleStatus = {
	teamName: string;
	captainLabel: string;
	discordId: string;
	status: "missing-config" | "missing-member" | "missing-role" | "synced" | "error";
	message: string;
};

type DiscordJobStatus = {
	id: string;
	title: string;
	status: "queued" | "running" | "completed" | "failed";
	total: number;
	completed: number;
	failed: number;
	current?: string;
	warnings: string[];
};

const tone: Record<CaptainRoleStatus["status"], string> = {
	synced: "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]",
	"missing-role": "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] text-[var(--amber)]",
	"missing-member": "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]",
	"missing-config": "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] text-[var(--amber)]",
	error: "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]",
};

export function DiscordSyncPanel({ statuses }: { statuses: CaptainRoleStatus[] }) {
	const [roleStatuses, setRoleStatuses] = useState(statuses);
	const [message, setMessage] = useState("");
	const [isLoading, setIsLoading] = useState(statuses.length === 0);
	const [isPending, startTransition] = useTransition();
	const [job, setJob] = useState<DiscordJobStatus | null>(null);
	const synced = roleStatuses.filter((entry) => entry.status === "synced").length;
	const jobRunning = job !== null && job.status !== "completed" && job.status !== "failed";

	async function loadStatuses(cancelled: () => boolean) {
		const response = await fetch("/api/tournament/discord-sync");
		const json = (await response.json().catch(() => null)) as { statuses?: CaptainRoleStatus[]; message?: string } | null;
		if (cancelled()) return;
		if (json?.statuses) {
			setRoleStatuses(json.statuses);
			setMessage("");
			return;
		}
		setMessage(json?.message ?? "Captain-Rollen konnten nicht geladen werden.");
	}

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				await loadStatuses(() => cancelled);
			} catch {
				if (!cancelled) setMessage("Captain-Rollen konnten nicht geladen werden.");
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!jobRunning || !job) return;
		let cancelled = false;
		const timer = window.setInterval(async () => {
			const response = await fetch(`/api/tournament/discord-jobs/${job.id}`);
			const json = (await response.json().catch(() => null)) as { job?: DiscordJobStatus } | null;
			if (cancelled || !json?.job) return;
			setJob(json.job);
			if (json.job.status === "completed" || json.job.status === "failed") {
				await loadStatuses(() => cancelled);
				const suffix = json.job.status === "failed" ? ` mit ${json.job.failed} Fehler(n)` : "";
				setMessage(`${json.job.title} abgeschlossen${suffix}: ${json.job.completed}/${json.job.total}.`);
			}
		}, 1200);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [job, jobRunning]);

	function repair() {
		setMessage("");
		startTransition(async () => {
			const response = await fetch("/api/tournament/discord-sync", { method: "POST" });
			const json = (await response.json().catch(() => null)) as {
				message?: string;
				queued?: number;
				discordJobId?: string;
			} | null;
			if (!response.ok) {
				setMessage(json?.message ?? "Discord Sync fehlgeschlagen.");
				return;
			}
			if (json?.discordJobId) {
				setJob({
					id: json.discordJobId,
					title: "Captain-Rollen reparieren",
					status: "queued",
					total: json.queued ?? 0,
					completed: 0,
					failed: 0,
					warnings: [],
				});
				setMessage(`Captain-Rollen Repair gestartet: ${json.queued ?? 0} Aktion(en) in der Queue.`);
				return;
			}
			await loadStatuses(() => false);
			setJob(null);
			setMessage("Alle Captain-Rollen waren bereits synchronisiert.");
		});
	}

	return (
		<section className="rounded-[16px] border border-[var(--line)] bg-[var(--admin-step)] p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="text-xs font-semibold text-[var(--muted)]">Discord Sync</div>
					<h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Captain-Rollen</h2>
					<p className="mt-2 text-sm leading-6 text-[var(--muted)]">Zeigt sofort, ob ein Captain seine Discord-Rolle hat oder ob der Bot gerade nicht reparieren kann.</p>
				</div>
				<button
					type="button"
					disabled={isPending || jobRunning}
					onClick={repair}
					className="rounded-[12px] bg-[var(--accent)] px-5 py-3 text-xs font-semibold text-[var(--on-accent)] disabled:opacity-50"
				>
					{jobRunning ? "Queue läuft…" : "Rollen reparieren"}
				</button>
			</div>
			{job ? (
				<div
					className={`mt-4 rounded-[12px] border px-4 py-3 text-xs ${
						job.status === "failed"
							? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]"
							: job.status === "completed"
								? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]"
								: "border-[var(--line)] bg-[var(--admin-step)] text-[var(--text)]"
					}`}
				>
					<span className="font-semibold">{job.title}</span>
					<span className="ml-2 tabular-nums">
						{job.completed}/{job.total || "?"}
					</span>
					{job.current ? <span className="ml-2 text-[var(--muted)]">{job.current}</span> : null}
				</div>
			) : null}
			<div className="mt-4 rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] px-4 py-3 text-sm font-semibold text-[var(--accent)]">
				{isLoading ? <LoadingIndicator compact label="Captain-Rollen werden geprüft…" state="connecting" /> : `${synced}/${roleStatuses.length} Captain-Rollen synced`}
			</div>
			<div className="mt-4 grid gap-2 md:grid-cols-2">
				{roleStatuses.map((entry) => (
					<div key={`${entry.teamName}-${entry.discordId}`} className={`rounded-[12px] border p-3 ${tone[entry.status]}`}>
						<div className="text-xs font-semibold opacity-70">{entry.teamName}</div>
						<div className="mt-1 text-sm font-semibold">{entry.captainLabel}</div>
						<div className="mt-1 text-xs opacity-70">{entry.message}</div>
					</div>
				))}
				{isLoading && roleStatuses.length === 0
					? Array.from({ length: 4 }).map((_, index) => (
							<div key={index} aria-hidden="true" className="h-20 motion-safe:animate-pulse rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)]" />
						))
					: null}
			</div>
			{message ? (
				<div role="status" className="mt-4 rounded-[12px] border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-3 text-sm font-medium text-[var(--accent)]">
					{message}
				</div>
			) : null}
		</section>
	);
}
