"use client";

import { useEffect } from "react";
import { useSocket } from "@/lib/socket-context";
import { Board } from "@/components/Board";
import { ParticipantTile } from "@/components/ParticipantTile";

interface Props {
  gameId: string;
  hideSelf?: string;
  compact: boolean;
}

export function ObsClient({ gameId, hideSelf, compact }: Props) {
  const { game, spectateGame, connected } = useSocket();

  useEffect(() => {
    void spectateGame(gameId);
  }, [gameId, spectateGame]);

  // Force transparent body for OBS browser source
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.background;
    const prevHtml = html.style.background;
    body.style.background = "transparent";
    html.style.background = "transparent";
    return () => {
      body.style.background = prevBody;
      html.style.background = prevHtml;
    };
  }, []);

  if (!game || !connected) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/50">
        Waiting for game…
      </div>
    );
  }

  const players = game.playerOrder
    .map((id) => game.players[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .filter((p) => !hideSelf || p.twitchLogin !== hideSelf);

  return (
    <div
      className={
        compact
          ? "min-h-screen p-2 text-white"
          : "min-h-screen p-6 text-white"
      }
      style={{ background: "transparent" }}
    >
      <div
        className={
          compact
            ? "flex flex-col gap-3"
            : "max-w-[1820px] mx-auto flex flex-col gap-6"
        }
      >
        <div className="flex items-center justify-between">
          <div className="text-xl font-bold drop-shadow">
            QuizDuell ·{" "}
            <span className="font-mono text-yellow-400">{gameId}</span>
          </div>
          {game.currentTurn && game.players[game.currentTurn] ? (
            <div className="text-lg drop-shadow">
              Turn:{" "}
              <span className="text-yellow-400 font-bold">
                {game.players[game.currentTurn].displayName}
              </span>
            </div>
          ) : null}
        </div>

        <Board game={game} />

        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${Math.max(players.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {players.map((p) => (
            <ParticipantTile
              key={p.id}
              player={p}
              gameId={gameId}
              isCurrentTurn={game.currentTurn === p.id}
              isHost={p.id === game.hostId}
            />
          ))}
        </div>

        {game.activeQuestion ? (
          <div className="bg-black/80 border border-white/20 rounded-lg p-6 text-center">
            <div className="text-yellow-400 text-sm font-bold uppercase mb-1">
              {game.categories.find((c) => c.id === game.activeQuestion?.category)
                ?.displayName}{" "}
              — {game.activeQuestion.points}
            </div>
            <div className="text-2xl font-semibold">
              {game.activeQuestion.question.prompt}
            </div>
            {game.activeQuestion.buzzersOpen ? (
              <div className="text-green-400 font-bold animate-pulse mt-2">
                BUZZERS OPEN
              </div>
            ) : null}
          </div>
        ) : null}

        {game.phase === "finished" && game.winnerId ? (
          <div className="text-center bg-yellow-500/20 border-2 border-yellow-400 rounded-lg p-6">
            <div className="text-4xl font-extrabold text-yellow-400">
              🏆 {game.players[game.winnerId]?.displayName} wins!
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
