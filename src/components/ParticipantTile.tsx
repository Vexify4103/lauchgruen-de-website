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
  gameId: _gameId,
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

  const ringClasses = isCurrentTurn
    ? "ring-4 ring-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.55)]"
    : isHost
      ? "ring-2 ring-emerald-500/60"
      : "ring-1 ring-emerald-900/60";

  return (
    // Parent controls sizing — tile fills 100% of whatever container it's placed in
    <div
      className={[
        "relative w-full h-full bg-emerald-950 rounded-xl overflow-hidden transition-all",
        ringClasses,
        player.eliminated ? "opacity-40 grayscale" : "",
      ].join(" ")}
    >
      {/* Cam iframe fills entire tile */}
      {!hideVideo ? (
        <iframe
          src={viewUrl}
          allow="autoplay; camera; microphone; fullscreen; display-capture"
          className="absolute inset-0 w-full h-full border-0"
          title={`${player.displayName} cam`}
        />
      ) : null}

      {/* Score badge — amber pill top-left */}
      {showStats ? (
        <div className="absolute top-2 left-2 z-10 bg-emerald-950/80 text-amber-300 font-extrabold text-xs px-2 py-0.5 rounded-full border border-amber-300/40 shadow">
          {player.score}
        </div>
      ) : null}

      {/* HOST badge */}
      {isHost ? (
        <div className="absolute top-2 right-2 bg-amber-500 text-emerald-950 text-xs font-extrabold px-2 py-0.5 rounded z-10 shadow">
          🍯 HOST
        </div>
      ) : null}

      {/* Avatar */}
      {player.avatarUrl ? (
        <Image
          src={player.avatarUrl}
          alt={player.displayName}
          width={variant === "host" ? 40 : 28}
          height={variant === "host" ? 40 : 28}
          className="absolute bottom-6 left-2 z-10 rounded-full border-2 border-emerald-950"
          unoptimized
        />
      ) : null}

      {/* Name bar at bottom */}
      <div
        className={[
          "absolute bottom-0 left-0 right-0 z-10 px-2 py-1 flex items-center justify-between",
          isCurrentTurn
            ? "bg-gradient-to-r from-amber-500 to-amber-600"
            : "bg-gradient-to-r from-emerald-900/90 to-emerald-800/90",
        ].join(" ")}
      >
        <span
          className={[
            "font-extrabold uppercase tracking-wider truncate",
            variant === "host" ? "text-sm" : "text-xs",
            isCurrentTurn ? "text-emerald-950" : "text-amber-100",
          ].join(" ")}
        >
          {player.displayName}
        </span>
        {showStats ? (
          <div className="flex gap-0.5 shrink-0 ml-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={[
                  "text-xs leading-none",
                  i < player.hearts ? "text-red-400" : "text-emerald-800",
                ].join(" ")}
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
