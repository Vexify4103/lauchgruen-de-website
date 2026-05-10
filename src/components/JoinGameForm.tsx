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
      className="flex gap-2"
    >
      <input
        value={gameId}
        onChange={(e) => setGameId(e.target.value.toUpperCase())}
        placeholder="GAME CODE"
        className="flex-1 rounded-md bg-emerald-950/60 border border-emerald-700 px-3 py-2 placeholder:text-emerald-700 text-amber-100 font-mono uppercase tracking-widest focus:border-amber-400 focus:outline-none"
        maxLength={8}
      />
      <button
        type="submit"
        className="rounded-md bg-emerald-700 hover:bg-emerald-600 transition-colors px-4 py-2 font-bold text-emerald-50"
      >
        Join
      </button>
    </form>
  );
}
