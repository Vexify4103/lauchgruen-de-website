"use client";

import { useState } from "react";

type SyncState =
  | { status: "idle"; message: "" }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function NicknameSyncButton() {
  const [state, setState] = useState<SyncState>({ status: "idle", message: "" });

  async function syncNicknames() {
    setState({
      status: "loading",
      message: "Nicknames werden gesetzt...",
    });
    const response = await fetch("/api/tournament/nicknames", {
      method: "POST",
    });
    const result = (await response.json().catch(() => null)) as
      | {
          renamed?: number;
          failed?: number;
          skipped?: number;
          warnings?: string[];
          message?: string;
        }
      | null;

    if (!response.ok) {
      setState({
        status: "error",
        message: result?.message ?? "Nickname-Sync fehlgeschlagen.",
      });
      return;
    }

    const warnings = result?.warnings ?? [];
    const summary = `Umbenannt: ${result?.renamed ?? 0} · Fehlgeschlagen: ${result?.failed ?? 0} · Übersprungen: ${result?.skipped ?? 0}`;
    setState({
      status: warnings.length > 0 ? "error" : "success",
      message: warnings.length > 0 ? `${summary}. ${warnings.slice(0, 3).join(" ")}` : summary,
    });
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={syncNicknames}
        disabled={state.status === "loading"}
        className="rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-amber-100 transition hover:border-amber-200/50 hover:text-amber-50 disabled:opacity-60"
      >
        {state.status === "loading" ? "Setzt Nicknames..." : "Turnier-Nicknames setzen"}
      </button>
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
    </div>
  );
}
