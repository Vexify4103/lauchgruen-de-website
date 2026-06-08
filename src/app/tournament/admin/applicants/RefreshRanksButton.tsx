"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type ApplicationSummary = {
  displayName?: string;
  riotId?: string;
};

export function RefreshRanksButton({
  applicationId,
  label = "Rang aktualisieren",
  confirmBulk = false,
  totalCount = 1,
  applicantNames = [],
  estimatedDelayMs = 2600,
}: {
  applicationId?: string;
  label?: string;
  confirmBulk?: boolean;
  totalCount?: number;
  applicantNames?: string[];
  estimatedDelayMs?: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [progressIndex, setProgressIndex] = useState(0);
  const [runtimeNames, setRuntimeNames] = useState<string[]>([]);
  const [runtimeTotal, setRuntimeTotal] = useState(0);
  const [isPending, startTransition] = useTransition();

  const names = applicantNames.length > 0 ? applicantNames : runtimeNames;
  const effectiveTotal = Math.max(1, names.length || runtimeTotal || totalCount);
  const currentName =
    names[Math.min(progressIndex, Math.max(0, names.length - 1))];

  useEffect(() => {
    if (!confirmBulk || applicantNames.length > 0 || runtimeNames.length > 0) return;
    let cancelled = false;

    void fetchApplicationNames().then((loaded) => {
      if (cancelled || loaded.length === 0) return;
      setRuntimeNames(loaded);
      setRuntimeTotal(loaded.length);
    });

    return () => {
      cancelled = true;
    };
  }, [applicantNames.length, confirmBulk, runtimeNames.length]);

  useEffect(() => {
    if (!isPending || !confirmBulk) return;
    const interval = window.setInterval(() => {
      setProgressIndex((current) => Math.min(effectiveTotal - 1, current + 1));
    }, estimatedDelayMs);
    return () => window.clearInterval(interval);
  }, [confirmBulk, effectiveTotal, estimatedDelayMs, isPending]);

  async function ensureBulkNames() {
    if (!confirmBulk) return;
    if (names.length > 0) {
      setRuntimeTotal(names.length);
      return;
    }

    const loaded = await fetchApplicationNames();
    if (loaded.length === 0) return;
    setRuntimeNames(loaded);
    setRuntimeTotal(loaded.length);
  }

  async function refreshRanks() {
    if (confirmBulk) {
      const confirmed = window.confirm(
        "Alle Bewerbungs-Ränge und Riot-IDs aktualisieren? Das läuft absichtlich langsam, um Riot Rate Limits einzuhalten.",
      );
      if (!confirmed) return;
    }

    setMessage("");
    setProgressIndex(0);
    await ensureBulkNames();

    startTransition(async () => {
      const response = await fetch("/api/tournament/ranks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(applicationId ? { id: applicationId } : {}),
      });
      const json = (await response.json().catch(() => null)) as
        | { okCount?: number; failCount?: number; message?: string }
        | null;

      if (!response.ok && response.status !== 429) {
        setMessage(json?.message ?? "Rank-Refresh fehlgeschlagen.");
        return;
      }

      const ok = json?.okCount ?? 0;
      const failed = json?.failCount ?? 0;
      setMessage(failed > 0 ? `${ok} ok, ${failed} Fehler.` : `${ok} aktualisiert.`);
      router.refresh();
    });
  }

  const pendingLabel = confirmBulk
    ? `Aktualisiere ${Math.min(progressIndex + 1, effectiveTotal)}/${effectiveTotal}`
    : "Aktualisiere";

  return (
    <div className="grid gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={refreshRanks}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-200/18 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-200/34 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <span className="size-3 animate-spin rounded-full border-2 border-cyan-100/30 border-t-cyan-100" />
            {pendingLabel}
          </>
        ) : (
          label
        )}
      </button>
      {isPending && confirmBulk ? (
        <span className="text-[10px] font-bold text-cyan-100/70">
          {currentName ? `Gerade dran: ${currentName}` : "Riot-Refresh läuft rate-limit-schonend."}
        </span>
      ) : null}
      {message ? (
        <span className="text-[10px] font-bold text-emerald-100/54">{message}</span>
      ) : null}
    </div>
  );
}

async function fetchApplicationNames() {
  const response = await fetch("/api/tournament/applications");
  const json = (await response.json().catch(() => null)) as
    | { applications?: ApplicationSummary[] }
    | null;
  if (!response.ok) return [];
  return json?.applications
    ?.map((app) => app.displayName || app.riotId || "")
    .filter(Boolean) ?? [];
}
