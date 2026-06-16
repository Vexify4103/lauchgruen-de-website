"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  isAdminVersionConflict,
  useAdminConflict,
} from "@/components/AdminConflictProvider";

export function DeleteApplicantButton({
  discordId,
  applicationId,
  initialVersion,
  label,
}: {
  discordId: string;
  applicationId: string;
  initialVersion: number;
  /** Human-readable name shown in the confirm dialog. */
  label: string;
}) {
  const router = useRouter();
  const { showConflict } = useAdminConflict();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function performDelete() {
    setOpen(false);
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/tournament/applications?discordId=${encodeURIComponent(discordId)}&id=${encodeURIComponent(applicationId)}&expectedVersion=${initialVersion}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      if (isAdminVersionConflict(response, json)) {
        showConflict(json);
        return;
      }
      setError(json?.message ?? "Löschen fehlgeschlagen.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        title="Bewerbung löschen"
        aria-label="Bewerbung löschen"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-white/12 bg-black/24 text-xs text-emerald-100/52 transition hover:border-rose-300/40 hover:text-rose-200 disabled:opacity-50"
      >
        ✕
      </button>
      {error ? (
        <div className="mt-2 rounded-lg border border-red-300/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-100">
          {error}
        </div>
      ) : null}
      <ConfirmDialog
        open={open}
        title="Bewerbung wirklich löschen?"
        description={
          <>
            Die Bewerbung von{" "}
            <strong className="text-emerald-50">{label}</strong> wird entfernt.
            Die verifizierte Discord-Riot-Verknüpfung bleibt erhalten, damit
            der Account bei einem späteren Turnier nicht erneut verifiziert
            werden muss. Eine bestehende Team-Zuweisung bleibt ebenfalls
            bestehen und muss bei Bedarf separat im Roster entfernt werden.
          </>
        }
        confirmLabel="Ja, löschen"
        cancelLabel="Abbrechen"
        tone="danger"
        onConfirm={performDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
