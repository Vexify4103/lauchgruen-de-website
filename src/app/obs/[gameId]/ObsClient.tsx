"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSocket } from "@/lib/socket-context";
import { Board } from "@/components/Board";
import { ParticipantTile } from "@/components/ParticipantTile";
import { TurnIndicator } from "@/components/TurnIndicator";
import { ChatOverlay } from "@/components/ChatOverlay";
import { StartingSoon } from "@/components/StartingSoon";
import { GameNotFound } from "@/components/GameNotFound";

interface Props {
  gameId: string;
  hideSelf?: string;
  compact: boolean;
}

export function ObsClient({ gameId, hideSelf, compact }: Props) {
  const { game, spectateGame, connected, lastJudgeResult } = useSocket();
  const [correctFlash, setCorrectFlash] = useState(false);
  const [wrongFlash,   setWrongFlash]   = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNotFound(false);
    void spectateGame(gameId).then((resp) => {
      if (cancelled) return;
      if (!resp.ok) setNotFound(true);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, spectateGame]);

  // Ensure body/html don't add their own background on top of ours
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

  // Flash on judge result
  useEffect(() => {
    if (!lastJudgeResult) return;
    if (lastJudgeResult.correct) {
      setCorrectFlash(true);
      const t = setTimeout(() => setCorrectFlash(false), 1600);
      return () => clearTimeout(t);
    } else {
      setWrongFlash(true);
      const t = setTimeout(() => setWrongFlash(false), 1200);
      return () => clearTimeout(t);
    }
  }, [lastJudgeResult]);

  if (notFound) {
    return <GameNotFound code={gameId} />;
  }

  if (!game || !connected) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-emerald-700">
        🐻 Warte auf Spiel…
      </div>
    );
  }

  // Pre-show: game exists but hasn't started yet → "Starting Soon" preview.
  if (game.phase === "lobby") {
    return <StartingSoon game={game} />;
  }

  const hostPlayer = game.players[game.hostId];
  const contestants = game.playerOrder
    .filter((id) => id !== game.hostId)
    .map((id) => game.players[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .filter((p) => !hideSelf || p.twitchLogin !== hideSelf);

  const CONTESTANT_ROW_H = 175;

  const flashOn    = correctFlash || wrongFlash;
  const flashColor = correctFlash
    ? { shadow: "inset 0 0 140px 50px rgba(34,197,94,0.55)", border: "rgba(34,197,94,0.85)", bg: "rgba(34,197,94,0.04)" }
    : { shadow: "inset 0 0 100px 30px rgba(220,38,38,0.5)",  border: "rgba(220,38,38,0.8)",  bg: "rgba(220,38,38,0.04)" };

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50 flex flex-col"
      style={{ padding: "10px", gap: "8px" }}
    >
      {/* Top 3-col: host cam | board | logo + turn indicator */}
      <div
        className="grid flex-1 min-h-0"
        style={{ gridTemplateColumns: "380px 1fr 240px", gap: "8px" }}
      >
        {/* Host cam — 16:9 wrapper, plus this streamer's Twitch chat below */}
        <div className="flex flex-col gap-2 min-h-0">
          <div className="aspect-video w-full shrink-0">
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
              <div className="w-full h-full" />
            )}
          </div>

          {/* Twitch chat — streamer's own if hideself=, else host's.
              Custom widget: 7TV + BTTV + FFZ + Twitch native emotes, read-only,
              no cookies, no input box, no third-party account needed. */}
          {(() => {
            const chatChannel = hideSelf || hostPlayer?.twitchLogin;
            if (!chatChannel) return null;
            return (
              <div className="flex-1 min-h-0 rounded-xl overflow-hidden border-2 border-emerald-800 bg-emerald-950/70 shadow-lg backdrop-blur-sm">
                <ChatOverlay channel={chatChannel} />
              </div>
            );
          })()}
        </div>

        {/* Board — read-only (no callbacks) */}
        <Board game={game} />

        <div className="flex flex-col gap-2 items-center justify-start pt-2">
          <Image
            src="/bear-logo.png"
            alt="QuizDuell Bear"
            width={72}
            height={72}
            className="drop-shadow-2xl"
            priority
          />
          <div className="text-xl font-extrabold text-amber-300 tracking-tight drop-shadow text-center">
            QUIZ<span className="text-emerald-200">DUELL</span> 🍯
          </div>
          <TurnIndicator game={game} />
        </div>
      </div>

      {/* Contestants row — flex + fixed height → always 16:9 */}
      <div
        className="flex gap-2 justify-center shrink-0"
        style={{ height: `${CONTESTANT_ROW_H}px` }}
      >
        {contestants.map((p) => (
          <div key={p.id} className="h-full aspect-video">
            <ParticipantTile
              player={p}
              gameId={gameId}
              isCurrentTurn={game.currentTurn === p.id}
              isHost={false}
            />
          </div>
        ))}
      </div>

      {/* Active question banner */}
      {game.activeQuestion ? (
        <div className="shrink-0 bg-emerald-950/85 border-2 border-amber-400/60 rounded-xl p-4 text-center backdrop-blur-sm shadow-2xl">
          <div className="text-amber-300 text-xs font-extrabold uppercase tracking-widest mb-1">
            {game.categories.find((c) => c.id === game.activeQuestion?.category)
              ?.displayName}{" "}
            · {game.activeQuestion.points}
          </div>
          <div className="text-2xl font-bold text-amber-50">
            {game.activeQuestion.question.prompt}
          </div>
          {game.activeQuestion.buzzersOpen ? (
            <div className="text-emerald-300 font-extrabold animate-pulse mt-2 text-lg">
              ⚡ BUZZER OFFEN
            </div>
          ) : null}
        </div>
      ) : null}

      {game.phase === "finished" && game.winnerId ? (
        <div className="shrink-0 text-center bg-amber-500/20 border-2 border-amber-400 rounded-xl p-4">
          <div className="text-3xl font-extrabold text-amber-300">
            🏆 {game.players[game.winnerId]?.displayName} gewinnt!
          </div>
        </div>
      ) : null}

      {/* ── Correct / wrong flash overlay ── */}
      <div
        className="fixed inset-0 z-[70] pointer-events-none rounded transition-opacity duration-300"
        style={{
          opacity:         flashOn ? 1 : 0,
          boxShadow:       flashOn ? flashColor.shadow : "none",
          border:          `10px solid ${flashOn ? flashColor.border : "transparent"}`,
          backgroundColor: flashOn ? flashColor.bg    : "transparent",
        }}
      />
    </div>
  );
}
