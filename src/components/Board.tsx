"use client";

import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
  /** Host: pick an unused cell to start a question. */
  onPickCell?: (category: string, points: number) => void;
  /** Host: click a used cell to open it for review. */
  onViewCell?: (category: string, points: number) => void;
  /** Host: switch to a different board. */
  onSwitchBoard?: (index: number) => void;
}

const POINT_VALUES = [100, 200, 300, 400, 500] as const;

export function Board({ game, onPickCell, onViewCell, onSwitchBoard }: Props) {
  const hasMultipleBoards = game.boards.length > 1;

  return (
    <div className="flex flex-col gap-1.5 w-full h-full min-h-0">
      {/* Board tabs — always show when there are multiple boards */}
      {hasMultipleBoards && (
        <div className="flex gap-1.5 shrink-0">
          {game.boards.map((b, idx) => {
            const isCurrent = idx === game.currentBoardIndex;
            const allUsed = b.board.length > 0 && b.board.every((c) => c.used);
            return (
              <button
                key={idx}
                type="button"
                disabled={isCurrent || !onSwitchBoard}
                onClick={() => onSwitchBoard?.(idx)}
                className={[
                  "flex-1 rounded-lg py-1 text-xs font-extrabold uppercase tracking-wider border transition-colors",
                  isCurrent
                    ? "bg-amber-500 text-emerald-950 border-amber-300"
                    : allUsed
                      ? "bg-emerald-950/40 text-emerald-700 border-emerald-900/30 line-through"
                      : onSwitchBoard
                        ? "bg-emerald-900 hover:bg-emerald-800 text-amber-300 border-emerald-700 cursor-pointer"
                        : "bg-emerald-900/40 text-amber-300/50 border-emerald-800/40 cursor-default",
                ].join(" ")}
              >
                Feld {idx + 1}
                {b.categories[0] ? ` · ${b.categories[0].displayName.slice(0, 8)}…` : ""}
              </button>
            );
          })}
        </div>
      )}

      {/* Grid */}
      <div
        className="grid gap-1.5 select-none w-full flex-1 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${game.categories.length}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${POINT_VALUES.length}, minmax(0, 1fr))`,
        }}
      >
        {game.categories.map((cat) => (
          <div
            key={cat.id}
            className="bg-red-700 text-white text-center font-extrabold uppercase tracking-wider py-2 rounded-lg text-xs border border-red-500/60 shadow-md flex items-center justify-center"
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
                  className="bg-blue-950/60 rounded-lg"
                />
              );
            }

            const used = cell.used;

            if (used) {
              // Used cells: click to review (host only), read-only for others.
              return (
                <button
                  key={`${cat.id}-${points}`}
                  type="button"
                  disabled={!onViewCell}
                  onClick={() => onViewCell?.(cat.id, points)}
                  className={[
                    "rounded-lg font-extrabold italic transition-all border flex items-center justify-center",
                    "bg-emerald-950/40 text-emerald-800 border-emerald-900/30 line-through",
                    onViewCell
                      ? "cursor-pointer hover:bg-emerald-900/60 hover:text-emerald-600"
                      : "cursor-not-allowed",
                  ].join(" ")}
                  style={{ fontSize: "clamp(0.6rem, 1.4vw, 1.1rem)" }}
                  title={onViewCell ? "Klicken, um diese Frage anzusehen" : undefined}
                >
                  {points}
                </button>
              );
            }

            return (
              <button
                key={`${cat.id}-${points}`}
                type="button"
                disabled={!onPickCell}
                onClick={() => onPickCell?.(cat.id, points)}
                className={[
                  "rounded-lg font-extrabold italic transition-all border flex items-center justify-center",
                  "bg-gradient-to-br from-emerald-800 to-emerald-900 text-amber-300 border-emerald-700 shadow-inner",
                  onPickCell
                    ? "cursor-pointer hover:from-emerald-700 hover:to-emerald-800 hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-400/20 active:scale-95"
                    : "",
                ].join(" ")}
                style={{ fontSize: "clamp(0.6rem, 1.4vw, 1.1rem)" }}
              >
                {points}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
