"use client";

import { useState } from "react";
import { useTournamentHref } from "../TournamentLink";

export function CopyDraftSpectatorLinkButton({
  matchId,
  disabled,
}: {
  matchId: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const spectatorPath = useTournamentHref(`/tournament/champ-select/${matchId}/spectate`);

  async function copy() {
    if (disabled) return;
    const url = new URL(spectatorPath, window.location.origin);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={copy}
      className="rounded-2xl border border-sky-200/16 bg-sky-300/8 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-sky-100 hover:border-sky-200/34 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.025] disabled:text-emerald-100/30"
    >
      {disabled ? "Draft pausiert" : copied ? "Spectator Link kopiert" : "Spectator Draft Link kopieren"}
    </button>
  );
}
