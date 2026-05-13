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
import { GameNotFound } from "@/components/GameNotFound";
import Image from "next/image";
import { playCorrect, playWrong } from "@/lib/sounds";

interface Props {
  gameId: string;
  userId: string;
  mode: "host" | "play";
}

const PHASE_LABELS: Record<string, string> = {
  lobby: "Warteraum",
  playing: "Spiel läuft",
  bonus_pending: "Bonus bereit",
  bonus_buzzing: "Bonus-Buzzer offen",
  finished: "Spiel beendet",
};

export function GameClient({ gameId, userId, mode }: Props) {
  const { game, joinGame, connected, emit, lastJudgeResult } = useSocket();
  const [correctFlash, setCorrectFlash] = useState(false);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [localReviewId, setLocalReviewId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void joinGame(gameId).then((resp) => {
      if (cancelled) return;
      setNotFound(!resp.ok);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, joinGame]);

  useEffect(() => {
    if (!lastJudgeResult) return;
    if (lastJudgeResult.correct) {
      playCorrect();
      const enableTimer = setTimeout(() => setCorrectFlash(true), 0);
      const timer = setTimeout(() => setCorrectFlash(false), 1600);
      return () => {
        clearTimeout(enableTimer);
        clearTimeout(timer);
      };
    }

    playWrong();
    const enableTimer = setTimeout(() => setWrongFlash(true), 0);
    const timer = setTimeout(() => setWrongFlash(false), 1200);
    return () => {
      clearTimeout(enableTimer);
      clearTimeout(timer);
    };
  }, [lastJudgeResult]);

  if (notFound) {
    return <GameNotFound code={gameId} />;
  }

  if (!game || !connected) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-emerald-950 text-amber-300">
        Verbinde mit Spiel...
      </div>
    );
  }

  const isHost = game.hostId === userId;
  const hostPlayer = game.players[game.hostId];
  const contestants = game.playerOrder
    .filter((id) => id !== game.hostId)
    .map((id) => game.players[id])
    .filter((player): player is NonNullable<typeof player> => Boolean(player));

  const handlePickCell =
    isHost && game.phase === "playing"
      ? (category: string, points: number) =>
          emit("host:pick_cell", { category, points })
      : undefined;

  const handleViewCell = !game.activeQuestion
    ? (category: string, points: number) => {
        if (isHost) {
          emit("host:open_review", { category, points });
        } else {
          const cell = game.board.find(
            (boardCell) =>
              boardCell.category === category && boardCell.points === points,
          );
          if (cell) setLocalReviewId(cell.questionId);
        }
      }
    : undefined;

  const handleSwitchBoard =
    isHost && game.phase === "playing"
      ? (index: number) => emit("host:switch_board", { index })
      : undefined;

  const contestantTileHeight =
    contestants.length >= 5 ? 204 : contestants.length === 4 ? 214 : 228;
  const contestantRowHeight = contestantTileHeight + 16;
  const flashOn = correctFlash || wrongFlash;
  const flashColor = correctFlash
    ? {
        shadow: "inset 0 0 140px 50px rgba(34,197,94,0.55)",
        border: "rgba(34,197,94,0.85)",
        bg: "rgba(34,197,94,0.04)",
      }
    : {
        shadow: "inset 0 0 100px 30px rgba(220,38,38,0.5)",
        border: "rgba(220,38,38,0.8)",
        bg: "rgba(220,38,38,0.04)",
      };

  const activeAnswerer = game.activeQuestion?.currentAnswerer
    ? game.players[game.activeQuestion.currentAnswerer]
    : null;
  const activeCategory = game.activeQuestion
    ? game.categories.find((category) => category.id === game.activeQuestion?.category)
    : null;
  const phaseLabel = PHASE_LABELS[game.phase] ?? game.phase;
  const boardStateLabel = game.activeQuestion
    ? game.activeQuestion.buzzersOpen
      ? "Buzzer offen"
      : activeAnswerer
        ? `${activeAnswerer.displayName} antwortet`
        : "Frage aktiv"
    : game.phase === "finished"
      ? "Spiel beendet"
      : "Board bereit";
  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50"
      style={{ padding: "10px", gap: "8px" }}
    >
      <header className="surface-panel-strong flex shrink-0 items-center justify-between rounded-[1.6rem] px-4 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            className="hidden text-sm text-emerald-300/62 transition-colors hover:text-amber-300 sm:block"
          >
            Startseite
          </Link>
          <div className="flex items-center gap-3">
            <Image
              src="/bear-logo.png"
              alt="Bear"
              width={34}
              height={34}
              className="rounded-xl shadow-lg shadow-amber-500/10"
              priority
            />
            <div className="min-w-0">
              <div className="section-kicker">Live-Spiel</div>
              <div className="truncate text-xl font-black tracking-tight text-amber-300">
                QUIZ<span className="text-emerald-100">DUELL</span>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <TurnIndicator game={game} />
          <div className="rounded-full border border-emerald-300/16 bg-emerald-950/45 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-200/72">
            {boardStateLabel}
          </div>
          <div className="rounded-full border border-emerald-300/16 bg-emerald-950/45 px-3 py-1.5 font-mono text-xs font-bold tracking-[0.22em] text-amber-300">
            {gameId}
          </div>
        </div>
      </header>

      {game.phase === "finished" && game.winnerId ? (
        <div className="surface-panel-strong shrink-0 rounded-[1.6rem] px-5 py-4 text-center">
          <div className="section-kicker">Ergebnis</div>
          <div className="mt-2 text-3xl font-black text-amber-200">
            {game.players[game.winnerId]?.displayName} gewinnt mit{" "}
            {game.players[game.winnerId]?.score} Punkten
          </div>
        </div>
      ) : null}

      <div
        className="grid min-h-0 flex-1 overflow-hidden"
        style={{ gridTemplateColumns: "380px 1fr 240px", gap: "8px" }}
      >
        <aside className="flex min-h-0 flex-col gap-2">
          <div className="surface-panel rounded-[1.6rem] p-3">
            <div className="section-kicker">Host-Cam</div>
            <div className="mt-3 aspect-video w-full shrink-0">
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
                <div className="flex h-full w-full items-center justify-center rounded-xl border border-emerald-800 bg-emerald-950/60 text-sm text-emerald-700">
                  Host offline
                </div>
              )}
            </div>
          </div>

          <div className="surface-panel min-h-0 flex-1 rounded-[1.6rem] p-4">
            <div className="section-kicker">Match-Status</div>
            <div className="mt-3 text-xl font-black text-amber-100">
              {boardStateLabel}
            </div>
            <div className="mt-2 text-sm leading-6 text-emerald-100/72">
              {game.activeQuestion
                ? "Die aktuelle Frage ist aktiv. Antworten und Buzz-Zustand laufen in Echtzeit."
                : game.phase === "finished"
                  ? "Das Match ist beendet. Das Board bleibt zur Nachschau sichtbar."
                  : "Warte auf den nächsten Pick oder den Start der nächsten Frage."}
            </div>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-emerald-300/10 bg-emerald-950/35 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/54">
                  Rolle
                </div>
                <div className="mt-1 text-sm font-bold text-amber-100">
                  {mode === "host" ? "Host-Ansicht" : "Spieler-Ansicht"}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-300/10 bg-emerald-950/35 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/54">
                  Phase
                </div>
                <div className="mt-1 text-sm font-bold text-amber-100">
                  {phaseLabel}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-300/10 bg-emerald-950/35 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/54">
                  Board
                </div>
                <div className="mt-1 text-sm font-bold text-amber-100">
                  Feld {game.currentBoardIndex + 1}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="surface-panel min-h-0 overflow-hidden rounded-[1.6rem] p-3">
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
            <Board
              game={game}
              onPickCell={handlePickCell}
              onViewCell={handleViewCell}
              onSwitchBoard={handleSwitchBoard}
            />
            {game.activeQuestion ? (
              <div className="surface-panel-strong shrink-0 overflow-hidden rounded-[1.4rem] px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="section-kicker">
                      {activeCategory?.displayName ?? "Frage"} · {game.activeQuestion.points}
                    </div>
                    <div className="mt-2 text-lg font-black leading-tight text-amber-50">
                      {game.activeQuestion.question.prompt}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full border border-emerald-300/16 bg-emerald-950/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/76">
                    {boardStateLabel}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="min-h-0 overflow-hidden">
          {isHost ? <HostControls game={game} /> : null}

          {!isHost ? (
            <div className="surface-panel h-full rounded-[1.6rem] p-4">
              <div className="section-kicker">Spieler</div>
              <div className="mt-3 text-xl font-black text-amber-100">
                Deine Aktion
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                Wenn die Buzzer offen sind, erscheint dein Button hier. Ansonsten
                einfach auf die nächste Frage warten.
              </p>
              {!game.activeQuestion ? (
                <div className="mt-4 rounded-2xl border border-emerald-300/10 bg-emerald-950/35 p-4 text-sm text-emerald-100/68">
                  Kein aktiver Buzzer. Das Board ist bereit für den nächsten Pick.
                </div>
              ) : (
                <div className="mt-5 flex justify-center">
                  <BuzzButton myPlayerId={userId} />
                </div>
              )}
            </div>
          ) : null}
        </aside>
      </div>

      <div
        className="surface-panel shrink-0 overflow-hidden rounded-[1.6rem] p-2"
        style={{ height: `${contestantRowHeight}px` }}
      >
        <div className="flex h-full min-h-0 justify-center gap-2 overflow-hidden">
          {contestants.map((player) => (
            <div key={player.id} className="h-full aspect-video shrink-0">
              <ParticipantTile
                player={player}
                gameId={gameId}
                isCurrentTurn={game.currentTurn === player.id}
                isHost={false}
              />
            </div>
          ))}
        </div>
      </div>

      <QuestionModal game={game} isHost={isHost} myPlayerId={userId} />

      <ReviewQuestionModal
        game={game}
        isHost={isHost}
        localQuestionId={localReviewId}
        onCloseLocal={() => setLocalReviewId(null)}
      />

      <div
        className="pointer-events-none fixed inset-0 z-[70] rounded transition-opacity duration-300"
        style={{
          opacity: flashOn ? 1 : 0,
          boxShadow: flashOn ? flashColor.shadow : "none",
          border: `10px solid ${flashOn ? flashColor.border : "transparent"}`,
          backgroundColor: flashOn ? flashColor.bg : "transparent",
        }}
      />
    </div>
  );
}
