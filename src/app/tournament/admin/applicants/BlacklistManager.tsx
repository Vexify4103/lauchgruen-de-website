"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { TournamentBlacklistEntry } from "@/lib/tournament-storage";

export function BlacklistManager({
  initialEntries,
}: {
  initialEntries: TournamentBlacklistEntry[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/tournament/blacklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          discordId: String(formData.get("discordId") ?? "").trim() || undefined,
          riotId: String(formData.get("riotId") ?? "").trim() || undefined,
          reason: String(formData.get("reason") ?? "").trim(),
        }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(json?.message ?? "Blacklist-Eintrag konnte nicht gespeichert werden.");
        return;
      }
      form.reset();
      setMessage("Blacklist-Eintrag gespeichert.");
      router.refresh();
    });
  }

  function removeEntry(id: string) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/tournament/blacklist?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(json?.message ?? "Blacklist-Eintrag konnte nicht entfernt werden.");
        return;
      }
      setMessage("Blacklist-Eintrag entfernt.");
      router.refresh();
    });
  }

  return (
    <section className="mt-8 rounded-[2rem] border border-red-300/18 bg-red-500/[0.045] p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.28em] text-red-100/70">
            Blacklist
          </div>
          <h2 className="mt-2 text-2xl font-black text-red-50">
            Spieler für zukünftige Turniere sperren
          </h2>
          <p className="mt-2 text-sm leading-6 text-red-50/62">
            Blockiert Bewerbungen, wenn Discord-ID oder Riot-ID übereinstimmt.
            Riot-IDs werden case-insensitive gespeichert.
          </p>
        </div>
        <div className="rounded-2xl border border-red-200/18 bg-black/20 px-4 py-2 text-sm font-black text-red-50">
          {initialEntries.length} Einträge
        </div>
      </div>

      <form onSubmit={addEntry} className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
        <Field label="Discord-ID" name="discordId" placeholder="337568120028004362" />
        <Field label="Riot-ID" name="riotId" placeholder="Name#TAG" />
        <Field label="Grund" name="reason" placeholder="Regelbruch, Toxicity, No-show..." required />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-2xl bg-red-100 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-red-950 transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          Sperren
        </button>
      </form>

      {message ? (
        <div className="mt-4 rounded-2xl border border-red-200/20 bg-black/24 px-4 py-3 text-sm font-bold text-red-50">
          {message}
        </div>
      ) : null}

      {initialEntries.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {initialEntries.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-red-200/14 bg-black/20 p-4">
              <div className="grid gap-1 text-sm">
                <Row label="Discord">{entry.discordId ?? "—"}</Row>
                <Row label="Riot">{entry.riotId ?? "—"}</Row>
                <Row label="Grund">{entry.reason}</Row>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => removeEntry(entry.id)}
                className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-red-100/72 underline decoration-red-200/30 underline-offset-4 hover:text-red-50"
              >
                Entfernen
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  name,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-100/64">
        {label}
      </span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="rounded-xl border border-red-200/12 bg-black/24 px-3 py-2.5 text-sm font-bold text-red-50 outline-none placeholder:text-red-100/26 focus:border-red-200/38"
      />
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-red-100/48">
        {label}
      </span>
      <span className="break-words font-bold text-red-50/82">{children}</span>
    </div>
  );
}
