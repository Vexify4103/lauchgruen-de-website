"use client";

import { useEffect } from "react";
import { useSocket } from "@/lib/socket-context";
import { Board } from "@/components/Board";
import { ParticipantTile } from "@/components/ParticipantTile";
import { TurnIndicator } from "@/components/TurnIndicator";

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
      <div className="min-h-screen flex items-center justify-center text-amber-300/70">
        🐻 Waiting for game…
      </div>
    );
  }

  const hostPlayer = game.players[game.hostId];
  const contestants = game.playerOrder
    .filter((id) => id !== game.hostId)
    .map((id) => game.players[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .filter((p) => !hideSelf || p.twitchLogin !== hideSelf);

  return (
    <div
      className={
        compact ? "min-h-screen p-3 text-emerald-50" : "min-h-screen p-6 text-emerald-50"
      }
      style={{ background: "transparent" }}
    >
      <div
        className={
          compact ? "flex flex-col gap-3" : "max-w-[1820px] mx-auto flex flex-col gap-4"
        }
      >
        {/* Top 3-col: host cam | board | turn indicator */}
        <div className="grid grid-cols-[300px_1fr_260px] gap-4">
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
            <div />
          )}

          <Board game={game} />

          <div className="flex flex-col gap-3">
            <div className="text-3xl font-extrabold text-amber-300 text-center drop-shadow tracking-tight">
              🐻 QUIZ<span className="text-emerald-200">DUELL</span> 🍯
            </div>
            <TurnIndicator game={game} />
          </div>
        </div>

        {/* Contestants row */}
        <div
          className="grid gap-3"
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

        {/* Active question banner */}
        {game.activeQuestion ? (
          <div className="bg-emerald-950/85 border-2 border-amber-400/60 rounded-xl p-6 text-center backdrop-blur-sm shadow-2xl">
            <div className="text-amber-300 text-sm font-extrabold uppercase tracking-widest mb-2">
              {game.categories.find((c) => c.id === game.activeQuestion?.category)
                ?.displayName}{" "}
              · {game.activeQuestion.points}
            </div>
            <div className="text-3xl font-bold text-amber-50">
              {game.activeQuestion.question.prompt}
            </div>
            {game.activeQuestion.buzzersOpen ? (
              <div className="text-emerald-300 font-extrabold animate-pulse mt-3 text-xl">
                ⚡ BUZZERS OPEN
              </div>
            ) : null}
          </div>
        ) : null}

        {game.phase === "finished" && game.winnerId ? (
          <div className="text-center bg-amber-500/20 border-2 border-amber-400 rounded-xl p-6">
            <div className="text-4xl font-extrabold text-amber-300">
              🏆 {game.players[game.winnerId]?.displayName} wins!
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
