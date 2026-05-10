"use client";

import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
  onPickCell?: (category: string, points: number) => void;
}

const POINT_VALUES = [100, 200, 300, 400, 500] as const;

export function Board({ game, onPickCell }: Props) {
  return (
    <div
      className="grid gap-1 select-none"
      style={{
        gridTemplateColumns: `repeat(${game.categories.length}, minmax(0, 1fr))`,
      }}
    >
      {game.categories.map((cat) => (
        <div
          key={cat.id}
          className="bg-blue-700 text-center font-bold uppercase tracking-wide py-3 rounded-md"
        >
          {cat.displayName}
        </div>
      ))}
      {POINT_VALUES.map((points) =>
        game.categories.map((cat) => {
          const cell = game.board.find(
            (c) => c.category === cat.id && c.points === points,
          );
          if (!cell) {
            return (
              <div
                key={`${cat.id}-${points}`}
                className="bg-zinc-800 rounded-md min-h-[80px]"
              />
            );
          }
          const used = cell.used;
          return (
            <button
              key={`${cat.id}-${points}`}
              type="button"
              disabled={used || !onPickCell}
              onClick={() => onPickCell?.(cat.id, points)}
              className={[
                "rounded-md min-h-[80px] text-3xl font-extrabold transition-colors",
                used
                  ? "bg-zinc-900 text-zinc-700"
                  : "bg-blue-900 text-yellow-400 hover:bg-blue-800",
                onPickCell && !used ? "cursor-pointer" : "cursor-default",
              ].join(" ")}
            >
              {used ? "" : points}
            </button>
          );
        }),
      )}
    </div>
  );
}
