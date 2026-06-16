"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ThemedMultiSelect, ThemedSelect } from "@/components/ThemedSelect";
import {
  isAdminVersionConflict,
  useAdminConflict,
} from "@/components/AdminConflictProvider";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import type { TournamentApplication } from "@/lib/tournament-storage";

const roleOptions = ["Top", "Jungle", "Mid", "Bot", "Support", "Fill"];

export function EditApplicantForm({
  app,
  initialVersion,
}: {
  app: TournamentApplication;
  initialVersion: number;
}) {
  const router = useRouter();
  const { showConflict } = useAdminConflict();
  const [version, setVersion] = useState(initialVersion);
  const [displayName, setDisplayName] = useState(app.displayName);
  const [mainRole, setMainRole] = useState(app.mainRole);
  const [preferredRoles, setPreferredRoles] = useState(app.preferredRoles);
  const [notes, setNotes] = useState(app.notes);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [savedValues, setSavedValues] = useState(
    JSON.stringify({
      displayName: app.displayName,
      mainRole: app.mainRole,
      preferredRoles: app.preferredRoles,
      notes: app.notes,
    }),
  );
  const currentValues = JSON.stringify({
    displayName,
    mainRole,
    preferredRoles,
    notes,
  });

  useUnsavedChanges({
    dirty: currentValues !== savedValues,
    label: `Bewerbung: ${app.displayName}`,
    save,
  });

  async function save(): Promise<boolean> {
    setMessage("");
    const response = await fetch("/api/tournament/applications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: app.id,
        expectedVersion: version,
        displayName,
        mainRole,
        preferredRoles,
        notes,
      }),
    });
    const json = (await response.json().catch(() => null)) as
      | { message?: string; version?: number }
      | null;
    if (!response.ok) {
      if (isAdminVersionConflict(response, json)) {
        showConflict(json);
        return false;
      }
      setMessage(json?.message ?? "Bewerbung konnte nicht gespeichert werden.");
      return false;
    }
    if (json?.version !== undefined) setVersion(json.version);
    setSavedValues(currentValues);
    setMessage("Gespeichert.");
    router.refresh();
    return true;
  }

  return (
    <details className="rounded-2xl border border-white/8 bg-black/16 p-3">
      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.2em] text-lime-200/72">
        Bewerbung bearbeiten
      </summary>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-xs font-bold text-emerald-100/70">
          Anzeigename
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/28 px-3 py-2 text-sm font-bold text-emerald-50 outline-none focus:border-lime-200/40"
          />
        </label>

        <label className="grid gap-1 text-xs font-bold text-emerald-100/70">
          Main Rolle
          <ThemedSelect
            value={mainRole}
            onChange={setMainRole}
            options={roleOptions.map((role) => ({ value: role, label: role }))}
          />
        </label>

        <label className="grid gap-1 text-xs font-bold text-emerald-100/70">
          Wunschrollen
          <ThemedMultiSelect
            value={preferredRoles}
            onChange={setPreferredRoles}
            placeholder="Eine oder mehrere Rollen wählen"
            options={roleOptions.map((role) => ({ value: role, label: role }))}
          />
        </label>

        <label className="grid gap-1 text-xs font-bold text-emerald-100/70">
          Notizen
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            className="rounded-xl border border-white/10 bg-black/28 px-3 py-2 text-sm font-bold text-emerald-50 outline-none focus:border-lime-200/40"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await save();
              })
            }
            className="rounded-xl bg-lime-200 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-45"
          >
            {isPending ? "Speichert..." : "Speichern"}
          </button>
          {message ? (
            <span className="text-xs font-bold text-emerald-100/60">{message}</span>
          ) : null}
        </div>
      </div>
    </details>
  );
}
