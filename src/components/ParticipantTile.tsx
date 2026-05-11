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
  //
  // Params we use:
  //   &cover        — fill the iframe with video, cropping aspect if needed
  //   &cleanoutput  — strip VDO.Ninja's UI chrome
  //   &noaudio      — mute audio (voice is on Discord; only video is needed here)
  //   &transparent  — transparent background while no stream is connected,
  //                   so the avatar/name fallback shows through
  //   &autorecover  — auto-reconnect if the P2P link drops
  //   &buffer=0     — minimal jitter buffer for low-latency game-show feel
  //   &order=1      — connection priority (helps the SFU prefer this stream
  //                   when bandwidth is tight, e.g. 5 simultaneous cams)
  const viewUrl = `https://vdo.ninja/?view=${encodeURIComponent(player.vdoStreamId)}&cover&cleanoutput&noaudio&transparent&autorecover&buffer=0`;

  const ringClasses = isCurrentTurn
    ? "ring-4 ring-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.55)]"
    : isHost
      ? "ring-2 ring-emerald-500/60"
      : "ring-1 ring-emerald-900/60";

  // Offline streamers get dimmed so the audience sees who's actually present.
  const offlineClasses = player.connected === false ? "opacity-50 grayscale" : "";

  return (
    // Parent controls sizing — tile fills 100% of whatever container it's placed in
    <div
      className={[
        "relative w-full h-full bg-emerald-950 rounded-xl overflow-hidden transition-all",
        ringClasses,
        offlineClasses,
      ].join(" ")}
    >
      {/* Avatar fallback — visible THROUGH the transparent iframe while no
          stream is connected, so an empty tile shows the player's identity
          instead of just a black square. */}
      {player.avatarUrl ? (
        <Image
          src={player.avatarUrl}
          alt=""
          width={120}
          height={120}
          className="absolute inset-0 m-auto rounded-full border-2 border-emerald-800/80 opacity-40 pointer-events-none"
          unoptimized
        />
      ) : null}

      {/* Cam iframe fills entire tile. Stable key on streamId+gameId keeps
          React from remounting it on unrelated re-renders (avoids flicker /
          reconnect storms). */}
      {!hideVideo && player.vdoStreamId ? (
        <iframe
          key={player.vdoStreamId}
          src={viewUrl}
          allow="autoplay; camera; microphone; fullscreen; display-capture"
          className="absolute inset-0 w-full h-full border-0"
          title={`${player.displayName} cam`}
          loading="eager"
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
        {/* Hearts removed — no elimination in the current ruleset. */}
      </div>
    </div>
  );
}
