"use client";

import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/lib/socket-context";

interface Props {
  myPlayerId: string;
}

export function BuzzButton({ myPlayerId }: Props) {
  const { game, emit, buzzersOpenedAt, lastBuzzWinner } = useSocket();
  const [pressed, setPressed] = useState(false);
  const lastEnabledAt = useRef<number | null>(null);

  const buzzersOpen = game?.activeQuestion?.buzzersOpen ?? false;
  const alreadyTried =
    game?.activeQuestion?.alreadyTried.includes(myPlayerId) ?? false;
  const isAnswerer =
    game?.activeQuestion?.currentAnswerer === myPlayerId;
  const player = game?.players[myPlayerId];
  const eligible =
    !!player &&
    !player.eliminated &&
    buzzersOpen &&
    !alreadyTried &&
    !isAnswerer;

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
    const reactionMs = Date.now() - lastEnabledAt.current;
    setPressed(true);
    emit("player:buzz", { clientReactionMs: reactionMs });
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={!eligible || pressed}
        onClick={handleBuzz}
        className={[
          "w-44 h-44 rounded-full font-extrabold text-4xl transition-all border-4",
          eligible && !pressed
            ? "bg-red-600 border-red-300 text-white hover:bg-red-500 active:scale-95 shadow-lg shadow-red-500/50"
            : pressed
              ? "bg-yellow-600 border-yellow-300 text-white"
              : "bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed",
        ].join(" ")}
      >
        BUZZ
      </button>
      {alreadyTried ? (
        <div className="text-sm text-zinc-500">Already tried</div>
      ) : null}
      {lastBuzzWinner && lastBuzzWinner.playerId === myPlayerId ? (
        <div className="text-sm text-yellow-400">
          You buzzed in! ({lastBuzzWinner.reactionMs}ms)
        </div>
      ) : null}
    </div>
  );
}
