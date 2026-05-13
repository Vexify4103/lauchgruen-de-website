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
    void joinGame(gameId).then((resp) => {
      if (cancelled) return;
      setNotFound(!resp.ok);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, joinGame]);

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
  const allReady = contestants.length > 0 && contestants.every((p) => p.ready);
  const readyCount = contestants.filter((p) => p.ready).length;

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
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 px-6 py-8 text-emerald-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="surface-panel-strong rounded-[2rem] p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <Link
                href="/"
                className="text-sm text-emerald-300/68 transition-colors hover:text-amber-300"
              >
                Zuruck zur Startseite
              </Link>
              <div className="flex items-center gap-4">
                <Image
                  src="/bear-logo.png"
                  alt="QuizDuell Bear"
                  width={52}
                  height={52}
                  className="rounded-2xl shadow-lg shadow-amber-500/10"
                  priority
                />
                <div>
                  <div className="section-kicker">Lobby</div>
                  <h1 className="mt-2 text-3xl font-black tracking-tight text-amber-300 sm:text-4xl">
                    QUIZ<span className="text-emerald-100">DUELL</span>
                  </h1>
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-emerald-100/72 sm:text-base">
                {isHost
                  ? "Richte die Event-Lobby ein, teile den Code mit deinen eingeladenen Gasten und starte, sobald alle bereit sind."
                  : "Du bist fur diese Runde eingeladen. Kamera verbinden, auf bereit setzen und auf den Start des Hosts warten."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[340px]">
              <div className="surface-panel rounded-[1.5rem] p-4">
                <div className="section-kicker">Spielcode</div>
                <div className="mt-2 font-mono text-3xl font-black tracking-[0.3em] text-amber-300">
                  {gameId}
                </div>
                <button
                  type="button"
                  onClick={() => copyText(gameId, setCodeCopied)}
                  className="mt-3 rounded-xl border border-emerald-300/18 bg-emerald-950/45 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-100 transition-colors hover:border-amber-300/30 hover:text-amber-200"
                >
                  {codeCopied ? "Code kopiert" : "Code kopieren"}
                </button>
              </div>

              <div className="surface-panel rounded-[1.5rem] p-4">
                <div className="section-kicker">Status</div>
                <div className="mt-2 text-lg font-black text-amber-100">
                  {connected ? "Verbunden" : "Verbinde..."}
                </div>
                <p className="mt-2 text-sm leading-6 text-emerald-100/70">
                  {isHost
                    ? `${readyCount}/${contestants.length} eingeladene Spieler bereit`
                    : me?.ready
                      ? "Du bist startklar"
                      : "Warte auf Freigabe und markiere dich dann als bereit"}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="flex flex-col gap-6">
            <div className="surface-panel rounded-[1.8rem] p-5 sm:p-6">
              <div className="section-kicker">Dein Platz im Event</div>
              <h2 className="mt-3 text-2xl font-black text-amber-100">
                Kamera verbinden und kurz bereitmachen
              </h2>
              {pushUrl ? (
                <div className="mt-4 flex flex-col gap-4">
                  <p className="text-sm leading-6 text-emerald-100/74">
                    Offne deinen persoenlichen VDO.Ninja-Link in einem neuen Tab.
                    Die Kamera wird nur einmal verbunden, Audio bleibt im Spiel stumm.
                  </p>
                  <a
                    href={pushUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-emerald-950 shadow-lg shadow-amber-500/20 transition-transform hover:-translate-y-0.5"
                  >
                    Kamera offnen
                  </a>
                  {pushUrlRevealed ? (
                    <code className="rounded-2xl border border-emerald-800 bg-emerald-950/45 px-4 py-3 text-xs text-emerald-300/70">
                      {pushUrl}
                    </code>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPushUrlRevealed(true)}
                      className="rounded-2xl border border-amber-400/18 bg-emerald-950/45 px-4 py-3 text-left text-xs font-mono text-emerald-300/62 transition-colors hover:border-amber-300/28 hover:text-emerald-200"
                    >
                      URL aus Sicherheitsgründen ausgeblendet. Klicken zum Anzeigen.
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-emerald-300/68">
                  Verbinde zuerst mit der Lobby, damit dein Kamera-Link erzeugt werden kann.
                </p>
              )}
            </div>

            {isHost ? (
              <div className="surface-panel rounded-[1.8rem] p-5 sm:p-6">
                <div className="section-kicker">Host-Setup</div>
                <h2 className="mt-3 text-2xl font-black text-amber-100">
                  OBS-Quelle fur den Stream
                </h2>
                <p className="mt-3 text-sm leading-6 text-emerald-100/74">
                  Kopiere die Browser-Quelle fur dein Overlay und fuege sie in OBS
                  als Browser Source mit 1920x1080 ein.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const params = me?.twitchLogin
                      ? `?hideself=${encodeURIComponent(me.twitchLogin)}`
                      : "";
                    copyText(
                      `${window.location.origin}/obs/${gameId}${params}`,
                      setObsCopied,
                    );
                  }}
                  className="mt-5 inline-flex w-fit items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-emerald-950 shadow-lg shadow-amber-500/20 transition-transform hover:-translate-y-0.5"
                >
                  {obsCopied ? "OBS-URL kopiert" : "OBS-URL kopieren"}
                </button>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-300/12 bg-emerald-950/35 p-4">
                    <div className="section-kicker">1</div>
                    <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                      Neue Browser-Quelle in OBS anlegen.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-300/12 bg-emerald-950/35 p-4">
                    <div className="section-kicker">2</div>
                    <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                      Kopierte URL einfugen.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-300/12 bg-emerald-950/35 p-4">
                    <div className="section-kicker">3</div>
                    <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                      Auf 1920x1080 setzen und live nehmen.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-6">
                <div className="surface-panel rounded-[1.8rem] p-5 sm:p-6">
                  <div className="section-kicker">Dein OBS-Link</div>
                  <h2 className="mt-3 text-2xl font-black text-amber-100">
                    Browser-Quelle fuer deine Szene
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-emerald-100/74">
                    Kopiere deine persoenliche OBS-URL. Darin wird dein eigener
                    Chat passend zur eingeloggten Twitch-Identität eingeblendet.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const params = me?.twitchLogin
                        ? `?hideself=${encodeURIComponent(me.twitchLogin)}`
                        : "";
                      copyText(
                        `${window.location.origin}/obs/${gameId}${params}`,
                        setObsCopied,
                      );
                    }}
                    className="mt-5 inline-flex w-fit items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-emerald-950 shadow-lg shadow-amber-500/20 transition-transform hover:-translate-y-0.5"
                  >
                    {obsCopied ? "OBS-URL kopiert" : "OBS-URL kopieren"}
                  </button>
                </div>

                <div className="surface-panel rounded-[1.8rem] p-5 sm:p-6">
                  <div className="section-kicker">Ablauf</div>
                  <h2 className="mt-3 text-2xl font-black text-amber-100">
                    Danach musst du nur noch warten
                  </h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-300/12 bg-emerald-950/35 p-4">
                      <div className="section-kicker">1</div>
                      <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                        Kamera im Extra-Tab offen lassen.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-300/12 bg-emerald-950/35 p-4">
                      <div className="section-kicker">2</div>
                      <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                        Auf bereit setzen, sobald alles passt.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-300/12 bg-emerald-950/35 p-4">
                      <div className="section-kicker">3</div>
                      <p className="mt-2 text-sm leading-6 text-emerald-100/72">
                        Der Host startet die Runde automatisch fuer alle.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-6">
            <div className="surface-panel-strong rounded-[1.8rem] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="section-kicker">Teilnehmer</div>
                  <h2 className="mt-3 text-2xl font-black text-amber-100">
                    Lobby-Besetzung
                  </h2>
                </div>
                <div className="rounded-full border border-emerald-300/18 bg-emerald-950/45 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200/72">
                  {contestants.length}/5 Gäste
                </div>
              </div>

              {players.length === 0 ? (
                <p className="mt-5 text-sm text-emerald-300/68">Warte auf Spieler...</p>
              ) : (
                <ul className="mt-5 grid gap-3">
                  {players.map((p) => {
                    const isPlayerHost = p.id === game?.hostId;
                    const isOffline = !p.connected;
                    const statusLabel = isPlayerHost
                      ? "Host"
                      : p.ready
                        ? "Bereit"
                        : isOffline
                          ? "Offline"
                          : "Nicht bereit";
                    const statusClass = isPlayerHost
                      ? "bg-amber-400 text-emerald-950"
                      : p.ready
                        ? "bg-emerald-300 text-emerald-950"
                        : isOffline
                          ? "bg-red-400/20 text-red-200"
                          : "bg-emerald-900/70 text-emerald-200";

                    return (
                      <li
                        key={p.id}
                        className={[
                          "flex items-center gap-4 rounded-2xl border p-4 transition-opacity",
                          isOffline
                            ? "border-emerald-900 bg-emerald-950/35 opacity-65"
                            : "border-emerald-300/12 bg-emerald-950/55",
                        ].join(" ")}
                      >
                        {p.avatarUrl ? (
                          <Image
                            src={p.avatarUrl}
                            alt={p.displayName}
                            width={46}
                            height={46}
                            className={[
                              "rounded-2xl border object-cover",
                              isOffline
                                ? "border-emerald-700/50 grayscale"
                                : "border-amber-400/35",
                            ].join(" ")}
                            unoptimized
                          />
                        ) : (
                          <div className="h-[46px] w-[46px] rounded-2xl bg-emerald-800" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-black text-amber-100">
                            {p.displayName}
                          </div>
                          <div className="truncate text-xs text-emerald-300/62">
                            @{p.twitchLogin}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
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
                            className="h-8 w-8 shrink-0 rounded-full bg-red-900/50 text-sm font-extrabold text-red-200 transition-colors hover:bg-red-700 hover:text-white"
                          >
                            x
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="surface-panel rounded-[1.8rem] p-5 sm:p-6">
              <div className="section-kicker">{isHost ? "Startfreigabe" : "Bereitschaft"}</div>
              <h2 className="mt-3 text-2xl font-black text-amber-100">
                {isHost ? "Starten, sobald alle bereit sind" : "Melde dich startklar"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-emerald-100/74">
                {isHost
                  ? `Aktuell sind ${readyCount} von ${contestants.length} eingeladenen Spielern bereit.`
                  : me?.ready
                    ? "Du bist als bereit markiert und wirst automatisch in die Runde geschickt."
                    : "Wenn Kamera und Setup passen, markiere dich als bereit."}
              </p>

              {isHost ? (
                <button
                  type="button"
                  onClick={() => emit("host:start_game")}
                  disabled={!allReady}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-6 py-4 text-base font-black text-emerald-950 shadow-lg shadow-amber-500/20 transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:from-emerald-800 disabled:to-emerald-900 disabled:text-emerald-600"
                >
                  {allReady ? "Spiel starten" : `Warte auf Spieler (${readyCount}/${contestants.length})`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => emit("player:set_ready", { ready: !me?.ready })}
                  className={[
                    "mt-5 inline-flex w-full items-center justify-center rounded-2xl px-6 py-4 text-base font-black transition-colors",
                    me?.ready
                      ? "bg-emerald-500 text-white hover:bg-emerald-400"
                      : "bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 text-emerald-950 hover:from-amber-200 hover:to-orange-300",
                  ].join(" ")}
                >
                  {me?.ready ? "Als bereit markiert" : "Jetzt bereit"}
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
