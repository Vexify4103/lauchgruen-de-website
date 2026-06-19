"use client";

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
	synced: "border-lime-200/20 bg-lime-200/10 text-lime-50",
	"missing-role": "border-amber-200/22 bg-amber-200/10 text-amber-50",
	"missing-member": "border-red-300/22 bg-red-500/10 text-red-100",
	"missing-config": "border-amber-200/22 bg-amber-200/10 text-amber-50",
	error: "border-red-300/22 bg-red-500/10 text-red-100",
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
		<section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Discord Sync</div>
					<h2 className="mt-2 text-2xl font-black text-emerald-50">Captain-Rollen</h2>
					<p className="mt-2 text-sm leading-6 text-emerald-100/58">Zeigt sofort, ob ein Captain seine Discord-Rolle hat oder ob der Bot gerade nicht reparieren kann.</p>
				</div>
				<button
					type="button"
					disabled={isPending || jobRunning}
					onClick={repair}
					className="rounded-2xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 shadow-xl shadow-lime-300/20 disabled:opacity-50"
				>
					{jobRunning ? "Queue läuft..." : "Rollen reparieren"}
				</button>
			</div>
			{job ? (
				<div
					className={`mt-4 rounded-2xl border px-4 py-3 text-xs ${
						job.status === "failed"
							? "border-red-300/30 bg-red-500/10 text-red-100"
							: job.status === "completed"
								? "border-lime-200/24 bg-lime-200/10 text-lime-50"
								: "border-cyan-200/24 bg-cyan-300/[0.08] text-cyan-50"
					}`}
				>
					<span className="font-black">{job.title}</span>
					<span className="ml-2 tabular-nums">
						{job.completed}/{job.total || "?"}
					</span>
					{job.current ? <span className="ml-2 text-white/60">{job.current}</span> : null}
				</div>
			) : null}
			<div className="mt-4 rounded-2xl border border-white/10 bg-black/18 px-4 py-3 text-sm font-black text-lime-100">
				{isLoading ? "Captain-Rollen werden geprüft..." : `${synced}/${roleStatuses.length} Captain-Rollen synced`}
			</div>
			<div className="mt-4 grid gap-2 md:grid-cols-2">
				{roleStatuses.map((entry) => (
					<div key={`${entry.teamName}-${entry.discordId}`} className={`rounded-2xl border p-3 ${tone[entry.status]}`}>
						<div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">{entry.teamName}</div>
						<div className="mt-1 text-sm font-black">{entry.captainLabel}</div>
						<div className="mt-1 text-xs opacity-70">{entry.message}</div>
					</div>
				))}
				{isLoading && roleStatuses.length === 0
					? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-black/18" />)
					: null}
			</div>
			{message ? <div className="mt-4 rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">{message}</div> : null}
		</section>
	);
}
