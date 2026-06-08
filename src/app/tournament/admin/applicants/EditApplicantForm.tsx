"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ThemedMultiSelect, ThemedSelect } from "@/components/ThemedSelect";
import type { TournamentApplication } from "@/lib/tournament-storage";

const roleOptions = ["Top", "Jungle", "Mid", "Bot", "Support", "Fill"];

export function EditApplicantForm({ app }: { app: TournamentApplication }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(app.displayName);
  const [mainRole, setMainRole] = useState(app.mainRole);
  const [preferredRoles, setPreferredRoles] = useState(app.preferredRoles);
  const [notes, setNotes] = useState(app.notes);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage("");

    startTransition(async () => {
      const response = await fetch("/api/tournament/applications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: app.id,
          displayName,
          mainRole,
          preferredRoles,
          notes,
        }),
      });
      const json = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        setMessage(json?.message ?? "Bewerbung konnte nicht gespeichert werden.");
        return;
      }
      setMessage("Gespeichert.");
      router.refresh();
    });
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
            onClick={save}
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
