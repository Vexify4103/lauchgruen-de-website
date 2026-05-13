"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSocket } from "@/lib/socket-context";
import { Board } from "@/components/Board";
import { ParticipantTile } from "@/components/ParticipantTile";
import { TurnIndicator } from "@/components/TurnIndicator";
import { ChatOverlay } from "@/components/ChatOverlay";
import { StartingSoon } from "@/components/StartingSoon";
import { GameNotFound } from "@/components/GameNotFound";

interface Props {
  gameId: string;
  hideSelf?: string;
  compact: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  lobby: "Warteraum",
  playing: "Spiel laeuft",
  bonus_pending: "Bonus bereit",
  bonus_buzzing: "Bonus-Buzzer offen",
  finished: "Spiel beendet",
};

export function ObsClient({ gameId, hideSelf, compact }: Props) {
  const { game, spectateGame, connected, lastJudgeResult } = useSocket();
  const [correctFlash, setCorrectFlash] = useState(false);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void spectateGame(gameId).then((resp) => {
      if (cancelled) return;
      setNotFound(!resp.ok);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, spectateGame]);

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.background;
    const prevHtml = html.style.background;
    body.style.background = "transparent";
    html.style.background = "transparent";
    return () => {
      body.style.background = prevBody;
      html.style.background = prevHtml;
    };
  }, []);

  useEffect(() => {
    if (!lastJudgeResult) return;
    if (lastJudgeResult.correct) {
      const enableTimer = setTimeout(() => setCorrectFlash(true), 0);
      const disableTimer = setTimeout(() => setCorrectFlash(false), 1600);
      return () => {
        clearTimeout(enableTimer);
        clearTimeout(disableTimer);
      };
    }

    const enableTimer = setTimeout(() => setWrongFlash(true), 0);
    const disableTimer = setTimeout(() => setWrongFlash(false), 1200);
    return () => {
      clearTimeout(enableTimer);
      clearTimeout(disableTimer);
    };
  }, [lastJudgeResult]);

  if (notFound) {
    return <GameNotFound code={gameId} />;
  }

  if (!game || !connected) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-emerald-700">
        Warte auf Spiel...
      </div>
    );
  }

  if (game.phase === "lobby") {
    return <StartingSoon game={game} />;
  }

  const hostPlayer = game.players[game.hostId];
  const contestants = game.playerOrder
    .filter((id) => id !== game.hostId)
    .map((id) => game.players[id])
    .filter((player): player is NonNullable<typeof player> => Boolean(player))
    .filter((player) => !hideSelf || player.twitchLogin !== hideSelf);
  const chatChannel = hideSelf || hostPlayer?.twitchLogin;
  const activeCategory = game.activeQuestion
    ? game.categories.find((category) => category.id === game.activeQuestion?.category)
    : null;
  const phaseLabel = PHASE_LABELS[game.phase] ?? game.phase;
  const boardStateLabel = game.activeQuestion
    ? game.activeQuestion.buzzersOpen
      ? "Buzzer offen"
      : game.activeQuestion.currentAnswerer
        ? `${game.players[game.activeQuestion.currentAnswerer]?.displayName ?? "?"} antwortet`
        : "Frage aktiv"
    : game.phase === "finished"
      ? "Ergebnis"
      : "Nächster Pick";
  const contestantRowHeight = compact ? 166 : 208;

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

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50"
      style={{ padding: compact ? "8px" : "10px", gap: compact ? "6px" : "8px" }}
    >
      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: compact ? "340px 1fr 210px" : "380px 1fr 230px",
          gap: compact ? "6px" : "8px",
        }}
      >
        <aside className="flex min-h-0 flex-col gap-2">
          <div className="surface-panel rounded-[1.6rem] p-3">
            <div className="section-kicker">Host</div>
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
                <div className="h-full w-full rounded-xl bg-emerald-950/45" />
              )}
            </div>
          </div>

          {chatChannel ? (
            <div className="surface-panel min-h-0 flex-1 rounded-[1.6rem] p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="section-kicker">Chat</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/48">
                  {chatChannel}
                </div>
              </div>
              <div className="min-h-0 overflow-hidden rounded-[1.2rem] bg-emerald-950/45">
                <ChatOverlay channel={chatChannel} />
              </div>
            </div>
          ) : null}
        </aside>

        <section className="flex min-h-0 flex-col gap-2">
          <div className="surface-panel min-h-0 flex-1 rounded-[1.7rem] p-3">
            <Board game={game} />
          </div>

          {game.activeQuestion ? (
            <div className="surface-panel-strong shrink-0 rounded-[1.6rem] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="section-kicker">
                    {activeCategory?.displayName ?? "Frage"} · {game.activeQuestion.points}
                  </div>
                  <div className="mt-2 text-2xl font-black leading-tight text-amber-50">
                    {game.activeQuestion.question.prompt}
                  </div>
                </div>
                <div className="shrink-0 rounded-full border border-emerald-300/16 bg-emerald-950/45 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-100/76">
                  {boardStateLabel}
                </div>
              </div>
            </div>
          ) : game.phase === "finished" && game.winnerId ? (
            <div className="surface-panel-strong shrink-0 rounded-[1.6rem] px-5 py-4 text-center">
              <div className="section-kicker">Sieger</div>
              <div className="mt-2 text-3xl font-black text-amber-200">
                {game.players[game.winnerId]?.displayName} gewinnt
              </div>
            </div>
          ) : null}
        </section>

        <aside className="flex min-h-0 flex-col gap-2">
          <div className="surface-panel-strong rounded-[1.6rem] p-4">
            <div className="flex items-center gap-3">
              <Image
                src="/bear-logo.png"
                alt="QuizDuell Bear"
                width={compact ? 56 : 64}
                height={compact ? 56 : 64}
                className="rounded-2xl shadow-lg shadow-amber-500/10"
                priority
              />
              <div>
                <div className="section-kicker">Broadcast</div>
                <div className="mt-1 text-xl font-black tracking-tight text-amber-300">
                  QUIZ<span className="text-emerald-100">DUELL</span>
                </div>
              </div>
            </div>
          </div>

          <div className="surface-panel rounded-[1.6rem] p-4">
            <div className="section-kicker">Spielstand</div>
            <div className="mt-3">
              <TurnIndicator game={game} />
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-emerald-300/10 bg-emerald-950/35 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/52">
                  Phase
                </div>
                <div className="mt-1 text-sm font-black text-amber-100">
                  {phaseLabel}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-300/10 bg-emerald-950/35 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/52">
                  Board
                </div>
                <div className="mt-1 text-sm font-black text-amber-100">
                  Feld {game.currentBoardIndex + 1}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-300/10 bg-emerald-950/35 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/52">
                  Status
                </div>
                <div className="mt-1 text-sm font-black text-amber-100">
                  {boardStateLabel}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div
        className="surface-panel shrink-0 rounded-[1.6rem] p-2"
        style={{ minHeight: `${contestantRowHeight}px` }}
      >
        <div className="flex h-full justify-center gap-2">
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
