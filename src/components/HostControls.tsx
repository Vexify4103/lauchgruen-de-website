"use client";

import { useSocket } from "@/lib/socket-context";
import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
}

export function HostControls({ game }: Props) {
  const { emit, lastBuzzWinner } = useSocket();
  const aq = game.activeQuestion;
  const phase = game.phase;
  const isBonusBuzz = phase === "bonus_buzzing";
  // After a bonus buzz resolves, phase returns to "playing" with isBonusRound=true
  // and currentTurn = buzz winner. Show a clear banner so the host knows who
  // just won and that the next cell-pick belongs to them.
  const bonusWinnerPending =
    game.isBonusRound && !aq && phase === "playing" && game.currentTurn;
  const bonusWinnerName = bonusWinnerPending
    ? game.players[game.currentTurn!]?.displayName ?? "?"
    : null;

  const contestants = game.playerOrder
    .filter((pid) => pid !== game.hostId)
    .map((pid) => game.players[pid])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="bg-emerald-950/60 border border-emerald-800 rounded-xl p-3 flex flex-col gap-3 backdrop-blur-sm">
      <div className="text-xs uppercase font-bold text-amber-300/70 tracking-widest">
        🍯 Host-Steuerung
      </div>

      <div className="text-xs text-emerald-400/70">
        Phase: <span className="font-mono text-amber-300">{phase}</span>
        {game.isBonusRound && (
          <span className="ml-2 text-amber-400 font-bold">(Bonus)</span>
        )}
      </div>

      {/* Bonus buzz indicator + cancel + force-resolve */}
      {isBonusBuzz && (
        <div className="flex flex-col gap-2">
          <div className="text-center text-amber-300 font-extrabold text-sm animate-pulse">
            🎯 Bonusrunde — Buzzer offen!
          </div>
          <button
            type="button"
            onClick={() => emit("host:force_resolve_bonus")}
            className="w-full bg-amber-600 hover:bg-amber-500 border border-amber-400 text-emerald-950 font-extrabold rounded-lg px-3 py-2 text-xs transition-colors"
            title="Falls ein Spieler gebuzzert hat, das System aber hängt — jetzt auswerten."
          >
            ⚡ Buzz jetzt auswerten
          </button>
          <button
            type="button"
            onClick={() => emit("host:cancel_bonus_buzz")}
            className="w-full bg-red-900 hover:bg-red-800 border border-red-700 text-red-200 font-bold rounded-lg px-3 py-2 text-xs transition-colors"
          >
            ✕ Bonus-Buzz abbrechen
          </button>
        </div>
      )}

      {/* Bonus winner — host needs to pick the cell they ask for */}
      {bonusWinnerPending && bonusWinnerName && (
        <div className="bg-gradient-to-br from-amber-500/30 to-orange-600/30 border-2 border-amber-400 rounded-lg p-3 flex flex-col gap-1 shadow-lg animate-pulse-slow">
          <div className="text-[10px] uppercase tracking-widest text-amber-300 font-extrabold">
            🎯 Bonus-Buzz Gewinner
          </div>
          <div className="text-amber-100 font-extrabold text-base leading-tight">
            {bonusWinnerName}
            {lastBuzzWinner && lastBuzzWinner.playerId === game.currentTurn ? (
              <span className="text-amber-300/80 text-xs font-normal ml-1">
                ({lastBuzzWinner.reactionMs}ms)
              </span>
            ) : null}
          </div>
          <div className="text-emerald-100 text-xs">
            Wähle die gewünschte Frage →
          </div>
          <button
            type="button"
            onClick={() => emit("host:cancel_bonus_buzz")}
            className="mt-1 bg-red-900/70 hover:bg-red-800 border border-red-700 text-red-200 font-bold rounded-md px-2 py-1 text-[11px] transition-colors"
          >
            ✕ Abbrechen — zurück zum normalen Zug
          </button>
        </div>
      )}

      {/* Active question status */}
      {aq ? (
        <div className="text-xs text-emerald-400/70 italic">
          {aq.buzzersOpen && !aq.currentAnswerer
            ? "⚡ Buzzer offen…"
            : aq.currentAnswerer
              ? `Antwortet: ${game.players[aq.currentAnswerer]?.displayName ?? "?"}`
              : null}
        </div>
      ) : null}

      {/* Board switcher */}
      {game.boards.length > 1 && (
        <div className="border-t border-emerald-800 pt-2">
          <div className="text-xs uppercase font-bold text-amber-300/70 mb-2 tracking-widest">
            Felder
          </div>
          <div className="flex gap-1.5">
            {game.boards.map((_, idx) => {
              const isCurrent = idx === game.currentBoardIndex;
              const allUsed = game.boards[idx].board.every((c) => c.used);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isCurrent || phase !== "playing"}
                  onClick={() => emit("host:switch_board", { index: idx })}
                  className={[
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition-colors border",
                    isCurrent
                      ? "bg-amber-500 text-emerald-950 border-amber-300"
                      : allUsed
                        ? "bg-emerald-950/40 text-emerald-700 border-emerald-900/30 line-through cursor-not-allowed"
                        : phase === "playing"
                          ? "bg-emerald-800 hover:bg-emerald-700 text-emerald-100 border-emerald-700"
                          : "bg-emerald-950/40 text-emerald-700 border-emerald-900/30 cursor-not-allowed",
                  ].join(" ")}
                >
                  Feld {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Set turn */}
      <div className="border-t border-emerald-800 pt-2">
        <div className="text-xs uppercase font-bold text-amber-300/70 mb-2 tracking-widest">
          Zug setzen
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
