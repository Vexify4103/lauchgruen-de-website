"use client";

import Image from "next/image";
import type { Player } from "@/server/types";

interface Props {
  player: Player;
  gameId: string;
  isCurrentTurn: boolean;
  isHost: boolean;
  hideVideo?: boolean;
  /** Visual size variant. "host" = large top-left tile; "contestant" = bottom-row tile. */
  variant?: "host" | "contestant";
  /** Show score/hearts UI. Hosts don't have either. */
  showStats?: boolean;
}

export function ParticipantTile({
  player,
  gameId,
  isCurrentTurn,
  isHost,
  hideVideo,
  variant = "contestant",
  showStats = true,
}: Props) {
  // VDO.Ninja streamIds are globally unique (we generate them server-side),
  // so we view by streamId directly. Including &room= here causes VDO.Ninja
  // to fall into "join room as participant" mode and prompt for a camera
  // instead of just viewing the publisher's stream.
  // &autorecover: auto-reconnect if the P2P link drops mid-game.
  const viewUrl = `https://vdo.ninja/?view=${encodeURIComponent(player.vdoStreamId)}&cover&cleanoutput&noaudio&transparent&autorecover`;

  const glowClasses = isCurrentTurn
    ? "border-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.6)] animate-pulse-slow"
    : isHost
      ? "border-emerald-400/60"
      : "border-emerald-900";

  return (
    <div
      className={[
        "relative flex flex-col bg-emerald-950 rounded-xl overflow-hidden border-2 transition-all",
        glowClasses,
        player.eliminated ? "opacity-40 grayscale" : "",
      ].join(" ")}
    >
      <div
        className={
          variant === "host"
            ? "aspect-[4/3] bg-emerald-950 relative"
            : "aspect-video bg-emerald-950 relative"
        }
      >
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
            width={variant === "host" ? 96 : 56}
            height={variant === "host" ? 96 : 56}
            className={
              variant === "host"
                ? "absolute bottom-3 left-3 rounded-full border-2 border-emerald-950 z-10"
                : "absolute bottom-2 left-2 rounded-full border-2 border-emerald-950 z-10"
            }
            unoptimized
          />
        ) : null}
        {showStats ? (
          <div className="absolute top-2 left-2 z-10 bg-emerald-950/80 text-amber-300 font-bold px-2 py-0.5 rounded-full text-sm border border-amber-300/40">
            {player.score}
          </div>
        ) : null}
        {isHost ? (
          <div className="absolute top-2 right-2 bg-amber-500 text-emerald-950 text-xs font-extrabold px-2 py-0.5 rounded z-10 shadow">
            🍯 HOST
          </div>
        ) : null}
      </div>
      <div
        className={[
          "px-3 py-2 flex items-center justify-between bg-gradient-to-r from-emerald-900 to-emerald-800",
          isCurrentTurn ? "from-amber-500 to-amber-600 text-emerald-950" : "",
        ].join(" ")}
      >
        <div
          className={[
            "font-bold truncate uppercase tracking-wide",
            variant === "host" ? "text-lg" : "text-sm",
            isCurrentTurn ? "text-emerald-950" : "text-amber-100",
          ].join(" ")}
        >
          {player.displayName}
        </div>
        {showStats ? (
          <div className="flex gap-0.5 text-base">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={
                  i < player.hearts
                    ? "text-red-500 drop-shadow"
                    : "text-emerald-700"
                }
              >
                ♥
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
