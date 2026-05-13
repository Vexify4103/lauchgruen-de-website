"use client";

import { useSocket } from "@/lib/socket-context";
import type { ClientGameState } from "@/server/types";

interface Props {
  game: ClientGameState;
}

const PHASE_LABELS: Record<string, string> = {
  lobby: "Warteraum",
  playing: "Spiel läuft",
  bonus_pending: "Bonus bereit",
  bonus_buzzing: "Bonus-Buzzer offen",
  finished: "Spiel beendet",
};

export function HostControls({ game }: Props) {
  const { emit, lastBuzzWinner } = useSocket();
  const activeQuestion = game.activeQuestion;
  const phase = game.phase;
  const phaseLabel = PHASE_LABELS[phase] ?? phase;
  const isBonusPending = phase === "bonus_pending";
  const isBonusBuzz = phase === "bonus_buzzing";
  const bonusWinnerPending =
    game.isBonusRound && !activeQuestion && phase === "playing" && game.currentTurn;
  const bonusWinnerName = bonusWinnerPending
    ? game.players[game.currentTurn!]?.displayName ?? "?"
    : null;

  const contestants = game.playerOrder
    .filter((pid) => pid !== game.hostId)
    .map((pid) => game.players[pid])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="surface-panel themed-scrollbar h-full overflow-y-auto rounded-[1.6rem] p-4">
      <div className="section-kicker">Host-Steuerung</div>
      <div className="mt-3 text-xl font-black text-amber-100">Regie</div>
      <div className="mt-2 text-sm text-emerald-100/72">
        Phase: <span className="font-bold text-amber-300">{phaseLabel}</span>
        {game.isBonusRound ? (
          <span className="ml-2 rounded-full bg-amber-400/16 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">
            Bonus
          </span>
        ) : null}
      </div>

      {isBonusPending ? (
        <div className="mt-5 rounded-[1.4rem] border border-amber-400/35 bg-amber-400/10 p-4">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
            Bonus bereit
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => emit("host:open_bonus_buzzers")}
              className="rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-emerald-950"
            >
              Bonus-Buzzer öffnen
            </button>
            <button
              type="button"
              onClick={() => emit("host:cancel_bonus_buzz")}
              className="rounded-2xl border border-red-500/35 bg-red-950/35 px-4 py-3 text-sm font-bold text-red-200 transition-colors hover:bg-red-900/45"
            >
              Bonus überspringen
            </button>
          </div>
        </div>
      ) : null}

      {isBonusBuzz ? (
        <div className="mt-5 rounded-[1.4rem] border border-amber-400/30 bg-amber-400/10 p-4">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
            Bonus-Buzzer offen
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => emit("host:force_resolve_bonus")}
              className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-emerald-950"
            >
              Buzz auswerten
            </button>
            <button
              type="button"
              onClick={() => emit("host:cancel_bonus_buzz")}
              className="rounded-2xl border border-red-500/35 bg-red-950/35 px-4 py-3 text-sm font-bold text-red-200 transition-colors hover:bg-red-900/45"
            >
              Bonus abbrechen
            </button>
          </div>
        </div>
      ) : null}

      {bonusWinnerPending && bonusWinnerName ? (
        <div className="mt-5 rounded-[1.4rem] border border-amber-400/30 bg-amber-400/10 p-4">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
            Bonus-Gewinner
          </div>
          <div className="mt-2 text-lg font-black text-amber-100">
            {bonusWinnerName}
            {lastBuzzWinner && lastBuzzWinner.playerId === game.currentTurn ? (
              <span className="ml-2 text-xs font-medium text-amber-200/76">
                {lastBuzzWinner.reactionMs}ms
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-emerald-100/74">
            Wähle jetzt auf dem Board die gewünschte Frage für den nächsten Zug.
          </p>
        </div>
      ) : null}

      {activeQuestion ? (
        <div className="mt-5 rounded-[1.4rem] border border-emerald-300/10 bg-emerald-950/35 p-4 text-sm text-emerald-100/72">
          {activeQuestion.buzzersOpen && !activeQuestion.currentAnswerer
            ? "Buzzer sind offen."
            : activeQuestion.currentAnswerer
              ? `Antwortet: ${game.players[activeQuestion.currentAnswerer]?.displayName ?? "?"}`
              : "Frage aktiv."}
        </div>
      ) : null}

      {game.boards.length > 1 ? (
        <div className="mt-5 border-t border-emerald-300/10 pt-4">
          <div className="section-kicker">Felder</div>
          <div className="mt-3 flex gap-2">
            {game.boards.map((board, idx) => {
              const isCurrent = idx === game.currentBoardIndex;
              const allUsed = board.board.every((cell) => cell.used);
              const canSwitch = !isCurrent && phase === "playing";
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!canSwitch}
                  onClick={() => canSwitch && emit("host:switch_board", { index: idx })}
                  className={[
                    "flex-1 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors",
                    isCurrent
                      ? "bg-amber-400 text-emerald-950"
                      : allUsed
                        ? "bg-emerald-950/40 text-emerald-700 line-through"
                        : canSwitch
                          ? "bg-emerald-800 text-emerald-100 hover:bg-emerald-700"
                          : "bg-emerald-950/40 text-emerald-700",
                  ].join(" ")}
                >
                  Feld {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-5 border-t border-emerald-300/10 pt-4">
        <div className="section-kicker">Zug setzen</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {contestants.map((player) => {
            const active = game.currentTurn === player.id;
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => emit("host:set_turn", { playerId: player.id })}
                className={[
                  "rounded-xl px-3 py-2 text-xs font-bold transition-colors",
                  active
                    ? "bg-amber-400 text-emerald-950"
                    : "bg-emerald-800 text-emerald-100 hover:bg-emerald-700",
                ].join(" ")}
              >
                {player.displayName}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
