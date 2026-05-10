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
      className="rounded-md bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors px-5 py-3 font-semibold"
    >
      {pending ? "Creating…" : "Host a new game"}
    </button>
  );
}
