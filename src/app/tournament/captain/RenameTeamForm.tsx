"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function RenameTeamForm({
  teamKey,
  initialName,
}: {
  teamKey: string;
  initialName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (nextName === initialName || nextName.length < 2) return;

    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/tournament/teams", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: teamKey, name: nextName }),
    });
    const result = (await response.json().catch(() => null)) as
      | { message?: string; warnings?: string[] }
      | null;
    setSaving(false);

    if (!response.ok) {
      setMessage({
        tone: "error",
        text: result?.message ?? "Der Teamname konnte nicht geändert werden.",
      });
      return;
    }

    const warnings = result?.warnings ?? [];
    setMessage({
      tone: warnings.length > 0 ? "error" : "ok",
      text: warnings.length > 0
        ? `Teamname geändert. ${warnings.join(" ")}`
        : "Teamname und Discord-Ressourcen wurden geändert.",
    });
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20"
    >
      <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
        Teamname
      </div>
      <p className="mt-2 text-sm leading-6 text-emerald-100/58">
        Die Änderung wird auch auf die Discord-Rolle sowie den Sprach- und Textkanal übertragen.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={2}
          maxLength={60}
          required
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-emerald-50 outline-none transition focus:border-lime-200/45"
        />
        <button
          type="submit"
          disabled={saving || name.trim() === initialName || name.trim().length < 2}
          className="rounded-2xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 transition hover:bg-lime-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Wird geändert..." : "Namen ändern"}
        </button>
      </div>
      {message ? (
        <p
          className={`mt-3 text-sm font-bold ${
            message.tone === "ok" ? "text-lime-100" : "text-amber-100"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
