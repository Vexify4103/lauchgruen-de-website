"use client";

import { useState } from "react";
import { useSocket } from "@/lib/socket-context";
import { QuestionImage } from "@/components/QuestionImage";
import { QuestionAudio } from "@/components/QuestionAudio";
import type { ClientGameState, QuestionForClient } from "@/server/types";

interface Props {
  game: ClientGameState;
  isHost: boolean;
  /**
   * Non-host local view: the questionId to display without broadcasting.
   * When set and game.reviewQuestion is null, looks up data from game.usedQuestionData.
   */
  localQuestionId?: string | null;
  onCloseLocal?: () => void;
}

export function ReviewQuestionModal({
  game,
  isHost,
  localQuestionId,
  onCloseLocal,
}: Props) {
  const { emit } = useSocket();
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  // Host broadcast takes priority; fall back to local non-host view.
  const rq = game.reviewQuestion ?? (
    localQuestionId
      ? { questionId: localQuestionId, category: "", points: 0 }
      : null
  );
  if (!rq) return null;

  const q: QuestionForClient | undefined =
    game.reviewQuestion?.question ??
    game.usedQuestionData[localQuestionId ?? ""];
  if (!q) return null;

  const isLocal = !game.reviewQuestion && !!localQuestionId;
  const categoryName =
    game.categories.find((c) => c.id === (game.reviewQuestion?.category ?? q.category))?.displayName ??
    game.boards.flatMap((b) => b.categories).find((c) => c.id === q.category)?.displayName ??
    q.category;

  const contestants = game.playerOrder
    .filter((pid) => pid !== game.hostId)
    .map((pid) => game.players[pid])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const handleJudge = (correct: boolean) => {
    if (!selectedPlayer || !game.reviewQuestion) return;
    emit("host:judge_used", {
      category: game.reviewQuestion.category,
      points:   game.reviewQuestion.points,
      playerId: selectedPlayer,
      correct,
    });
    setSelectedPlayer(null);
  };

  const handleClose = () => {
    if (isLocal) {
      onCloseLocal?.();
    } else {
      emit("host:close_review");
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/75 backdrop-blur-sm p-4">
        <div className="bg-gradient-to-b from-emerald-900 to-emerald-950 border-2 border-emerald-600/60 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="inline-block bg-emerald-700 text-emerald-100 text-xs font-extrabold uppercase tracking-widest px-4 py-1.5 rounded-full shadow">
              🔍 Überprüfung · {categoryName} · {q.points}
            </span>
            {/* Anyone can close their own local view; only host can close broadcast */}
            {(isLocal || isHost) && (
              <button
                type="button"
                onClick={handleClose}
                className="text-emerald-400 hover:text-white text-xl"
              >
                ✕
              </button>
            )}
          </div>

          {/* Prompt */}
          <div className="text-2xl font-bold text-amber-50 text-center leading-snug">
            {q.prompt}
          </div>

          {/* Image — 16:9 preview, click to enlarge */}
          {q.imageUrl ? (
            <div className="px-4">
              <QuestionImage src={q.imageUrl} />
            </div>
          ) : null}

          {/* Audio — custom player */}
          {q.audioUrl ? <QuestionAudio src={q.audioUrl} /> : null}

          {/* Answer — always visible for reviewed questions */}
          <div className="bg-amber-950/60 border border-amber-400/40 rounded-lg px-4 py-3">
            <div className="text-xs uppercase font-bold text-amber-300/60 tracking-wider mb-1">
              🍯 Antwort
            </div>
            <div className="text-xl font-bold text-amber-100">{q.answer}</div>
            {q.answerImageUrl ? (
              <div className="mt-4">
                <QuestionImage src={q.answerImageUrl} />
              </div>
            ) : null}
          </div>

          {/* Host judge section — only when it's a broadcast review (not local) */}
          {isHost && !isLocal ? (
            <div className="border-t border-emerald-800 pt-3 flex flex-col gap-3">
              <div className="text-xs uppercase font-bold text-amber-300/60 tracking-wider">
                Punkte vergeben / abziehen für Spieler
              </div>
              <div className="flex flex-wrap gap-2">
                {contestants.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlayer(selectedPlayer === p.id ? null : p.id)}
                    className={[
                      "rounded-lg px-3 py-1.5 text-sm font-bold border transition-colors",
                      selectedPlayer === p.id
                        ? "bg-amber-500 text-emerald-950 border-amber-300"
                        : "bg-emerald-800 hover:bg-emerald-700 text-emerald-100 border-emerald-700",
                    ].join(" ")}
                  >
                    {p.displayName}
                  </button>
                ))}
              </div>
              {selectedPlayer ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleJudge(true)}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-extrabold rounded-lg px-5 py-2.5 text-base transition-colors"
                  >
                    ✓ Richtig (+{q.points})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleJudge(false)}
                    className="flex-1 bg-red-700 hover:bg-red-600 text-white font-extrabold rounded-lg px-5 py-2.5 text-base transition-colors"
                    title="Macht die volle Punktzahl rückgängig — um eine falsche Vergabe zu korrigieren."
                  >
                    ✗ Falsch (−{q.points ?? 0})
                  </button>
                </div>
              ) : (
                <div className="text-xs text-emerald-500/70 italic text-center">
                  Wähle oben einen Spieler aus, um Punkte zu vergeben oder abzuziehen
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
