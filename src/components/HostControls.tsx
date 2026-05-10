"use client";

import { useSocket } from "@/lib/socket-context";
import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
}

export function HostControls({ game }: Props) {
  const { emit } = useSocket();
  const aq = game.activeQuestion;
  const phase = game.phase;
  const contestants = game.playerOrder
    .filter((pid) => pid !== game.hostId)
    .map((pid) => game.players[pid])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="bg-emerald-950/60 border border-emerald-800 rounded-xl p-4 flex flex-col gap-3 backdrop-blur-sm">
      <div className="text-xs uppercase font-bold text-amber-300/70 tracking-widest">
        🍯 Host controls
      </div>
      <div className="text-xs text-emerald-300/70">
        Phase: <span className="font-mono text-amber-300">{phase}</span>
      </div>

      {aq && phase !== "finished" ? (
        <div className="flex flex-col gap-2">
          {!aq.currentAnswerer && !aq.buzzersOpen ? (
            <button
              type="button"
              onClick={() => emit("host:open_buzzers")}
              className="bg-amber-500 hover:bg-amber-400 text-emerald-950 font-bold rounded-md px-3 py-2 text-sm transition-colors"
            >
              ⚡ Open buzzers
            </button>
          ) : null}
          {aq.buzzersOpen && !aq.currentAnswerer ? (
            <div className="text-amber-300 italic text-xs animate-pulse text-center">
              Waiting for buzzes…
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-emerald-800 pt-3">
        <div className="text-xs uppercase font-bold text-amber-300/70 mb-2 tracking-widest">
          Set turn
        </div>
        <div className="flex flex-wrap gap-1.5">
          {contestants.map((p) => {
            const active = game.currentTurn === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => emit("host:set_turn", { playerId: p.id })}
                disabled={p.eliminated}
                className={[
                  "rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                  active
                    ? "bg-amber-500 text-emerald-950"
                    : "bg-emerald-800 hover:bg-emerald-700 text-emerald-100",
                  p.eliminated ? "opacity-30 line-through" : "",
                ].join(" ")}
              >
                {p.displayName}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
