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
      className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-5 py-4 text-base font-black text-emerald-950 shadow-xl shadow-amber-500/20 transition-all hover:-translate-y-0.5 hover:shadow-amber-400/30 disabled:translate-y-0 disabled:opacity-60"
    >
      {pending ? "Spiel wird erstellt..." : "Neues Spiel hosten"}
    </button>
  );
}
