"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TournamentSettings } from "@/lib/tournament-settings";

const items: Array<{
  key: keyof Pick<TournamentSettings, "applicationsOpen" | "tournamentLive" | "draftEnabled">;
  label: string;
  on: string;
  off: string;
}> = [
  {
    key: "applicationsOpen",
    label: "Bewerbungen",
    on: "Offen",
    off: "Geschlossen",
  },
  {
    key: "tournamentLive",
    label: "Turniermodus",
    on: "Live",
    off: "Vorbereitung",
  },
  {
    key: "draftEnabled",
    label: "Champ Select",
    on: "Aktiv",
    off: "Pausiert",
  },
];

export function TournamentModePanel({ initialSettings }: { initialSettings: TournamentSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggle(key: (typeof items)[number]["key"]) {
    setMessage("");
    const nextValue = !settings[key];
    setSettings((current) => ({ ...current, [key]: nextValue }));
    startTransition(async () => {
      const response = await fetch("/api/tournament/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: nextValue }),
      });
      const json = (await response.json().catch(() => null)) as
        | { settings?: TournamentSettings; message?: string }
        | null;
      if (!response.ok || !json?.settings) {
        setSettings((current) => ({ ...current, [key]: !nextValue }));
        setMessage(json?.message ?? "Settings konnten nicht gespeichert werden.");
        return;
      }
      setSettings(json.settings);
      setMessage("Settings gespeichert.");
      router.refresh();
    });
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">
            Tournament Mode
          </div>
          <h2 className="mt-2 text-2xl font-black text-emerald-50">
            Live-Schalter
          </h2>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/18 px-4 py-2 text-xs font-black text-emerald-100/54">
          {new Date(settings.updatedAt).toLocaleTimeString("de-DE")}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((item) => {
          const active = settings[item.key];
          return (
            <button
              key={item.key}
              type="button"
              disabled={isPending}
              onClick={() => toggle(item.key)}
              className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 ${
                active
                  ? "border-lime-200/24 bg-lime-200/10"
                  : "border-white/10 bg-black/18"
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/48">
                {item.label}
              </div>
              <div className={`mt-2 text-xl font-black ${active ? "text-lime-100" : "text-emerald-100/52"}`}>
                {active ? item.on : item.off}
              </div>
            </button>
          );
        })}
      </div>
      {message ? (
        <div className="mt-4 rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-3 text-sm font-bold text-lime-50">
          {message}
        </div>
      ) : null}
    </section>
  );
}
