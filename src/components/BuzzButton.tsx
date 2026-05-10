"use client";

import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/lib/socket-context";
import { playBuzz } from "@/lib/sounds";

interface Props {
  myPlayerId: string;
}

export function BuzzButton({ myPlayerId }: Props) {
  const { game, emit, buzzersOpenedAt, lastBuzzWinner } = useSocket();
  const [pressed, setPressed] = useState(false);
  const lastEnabledAt = useRef<number | null>(null);

  const isBonusBuzz   = game?.phase === "bonus_buzzing";
  // Buzzers are open during a regular buzz phase OR a bonus-buzz phase.
  const buzzersOpen   = isBonusBuzz || (game?.activeQuestion?.buzzersOpen ?? false);
  const alreadyTried  = game?.activeQuestion?.alreadyTried.includes(myPlayerId) ?? false;
  const isAnswerer    = game?.activeQuestion?.currentAnswerer === myPlayerId;
  const player        = game?.players[myPlayerId];

  // During bonus buzz there's no alreadyTried / isAnswerer concept — just alive check.
  const eligible =
    !!player &&
    !player.eliminated &&
    buzzersOpen &&
    (isBonusBuzz ? true : !alreadyTried && !isAnswerer);

  useEffect(() => {
    if (buzzersOpen) {
      lastEnabledAt.current = buzzersOpenedAt ?? Date.now();
      setPressed(false);
    } else {
      lastEnabledAt.current = null;
    }
  }, [buzzersOpen, buzzersOpenedAt]);

  const handleBuzz = () => {
    if (!eligible || pressed || lastEnabledAt.current === null) return;
    playBuzz();
    const reactionMs = Date.now() - lastEnabledAt.current;
    setPressed(true);
    emit("player:buzz", { clientReactionMs: reactionMs });
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {isBonusBuzz && (
        <div className="text-xs font-extrabold text-amber-300 uppercase tracking-widest animate-pulse">
          🎯 Bonusrunde!
        </div>
      )}
      <button
        type="button"
        disabled={!eligible || pressed}
        onClick={handleBuzz}
        className={[
          "w-44 h-44 rounded-full font-extrabold text-4xl transition-all border-4",
          eligible && !pressed
            ? isBonusBuzz
              ? "bg-gradient-to-br from-amber-300 to-orange-500 border-amber-200 text-emerald-950 hover:scale-105 active:scale-95 shadow-2xl shadow-orange-400/60 animate-pulse-slow"
              : "bg-gradient-to-br from-amber-400 to-amber-600 border-amber-200 text-emerald-950 hover:scale-105 active:scale-95 shadow-2xl shadow-amber-400/60 animate-pulse-slow"
            : pressed
              ? "bg-emerald-600 border-emerald-300 text-white"
              : "bg-emerald-950 border-emerald-800 text-emerald-700 cursor-not-allowed",
        ].join(" ")}
      >
        BUZZ
      </button>
      {!isBonusBuzz && alreadyTried ? (
        <div className="text-sm text-emerald-400/70">Bereits versucht</div>
      ) : null}
      {lastBuzzWinner ? (
        lastBuzzWinner.playerId === myPlayerId ? (
          <div className="text-sm text-amber-300 font-bold">
            Du hast gebuzzert! ({lastBuzzWinner.reactionMs}ms)
          </div>
        ) : (
          <div className="text-sm text-emerald-300/80">
            {game?.players[lastBuzzWinner.playerId]?.displayName ?? "?"} war zuerst
            <span className="text-emerald-500/70 ml-1">
              ({lastBuzzWinner.reactionMs}ms)
            </span>
          </div>
        )
      ) : null}
    </div>
  );
}
