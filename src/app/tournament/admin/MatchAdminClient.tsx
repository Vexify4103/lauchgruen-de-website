"use client";

import { TournamentLink as Link } from "../TournamentLink";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { StoredTournamentMatch } from "@/lib/tournament-storage";
import { ThemedSelect } from "@/components/ThemedSelect";
import { formatGameDuration } from "@/lib/match-duration";

const statuses = ["Scheduled", "Live", "Finished", "Pending", "Locked"] as const;
const statusOptions = statuses.map((value) => ({ value, label: value }));

const statusToneClass: Record<(typeof statuses)[number], string> = {
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
  status: (typeof statuses)[number];
};

export function MatchAdminClient({
  initialMatches,
  initialStored,
}: {
  initialMatches: AdminMatch[];
  initialStored: Record<string, StoredTournamentMatch>;
}) {
  const router = useRouter();
  const [stored, setStored] = useState(initialStored);
  const [message, setMessage] = useState("");

  async function updateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const id = String(formData.get("id") ?? "");

    const response = await fetch("/api/tournament/matches", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        scoreA: formData.get("scoreA"),
        scoreB: formData.get("scoreB"),
        gameDuration: formData.get("gameDuration"),
        status: formData.get("status"),
      }),
    });

    const result = (await response.json().catch(() => null)) as
      | { match?: StoredTournamentMatch; message?: string }
      | null;

    if (!response.ok || !result?.match) {
      setMessage(result?.message ?? "Match konnte nicht aktualisiert werden.");
      return;
    }

    setStored((current) => ({ ...current, [id]: result.match! }));
    setMessage("Match aktualisiert.");
    // Re-fetch server data so dependent playoff slots refresh with the new team names.
    router.refresh();
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
                onSubmit={updateMatch}
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
  onSubmit,
}: {
  base: AdminMatch;
  stored: StoredTournamentMatch;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const initialStatus = (stored.status ?? base.status) as (typeof statuses)[number];
  const [status, setStatus] = useState<(typeof statuses)[number]>(initialStatus);
  const tone = statusToneClass[status] ?? statusToneClass.Scheduled;

  return (
    <form
      onSubmit={onSubmit}
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
        <NumberField short="A" name="scoreA" team={base.teamA} value={stored.scoreA} />
        <NumberField short="B" name="scoreB" team={base.teamB} value={stored.scoreB} />
        <label className="grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-lime-200/58">
            Spielzeit
          </span>
          <input
            name="gameDuration"
            inputMode="numeric"
            placeholder="mm:ss"
            pattern="\d{1,3}:[0-5]\d"
            defaultValue={formatGameDuration(stored.gameDurationSeconds)}
            className="w-full rounded-xl border border-white/10 bg-black/24 px-3 py-2.5 text-center text-sm font-black text-emerald-50 outline-none transition placeholder:text-emerald-100/24 focus:border-lime-200/40"
          />
        </label>

        <div className="grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-lime-200/58">
            Status
          </span>
          <ThemedSelect
            name="status"
            value={status}
            onChange={(value) => setStatus(value as (typeof statuses)[number])}
            options={statusOptions}
          />
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

        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5"
          >
            Speichern
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
  name,
  team,
  value,
}: {
  short: string;
  name: string;
  team: string;
  value: string | number | undefined;
}) {
  return (
    <label className="grid gap-2" title={`Score · ${team}`}>
      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-lime-200/58">
        Score {short}
      </span>
      <input
        name={name}
        type="number"
        min="0"
        defaultValue={value ?? ""}
        className="w-full rounded-xl border border-white/10 bg-black/24 px-3 py-2.5 text-center text-sm font-black text-emerald-50 outline-none transition focus:border-lime-200/40"
      />
    </label>
  );
}
