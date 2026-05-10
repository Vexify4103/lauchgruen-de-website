"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSocket } from "@/lib/socket-context";

interface Props {
  gameId: string;
  userId: string;
  isHost: boolean;
}

export function LobbyClient({ gameId, userId }: Props) {
  const router = useRouter();
  const { game, joinGame, vdoStreamId, connected, emit } = useSocket();

  useEffect(() => {
    let cancelled = false;
    void joinGame(gameId).then((resp) => {
      if (!resp.ok && !cancelled) {
        console.warn("join_game failed");
      }
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

  const pushUrl = vdoStreamId
    ? `https://vdo.ninja/?push=${encodeURIComponent(vdoStreamId)}&room=quizduell-${encodeURIComponent(gameId)}&webcam&autostart&cleanoutput`
    : null;

  const isHost = game?.hostId === userId;
  const players = game ? Object.values(game.players) : [];
  const contestants = players.filter((p) => p.id !== game?.hostId);
  const me = game?.players[userId];
  const allReady =
    contestants.length > 0 && contestants.every((p) => p.ready);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50 px-6 py-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <header className="flex items-baseline justify-between">
          <div>
            <Link
              href="/"
              className="text-emerald-400/70 text-sm hover:text-amber-300 transition-colors"
            >
              ← Home
            </Link>
            <h1 className="text-3xl font-extrabold mt-2 text-amber-300 drop-shadow">
              🐻 Lobby 🍯
            </h1>
            <div className="text-emerald-200/80 mt-1">
              Game code:{" "}
              <span className="font-mono font-extrabold text-amber-300 text-2xl tracking-widest">
                {gameId}
              </span>
            </div>
          </div>
          <div className="text-sm">
            {connected ? (
              <span className="text-emerald-300">● Connected</span>
            ) : (
              <span className="text-red-400">● Connecting…</span>
            )}
          </div>
        </header>

        <section className="bg-emerald-950/60 border border-emerald-800 rounded-xl p-6 backdrop-blur-sm">
          <h2 className="text-xl font-extrabold mb-3 text-amber-300">
            Your camera
          </h2>
          {pushUrl ? (
            <div className="flex flex-col gap-3">
              <p className="text-emerald-200/80 text-sm">
                Open this link in a new tab to publish your webcam to the game.
                You only need to do this once. Voice chat happens on Discord —
                your webcam audio is muted in the game view.
              </p>
              <a
                href={pushUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 rounded-md px-4 py-2 font-extrabold text-emerald-950 w-fit shadow-lg shadow-amber-400/20 transition-all"
              >
                🎥 Open my camera (VDO.Ninja) ↗
              </a>
              <code className="block text-xs text-emerald-500/60 break-all">
                {pushUrl}
              </code>
            </div>
          ) : (
            <p className="text-emerald-400/70">
              Connecting to allocate your stream…
            </p>
          )}
        </section>

        <section className="bg-emerald-950/60 border border-emerald-800 rounded-xl p-6 backdrop-blur-sm">
          <h2 className="text-xl font-extrabold mb-4 text-amber-300">
            Players ({contestants.length}/6 contestants{game?.hostId ? " + 1 host" : ""})
          </h2>
          {players.length === 0 ? (
            <p className="text-emerald-400/70">Waiting for players to join…</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {players.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 bg-emerald-950 border border-emerald-800 rounded-md p-3"
                >
                  {p.avatarUrl ? (
                    <Image
                      src={p.avatarUrl}
                      alt={p.displayName}
                      width={40}
                      height={40}
                      className="rounded-full border border-amber-400/40"
                      unoptimized
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-800" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate text-amber-100">
                      {p.displayName}
                    </div>
                    <div className="text-xs text-emerald-300/60 truncate">
                      @{p.twitchLogin}
                    </div>
                  </div>
                  {p.id === game?.hostId ? (
                    <span className="text-xs font-extrabold bg-amber-500 text-emerald-950 px-2 py-0.5 rounded">
                      🍯 HOST
                    </span>
                  ) : p.ready ? (
                    <span className="text-xs font-extrabold bg-emerald-500 text-emerald-950 px-2 py-0.5 rounded">
                      READY
                    </span>
                  ) : (
                    <span className="text-xs font-bold bg-emerald-800 text-emerald-300 px-2 py-0.5 rounded">
                      …
                    </span>
                  )}
                </li>
              ))}
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
              ? "🐻 Start game →"
              : `Waiting for players (${contestants.filter((p) => p.ready).length}/${contestants.length} ready)`}
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
            {me?.ready ? "✓ Ready" : "🍯 Click when ready"}
          </button>
        )}
      </div>
    </div>
  );
}
