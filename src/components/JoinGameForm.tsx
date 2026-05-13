"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinGameForm() {
  const router = useRouter();
  const [gameId, setGameId] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = gameId.trim().toUpperCase();
        if (trimmed) router.push(`/lobby/${encodeURIComponent(trimmed)}`);
      }}
      className="flex flex-col gap-3 sm:flex-row"
    >
      <label className="sr-only" htmlFor="game-code">
        Spielcode
      </label>
      <input
        id="game-code"
        value={gameId}
        onChange={(e) => setGameId(e.target.value.toUpperCase())}
        placeholder="SPIELCODE"
        className="min-h-14 flex-1 rounded-2xl border border-emerald-600/60 bg-emerald-950/80 px-4 text-base text-amber-100 uppercase tracking-[0.32em] placeholder:text-emerald-400/40 focus:border-amber-300 focus:outline-none"
        maxLength={8}
      />
      <button
        type="submit"
        className="min-h-14 rounded-2xl border border-emerald-400/20 bg-emerald-400 px-5 font-black text-emerald-950 transition-colors hover:bg-emerald-300 sm:px-6"
      >
        Beitreten
      </button>
    </form>
  );
}
