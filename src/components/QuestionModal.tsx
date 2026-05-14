"use client";

import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/lib/socket-context";
import { playBuzz } from "@/lib/sounds";
import { QuestionImage } from "@/components/QuestionImage";
import { QuestionAudio } from "@/components/QuestionAudio";
import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
  isHost: boolean;
  myPlayerId?: string;
}

export function QuestionModal({ game, isHost, myPlayerId }: Props) {
  const { emit, buzzersOpenedAt } = useSocket();
  const [buzzPressed, setBuzzPressed] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const lastEnabledAt = useRef<number | null>(null);

  // Derived values — computed unconditionally (no hooks, just reads)
  const aq = game.activeQuestion;
  const q = aq?.question;
  const answerer = aq?.currentAnswerer ? game.players[aq.currentAnswerer] : null;
  const isBonusBuzzerQ = aq?.category === "_bonus_buzzer";
  const categoryName = isBonusBuzzerQ
    ? "🎯 Bonusrunde"
    : aq
      ? game.categories.find((c) => c.id === aq.category)?.displayName
      : "";
  const buzzersOpen = aq?.buzzersOpen ?? false;
  const answerRevealed = aq?.answerRevealed ?? false;
  const alreadyTried = myPlayerId ? (aq?.alreadyTried.includes(myPlayerId) ?? false) : true;
  const isAnswerer = aq?.currentAnswerer === myPlayerId;
  const me = myPlayerId ? game.players[myPlayerId] : null;
  const eligible =
    !isHost && !!me && buzzersOpen && !alreadyTried && !isAnswerer;

  // Reset answer reveal + buzz state when question changes
  const questionId = aq?.questionId ?? null;
  useEffect(() => {
    setShowAnswer(false);
    setBuzzPressed(false);
    lastEnabledAt.current = null;
  }, [questionId]);

  // Track buzzers-opened timestamp for reaction time
  useEffect(() => {
    if (buzzersOpen) {
      lastEnabledAt.current = buzzersOpenedAt ?? Date.now();
      setBuzzPressed(false);
    } else {
      lastEnabledAt.current = null;
    }
  }, [buzzersOpen, buzzersOpenedAt]);

  // Safe to bail now — all hooks are above
  if (!aq || !q) return null;

  const handleBuzz = () => {
    if (!eligible || buzzPressed || lastEnabledAt.current === null) return;
    playBuzz();
    const reactionMs = Date.now() - lastEnabledAt.current;
    setBuzzPressed(true);
    emit("player:buzz", { clientReactionMs: reactionMs });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/75 backdrop-blur-sm p-4">
        <div className="bg-gradient-to-b from-emerald-900 to-emerald-950 border-2 border-amber-400/60 rounded-2xl max-w-3xl w-full p-6 shadow-2xl shadow-amber-400/20 flex flex-col gap-4">

          {/* Category + points badge */}
          <div className="text-center">
            <span className="inline-block bg-amber-500 text-emerald-950 text-xs font-extrabold uppercase tracking-widest px-4 py-1.5 rounded-full shadow">
              {categoryName} · {q.points}
            </span>
          </div>

          {/* Prompt */}
          <div className="text-2xl font-bold text-amber-50 text-center leading-snug">
            {q.prompt}
          </div>

          {/* Image — 16:9 preview, click anywhere on it to toggle lightbox */}
          {q.imageUrl ? (
            <div className="px-4">
              <QuestionImage src={q.imageUrl} />
            </div>
          ) : null}

          {/* Audio — custom player so non-host users can click play even if
              the browser blocks autoplay */}
          {q.audioUrl ? <QuestionAudio src={q.audioUrl} /> : null}

          {/* ── Answer reveal ─────────────────────────────────────────────── */}
          {answerRevealed && q.answer ? (
            /* Revealed to everyone after host skips buzzers */
            <div className="bg-amber-500/20 border-2 border-amber-400 rounded-xl px-5 py-4 text-center">
              <div className="text-xs uppercase font-bold text-amber-300/70 tracking-wider mb-1">
                🍯 Antwort
              </div>
              <div className="text-2xl font-extrabold text-amber-100">{q.answer}</div>
              {q.answerImageUrl ? (
                <div className="mt-4">
                  <QuestionImage src={q.answerImageUrl} />
                </div>
              ) : null}
              <div className="text-xs text-emerald-400/60 mt-2 animate-pulse">
                Zurück zum Spielfeld…
              </div>
            </div>
          ) : isHost && q.answer ? (
            /* Host-only toggle (anti-stream-snipe) */
            showAnswer ? (
              <div className="bg-amber-950/60 border border-amber-400/40 rounded-lg px-4 py-3 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase font-bold text-amber-300/60 tracking-wider mb-1">
                      🍯 Antwort
                    </div>
                    <div className="text-xl font-bold text-amber-100">{q.answer}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAnswer(false)}
                    className="text-amber-300/50 hover:text-amber-300 text-xs shrink-0 mt-0.5"
                  >
                    verbergen
                  </button>
                </div>
                {q.answerImageUrl ? <QuestionImage src={q.answerImageUrl} /> : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAnswer(true)}
                className="self-center bg-emerald-900 hover:bg-emerald-800 border border-emerald-700 text-emerald-300 hover:text-amber-300 font-bold rounded-lg px-5 py-2 text-sm transition-colors"
              >
                🔍 Antwort anzeigen
              </button>
            )
          ) : null}

          {/* ── Status row ── (hidden while answer is being revealed) */}
          {!answerRevealed ? (
            answerer ? (
              /* Someone is answering */
              <div className="text-center text-emerald-100 text-lg">
                {isAnswerer ? (
                  <span className="font-extrabold text-amber-300 text-xl">
                    Du bist dran!
                  </span>
                ) : (
                  <>
                    <span className="font-extrabold text-amber-300">
                      {answerer.displayName}
                    </span>{" "}
                    antwortet…
                  </>
                )}
              </div>
            ) : buzzersOpen ? (
              /* Buzz phase */
              !isHost ? (
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    disabled={!eligible || buzzPressed}
                    onClick={handleBuzz}
                    className={[
                      "w-36 h-36 rounded-full font-extrabold text-3xl transition-all border-4",
                      eligible && !buzzPressed
                        ? "bg-gradient-to-br from-amber-400 to-amber-600 border-amber-200 text-emerald-950 hover:scale-105 active:scale-95 shadow-2xl shadow-amber-400/60 animate-pulse"
                        : buzzPressed
                          ? "bg-emerald-600 border-emerald-300 text-white"
                          : "bg-emerald-950 border-emerald-800 text-emerald-700 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {buzzPressed ? "✓" : "BUZZ"}
                  </button>
                  {alreadyTried && !isAnswerer ? (
                    <div className="text-sm text-emerald-400/70">Diese Frage bereits versucht</div>
                  ) : eligible ? (
                    <div className="text-sm text-amber-300 font-bold animate-pulse">⚡ Buzzer offen!</div>
                  ) : null}
                </div>
              ) : (
                <div className="text-center text-emerald-300 font-extrabold text-xl animate-pulse">
                  🐻 BUZZER OFFEN — warte auf Buzzes…
                </div>
              )
            ) : (
              !isHost ? (
                <div className="text-center text-emerald-400/70 italic text-sm">
                  Warte auf Host…
                </div>
              ) : null
            )
          ) : null}

          {/* ── Host buttons ────────────────────────────────────────────── */}
          {isHost && !answerRevealed ? (
            game.phase === "bonus_pending" ? (
              /* Bonus image is staged, buzzers not open yet — host's talk window. */
              <div className="flex gap-3 pt-2 border-t border-emerald-800">
                <button
                  type="button"
                  onClick={() => emit("host:open_bonus_buzzers")}
                  className="flex-1 bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-emerald-950 font-extrabold rounded-lg px-6 py-3 transition-colors text-lg shadow-lg shadow-amber-400/30"
                >
                  ⚡ Bonus-Buzzer öffnen
                </button>
                <button
                  type="button"
                  onClick={() => emit("host:cancel_bonus_buzz")}
                  className="bg-red-900/70 hover:bg-red-800 border border-red-700 text-red-200 font-bold rounded-lg px-4 py-3 text-sm transition-colors"
                >
                  ✕ Bonus überspringen
                </button>
              </div>
            ) : answerer ? (
              /* Judge buttons */
              <div className="flex gap-3 pt-2 border-t border-emerald-800">
                <button
                  type="button"
                  onClick={() => emit("host:judge", { correct: true })}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-extrabold rounded-lg px-6 py-3 transition-colors text-lg shadow-lg shadow-emerald-500/30"
                >
                  ✓ Richtig
                </button>
                <button
                  type="button"
                  onClick={() => emit("host:judge", { correct: false })}
                  className="flex-1 bg-red-700 hover:bg-red-600 text-white font-extrabold rounded-lg px-6 py-3 transition-colors text-lg shadow-lg"
                >
                  {isBonusBuzzerQ ? "✗ Falsch" : "✗ Falsch → Buzzer"}
                </button>
              </div>
            ) : buzzersOpen ? (
              /* Buzzers-open phase — allow host to skip / force-resolve */
              <div className="flex gap-3 pt-2 border-t border-emerald-800">
                {isBonusBuzzerQ ? (
                  <button
                    type="button"
                    onClick={() => emit("host:force_resolve_bonus")}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-emerald-950 font-extrabold rounded-lg px-6 py-3 transition-colors text-base"
                    title="Falls ein Spieler gebuzzert hat, das System aber hängt — jetzt auswerten."
                  >
                    ⚡ Buzz jetzt auswerten
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => emit("host:reveal_and_close")}
                    className="flex-1 bg-emerald-900 hover:bg-emerald-800 border border-emerald-700 text-amber-300 hover:text-amber-200 font-extrabold rounded-lg px-6 py-3 transition-colors text-base"
                  >
                    📖 Antwort zeigen &amp; Zug beenden
                  </button>
                )}
              </div>
            ) : null
          ) : null}
        </div>
      </div>
    </>
  );
}
