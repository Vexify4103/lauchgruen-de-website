"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TournamentAuditEntry } from "@/lib/tournament-audit";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function AuditLogPanel({ initialEntries }: { initialEntries: TournamentAuditEntry[] }) {
	const router = useRouter();
	const [entries, setEntries] = useState(initialEntries);
	const [message, setMessage] = useState("");
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [bulkDeleting, setBulkDeleting] = useState(false);
	const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function deleteEntry(entry: TournamentAuditEntry) {
		setMessage("");
		setPendingId(entry.id);
		startTransition(async () => {
			const response = await fetch(`/api/tournament/audit/${encodeURIComponent(entry.id)}`, {
				method: "DELETE",
			});
			const json = (await response.json().catch(() => null)) as { deleted?: boolean; message?: string } | null;
			setPendingId(null);
			if (!response.ok || !json?.deleted) {
				setMessage(json?.message ?? "Audit-Eintrag konnte nicht gelöscht werden.");
				return;
			}
			setEntries((current) => current.filter((item) => item.id !== entry.id));
			setMessage("Audit-Eintrag gelöscht.");
			router.refresh();
		});
	}

	function deleteAllEntries() {
		if (entries.length === 0 || bulkDeleting) return;
		setBulkDeleteConfirmOpen(false);
		setMessage("");
		setBulkDeleting(true);
		startTransition(async () => {
			const response = await fetch("/api/tournament/audit", {
				method: "DELETE",
			});
			const json = (await response.json().catch(() => null)) as { deleted?: boolean; deletedCount?: number; message?: string } | null;
			setBulkDeleting(false);
			if (!response.ok || !json?.deleted) {
				setMessage(json?.message ?? "Audit Log konnte nicht gelöscht werden.");
				return;
			}
			setEntries([]);
			setMessage(`Audit Log gelöscht (${json.deletedCount ?? 0} Einträge).`);
			router.refresh();
		});
	}

	return (
		<section className="admin-panel min-w-0" aria-labelledby="audit-title">
			<div className="admin-panel-head">
				<div>
					<span>Audit Log</span>
					<h2 id="audit-title">Letzte Admin-Aktionen</h2>
				</div>
				<div className="admin-panel-actions">
					<span className="font-mono text-[13px] tabular-nums text-[var(--muted)]">{entries.length} Einträge</span>
					<button
						type="button"
						disabled={entries.length === 0 || isPending || bulkDeleting}
						onClick={() => setBulkDeleteConfirmOpen(true)}
						className="button ghost small !text-[var(--danger)]"
					>
						{bulkDeleting ? "Lösche…" : "Alle löschen"}
					</button>
				</div>
			</div>
			{entries.length === 0 ? (
				<p className="attention-clear">Noch keine Aktionen gespeichert</p>
			) : (
				<ul className="m-0 grid max-h-96 min-w-0 list-none gap-2 overflow-y-auto overscroll-contain p-0">
					{entries.map((entry) => (
						<li
							key={entry.id}
							className="grid min-w-0 gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--admin-inset)] px-4 py-3 lg:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_auto] lg:items-center lg:gap-4"
						>
							<div className="min-w-0 break-words text-[13px] text-[var(--muted)]">{formatAction(entry.action)}</div>
							<div className="min-w-0">
								<div className="line-clamp-2 break-words text-sm font-medium leading-5">{entry.summary}</div>
								<div className="mt-1 truncate text-xs text-[var(--muted)]">
									{entry.actorLabel ?? "System"} · {entry.targetType}:{entry.targetId}
								</div>
							</div>
							<div className="flex shrink-0 items-center justify-between gap-4 lg:justify-end">
								<time dateTime={entry.createdAt} className="whitespace-nowrap font-mono text-xs tabular-nums text-[var(--muted)]">
									{new Date(entry.createdAt).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin" })}
								</time>
								<button type="button" disabled={isPending} onClick={() => deleteEntry(entry)} className="button ghost small !text-[var(--danger)]">
									{pendingId === entry.id ? "Löscht…" : "Löschen"}
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
			{message ? (
				<p role="status" className="mt-4 text-sm text-[var(--muted)]">
					{message}
				</p>
			) : null}
			<ConfirmDialog
				open={bulkDeleteConfirmOpen}
				title="Audit Log vollständig löschen?"
				description="Alle gespeicherten Admin-Aktionen werden unwiderruflich entfernt."
				confirmLabel="Alle Einträge löschen"
				cancelLabel="Abbrechen"
				tone="danger"
				onCancel={() => setBulkDeleteConfirmOpen(false)}
				onConfirm={deleteAllEntries}
			/>
		</section>
	);
}

function formatAction(action: string) {
	if (action === "riot_profile.refresh_all") return "Riot-Profile · Sammelabgleich";
	if (action === "riot_profile.refresh_one") return "Riot-Profil · Einzelabgleich";
	const label = action.replaceAll("_", " ").replaceAll(".", " · ");
	return label.charAt(0).toUpperCase() + label.slice(1);
}
