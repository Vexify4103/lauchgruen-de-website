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
      className="grid gap-1.5 select-none w-full h-full"
      style={{
        gridTemplateColumns: `repeat(${game.categories.length}, minmax(0, 1fr))`,
        gridTemplateRows: `auto repeat(${POINT_VALUES.length}, minmax(0, 1fr))`,
      }}
    >
      {game.categories.map((cat) => (
        <div
          key={cat.id}
          className="bg-gradient-to-b from-amber-500 to-amber-600 text-emerald-950 text-center font-extrabold uppercase tracking-wider py-3 rounded-lg text-sm border border-amber-400/60 shadow-md"
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
                className="bg-emerald-950/60 rounded-lg"
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
                "rounded-lg text-3xl font-extrabold transition-all border",
                used
                  ? "bg-emerald-950/40 text-emerald-900 border-emerald-900/30"
                  : "bg-gradient-to-br from-emerald-800 to-emerald-900 text-amber-300 border-emerald-700 shadow-inner",
                onPickCell && !used
                  ? "cursor-pointer hover:from-emerald-700 hover:to-emerald-800 hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-400/20"
                  : "cursor-default",
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
