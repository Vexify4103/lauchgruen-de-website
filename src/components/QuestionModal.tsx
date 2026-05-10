"use client";

import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
}

export function QuestionModal({ game }: Props) {
  if (!game.activeQuestion) return null;
  const q = game.activeQuestion.question;
  const answerer = game.activeQuestion.currentAnswerer
    ? game.players[game.activeQuestion.currentAnswerer]
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-3xl w-full mx-6 p-8">
        <div className="text-yellow-400 text-sm font-bold uppercase tracking-wide mb-2">
          {game.categories.find((c) => c.id === q.category)?.displayName} — {q.points}
        </div>
        <div className="text-2xl font-semibold mb-6">{q.prompt}</div>
        {q.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={q.imageUrl}
            alt=""
            className="max-h-80 mx-auto mb-6 rounded"
          />
        ) : null}
        {q.answer ? (
          <div className="bg-green-950 border border-green-800 text-green-300 rounded px-4 py-3 mb-4">
            <div className="text-xs uppercase font-bold opacity-70">Answer (host only)</div>
            <div className="text-xl font-bold">{q.answer}</div>
          </div>
        ) : null}
        {answerer ? (
          <div className="text-center text-zinc-300">
            <span className="font-bold text-yellow-400">{answerer.displayName}</span>{" "}
            is answering
          </div>
        ) : game.activeQuestion.buzzersOpen ? (
          <div className="text-center text-green-400 font-bold animate-pulse">
            Buzzers OPEN
          </div>
        ) : (
          <div className="text-center text-zinc-500">
            Waiting for host…
          </div>
        )}
      </div>
    </div>
  );
}
