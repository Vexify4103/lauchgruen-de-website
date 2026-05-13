"use client";

import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
}

export function TurnIndicator({ game }: Props) {
  const turnPlayer = game.currentTurn ? game.players[game.currentTurn] : null;

  return (
    <div className="flex items-center gap-2 rounded-full border border-amber-400/20 bg-emerald-950/55 px-3 py-1.5 text-center shadow-lg">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-emerald-300/56">
        Zug
      </span>
      {turnPlayer ? (
        <span className="max-w-[150px] truncate text-sm font-extrabold text-amber-100">
          {turnPlayer.displayName}
        </span>
      ) : (
        <span className="text-sm italic text-emerald-600">-</span>
      )}
    </div>
  );
}
