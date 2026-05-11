"use client";

/**
 * Pre-show "Starting Soon" screen for the OBS overlay.
 *
 * Mirrors the exact layout of the live game (host cam | board | logo,
 * with contestant row underneath and chat below the host cam) but with
 * placeholder content so viewers see what's coming.
 *
 * Real players from the lobby are shown in the contestant slots with their
 * Twitch avatars + names, so the pre-show graphic feels personalized.
 */

import Image from "next/image";
import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
}

const CONTESTANT_ROW_H = 175;
const POINT_VALUES = [100, 200, 300, 400, 500];

export function StartingSoon({ game }: Props) {
  const hostPlayer = game.hostId ? game.players[game.hostId] : null;
  const contestants = game.playerOrder
    .filter((id) => id !== game.hostId)
    .map((id) => game.players[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  // Max 5 contestants + host. Always render 5 slots so the layout previews
  // exactly what the live game will look like at full capacity (and "freie
  // Plätze" placeholders fill in for whichever spots haven't been claimed yet).
  const SLOT_COUNT = 5;
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => contestants[i] ?? null);

  // Use the first board's categories as a preview (or empty placeholders).
  const previewCategories =
    game.boards[0]?.categories.slice(0, 6) ??
    Array.from({ length: 6 }, (_, i) => ({ id: `_${i}`, displayName: "—" }));

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50 flex flex-col relative"
      style={{ padding: "10px", gap: "8px" }}
    >
      {/* ── Big STARTING SOON overlay banner ── */}
      <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
        <div className="bg-emerald-950/85 backdrop-blur-md border-4 border-amber-400 rounded-3xl px-12 py-8 shadow-2xl shadow-amber-400/30 flex flex-col items-center gap-3">
          <Image
            src="/bear-logo.png"
            alt="QuizDuell Bear"
            width={120}
            height={120}
            className="drop-shadow-2xl animate-pulse-slow"
            priority
            fetchPriority="high"
          />
          <div className="text-5xl font-extrabold tracking-tight text-amber-300 drop-shadow-lg text-center">
            QUIZ<span className="text-emerald-200">DUELL</span>
            <span className="ml-2">🍯</span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-100 uppercase tracking-[0.4em] animate-pulse">
            Gleich geht's los
          </div>
        </div>
      </div>

      {/* ── Top 3-col layout (placeholder) ── */}
      <div
        className="grid flex-1 min-h-0 opacity-50"
        style={{ gridTemplateColumns: "380px 1fr 240px", gap: "8px" }}
      >
        {/* Host cam + chat placeholders */}
        <div className="flex flex-col gap-2 min-h-0">
          <div className="aspect-video w-full shrink-0 rounded-xl border-2 border-amber-400/40 bg-emerald-950/60 flex items-center justify-center relative overflow-hidden">
            {hostPlayer?.avatarUrl ? (
              <Image
                src={hostPlayer.avatarUrl}
                alt={hostPlayer.displayName}
                width={80}
                height={80}
                className="rounded-full border-2 border-amber-400 opacity-80"
                unoptimized
              />
            ) : (
              <div className="text-amber-300/70 text-3xl">🎥</div>
            )}
            <div className="absolute top-2 left-2 bg-amber-500 text-emerald-950 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider">
              🍯 Host
            </div>
            {hostPlayer ? (
              <div className="absolute bottom-2 left-2 text-amber-100 font-bold text-sm drop-shadow">
                {hostPlayer.displayName}
              </div>
            ) : null}
          </div>

          <div className="flex-1 min-h-0 rounded-xl border-2 border-emerald-800 bg-emerald-950/60 flex flex-col items-center justify-center gap-2">
            <div className="text-4xl">💬</div>
            <div className="text-emerald-300/80 text-xs font-bold uppercase tracking-wider">
              Stream-Chat
            </div>
          </div>
        </div>

        {/* Board placeholder */}
        <div className="min-h-0 flex flex-col gap-1.5">
          <div
            className="grid gap-1.5 select-none w-full flex-1 min-h-0"
            style={{
              gridTemplateColumns: `repeat(${previewCategories.length}, minmax(0, 1fr))`,
              gridTemplateRows: `auto repeat(${POINT_VALUES.length}, minmax(0, 1fr))`,
            }}
          >
            {previewCategories.map((cat) => (
              <div
                key={cat.id}
                className="bg-red-700/60 text-white text-center font-extrabold uppercase tracking-wider py-2 rounded-lg text-[10px] border border-red-500/40 flex items-center justify-center px-1"
              >
                {cat.displayName}
              </div>
            ))}

            {POINT_VALUES.map((points) =>
              previewCategories.map((cat) => (
                <div
                  key={`${cat.id}-${points}`}
                  className="rounded-lg font-extrabold italic flex items-center justify-center bg-gradient-to-br from-emerald-800/70 to-emerald-900/70 text-amber-300/70 border border-emerald-700/60"
                  style={{ fontSize: "clamp(0.6rem, 1.4vw, 1.1rem)" }}
                >
                  {points}
                </div>
              )),
            )}
          </div>
        </div>

        {/* Logo column placeholder */}
        <div className="flex flex-col gap-2 items-center justify-start pt-2 opacity-50">
          <Image
            src="/bear-logo.png"
            alt="QuizDuell Bear"
            width={72}
            height={72}
            className="drop-shadow-2xl"
            priority
          />
          <div className="text-xl font-extrabold text-amber-300 tracking-tight text-center">
            QUIZ<span className="text-emerald-200">DUELL</span> 🍯
          </div>
        </div>
      </div>

      {/* ── Contestant row placeholders (with real players if joined) ── */}
      <div
        className="flex gap-2 justify-center shrink-0 opacity-50"
        style={{ height: `${CONTESTANT_ROW_H}px` }}
      >
        {slots.map((p, idx) => (
          <div
            key={p?.id ?? `slot-${idx}`}
            className="h-full aspect-video rounded-xl border-2 border-emerald-800 bg-emerald-950/60 flex flex-col items-center justify-center gap-1.5 relative overflow-hidden"
          >
            {p ? (
              <>
                {p.avatarUrl ? (
                  <Image
                    src={p.avatarUrl}
                    alt={p.displayName}
                    width={48}
                    height={48}
                    className="rounded-full border-2 border-emerald-600"
                    unoptimized
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-emerald-800" />
                )}
                <div className="text-emerald-100 font-bold text-xs truncate max-w-[90%]">
                  {p.displayName}
                </div>
                {p.ready ? (
                  <div className="text-[9px] font-extrabold bg-emerald-500 text-emerald-950 px-1.5 py-0.5 rounded uppercase">
                    Bereit
                  </div>
                ) : (
                  <div className="text-[9px] font-extrabold bg-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded uppercase">
                    Tritt bei…
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-3xl text-emerald-700">🎥</div>
                <div className="text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                  Freier Platz
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
