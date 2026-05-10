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
        const trimmed = gameId.trim();
        if (trimmed) router.push(`/lobby/${encodeURIComponent(trimmed)}`);
      }}
      className="flex gap-2"
    >
      <input
        value={gameId}
        onChange={(e) => setGameId(e.target.value)}
        placeholder="Game code"
        className="flex-1 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 placeholder:text-zinc-500"
      />
      <button
        type="submit"
        className="rounded-md bg-zinc-700 hover:bg-zinc-600 transition-colors px-4 py-2 font-semibold"
      >
        Join
      </button>
    </form>
  );
}
