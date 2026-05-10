"use client";

import Image from "next/image";
import type { Player } from "@/server/types";

interface Props {
  player: Player;
  gameId: string;
  isCurrentTurn: boolean;
  isHost: boolean;
  hideVideo?: boolean;
}

export function ParticipantTile({
  player,
  gameId,
  isCurrentTurn,
  isHost,
  hideVideo,
}: Props) {
  const viewUrl = `https://vdo.ninja/?view=${encodeURIComponent(player.vdoStreamId)}&room=quizduell-${encodeURIComponent(gameId)}&cover&cleanoutput&noaudio&transparent`;

  return (
    <div
      className={[
        "relative flex flex-col bg-zinc-900 rounded-lg overflow-hidden border-2",
        isCurrentTurn ? "border-yellow-400 shadow-lg shadow-yellow-400/40" : "border-zinc-800",
        player.eliminated ? "opacity-50 grayscale" : "",
      ].join(" ")}
    >
      <div className="aspect-video bg-zinc-950 relative">
        {!hideVideo ? (
          <iframe
            src={viewUrl}
            allow="autoplay; camera; microphone; fullscreen; display-capture"
            className="absolute inset-0 w-full h-full border-0"
            title={`${player.displayName} cam`}
          />
        ) : null}
        {player.avatarUrl ? (
          <Image
            src={player.avatarUrl}
            alt={player.displayName}
            width={64}
            height={64}
            className="absolute bottom-2 left-2 rounded-full border-2 border-zinc-900 z-10"
            unoptimized
          />
        ) : null}
        {isHost ? (
          <div className="absolute top-2 left-2 bg-purple-600 text-xs font-bold px-2 py-0.5 rounded z-10">
            HOST
          </div>
        ) : null}
      </div>
      <div className="px-3 py-2 flex items-center justify-between bg-zinc-900">
        <div className="font-semibold truncate">{player.displayName}</div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={i < player.hearts ? "text-red-500" : "text-zinc-700"}
              >
                ♥
              </span>
            ))}
          </div>
          <div className="font-mono font-bold text-yellow-400 min-w-[3ch] text-right">
            {player.score}
          </div>
        </div>
      </div>
    </div>
  );
}
