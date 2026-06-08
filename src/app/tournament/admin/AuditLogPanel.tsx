"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TournamentAuditEntry } from "@/lib/tournament-audit";

export function AuditLogPanel({ initialEntries }: { initialEntries: TournamentAuditEntry[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  function deleteEntry(entry: TournamentAuditEntry) {
    setMessage("");
    setPendingId(entry.id);
    startTransition(async () => {
      const response = await fetch(`/api/tournament/audit/${encodeURIComponent(entry.id)}`, {
        method: "DELETE",
      });
      const json = (await response.json().catch(() => null)) as
        | { deleted?: boolean; message?: string }
        | null;
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
    const confirmed = window.confirm(
      "Wirklich den kompletten Audit Log löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
    );
    if (!confirmed) return;

    setMessage("");
    setBulkDeleting(true);
    startTransition(async () => {
      const response = await fetch("/api/tournament/audit", {
        method: "DELETE",
      });
      const json = (await response.json().catch(() => null)) as
        | { deleted?: boolean; deletedCount?: number; message?: string }
        | null;
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
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
            Audit Log
          </div>
          <h2 className="mt-2 text-2xl font-black text-emerald-50">
            Letzte Admin-Aktionen
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-2xl border border-white/10 bg-black/18 px-4 py-2 text-sm font-black text-emerald-100/48">
            max. 5 sichtbar
          </div>
          <button
            type="button"
            disabled={entries.length === 0 || isPending || bulkDeleting}
            onClick={deleteAllEntries}
            className="rounded-2xl border border-red-300/18 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-red-100 transition hover:border-red-300/34 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {bulkDeleting ? "Lösche..." : "Alle löschen"}
          </button>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-white/8 bg-black/16 p-4 text-sm text-emerald-100/48">
          Noch keine Aktionen gespeichert.
        </p>
      ) : (
        <div className="mt-4 max-h-80 overflow-y-auto pr-2">
          <div className="grid gap-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-2 rounded-2xl border border-white/8 bg-black/18 p-3 md:grid-cols-[9rem_1fr_auto_auto] md:items-center"
              >
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-200/54">
                  {entry.action}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-emerald-50">{entry.summary}</div>
                  <div className="truncate text-xs text-emerald-100/42">
                    {entry.actorLabel ?? "System"} · {entry.targetType}:{entry.targetId}
                  </div>
                </div>
                <div className="text-xs font-bold text-emerald-100/42">
                  {new Date(entry.createdAt).toLocaleTimeString("de-DE")}
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => deleteEntry(entry)}
                  className="rounded-xl border border-red-300/18 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-red-100 transition hover:border-red-300/34 disabled:opacity-50"
                >
                  {pendingId === entry.id ? "..." : "Löschen"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {message ? (
        <div className="mt-4 rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">
          {message}
        </div>
      ) : null}
    </section>
  );
}
