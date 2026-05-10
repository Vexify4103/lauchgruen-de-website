"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function CreateGameButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const res = await fetch("/api/games", { method: "POST" });
          if (!res.ok) {
            console.error("Failed to create game");
            return;
          }
          const { gameId } = (await res.json()) as { gameId: string };
          router.push(`/lobby/${gameId}`);
        });
      }}
      className="rounded-md bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 disabled:opacity-50 transition-all px-5 py-3 font-extrabold text-emerald-950 shadow-lg shadow-amber-400/20"
    >
      {pending ? "🐻 Erstelle…" : "🍯 Neues Spiel hosten"}
    </button>
  );
}
