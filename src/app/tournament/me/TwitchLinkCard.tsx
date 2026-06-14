"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TournamentTwitchLink } from "@/lib/tournament-storage";

const statusMessages: Record<string, string> = {
  connected: "Dein Twitch-Kanal wurde erfolgreich verbunden.",
  cancelled: "Die Twitch-Verknüpfung wurde abgebrochen.",
  "login-required": "Bitte melde dich zuerst mit Discord an.",
  "invalid-state": "Die Twitch-Anfrage ist abgelaufen. Bitte versuche es erneut.",
  configuration: "Twitch OAuth ist noch nicht vollständig konfiguriert.",
  failed: "Twitch konnte nicht verbunden werden. Bitte versuche es erneut.",
};

export function TwitchLinkCard({
  initialLink,
  status,
  isOwner,
}: {
  initialLink: TournamentTwitchLink | null;
  status?: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [link, setLink] = useState(initialLink);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(status ? statusMessages[status] : "");

  async function updateVisibility(showWhenLive: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tournament/twitch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showWhenLive }),
      });
      const json = (await response.json()) as {
        link?: TournamentTwitchLink;
        message?: string;
      };
      if (!response.ok || !json.link) {
        throw new Error(json.message ?? "Einstellung konnte nicht gespeichert werden.");
      }
      setLink(json.link);
      setMessage("Twitch-Anzeige gespeichert.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Twitch-Verknüpfung wirklich entfernen?")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tournament/twitch", { method: "DELETE" });
      const json = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(json.message ?? "Twitch konnte nicht getrennt werden.");
      }
      setLink(null);
      setMessage("Twitch-Verknüpfung entfernt.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Trennen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[#9146ff]/25 bg-[#9146ff]/[0.08] p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.28em] text-[#c9a8ff]">
            Twitch
          </div>
          <h2 className="mt-2 text-2xl font-black text-emerald-50">
            {link ? link.displayName : "Stream mit dem Turnier verbinden"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/60">
            Wenn dein Team ein Live-Match spielt und dein Kanal gerade online
            ist, können Zuschauer deinen Stream im Zeitplan und bei den Teams
            öffnen.
          </p>
        </div>
        {link?.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.profileImageUrl}
            alt=""
            className="size-14 rounded-2xl border border-[#c9a8ff]/30 object-cover"
          />
        ) : null}
      </div>

      {link ? (
        <div className="mt-5 grid gap-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/18 p-4">
            <input
              type="checkbox"
              checked={link.showWhenLive}
              disabled={busy}
              onChange={(event) => void updateVisibility(event.target.checked)}
              className="mt-0.5 size-5 accent-[#9146ff]"
            />
            <span>
              <span className="block text-sm font-black text-emerald-50">
                Während meiner Turniermatches anzeigen
              </span>
              <span className="mt-1 block text-xs leading-5 text-emerald-100/48">
                Es erscheint nur dann ein Link, wenn dein Match den Status
                „Live“ hat und dein Twitch-Kanal tatsächlich live ist.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://twitch.tv/${encodeURIComponent(link.login)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-[#9146ff] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#a970ff]"
            >
              Kanal öffnen
            </a>
            <a
              href="/api/tournament/twitch/connect"
              className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/72"
            >
              Anderes Konto verbinden
            </a>
            {isOwner && link.showWhenLive ? (
              <a
                href="/tournament/teams?twitchPreview=1"
                className="rounded-2xl border border-amber-200/22 bg-amber-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-50/82"
              >
                Live-Anzeige testen
              </a>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
              className="rounded-2xl border border-red-200/18 bg-red-500/8 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-red-100/72 disabled:opacity-50"
            >
              Verbindung trennen
            </button>
          </div>
        </div>
      ) : (
        <a
          href="/api/tournament/twitch/connect"
          className="mt-5 inline-flex rounded-2xl bg-[#9146ff] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-[#9146ff]/20 transition hover:-translate-y-0.5 hover:bg-[#a970ff]"
        >
          Twitch verbinden
        </a>
      )}

      {message ? (
        <p className="mt-4 text-xs font-bold text-emerald-100/64">{message}</p>
      ) : null}
    </section>
  );
}
