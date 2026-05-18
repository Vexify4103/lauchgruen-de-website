"use client";

import { useState } from "react";

export function CopyOverlayButton({ teamId }: { teamId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/obs/tournament?team=${teamId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can fail in non-HTTPS dev or older browsers.
      window.prompt("Diese URL in OBS einfügen:", url);
    }
  }

  return (
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
  );
}
