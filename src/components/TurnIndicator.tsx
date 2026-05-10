"use client";

import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
}

export function TurnIndicator({ game }: Props) {
  const turnPlayer = game.currentTurn ? game.players[game.currentTurn] : null;
  return (
    <div className="bg-gradient-to-r from-emerald-900 via-amber-900/40 to-emerald-900 border border-amber-400/40 rounded-full px-4 py-1.5 text-center shadow-lg flex items-center gap-2">
      <span className="text-[10px] text-amber-300/60 font-bold uppercase tracking-widest shrink-0">Zug</span>
      {turnPlayer ? (
        <span className="text-amber-100 font-extrabold text-sm truncate max-w-[120px]">
          🐻 {turnPlayer.displayName}
        </span>
      ) : (
        <span className="text-emerald-600 italic text-sm">—</span>
      )}
    </div>
  );
}
