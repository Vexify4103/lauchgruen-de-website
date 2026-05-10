"use client";

import { useSocket } from "@/lib/socket-context";

export function HostControls() {
  const { game, emit } = useSocket();
  if (!game) return null;
  const aq = game.activeQuestion;
  const phase = game.phase;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
      <div className="text-xs uppercase font-bold text-zinc-500">Host controls</div>
      <div className="text-sm">
        Phase: <span className="font-mono text-yellow-400">{phase}</span>
      </div>

      {phase === "lobby" ? (
        <button
          type="button"
          onClick={() => emit("host:start_game")}
          className="bg-green-600 hover:bg-green-500 rounded-md px-4 py-2 font-semibold disabled:opacity-50"
          disabled={Object.keys(game.players).length === 0}
        >
          Start game
        </button>
      ) : null}

      {aq && phase === "answering" ? (
        <>
          {!aq.currentAnswerer ? (
            <button
              type="button"
              onClick={() => emit("host:open_buzzers")}
              className="bg-purple-600 hover:bg-purple-500 rounded-md px-4 py-2 font-semibold"
            >
              Open buzzers
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => emit("host:judge", { correct: true })}
                className="flex-1 bg-green-600 hover:bg-green-500 rounded-md px-4 py-2 font-semibold"
              >
                ✓ Correct
              </button>
              <button
                type="button"
                onClick={() => emit("host:judge", { correct: false })}
                className="flex-1 bg-red-600 hover:bg-red-500 rounded-md px-4 py-2 font-semibold"
              >
                ✗ Wrong
              </button>
            </div>
          )}
        </>
      ) : null}

      {aq && phase === "buzzing" ? (
        <div className="text-purple-300 italic text-sm animate-pulse">
          Waiting for buzzes…
        </div>
      ) : null}

      <div className="border-t border-zinc-800 pt-3">
        <div className="text-xs uppercase font-bold text-zinc-500 mb-2">Set turn</div>
        <div className="flex flex-wrap gap-2">
          {game.playerOrder.map((pid) => {
            const p = game.players[pid];
            if (!p) return null;
            const active = game.currentTurn === pid;
            return (
              <button
                key={pid}
                type="button"
                onClick={() => emit("host:set_turn", { playerId: pid })}
                disabled={p.eliminated}
                className={[
                  "rounded-md px-2 py-1 text-sm",
                  active ? "bg-yellow-500 text-black font-bold" : "bg-zinc-700 hover:bg-zinc-600",
                  p.eliminated ? "opacity-30" : "",
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
