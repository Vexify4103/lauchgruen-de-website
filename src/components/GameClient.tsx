"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSocket } from "@/lib/socket-context";
import { Board } from "@/components/Board";
import { ParticipantTile } from "@/components/ParticipantTile";
import { QuestionModal } from "@/components/QuestionModal";
import { ReviewQuestionModal } from "@/components/ReviewQuestionModal";
import { BuzzButton } from "@/components/BuzzButton";
import { HostControls } from "@/components/HostControls";
import { TurnIndicator } from "@/components/TurnIndicator";
import Image from "next/image";
import { playCorrect, playWrong } from "@/lib/sounds";

interface Props {
  gameId: string;
  userId: string;
  mode: "host" | "play";
}

export function GameClient({ gameId, userId, mode }: Props) {
  const { game, joinGame, connected, emit, lastJudgeResult } = useSocket();
  const [correctFlash, setCorrectFlash] = useState(false);
  const [wrongFlash,   setWrongFlash]   = useState(false);
  /** Non-host local review: the questionId currently being viewed, or null. */
  const [localReviewId, setLocalReviewId] = useState<string | null>(null);

  useEffect(() => {
    void joinGame(gameId);
  }, [gameId, joinGame]);

  // Sound + screen flash on judge result
  useEffect(() => {
    if (!lastJudgeResult) return;
    if (lastJudgeResult.correct) {
      playCorrect();
      setCorrectFlash(true);
      const t = setTimeout(() => setCorrectFlash(false), 1600);
      return () => clearTimeout(t);
    } else {
      playWrong();
      setWrongFlash(true);
      const t = setTimeout(() => setWrongFlash(false), 1200);
      return () => clearTimeout(t);
    }
  }, [lastJudgeResult]);

  if (!game || !connected) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-emerald-950 text-amber-300">
        🐻 Verbinde mit Spiel…
      </div>
    );
  }

  const isHost = game.hostId === userId;
  const hostPlayer = game.players[game.hostId];
  const contestants = game.playerOrder
    .filter((id) => id !== game.hostId)
    .map((id) => game.players[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  // Host picks an unused cell to start a question (only during "playing").
  const handlePickCell =
    isHost && game.phase === "playing"
      ? (category: string, points: number) =>
          emit("host:pick_cell", { category, points })
      : undefined;

  // Clicking a used cell:
  //  - Host   → broadcast the review to all clients (OBS sees it too)
  //  - Others → open a local-only modal using usedQuestionData
  const handleViewCell = !game.activeQuestion
    ? (category: string, points: number) => {
        if (isHost) {
          emit("host:open_review", { category, points });
        } else {
          const cell = game.board.find(
            (c) => c.category === category && c.points === points,
          );
          if (cell) setLocalReviewId(cell.questionId);
        }
      }
    : undefined;

  // Host switches boards (only while no question is active).
  const handleSwitchBoard =
    isHost && game.phase === "playing"
      ? (index: number) => emit("host:switch_board", { index })
      : undefined;

  const CONTESTANT_ROW_H = 175;

  // Flash overlay style (green = correct, red = wrong)
  const flashOn    = correctFlash || wrongFlash;
  const flashColor = correctFlash
    ? { shadow: "inset 0 0 140px 50px rgba(34,197,94,0.55)", border: "rgba(34,197,94,0.85)", bg: "rgba(34,197,94,0.04)" }
    : { shadow: "inset 0 0 100px 30px rgba(220,38,38,0.5)",  border: "rgba(220,38,38,0.8)",  bg: "rgba(220,38,38,0.04)" };

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50 flex flex-col"
      style={{ padding: "10px", gap: "8px" }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ height: "38px" }}
      >
        <Link
          href="/"
          className="text-emerald-500/60 text-xs hover:text-amber-300 transition-colors"
        >
          ← Startseite
        </Link>

        <div className="flex items-center gap-2">
          <Image
            src="/bear-logo.png"
            alt="Bear"
            width={32}
            height={32}
            className="drop-shadow"
            priority
          />
          <span className="text-2xl font-extrabold tracking-tight text-amber-300 drop-shadow">
            QUIZ<span className="text-emerald-200">DUELL</span> 🍯
          </span>
        </div>

        <div className="flex items-center gap-3">
          <TurnIndicator game={game} />
          <div className="text-xs text-emerald-700 font-mono">{gameId}</div>
        </div>
      </div>

      {/* ── Winner banner ── */}
      {game.phase === "finished" && game.winnerId ? (
        <div className="shrink-0 text-center py-3 bg-amber-500/10 border-2 border-amber-400 rounded-xl">
          <div className="text-4xl font-extrabold text-amber-300">
            🏆 {game.players[game.winnerId]?.displayName} gewinnt! ({game.players[game.winnerId]?.score} Pkt)
          </div>
        </div>
      ) : null}

      {/* ── Main 3-col: host cam | board | right panel ── */}
      <div
        className="grid flex-1 min-h-0"
        style={{ gridTemplateColumns: "380px 1fr 240px", gap: "8px" }}
      >
        {/* Host cam */}
        <div className="min-h-0 flex flex-col gap-2">
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
              <div className="w-full h-full bg-emerald-950/60 rounded-xl border-2 border-emerald-800 flex items-center justify-center text-emerald-700 text-sm">
                Host offline
              </div>
            )}
          </div>
        </div>

        {/* Board */}
        <div className="min-h-0">
          <Board
            game={game}
            onPickCell={handlePickCell}
            onViewCell={handleViewCell}
            onSwitchBoard={handleSwitchBoard}
          />
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-2 min-h-0 overflow-y-auto">
          {isHost ? <HostControls game={game} /> : null}
          {!isHost && !game.activeQuestion ? (
            <div className="flex justify-center pt-4">
              <BuzzButton myPlayerId={userId} />
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Bottom row: contestants ── */}
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

      {/* Active question modal */}
      <QuestionModal game={game} isHost={isHost} myPlayerId={userId} />

      {/* Review modal — host broadcast or local non-host view */}
      <ReviewQuestionModal
        game={game}
        isHost={isHost}
        localQuestionId={localReviewId}
        onCloseLocal={() => setLocalReviewId(null)}
      />

      {/* ── Correct / wrong flash overlay ── */}
      <div
        className="fixed inset-0 z-[70] pointer-events-none rounded transition-opacity duration-300"
        style={{
          opacity: flashOn ? 1 : 0,
          boxShadow:       flashOn ? flashColor.shadow : "none",
          border:          `10px solid ${flashOn ? flashColor.border : "transparent"}`,
          backgroundColor: flashOn ? flashColor.bg    : "transparent",
        }}
      />
    </div>
  );
}
