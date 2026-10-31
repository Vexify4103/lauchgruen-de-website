"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
			message: "Nickname-Job wird gestartet…",
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
				message: `Nickname-Prüfung gestartet: ${result.queued ?? 0} Person(en) in der Queue. Übersprungen: ${result.skipped ?? 0}.`,
			});
			return;
		}

		setJob(null);
		setState({
			status: "success",
			message: `Alle Nicknames sind bereits korrekt. Übersprungen: ${result?.skipped ?? 0}.`,
		});
	}

	const [pendingReset, setPendingReset] = useState<true | null>(null);

	async function resetNicknames() {
		setState({
			status: "loading",
			message: "Nickname-Reset-Job wird gestartet…",
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
			<ConfirmDialog
				open={Boolean(pendingReset)}
				tone="danger"
				title="Alle Turnier-Nicknames entfernen?"
				description="Die Discord-Nicknames aller Roster-Spieler werden zurückgesetzt. Mit „Nicknames prüfen & reparieren“ lassen sie sich neu setzen."
				confirmLabel="Nicknames entfernen"
				cancelLabel="Abbrechen"
				onConfirm={() => {
					setPendingReset(null);
					void resetNicknames();
				}}
				onCancel={() => setPendingReset(null)}
			/>
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={syncNicknames}
					disabled={busy}
					className="rounded-[12px] border border-[var(--line)] bg-[var(--admin-step)] px-4 py-3 text-xs font-semibold text-[var(--amber)] transition hover:border-[color-mix(in_srgb,var(--amber)_35%,transparent)] hover:text-[var(--amber)] disabled:opacity-60"
				>
					{busy ? "Prüfung läuft…" : "Nicknames prüfen & reparieren"}
				</button>
				<button
					type="button"
					onClick={() => setPendingReset(true)}
					disabled={busy}
					className="rounded-[12px] border border-[var(--line)] bg-[var(--admin-step)] px-4 py-3 text-xs font-semibold text-[var(--text)] transition hover:border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:text-[var(--danger)] disabled:opacity-60"
				>
					Nicknames entfernen
				</button>
			</div>
			{state.message ? (
				<div
					className={`rounded-xl border px-3 py-2 text-xs ${
						state.status === "success"
							? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]"
							: state.status === "error"
								? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)]"
								: "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] text-[var(--amber)]"
					}`}
				>
					{state.message}
				</div>
			) : null}
			{job ? (
				<div
					className={`rounded-xl border px-3 py-2 text-xs ${
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
		</div>
	);
}
