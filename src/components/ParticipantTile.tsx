"use client";

import Image from "next/image";
import type { Player } from "@/server/types";

interface Props {
  player: Player;
  gameId: string;
  isCurrentTurn: boolean;
  isHost: boolean;
  hideVideo?: boolean;
  variant?: "host" | "contestant";
  showStats?: boolean;
}

export function ParticipantTile({
  player,
  isCurrentTurn,
  isHost,
  hideVideo,
  variant = "contestant",
  showStats = true,
}: Props) {
  const viewUrl = `https://vdo.ninja/?view=${encodeURIComponent(player.vdoStreamId)}&cover&cleanoutput&noaudio&transparent&autorecover&buffer=0`;

  const frameClasses = isCurrentTurn
    ? "ring-4 ring-amber-300 shadow-[0_0_26px_rgba(252,211,77,0.45)]"
    : isHost
      ? "ring-2 ring-emerald-400/45"
      : "ring-1 ring-emerald-900/60";
  const offlineClasses = player.connected === false ? "opacity-55 grayscale" : "";
  const avatarSize = variant === "host" ? 42 : 30;

  return (
    <div
      className={[
        "relative h-full w-full overflow-hidden rounded-[1.15rem] bg-emerald-950 transition-all",
        frameClasses,
        offlineClasses,
      ].join(" ")}
    >
      {player.avatarUrl ? (
        <Image
          src={player.avatarUrl}
          alt=""
          width={120}
          height={120}
          className="pointer-events-none absolute inset-0 m-auto rounded-full border-2 border-emerald-800/75 opacity-35"
          unoptimized
        />
      ) : null}

      {!hideVideo && player.vdoStreamId ? (
        <iframe
          key={player.vdoStreamId}
          src={viewUrl}
          allow="autoplay; camera; microphone; fullscreen; display-capture"
          className="absolute inset-0 h-full w-full border-0"
          title={`${player.displayName} cam`}
          loading="eager"
        />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/30 to-transparent" />

      {showStats ? (
        <div className="absolute left-2 top-2 z-10 rounded-full border border-amber-300/30 bg-emerald-950/82 px-2.5 py-1 text-[11px] font-black text-amber-200 shadow">
          {player.score}
        </div>
      ) : null}

      {isHost ? (
        <div className="absolute right-2 top-2 z-10 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-950 shadow">
          Host
        </div>
      ) : player.connected === false ? (
        <div className="absolute right-2 top-2 z-10 rounded-full border border-red-400/30 bg-red-950/65 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-red-200">
          Offline
        </div>
      ) : null}

      <div
        className={[
          "absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 px-2.5 py-2",
          isCurrentTurn
            ? "bg-gradient-to-r from-amber-300 via-amber-400 to-orange-300"
            : "bg-gradient-to-r from-emerald-950/96 via-emerald-900/94 to-emerald-800/92",
        ].join(" ")}
      >
        <div className="flex min-w-0 items-center gap-2">
          {player.avatarUrl ? (
            <Image
              src={player.avatarUrl}
              alt={player.displayName}
              width={avatarSize}
              height={avatarSize}
              className="rounded-full border-2 border-emerald-950 object-cover"
              unoptimized
            />
          ) : null}
          <div className="min-w-0">
            <div
              className={[
                "truncate font-black uppercase tracking-[0.12em]",
                variant === "host" ? "text-sm" : "text-xs",
                isCurrentTurn ? "text-emerald-950" : "text-amber-50",
              ].join(" ")}
            >
              {player.displayName}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
