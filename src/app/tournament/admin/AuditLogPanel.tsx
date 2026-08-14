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
		<section className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-xl shadow-black/24">
			<div className="p-5">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Audit Log</div>
						<h2 className="mt-2 text-2xl font-black text-emerald-50">Letzte Admin-Aktionen</h2>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<div className="rounded-2xl border border-white/10 bg-black/18 px-4 py-2 text-sm font-black text-emerald-100/48">
							{entries.length} gesamt · 5 gleichzeitig sichtbar
						</div>
						<button
							type="button"
							disabled={entries.length === 0 || isPending || bulkDeleting}
							onClick={() => setBulkDeleteConfirmOpen(true)}
							className="rounded-2xl border border-red-300/18 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-red-100 transition hover:border-red-300/34 disabled:cursor-not-allowed disabled:opacity-45"
						>
							{bulkDeleting ? "Lösche..." : "Alle löschen"}
						</button>
					</div>
				</div>
			</div>
			{entries.length === 0 ? (
				<p className="mx-5 mb-5 rounded-2xl border border-white/8 bg-black/16 p-4 text-sm text-emerald-100/48">Noch keine Aktionen gespeichert.</p>
			) : (
				<div className="max-h-[24rem] overflow-x-hidden overflow-y-auto overscroll-contain border-t border-white/8 bg-black/10 p-3 sm:p-4">
					<div className="grid min-w-0 gap-2">
						{entries.map((entry) => (
							<div key={entry.id} className="grid min-w-0 gap-3 rounded-2xl border border-white/8 bg-black/18 p-3 lg:grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)_auto] lg:items-center">
								<div className="min-w-0 break-words text-[9px] font-black uppercase leading-4 tracking-[0.14em] text-lime-200/54">{formatAction(entry.action)}</div>
								<div className="min-w-0">
									<div className="line-clamp-2 break-words text-sm font-black leading-5 text-emerald-50">{entry.summary}</div>
									<div className="mt-1 truncate text-xs text-emerald-100/42">
										{entry.actorLabel ?? "System"} · {entry.targetType}:{entry.targetId}
									</div>
								</div>
								<div className="flex shrink-0 items-center justify-between gap-3 lg:justify-end">
									<div className="whitespace-nowrap text-xs font-bold text-emerald-100/42">{new Date(entry.createdAt).toLocaleTimeString("de-DE")}</div>
									<button
										type="button"
										disabled={isPending}
										onClick={() => deleteEntry(entry)}
										className="rounded-xl border border-red-300/18 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-red-100 transition hover:border-red-300/34 disabled:opacity-50"
									>
										{pendingId === entry.id ? "..." : "Löschen"}
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
			{message ? <div className="mx-5 mb-5 mt-4 rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">{message}</div> : null}
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
	return action.replaceAll("_", " ").replaceAll(".", " · ");
}
