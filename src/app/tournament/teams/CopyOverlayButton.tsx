"use client";

import { useState } from "react";

export function CopyOverlayButton({ teamId }: { teamId: string }) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState("");

  async function copy() {
    const url = `${window.location.origin}/obs/tournament?team=${teamId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setFallbackUrl(url);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        title="OBS-Browser-Source-URL für dieses Team"
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
          copied
            ? "border-lime-200/40 bg-lime-200/14 text-lime-50"
            : "border-white/14 bg-black/24 text-emerald-100/76 hover:border-lime-200/30 hover:text-lime-100"
        }`}
      >
        <span aria-hidden>{copied ? "✓" : "⧉"}</span>
        {copied ? "Kopiert" : "OBS-Overlay kopieren"}
      </button>
      {fallbackUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="overlay-url-title"
          className="fixed inset-0 z-[100] grid place-items-center px-5"
        >
          <button
            type="button"
            aria-label="Dialog schließen"
            onClick={() => setFallbackUrl("")}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />
          <div className="relative w-full max-w-xl rounded-[2rem] border border-cyan-200/20 bg-gradient-to-br from-emerald-950 via-[#091a12] to-black p-6 shadow-2xl shadow-black/60">
            <h2
              id="overlay-url-title"
              className="text-2xl font-black text-emerald-50"
            >
              OBS-Link manuell kopieren
            </h2>
            <p className="mt-2 text-sm leading-6 text-emerald-100/62">
              Dein Browser hat den direkten Zugriff auf die Zwischenablage
              blockiert. Markiere deshalb diese URL und füge sie in OBS ein.
            </p>
            <input
              autoFocus
              readOnly
              value={fallbackUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-4 w-full rounded-xl border border-cyan-200/18 bg-black/30 px-4 py-3 font-mono text-xs text-cyan-50 outline-none focus:border-cyan-200/40"
            />
            <button
              type="button"
              onClick={() => setFallbackUrl("")}
              className="mt-4 rounded-xl bg-gradient-to-r from-lime-200 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950"
            >
              Fertig
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
