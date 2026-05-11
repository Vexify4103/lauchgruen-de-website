"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientGameState } from "@/server/types";

type Role = "player" | "spectator";

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  game: ClientGameState | null;
  vdoStreamId: string | null;
  joinGame: (gameId: string) => Promise<{ ok: boolean; vdoStreamId?: string }>;
  spectateGame: (gameId: string) => Promise<{ ok: boolean }>;
  leaveGame: () => void;
  emit: (event: string, payload?: unknown) => void;
  lastBuzzWinner: { playerId: string; reactionMs: number } | null;
  buzzersOpenedAt: number | null;
  /** Fires whenever the host judges an answer. The `seq` counter increments each
   *  time so React effects re-fire even for consecutive identical outcomes. */
  lastJudgeResult: { correct: boolean; seq: number } | null;
  /** True after the server emits "kicked" — i.e. the host removed us from the lobby. */
  wasKicked: boolean;
  /** Reset the kicked flag (e.g. after the user navigates away). */
  clearKicked: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const roleRef = useRef<Role>("player");
  const [connected, setConnected] = useState(false);
  const [game, setGame] = useState<ClientGameState | null>(null);
  const [vdoStreamId, setVdoStreamId] = useState<string | null>(null);
  const [lastBuzzWinner, setLastBuzzWinner] = useState<
    { playerId: string; reactionMs: number } | null
  >(null);
  const [buzzersOpenedAt, setBuzzersOpenedAt] = useState<number | null>(null);
  const [lastJudgeResult, setLastJudgeResult] = useState<{
    correct: boolean;
    seq: number;
  } | null>(null);
  const [wasKicked, setWasKicked] = useState(false);
  const judgeSeqRef = useRef(0);

  const ensureSocket = useCallback((role: Role) => {
    const existing = socketRef.current;
    if (existing && roleRef.current === role) return existing;
    if (existing) {
      existing.disconnect();
      socketRef.current = null;
    }
    roleRef.current = role;
    const socket = io({
      transports: ["websocket", "polling"],
      auth: { role },
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", (state: ClientGameState) => setGame(state));
    socket.on("buzzers_opened", () => {
      setBuzzersOpenedAt(Date.now());
      setLastBuzzWinner(null);
    });
    socket.on(
      "buzz_winner",
      (payload: { playerId: string; reactionMs: number }) => {
        setLastBuzzWinner(payload);
      },
    );
    socket.on("judge_result", (payload: { correct: boolean }) => {
      setLastJudgeResult({ correct: payload.correct, seq: ++judgeSeqRef.current });
    });
    socket.on("kicked", () => {
      // Host removed us from the lobby; clear local game state and surface to UI.
      setGame(null);
      setVdoStreamId(null);
      setWasKicked(true);
    });
    socket.on(
      "error",
      (payload: { code: string; message: string }) => {
        console.warn("[socket] server error:", payload);
      },
    );
    socket.on("connect_error", (err) => {
      console.error("[socket] connect_error:", err.message);
    });
    return socket;
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const joinGame = useCallback(
    (gameId: string) =>
      new Promise<{ ok: boolean; vdoStreamId?: string }>((resolve) => {
        const s = ensureSocket("player");
        const send = () =>
          s.emit(
            "join_game",
            { gameId },
            (resp: { ok: boolean; vdoStreamId?: string }) => {
              if (resp?.ok && resp.vdoStreamId) setVdoStreamId(resp.vdoStreamId);
              resolve(resp ?? { ok: false });
            },
          );
        if (s.connected) send();
        else s.once("connect", send);
      }),
    [ensureSocket],
  );

  const spectateGame = useCallback(
    (gameId: string) =>
      new Promise<{ ok: boolean }>((resolve) => {
        const s = ensureSocket("spectator");
        const send = () =>
          s.emit("spectate_game", { gameId }, (resp: { ok: boolean }) =>
            resolve(resp ?? { ok: false }),
          );
        if (s.connected) send();
        else s.once("connect", send);
      }),
    [ensureSocket],
  );

  const leaveGame = useCallback(() => {
    socketRef.current?.emit("leave_game");
    setGame(null);
    setVdoStreamId(null);
  }, []);

  const clearKicked = useCallback(() => setWasKicked(false), []);

  const emit = useCallback((event: string, payload?: unknown) => {
    socketRef.current?.emit(event, payload);
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        connected,
        game,
        vdoStreamId,
        joinGame,
        spectateGame,
        leaveGame,
        emit,
        lastBuzzWinner,
        buzzersOpenedAt,
        lastJudgeResult,
        wasKicked,
        clearKicked,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used inside SocketProvider");
  return ctx;
}
