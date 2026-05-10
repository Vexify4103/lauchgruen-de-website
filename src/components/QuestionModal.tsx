"use client";

import { useSocket } from "@/lib/socket-context";
import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
  isHost: boolean;
}

export function QuestionModal({ game, isHost }: Props) {
  const { emit } = useSocket();
  if (!game.activeQuestion) return null;
  const aq = game.activeQuestion;
  const q = aq.question;
  const answerer = aq.currentAnswerer ? game.players[aq.currentAnswerer] : null;
  const categoryName = game.categories.find((c) => c.id === q.category)?.displayName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/70 backdrop-blur-sm p-6">
      <div className="bg-gradient-to-b from-emerald-900 to-emerald-950 border-2 border-amber-400/60 rounded-2xl max-w-3xl w-full p-8 shadow-2xl shadow-amber-400/20">
        <div className="text-amber-300 text-sm font-extrabold uppercase tracking-widest mb-3 text-center">
          {categoryName} · {q.points}
        </div>
        <div className="text-3xl font-bold mb-6 text-amber-50 text-center leading-snug">
          {q.prompt}
        </div>
        {q.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={q.imageUrl}
            alt=""
            className="max-h-80 mx-auto mb-6 rounded-lg border border-emerald-700"
          />
        ) : null}

        {q.answer ? (
          <div className="bg-amber-950/60 border border-amber-400/40 text-amber-200 rounded-lg px-4 py-3 mb-6">
            <div className="text-xs uppercase font-bold opacity-70 tracking-wider">
              🍯 Answer (host only)
            </div>
            <div className="text-2xl font-bold text-amber-100">{q.answer}</div>
          </div>
        ) : null}

        {answerer ? (
          <div className="text-center mb-4 text-amber-100 text-lg">
            <span className="font-extrabold text-amber-300">
              {answerer.displayName}
            </span>{" "}
            is answering
          </div>
        ) : aq.buzzersOpen ? (
          <div className="text-center mb-4 text-emerald-300 font-extrabold text-xl animate-pulse">
            🐻 BUZZERS OPEN
          </div>
        ) : (
          <div className="text-center mb-4 text-emerald-400/70 italic">
            Waiting for host…
          </div>
        )}

        {isHost ? (
          <div className="flex gap-3 justify-center pt-2 border-t border-emerald-800">
            <div className="flex-1" />
            {!answerer && !aq.buzzersOpen ? (
              <button
                type="button"
                onClick={() => emit("host:open_buzzers")}
                className="bg-amber-500 hover:bg-amber-400 text-emerald-950 font-extrabold rounded-lg px-6 py-3 mt-3 transition-colors"
              >
                ⚡ Open buzzers
              </button>
            ) : null}
            {answerer ? (
              <>
                <button
                  type="button"
                  onClick={() => emit("host:judge", { correct: true })}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-extrabold rounded-lg px-6 py-3 mt-3 transition-colors text-lg shadow-lg shadow-emerald-500/30"
                >
                  ✓ Correct
                </button>
                <button
                  type="button"
                  onClick={() => emit("host:judge", { correct: false })}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-extrabold rounded-lg px-6 py-3 mt-3 transition-colors text-lg shadow-lg shadow-red-500/30"
                >
                  ✗ Wrong
                </button>
              </>
            ) : null}
            <div className="flex-1" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
