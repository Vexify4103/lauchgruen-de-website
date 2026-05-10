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
  const me = game?.players[userId];
  const allReady =
    players.length > 0 &&
    players.filter((p) => p.id !== game?.hostId).every((p) => p.ready);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-6 py-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <header className="flex items-baseline justify-between">
          <div>
            <Link href="/" className="text-zinc-500 text-sm hover:text-zinc-300">
              ← Home
            </Link>
            <h1 className="text-3xl font-bold mt-2">Lobby</h1>
            <div className="text-zinc-400">
              Game code:{" "}
              <span className="font-mono font-bold text-yellow-400 text-xl">
                {gameId}
              </span>
            </div>
          </div>
          <div className="text-sm">
            {connected ? (
              <span className="text-green-400">● Connected</span>
            ) : (
              <span className="text-red-400">● Connecting…</span>
            )}
          </div>
        </header>

        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-3">Your camera</h2>
          {pushUrl ? (
            <div className="flex flex-col gap-3">
              <p className="text-zinc-400 text-sm">
                Open this link in a new tab to publish your webcam to the game. You
                only need to do this once. Voice chat happens on Discord — your
                webcam audio is muted in the game view.
              </p>
              <a
                href={pushUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-purple-600 hover:bg-purple-500 rounded-md px-4 py-2 font-semibold w-fit"
              >
                Open my camera (VDO.Ninja) ↗
              </a>
              <code className="block text-xs text-zinc-500 break-all">{pushUrl}</code>
            </div>
          ) : (
            <p className="text-zinc-500">Connecting to allocate your stream…</p>
          )}
        </section>

        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">
            Players ({players.length}/6)
          </h2>
          {players.length === 0 ? (
            <p className="text-zinc-500">Waiting for players to join…</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {players.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-md p-3"
                >
                  {p.avatarUrl ? (
                    <Image
                      src={p.avatarUrl}
                      alt={p.displayName}
                      width={40}
                      height={40}
                      className="rounded-full"
                      unoptimized
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-800" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.displayName}</div>
                    <div className="text-xs text-zinc-500 truncate">
                      @{p.twitchLogin}
                    </div>
                  </div>
                  {p.id === game?.hostId ? (
                    <span className="text-xs font-bold bg-purple-700 px-2 py-0.5 rounded">
                      HOST
                    </span>
                  ) : p.ready ? (
                    <span className="text-xs font-bold bg-green-700 px-2 py-0.5 rounded">
                      READY
                    </span>
                  ) : (
                    <span className="text-xs font-bold bg-zinc-700 px-2 py-0.5 rounded">
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
            className="bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-md px-6 py-3 text-lg font-bold w-fit self-center"
          >
            {allReady
              ? "Start game →"
              : `Waiting for players (${players.filter((p) => p.id !== game?.hostId && p.ready).length}/${players.filter((p) => p.id !== game?.hostId).length} ready)`}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => emit("player:set_ready", { ready: !me?.ready })}
            className={[
              "rounded-md px-6 py-3 text-lg font-bold w-fit self-center",
              me?.ready
                ? "bg-green-700 hover:bg-green-600"
                : "bg-yellow-600 hover:bg-yellow-500",
            ].join(" ")}
          >
            {me?.ready ? "✓ Ready" : "Click when ready"}
          </button>
        )}
      </div>
    </div>
  );
}
