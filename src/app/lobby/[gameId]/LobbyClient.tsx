"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket-context";
import { GameNotFound } from "@/components/GameNotFound";

interface Props {
  gameId: string;
  userId: string;
  isHost: boolean;
}

export function LobbyClient({ gameId, userId }: Props) {
  const router = useRouter();
  const { game, joinGame, vdoStreamId, connected, emit, wasKicked } = useSocket();
  const [pushUrlRevealed, setPushUrlRevealed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [obsCopied, setObsCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const copyText = (text: string, setCopied: (v: boolean) => void) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    let cancelled = false;
    setNotFound(false);
    void joinGame(gameId).then((resp) => {
      if (cancelled) return;
      if (!resp.ok) setNotFound(true);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, joinGame]);

  // Auto-redirect to play/host once game is started
  useEffect(() => {
    if (!game) return;
    if (game.phase === "lobby") return;
    if (game.hostId === userId) router.push(`/host/${gameId}`);
    else router.push(`/play/${gameId}`);
  }, [game, userId, gameId, router]);

  const isHost = game?.hostId === userId;
  const players = game ? Object.values(game.players) : [];
  const contestants = players.filter((p) => p.id !== game?.hostId);
  const me = game?.players[userId];
  const allReady =
    contestants.length > 0 && contestants.every((p) => p.ready);

  // No &room= on the push URL: putting the publisher in a room makes their
  // tab subscribe to every other publisher's stream (cams AND audio) since
  // room peers default to bidirectional. We only need a publish-only tab.
  // Our streamIds are globally unique (8 random bytes) so there's no
  // collision risk from skipping the room.
  // &meshcast: relay the publisher's stream through VDO.Ninja's hosted SFU
  //   so they only upload it once instead of N times (one per viewer).
  // &label: shows the player's Twitch display name in VDO.Ninja's own UI.
  const labelParam = me?.displayName
    ? `&label=${encodeURIComponent(me.displayName)}`
    : "";
  const pushUrl = vdoStreamId
    ? `https://vdo.ninja/?push=${encodeURIComponent(vdoStreamId)}&webcam&cleanoutput&meshcast${labelParam}`
    : null;

  if (wasKicked) {
    return <GameNotFound code={gameId} reason="kicked" />;
  }
  if (notFound) {
    return <GameNotFound code={gameId} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50 px-6 py-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <header className="flex items-baseline justify-between">
          <div>
            <Link
              href="/"
              className="text-emerald-400/70 text-sm hover:text-amber-300 transition-colors"
            >
              ← Startseite
            </Link>
            <div className="flex items-center gap-3 mt-2">
              <Image
                src="/bear-logo.png"
                alt="QuizDuell Bear"
                width={44}
                height={44}
                className="drop-shadow"
                priority
              />
              <h1 className="text-3xl font-extrabold text-amber-300 drop-shadow">
                QUIZ<span className="text-emerald-200">DUELL</span> — Lobby 🍯
              </h1>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="font-mono font-extrabold text-amber-300 text-3xl tracking-widest">
                {gameId}
              </span>
              <button
                type="button"
                onClick={() => copyText(gameId, setCodeCopied)}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-200 hover:text-amber-300 transition-colors border border-emerald-700"
              >
                {codeCopied ? "✓ Kopiert!" : "📋 Code kopieren"}
              </button>
            </div>
          </div>
          <div className="text-sm">
            {connected ? (
              <span className="text-emerald-300">● Verbunden</span>
            ) : (
              <span className="text-red-400">● Verbinde…</span>
            )}
          </div>
        </header>

        <section className="bg-emerald-950/60 border border-emerald-800 rounded-xl p-6 backdrop-blur-sm">
          <h2 className="text-xl font-extrabold mb-3 text-amber-300">
            Deine Kamera
          </h2>
          {pushUrl ? (
            <div className="flex flex-col gap-3">
              <p className="text-emerald-200/80 text-sm">
                Öffne diesen Link in einem neuen Tab, um deine Webcam ins Spiel
                zu übertragen. Du musst das nur einmal machen. Voice-Chat läuft
                über Discord — der Ton deiner Webcam ist im Spiel stummgeschaltet.
              </p>
              <a
                href={pushUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 rounded-md px-4 py-2 font-extrabold text-emerald-950 w-fit shadow-lg shadow-amber-400/20 transition-all"
              >
                🎥 Meine Kamera öffnen (VDO.Ninja) ↗
              </a>
              {pushUrlRevealed ? (
                <code className="block text-xs text-emerald-500/70 break-all bg-emerald-950/40 border border-emerald-800 rounded px-3 py-2 font-mono select-all">
                  {pushUrl}
                </code>
              ) : (
                <button
                  type="button"
                  onClick={() => setPushUrlRevealed(true)}
                  aria-label="Reveal camera URL (contains your stream ID)"
                  className="relative block w-full text-left text-xs break-all font-mono px-3 py-2 rounded bg-emerald-950 hover:bg-emerald-900 cursor-pointer select-none border border-amber-400/20 transition-colors text-transparent"
                >
                  {pushUrl}
                  <span className="absolute inset-0 flex items-center justify-center text-emerald-300 font-sans text-[11px] uppercase tracking-wider pointer-events-none">
                    🔒 Klicken, um Kamera-URL anzuzeigen
                  </span>
                </button>
              )}
            </div>
          ) : (
            <p className="text-emerald-400/70">
              Verbinde, um deinen Stream zuzuweisen…
            </p>
          )}
        </section>

        {/* OBS Browser Source */}
        <section className="bg-emerald-950/60 border border-emerald-800 rounded-xl p-6 backdrop-blur-sm">
          <h2 className="text-xl font-extrabold mb-3 text-amber-300">
            📺 OBS Browser Source
          </h2>
          <p className="text-emerald-200/80 text-sm mb-4">
            Füge das Spielfeld als Browser-Quelle in OBS hinzu, damit dein Publikum es im Stream sieht.
          </p>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                // Bake the streamer's Twitch login into the URL so their OBS
                // overlay hides their own cam and shows their own chat.
                const params = me?.twitchLogin
                  ? `?hideself=${encodeURIComponent(me.twitchLogin)}`
                  : "";
                copyText(
                  `${window.location.origin}/obs/${gameId}${params}`,
                  setObsCopied,
                );
              }}
              className="flex items-center gap-3 w-fit bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-emerald-950 font-extrabold rounded-lg px-5 py-3 transition-all shadow-lg shadow-amber-400/20"
            >
              {obsCopied ? "✓ Kopiert!" : "📋 Meine OBS-Browser-Quelle-URL kopieren"}
            </button>

            <div className="bg-emerald-950/60 border border-emerald-800 rounded-lg p-4 text-sm text-emerald-200/80 space-y-1.5">
              <p className="font-bold text-emerald-100 mb-2">So fügst du sie in OBS hinzu:</p>
              <p>1. In OBS auf <strong className="text-amber-300">+</strong> unter Quellen klicken → <strong className="text-amber-300">Browser</strong></p>
              <p>2. Die kopierte URL ins <strong className="text-amber-300">URL</strong>-Feld einfügen</p>
              <p>3. <strong className="text-amber-300">Breite: 1920</strong> und <strong className="text-amber-300">Höhe: 1080</strong> einstellen</p>
              <p>4. Auf <strong className="text-amber-300">OK</strong> klicken — fertig!</p>
            </div>
          </div>
        </section>

        <section className="bg-emerald-950/60 border border-emerald-800 rounded-xl p-6 backdrop-blur-sm">
          <h2 className="text-xl font-extrabold mb-4 text-amber-300">
            Spieler ({contestants.length}/5 Teilnehmer{game?.hostId ? " + 1 Host" : ""})
          </h2>
          {players.length === 0 ? (
            <p className="text-emerald-400/70">Warte auf Spieler…</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {players.map((p) => {
                const isPlayerHost = p.id === game?.hostId;
                const isOffline = !p.connected;
                return (
                  <li
                    key={p.id}
                    className={[
                      "flex items-center gap-3 border rounded-md p-3 transition-opacity",
                      isOffline
                        ? "bg-emerald-950/40 border-emerald-900 opacity-60"
                        : "bg-emerald-950 border-emerald-800",
                    ].join(" ")}
                  >
                    {p.avatarUrl ? (
                      <Image
                        src={p.avatarUrl}
                        alt={p.displayName}
                        width={40}
                        height={40}
                        className={[
                          "rounded-full border",
                          isOffline ? "border-emerald-700/50 grayscale" : "border-amber-400/40",
                        ].join(" ")}
                        unoptimized
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-800" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate text-amber-100 flex items-center gap-1.5">
                        {p.displayName}
                        {isOffline ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-red-300 uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            Offline
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-emerald-300/60 truncate">
                        @{p.twitchLogin}
                      </div>
                    </div>
                    {isPlayerHost ? (
                      <span className="text-xs font-extrabold bg-amber-500 text-emerald-950 px-2 py-0.5 rounded">
                        🍯 HOST
                      </span>
                    ) : p.ready ? (
                      <span className="text-xs font-extrabold bg-emerald-500 text-emerald-950 px-2 py-0.5 rounded">
                        BEREIT
                      </span>
                    ) : (
                      <span className="text-xs font-bold bg-emerald-800 text-emerald-300 px-2 py-0.5 rounded">
                        …
                      </span>
                    )}
                    {/* Host-only: kick this player out of the lobby. */}
                    {isHost && !isPlayerHost ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`${p.displayName} aus der Lobby entfernen?`)) {
                            emit("host:kick_player", { playerId: p.id });
                          }
                        }}
                        title="Spieler entfernen"
                        aria-label={`${p.displayName} entfernen`}
                        className="shrink-0 w-7 h-7 rounded-full bg-red-900/50 hover:bg-red-700 text-red-200 hover:text-white font-extrabold text-sm flex items-center justify-center transition-colors"
                      >
                        ✕
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {isHost ? (
          <button
            type="button"
            onClick={() => emit("host:start_game")}
            disabled={!allReady}
            className="bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 disabled:from-emerald-800 disabled:to-emerald-900 disabled:text-emerald-600 disabled:cursor-not-allowed text-emerald-950 rounded-md px-6 py-3 text-lg font-extrabold w-fit self-center transition-all shadow-lg"
          >
            {allReady
              ? "🐻 Spiel starten →"
              : `Warte auf Spieler (${contestants.filter((p) => p.ready).length}/${contestants.length} bereit)`}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => emit("player:set_ready", { ready: !me?.ready })}
            className={[
              "rounded-md px-6 py-3 text-lg font-extrabold w-fit self-center transition-all shadow-lg",
              me?.ready
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-amber-500 hover:bg-amber-400 text-emerald-950",
            ].join(" ")}
          >
            {me?.ready ? "✓ Bereit" : "🍯 Klicken wenn bereit"}
          </button>
        )}
      </div>
    </div>
  );
}
