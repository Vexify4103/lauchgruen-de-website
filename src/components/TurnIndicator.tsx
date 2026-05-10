"use client";

import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
}

export function TurnIndicator({ game }: Props) {
  const turnPlayer = game.currentTurn ? game.players[game.currentTurn] : null;
  return (
    <div className="bg-gradient-to-r from-emerald-900 via-amber-900/40 to-emerald-900 border border-amber-400/40 rounded-xl px-4 py-3 text-center shadow-lg">
      <div className="text-[10px] uppercase tracking-widest text-amber-300/70 font-bold">
        Turn
      </div>
      {turnPlayer ? (
        <div className="text-amber-100 font-extrabold text-lg leading-tight mt-0.5 truncate">
          🐻 {turnPlayer.displayName}
        </div>
      ) : (
        <div className="text-emerald-300/70 italic mt-0.5">—</div>
      )}
    </div>
  );
}
