"use client";

import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
  onPickCell?: (category: string, points: number) => void;
  onViewCell?: (category: string, points: number) => void;
  onSwitchBoard?: (index: number) => void;
}

const POINT_VALUES = [100, 200, 300, 400, 500] as const;

export function Board({ game, onPickCell, onViewCell, onSwitchBoard }: Props) {
  const hasMultipleBoards = game.boards.length > 1;
  const isBoardLocked = game.boards
    .slice(0, game.currentBoardIndex)
    .some((board) => !board.board.every((cell) => cell.used));

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      {hasMultipleBoards ? (
        <div className="flex shrink-0 gap-2">
          {game.boards.map((board, idx) => {
            const isCurrent = idx === game.currentBoardIndex;
            const allUsed = board.board.length > 0 && board.board.every((cell) => cell.used);
            const canSwitch = !!onSwitchBoard && !isCurrent;

            return (
              <button
                key={idx}
                type="button"
                disabled={!canSwitch}
                onClick={() => canSwitch && onSwitchBoard?.(idx)}
                className={[
                  "flex-1 rounded-2xl border px-3 py-2 text-xs font-black uppercase tracking-[0.16em] transition-all",
                  isCurrent
                    ? "border-amber-200 bg-gradient-to-r from-amber-300 to-orange-300 text-emerald-950 shadow-lg shadow-amber-500/15"
                    : allUsed
                      ? "border-emerald-900/30 bg-emerald-950/30 text-emerald-700 line-through"
                      : canSwitch
                        ? "border-emerald-700 bg-emerald-900/85 text-amber-200 hover:border-amber-300/35 hover:bg-emerald-800"
                        : "border-emerald-800/35 bg-emerald-900/40 text-amber-300/45",
                ].join(" ")}
              >
                Feld {idx + 1}
              </button>
            );
          })}
        </div>
      ) : null}

      {isBoardLocked ? (
        <div className="shrink-0 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.14em] text-amber-200/82">
          Feld {game.currentBoardIndex + 1} wird freigeschaltet, sobald das vorige Feld leer gespielt ist
        </div>
      ) : null}

      <div
        className="grid min-h-0 flex-1 gap-2 select-none rounded-[1.5rem] bg-[#031a12] p-2"
        style={{
          gridTemplateColumns: `repeat(${game.categories.length}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${POINT_VALUES.length}, minmax(0, 1fr))`,
        }}
      >
        {game.categories.map((category) => (
          <div
            key={category.id}
            className="flex items-center justify-center rounded-2xl border border-red-400/40 bg-gradient-to-b from-red-700 via-red-800 to-red-950 px-2 py-3 text-center text-[11px] font-black uppercase tracking-[0.16em] text-red-50 shadow-lg shadow-black/15"
          >
            {category.displayName}
          </div>
        ))}

        {POINT_VALUES.map((points) =>
          game.categories.map((category) => {
            const cell = game.board.find(
              (boardCell) =>
                boardCell.category === category.id && boardCell.points === points,
            );

            if (!cell) {
              return (
                <div
                  key={`${category.id}-${points}`}
                  className="rounded-2xl bg-emerald-950/35"
                />
              );
            }

            if (cell.used) {
              return (
                <button
                  key={`${category.id}-${points}`}
                  type="button"
                  disabled={!onViewCell}
                  onClick={() => onViewCell?.(category.id, points)}
                  className={[
                    "relative flex items-center justify-center overflow-hidden rounded-2xl border text-center font-black transition-all",
                    "border-emerald-900/25 bg-gradient-to-b from-emerald-950/50 to-emerald-950/75 text-emerald-700/82",
                    onViewCell
                      ? "hover:border-amber-400/18 hover:bg-emerald-900/70 hover:text-emerald-500"
                      : "cursor-not-allowed",
                  ].join(" ")}
                  style={{ fontSize: "clamp(0.8rem, 1.8vw, 1.4rem)" }}
                  title={onViewCell ? "Frage zur Nachschau oeffnen" : undefined}
                >
                  <span className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-emerald-700/45" />
                  <span className="relative">{points}</span>
                </button>
              );
            }

            if (isBoardLocked) {
              return (
                <div
                  key={`${category.id}-${points}`}
                  className="flex items-center justify-center rounded-2xl border border-emerald-900/20 bg-emerald-950/30 text-xl text-emerald-700/45"
                  title="Vorheriges Feld muss erst abgeschlossen werden"
                >
                  •
                </div>
              );
            }

            return (
              <button
                key={`${category.id}-${points}`}
                type="button"
                disabled={!onPickCell}
                onClick={() => onPickCell?.(category.id, points)}
                className={[
                  "relative flex items-center justify-center overflow-hidden rounded-2xl border text-center font-black transition-all",
                  "border-emerald-600/65 bg-gradient-to-b from-emerald-700 via-emerald-800 to-emerald-950 text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                  onPickCell
                    ? "hover:-translate-y-0.5 hover:border-amber-300/40 hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-900 hover:text-amber-100 hover:shadow-xl hover:shadow-amber-500/12 active:translate-y-0"
                    : "",
                ].join(" ")}
                style={{ fontSize: "clamp(0.85rem, 2vw, 1.55rem)" }}
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/6 to-transparent" />
                <span className="relative tracking-[0.08em]">{points}</span>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
