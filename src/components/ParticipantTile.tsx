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
  isLeader?: boolean;
}

const VDO_VIEW_PARAMS = [
  "cover",
  "cleanoutput",
  "noaudio",
  "transparent",
  "autorecover",
  "scale=100",
  "videobitrate=3200",
  "buffer=200",
].join("&");

export function ParticipantTile({
  player,
  isCurrentTurn,
  isHost,
  hideVideo,
  variant = "contestant",
  showStats = true,
  isLeader = false,
}: Props) {
  const viewUrl = `https://vdo.ninja/?view=${encodeURIComponent(player.vdoStreamId)}&${VDO_VIEW_PARAMS}`;

  const frameClasses = isCurrentTurn
    ? "border-4 border-amber-300 shadow-[0_0_26px_rgba(252,211,77,0.45)]"
    : isHost
      ? "border-2 border-emerald-400/45"
      : "border border-emerald-900/60";
  const offlineClasses = player.connected === false ? "opacity-55 grayscale" : "";
  const avatarSize = variant === "host" ? 46 : 38;

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

      {player.avatarUrl ? (
        <div
          className={[
            "absolute bottom-2 left-2 z-10 rounded-full p-0.5 shadow-lg",
            isCurrentTurn
              ? "bg-amber-300 shadow-amber-300/35"
              : "bg-emerald-950/88 shadow-black/30",
          ].join(" ")}
        >
          <Image
            src={player.avatarUrl}
            alt={player.displayName}
            width={avatarSize}
            height={avatarSize}
            className="rounded-full border-2 border-emerald-950 object-cover"
            unoptimized
          />
          {isLeader ? (
            <div className="absolute -right-1.5 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-amber-100/75 bg-gradient-to-br from-amber-200 via-amber-400 to-orange-400 shadow-lg shadow-amber-400/30">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 fill-emerald-950"
              >
                <path d="M5.2 18.4h13.6l1.1-9.6-4.5 3.2-3.4-6.4L8.6 12 4.1 8.8l1.1 9.6Zm.4 2.4h12.8v-1.6H5.6v1.6Z" />
              </svg>
              <span className="sr-only">Fuehrend</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
