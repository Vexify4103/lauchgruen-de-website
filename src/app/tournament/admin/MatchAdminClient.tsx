"use client";

import { TournamentLink as Link } from "../TournamentLink";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { StoredTournamentMatch } from "@/lib/tournament-storage";
import { formatGameDuration } from "@/lib/match-duration";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import {
  isAdminVersionConflict,
  useAdminConflict,
} from "@/components/AdminConflictProvider";

type MatchStatus = NonNullable<StoredTournamentMatch["status"]>;

const statusToneClass: Record<MatchStatus, string> = {
  Scheduled: "border-white/10 bg-black/24 text-emerald-100/80",
  Live: "border-red-300/40 bg-red-500/20 text-red-100",
  Finished: "border-lime-200/30 bg-lime-200/14 text-lime-50",
  Pending: "border-amber-200/30 bg-amber-200/12 text-amber-100",
  Locked: "border-white/10 bg-black/40 text-emerald-100/52",
};

export type AdminMatch = {
  id: string;
  phase: "groups" | "playoffs";
  group?: "A" | "B";
  round: string;
  teamA: string;        // resolved display name or a group-placement placeholder
  teamB: string;
  status: MatchStatus;
  poolsDrawn: boolean;
};

export function MatchAdminClient({
  initialMatches,
  initialStored,
  initialVersions,
}: {
  initialMatches: AdminMatch[];
  initialStored: Record<string, StoredTournamentMatch>;
  initialVersions: Record<string, number>;
}) {
  const router = useRouter();
  const { showConflict } = useAdminConflict();
  const [stored, setStored] = useState(initialStored);
  const [versions, setVersions] = useState(initialVersions);
  const [preparedMatchIds, setPreparedMatchIds] = useState(
    () => new Set(initialMatches.filter((match) => match.poolsDrawn).map((match) => match.id)),
  );
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPreparing, startPreparing] = useTransition();

  async function updateMatch(
    id: string,
    values: { scoreA: string; scoreB: string; gameDuration: string },
  ): Promise<boolean> {
    const response = await fetch("/api/tournament/matches", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        expectedVersion: versions[id] ?? 0,
        scoreA: values.scoreA,
        scoreB: values.scoreB,
        gameDuration: values.gameDuration,
      }),
    });

    const result = (await response.json().catch(() => null)) as
      | { match?: StoredTournamentMatch; message?: string; version?: number }
      | null;

    if (!response.ok || !result?.match) {
      if (isAdminVersionConflict(response, result)) {
        showConflict(result);
        return false;
      }
      setMessage(result?.message ?? "Match konnte nicht aktualisiert werden.");
      return false;
    }

    setStored((current) => ({ ...current, [id]: result.match! }));
    if (result.version !== undefined) {
      setVersions((current) => ({ ...current, [id]: result.version! }));
    }
    setMessage("Match aktualisiert.");
    // Re-fetch server data so dependent playoff slots refresh with the new team names.
    router.refresh();
    return true;
  }

  function prepareMatch(match: AdminMatch) {
    if (
      isPreparing
      || match.status !== "Scheduled"
      || preparedMatchIds.has(match.id)
    ) {
      return;
    }

    setMessage("");
    setPreparingId(match.id);
    startPreparing(async () => {
      const response = await fetch("/api/tournament/matches/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: match.id }),
      });
      const result = (await response.json().catch(() => null)) as
        | { message?: string; drewPools?: boolean }
        | null;

      if (!response.ok) {
        setMessage(result?.message ?? "Pools konnten nicht gezogen werden.");
        setPreparingId(null);
        return;
      }

      setPreparedMatchIds((current) => new Set(current).add(match.id));
      setMessage(
        result?.drewPools
          ? `Pools für ${match.teamA} vs. ${match.teamB} gezogen.`
          : "Dieses Match war bereits vorbereitet.",
      );
      setPreparingId(null);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {message ? (
        <div className="rounded-2xl border border-lime-200/24 bg-lime-200/10 px-4 py-3 text-sm text-lime-50">
          {message}
        </div>
      ) : null}

      {groupMatchesByRound(initialMatches).map(({ label, matches }) => (
        <section key={label} className="grid gap-3">
          <div className="flex items-center gap-3 px-1">
            <span className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/64">
              {label}
            </span>
            <span className="h-px flex-1 bg-white/10" />
            {matches.length > 1 ? (
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/52">
                Parallel
              </span>
            ) : null}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {matches.map((match) => (
              <MatchRow
                key={match.id}
                base={match}
                stored={stored[match.id] ?? { id: match.id }}
                poolsDrawn={preparedMatchIds.has(match.id)}
                preparing={preparingId === match.id}
                onPrepare={() => prepareMatch(match)}
                onSave={(values) => updateMatch(match.id, values)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupMatchesByRound(matches: AdminMatch[]) {
  const sections = new Map<string, AdminMatch[]>();
  for (const match of matches) {
    const groupRound = match.phase === "groups"
      ? /^[ab]-r(\d+)-\d+$/.exec(match.id)?.[1]
      : null;
    const label = groupRound
      ? `Gruppenphase · Runde ${groupRound}`
      : `Playoffs · ${match.round}`;
    sections.set(label, [...(sections.get(label) ?? []), match]);
  }
  return [...sections.entries()].map(([label, entries]) => ({
    label,
    matches: entries.sort((a, b) => a.id.localeCompare(b.id)),
  }));
}

function MatchRow({
  base,
  stored,
  poolsDrawn,
  preparing,
  onPrepare,
  onSave,
}: {
  base: AdminMatch;
  stored: StoredTournamentMatch;
  poolsDrawn: boolean;
  preparing: boolean;
  onPrepare: () => void;
  onSave: (values: {
    scoreA: string;
    scoreB: string;
    gameDuration: string;
  }) => Promise<boolean>;
}) {
  const status = base.status;
  const tone = statusToneClass[status] ?? statusToneClass.Scheduled;
  const [scoreA, setScoreA] = useState(stored.scoreA?.toString() ?? "");
  const [scoreB, setScoreB] = useState(stored.scoreB?.toString() ?? "");
  const [gameDuration, setGameDuration] = useState(
    formatGameDuration(stored.gameDurationSeconds),
  );
  const [saving, setSaving] = useState(false);
  const [savedValues, setSavedValues] = useState(
    JSON.stringify({ scoreA, scoreB, gameDuration }),
  );
  const currentValues = JSON.stringify({ scoreA, scoreB, gameDuration });

  async function saveRow(): Promise<boolean> {
    setSaving(true);
    const saved = await onSave({ scoreA, scoreB, gameDuration });
    setSaving(false);
    if (saved) setSavedValues(currentValues);
    return saved;
  }

  useUnsavedChanges({
    dirty: currentValues !== savedValues,
    label: `Match ${base.id}`,
    save: saveRow,
  });

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void saveRow();
      }}
      className="grid gap-4 rounded-[1.7rem] border border-white/10 bg-black/18 p-4 sm:p-5"
    >
      <input type="hidden" name="id" value={base.id} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">
            {base.id}
          </div>
          <div className="mt-2 break-words text-lg font-black text-emerald-50">
            <span>{base.teamA}</span>
            <span className="mx-2 text-emerald-100/40">vs</span>
            <span>{base.teamB}</span>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${tone}`}
        >
          {status}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField short="A" team={base.teamA} value={scoreA} onChange={setScoreA} />
        <NumberField short="B" team={base.teamB} value={scoreB} onChange={setScoreB} />
        <label className="grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-lime-200/58">
            Spielzeit
          </span>
          <input
            inputMode="numeric"
            placeholder="mm:ss"
            pattern="\d{1,3}:[0-5]\d"
            value={gameDuration}
            onChange={(event) => setGameDuration(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/24 px-3 py-2.5 text-center text-sm font-black text-emerald-50 outline-none transition placeholder:text-emerald-100/24 focus:border-lime-200/40"
          />
        </label>

        <div className="grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-lime-200/58">
            Status (automatisch)
          </span>
          <div className="flex h-[42px] items-center rounded-xl border border-white/10 bg-black/24 px-3 text-sm font-black text-emerald-100/72">
            {status}
          </div>
        </div>

        <div className="grid min-w-0 gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-lime-200/58">
            Sieger (auto)
          </span>
          <div
            className={`flex h-[42px] items-center truncate rounded-xl border px-3 text-sm font-black ${
              stored.winner
                ? "border-lime-200/30 bg-lime-200/10 text-lime-50"
                : "border-white/10 bg-black/12 text-emerald-100/40"
            }`}
            title={stored.winner ?? "Wird aus den Scores berechnet"}
          >
            {stored.winner ?? "—"}
          </div>
        </div>

        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
          <button
            type="submit"
            disabled={status === "Locked" || saving}
            className="rounded-xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? "Wird gespeichert..."
              : status === "Locked"
                ? "Teilnehmer offen"
                : "Ergebnis speichern"}
          </button>
          <button
            type="button"
            onClick={onPrepare}
            disabled={poolsDrawn || preparing || status !== "Scheduled"}
            className="rounded-xl border border-cyan-200/20 bg-cyan-300/8 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-cyan-50 transition hover:border-cyan-200/42 hover:bg-cyan-300/12 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.025] disabled:text-emerald-100/32"
          >
            {preparing
              ? "Pools werden gezogen..."
              : poolsDrawn
                ? "Pools gezogen"
                : status === "Locked"
                  ? "Teilnehmer offen"
                  : status !== "Scheduled"
                    ? "Draft läuft"
                    : "Pools ziehen"}
          </button>
          <Link
            href={`/tournament/admin/matches/${base.id}`}
            className="rounded-xl border border-white/12 bg-white/[0.04] px-5 py-3 text-center text-xs font-black uppercase tracking-[0.18em] text-emerald-100/72 transition hover:border-lime-200/30 hover:text-lime-100"
          >
            Control Room
          </Link>
        </div>
      </div>
    </form>
  );
}

function NumberField({
  short,
  team,
  value,
  onChange,
}: {
  short: string;
  team: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2" title={`Score · ${team}`}>
      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-lime-200/58">
        Score {short}
      </span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/24 px-3 py-2.5 text-center text-sm font-black text-emerald-50 outline-none transition focus:border-lime-200/40"
      />
    </label>
  );
}
