"use client";

import { useEffect, useState } from "react";

type SyncState = { status: "idle"; message: "" } | { status: "loading"; message: string } | { status: "success"; message: string } | { status: "error"; message: string };

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

export function NicknameSyncButton() {
	const [state, setState] = useState<SyncState>({ status: "idle", message: "" });
	const [job, setJob] = useState<DiscordJobStatus | null>(null);

	useEffect(() => {
		if (!job || job.status === "completed" || job.status === "failed") return;
		let cancelled = false;
		const timer = window.setInterval(async () => {
			const response = await fetch(`/api/tournament/discord-jobs/${job.id}`);
			const json = (await response.json().catch(() => null)) as { job?: DiscordJobStatus } | null;
			if (!cancelled && json?.job) {
				setJob(json.job);
				if (json.job.status === "completed") {
					setState({ status: "success", message: `${json.job.title} abgeschlossen: ${json.job.completed}/${json.job.total}.` });
				}
				if (json.job.status === "failed") {
					setState({
						status: "error",
						message: `${json.job.title} beendet mit ${json.job.failed} Fehler(n). ${json.job.warnings.slice(0, 3).join(" ")}`,
					});
				}
			}
		}, 1200);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [job]);

	async function syncNicknames() {
		setState({
			status: "loading",
			message: "Nickname-Job wird gestartet...",
		});
		const response = await fetch("/api/tournament/nicknames", {
			method: "POST",
		});
		const result = (await response.json().catch(() => null)) as {
			queued?: number;
			skipped?: number;
			discordJobId?: string;
			message?: string;
		} | null;

		if (!response.ok) {
			setState({
				status: "error",
				message: result?.message ?? "Nickname-Sync fehlgeschlagen.",
			});
			return;
		}

		if (result?.discordJobId) {
			setJob({
				id: result.discordJobId,
				title: "Turnier-Nicknames setzen",
				status: "queued",
				total: result.queued ?? 0,
				completed: 0,
				failed: 0,
				warnings: [],
			});
			setState({
				status: "loading",
				message: `Nickname-Job gestartet: ${result.queued ?? 0} Aktion(en) in der Queue. Übersprungen: ${result.skipped ?? 0}.`,
			});
			return;
		}

		setJob(null);
		setState({
			status: "success",
			message: `Keine Nickname-Änderungen nötig. Übersprungen: ${result?.skipped ?? 0}.`,
		});
	}

	async function resetNicknames() {
		setState({
			status: "loading",
			message: "Nickname-Reset-Job wird gestartet...",
		});
		const response = await fetch("/api/tournament/nicknames", {
			method: "DELETE",
		});
		const result = (await response.json().catch(() => null)) as {
			queued?: number;
			discordJobId?: string;
			message?: string;
		} | null;

		if (!response.ok) {
			setState({
				status: "error",
				message: result?.message ?? "Nickname-Reset fehlgeschlagen.",
			});
			return;
		}

		if (result?.discordJobId) {
			setJob({
				id: result.discordJobId,
				title: "Turnier-Nicknames entfernen",
				status: "queued",
				total: result.queued ?? 0,
				completed: 0,
				failed: 0,
				warnings: [],
			});
			setState({
				status: "loading",
				message: `Nickname-Reset gestartet: ${result.queued ?? 0} Aktion(en) in der Queue.`,
			});
			return;
		}

		setJob(null);
		setState({
			status: "success",
			message: "Keine Nicknames mussten entfernt werden.",
		});
	}

	const busy = state.status === "loading" || (job !== null && job.status !== "completed" && job.status !== "failed");

	return (
		<div className="grid gap-2">
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={syncNicknames}
					disabled={busy}
					className="rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-amber-100 transition hover:border-amber-200/50 hover:text-amber-50 disabled:opacity-60"
				>
					{busy ? "Queue läuft..." : "Turnier-Nicknames setzen"}
				</button>
				<button
					type="button"
					onClick={resetNicknames}
					disabled={busy}
					className="rounded-2xl border border-white/14 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-red-300/40 hover:text-red-100 disabled:opacity-60"
				>
					Nicknames entfernen
				</button>
			</div>
			{state.message ? (
				<div
					className={`rounded-xl border px-3 py-2 text-xs ${
						state.status === "success"
							? "border-lime-200/24 bg-lime-200/10 text-lime-50"
							: state.status === "error"
								? "border-red-300/30 bg-red-500/10 text-red-100"
								: "border-amber-200/24 bg-amber-200/10 text-amber-50"
					}`}
				>
					{state.message}
				</div>
			) : null}
			{job ? (
				<div
					className={`rounded-xl border px-3 py-2 text-xs ${
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
		</div>
	);
}
