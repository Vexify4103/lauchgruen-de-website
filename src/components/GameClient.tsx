"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSocket } from "@/lib/socket-context";
import { Board } from "@/components/Board";
import { ParticipantTile } from "@/components/ParticipantTile";
import { QuestionModal } from "@/components/QuestionModal";
import { BuzzButton } from "@/components/BuzzButton";
import { HostControls } from "@/components/HostControls";
import { TurnIndicator } from "@/components/TurnIndicator";

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
      <div className="min-h-screen flex items-center justify-center bg-emerald-950 text-amber-300">
        🐻 Connecting to game…
      </div>
    );
  }

  const isHost = game.hostId === userId;
  const hostPlayer = game.players[game.hostId];
  const contestants = game.playerOrder
    .filter((id) => id !== game.hostId)
    .map((id) => game.players[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const handlePickCell =
    isHost && game.phase === "playing"
      ? (category: string, points: number) =>
          emit("host:pick_cell", { category, points })
      : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50 p-4 flex flex-col">
      {/* Top bar with logo */}
      <div className="flex items-center justify-between mb-3 px-2">
        <Link
          href="/"
          className="text-emerald-400/70 text-sm hover:text-amber-300 transition-colors"
        >
          ← Home
        </Link>
        <div className="text-2xl font-extrabold tracking-tight text-amber-300 drop-shadow">
          🐻 QUIZ<span className="text-emerald-200">DUELL</span> 🍯
        </div>
        <div className="text-xs text-emerald-300/70">
          {gameId} ·{" "}
          <span className="font-mono text-amber-300">{game.phase}</span>
        </div>
      </div>

      {game.phase === "finished" && game.winnerId ? (
        <div className="text-center py-6 bg-amber-500/10 border-2 border-amber-400 rounded-xl mb-4">
          <div className="text-5xl font-extrabold text-amber-300 mb-2 drop-shadow-lg">
            🏆 {game.players[game.winnerId]?.displayName} wins!
          </div>
          <div className="text-emerald-200">
            Final score: {game.players[game.winnerId]?.score}
          </div>
        </div>
      ) : null}

      {/* Main 3-col layout: host cam | board | right panel */}
      <div className="grid grid-cols-[300px_1fr_260px] gap-4 flex-1 min-h-0">
        {/* Host cam (top-left, big) */}
        <div className="flex flex-col gap-3 min-h-0">
          {hostPlayer ? (
            <ParticipantTile
              player={hostPlayer}
              gameId={gameId}
              isCurrentTurn={false}
              isHost
              variant="host"
              showStats={false}
            />
          ) : (
            <div className="aspect-[4/3] bg-emerald-950/60 border-2 border-emerald-800 rounded-xl flex items-center justify-center text-emerald-700">
              host offline
            </div>
          )}
        </div>

        {/* Board */}
        <div className="min-h-0">
          <Board game={game} onPickCell={handlePickCell} />
        </div>

        {/* Right panel: buzz / host controls + turn indicator */}
        <div className="flex flex-col gap-3 min-h-0">
          {isHost ? (
            <HostControls game={game} />
          ) : (
            <div className="flex justify-center pt-2">
              <BuzzButton myPlayerId={userId} />
            </div>
          )}
          <TurnIndicator game={game} />
        </div>
      </div>

      {/* Bottom row: contestants */}
      <div
        className="grid gap-3 mt-4"
        style={{
          gridTemplateColumns: `repeat(${Math.max(contestants.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {contestants.map((p) => (
          <ParticipantTile
            key={p.id}
            player={p}
            gameId={gameId}
            isCurrentTurn={game.currentTurn === p.id}
            isHost={false}
          />
        ))}
      </div>

      <QuestionModal game={game} isHost={isHost} />
    </div>
  );
}
