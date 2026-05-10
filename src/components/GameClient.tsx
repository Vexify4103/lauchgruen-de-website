"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSocket } from "@/lib/socket-context";
import { Board } from "@/components/Board";
import { ParticipantTile } from "@/components/ParticipantTile";
import { QuestionModal } from "@/components/QuestionModal";
import { BuzzButton } from "@/components/BuzzButton";
import { HostControls } from "@/components/HostControls";

interface Props {
  gameId: string;
  userId: string;
  mode: "host" | "play";
}

export function GameClient({ gameId, userId, mode }: Props) {
  const { game, joinGame, connected, emit } = useSocket();

  useEffect(() => {
    void joinGame(gameId);
  }, [gameId, joinGame]);

  if (!game || !connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-300">
        Connecting to game…
      </div>
    );
  }

  const isHost = game.hostId === userId;
  const players = game.playerOrder
    .map((id) => game.players[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const handlePickCell =
    isHost && game.phase === "playing"
      ? (category: string, points: number) =>
          emit("host:pick_cell", { category, points })
      : undefined;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-4">
      <header className="flex items-center justify-between mb-4">
        <Link href="/" className="text-zinc-500 text-sm hover:text-zinc-300">
          ← Home
        </Link>
        <div className="text-sm text-zinc-400">
          Game{" "}
          <span className="font-mono font-bold text-yellow-400">{gameId}</span>{" "}
          · {mode === "host" ? "HOST" : "PLAYER"} ·{" "}
          <span className="font-mono">{game.phase}</span>
        </div>
      </header>

      {game.phase === "finished" && game.winnerId ? (
        <div className="text-center py-12 bg-yellow-500/10 border-2 border-yellow-400 rounded-lg mb-4">
          <div className="text-5xl font-extrabold text-yellow-400 mb-2">
            🏆 {game.players[game.winnerId]?.displayName} wins!
          </div>
          <div className="text-zinc-400">Final score: {game.players[game.winnerId]?.score}</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="flex flex-col gap-4">
          <Board game={game} onPickCell={handlePickCell} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {players.map((p) => (
              <ParticipantTile
                key={p.id}
                player={p}
                gameId={gameId}
                isCurrentTurn={game.currentTurn === p.id}
                isHost={p.id === game.hostId}
                hideVideo={mode === "host" && p.id === userId}
              />
            ))}
          </div>
        </div>
        <aside className="flex flex-col gap-4">
          {isHost ? <HostControls /> : null}
          {!isHost && game.phase !== "lobby" && game.phase !== "finished" ? (
            <BuzzButton myPlayerId={userId} />
          ) : null}
        </aside>
      </div>

      <QuestionModal game={game} />
    </div>
  );
}
