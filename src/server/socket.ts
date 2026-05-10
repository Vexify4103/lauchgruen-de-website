import type { Server as SocketIOServer, Socket } from "socket.io";
import { z } from "zod";
import {
  addPlayer,
  awardPoints,
  checkGameOver,
  getGame,
  getQuestion,
  loseHeart,
  makePlayer,
  markCellUsed,
  nextTurn,
  registerQuestionPool,
  serializeFor,
  setActiveQuestion,
  setReady,
} from "./game-state";
import { generateStreamId } from "../lib/stream-id";
import { loadQuestionPool } from "../lib/questions";
import { decodeSessionFromCookie } from "./socket-auth";
import { BUZZ_COLLECTION_WINDOW_MS, type GameState, type PlayerId } from "./types";

interface SocketData {
  userId: string;
  twitchLogin: string;
  displayName: string;
  avatarUrl: string;
  gameId?: string;
}

type AuthedSocket = Socket & { data: SocketData };

let questionPoolReady = false;
function ensureQuestionPool() {
  if (questionPoolReady) return;
  registerQuestionPool(loadQuestionPool());
  questionPoolReady = true;
}

interface PendingBuzz {
  playerId: PlayerId;
  clientReactionMs: number;
  receivedAt: number;
}

const buzzCollectors = new Map<
  string,
  { buzzes: PendingBuzz[]; timer: NodeJS.Timeout }
>();

function broadcastState(io: SocketIOServer, game: GameState) {
  // Broadcast a per-recipient view so the host gets answers and players don't.
  for (const [, sock] of io.sockets.sockets) {
    const s = sock as AuthedSocket;
    if (s.data.gameId !== game.id) continue;
    s.emit("state", serializeFor(game, s.data.userId));
  }
}

function broadcastSpectatorState(io: SocketIOServer, game: GameState) {
  // Spectator sockets (OBS view) — strip answers.
  io.to(`spectator:${game.id}`).emit("state", serializeFor(game, null));
}

function broadcastAll(io: SocketIOServer, game: GameState) {
  broadcastState(io, game);
  broadcastSpectatorState(io, game);
}

function isHost(socket: AuthedSocket, game: GameState): boolean {
  return socket.data.userId === game.hostId;
}

function emitError(socket: AuthedSocket, code: string, message: string) {
  socket.emit("error", { code, message });
}

const JoinGamePayload = z.object({ gameId: z.string().min(1) });
const SpectateGamePayload = z.object({ gameId: z.string().min(1) });
const PickCellPayload = z.object({
  category: z.string(),
  points: z.number().int().positive(),
});
const JudgePayload = z.object({ correct: z.boolean() });
const SetTurnPayload = z.object({ playerId: z.string() });
const BuzzPayload = z.object({ clientReactionMs: z.number().min(0).max(60_000) });
const SetReadyPayload = z.object({ ready: z.boolean() });

function resolveBuzzes(io: SocketIOServer, gameId: string) {
  const collector = buzzCollectors.get(gameId);
  if (!collector) return;
  buzzCollectors.delete(gameId);

  const game = getGame(gameId);
  if (!game || !game.activeQuestion?.buzzersOpen) return;

  const winner = collector.buzzes.sort(
    (a, b) =>
      a.clientReactionMs - b.clientReactionMs ||
      a.receivedAt - b.receivedAt,
  )[0];
  if (!winner) return;

  game.activeQuestion.buzzersOpen = false;
  game.activeQuestion.currentAnswerer = winner.playerId;
  game.phase = "answering";
  game.currentTurn = winner.playerId;

  io.to(`game:${gameId}`).emit("buzz_winner", {
    playerId: winner.playerId,
    reactionMs: winner.clientReactionMs,
  });
  io.to(`spectator:${gameId}`).emit("buzz_winner", {
    playerId: winner.playerId,
    reactionMs: winner.clientReactionMs,
  });
  broadcastAll(io, game);
}

export function registerSocketHandlers(io: SocketIOServer): void {
  ensureQuestionPool();

  // Auth middleware — validates cookie before allowing connection (except spectators)
  io.use(async (socket, nextFn) => {
    const role = (socket.handshake.auth?.role as string) ?? "player";
    if (role === "spectator") {
      // Spectator sockets bypass auth — read-only OBS view
      (socket as AuthedSocket).data.userId = "";
      (socket as AuthedSocket).data.twitchLogin = "";
      (socket as AuthedSocket).data.displayName = "spectator";
      (socket as AuthedSocket).data.avatarUrl = "";
      return nextFn();
    }
    const ident = await decodeSessionFromCookie(socket.handshake.headers.cookie);
    if (!ident) {
      return nextFn(new Error("UNAUTHENTICATED"));
    }
    const data = (socket as AuthedSocket).data;
    data.userId = ident.userId;
    data.twitchLogin = ident.twitchLogin;
    data.displayName = ident.displayName;
    data.avatarUrl = ident.avatarUrl;
    nextFn();
  });

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AuthedSocket;
    console.log(
      `[socket] connected: ${socket.id} (${socket.data.twitchLogin || "spectator"})`,
    );

    socket.on("join_game", (payload: unknown, ack?: (resp: unknown) => void) => {
      const parsed = JoinGamePayload.safeParse(payload);
      if (!parsed.success) {
        emitError(socket, "BAD_PAYLOAD", "Invalid join_game payload");
        ack?.({ ok: false });
        return;
      }
      const game = getGame(parsed.data.gameId);
      if (!game) {
        emitError(socket, "GAME_NOT_FOUND", "Game does not exist");
        ack?.({ ok: false });
        return;
      }
      socket.data.gameId = game.id;
      void socket.join(`game:${game.id}`);

      // Add or refresh player record (host is also a Player so they can be on board)
      const existing = game.players[socket.data.userId];
      const player =
        existing ??
        makePlayer({
          id: socket.data.userId,
          twitchLogin: socket.data.twitchLogin,
          displayName: socket.data.displayName,
          avatarUrl: socket.data.avatarUrl,
          vdoStreamId: generateStreamId(),
        });
      addPlayer(game, player);

      ack?.({ ok: true, vdoStreamId: player.vdoStreamId });
      broadcastAll(io, game);
    });

    socket.on("spectate_game", (payload: unknown, ack?: (resp: unknown) => void) => {
      const parsed = SpectateGamePayload.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false });
        return;
      }
      const game = getGame(parsed.data.gameId);
      if (!game) {
        ack?.({ ok: false });
        return;
      }
      socket.data.gameId = game.id;
      void socket.join(`spectator:${game.id}`);
      socket.emit("state", serializeFor(game, null));
      ack?.({ ok: true });
    });

    socket.on("leave_game", () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;
      void socket.leave(`game:${gameId}`);
      void socket.leave(`spectator:${gameId}`);
      socket.data.gameId = undefined;
    });

    socket.on("player:set_ready", (payload: unknown) => {
      const parsed = SetReadyPayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || game.phase !== "lobby") return;
      setReady(game, socket.data.userId, parsed.data.ready);
      broadcastAll(io, game);
    });

    socket.on("host:start_game", () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (game.phase !== "lobby") return;
      const playerCount = Object.keys(game.players).length;
      if (playerCount < 1) {
        emitError(socket, "NO_PLAYERS", "Need at least 1 player");
        return;
      }
      game.phase = "playing";
      game.currentTurn = game.playerOrder[0] ?? null;
      broadcastAll(io, game);
    });

    socket.on("host:pick_cell", (payload: unknown) => {
      const parsed = PickCellPayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (game.phase !== "playing") return;
      const cell = game.board.find(
        (c) => c.category === parsed.data.category && c.points === parsed.data.points,
      );
      if (!cell || cell.used) return;

      setActiveQuestion(game, {
        questionId: cell.questionId,
        category: cell.category,
        points: cell.points,
        pickedBy: game.currentTurn ?? game.hostId,
        buzzersOpen: false,
        buzzersOpenedAt: null,
        currentAnswerer: game.currentTurn,
        alreadyTried: [],
      });
      game.phase = "answering";
      broadcastAll(io, game);
    });

    socket.on("host:open_buzzers", () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (!game.activeQuestion) return;

      game.activeQuestion.buzzersOpen = true;
      game.activeQuestion.buzzersOpenedAt = Date.now();
      game.activeQuestion.currentAnswerer = null;
      game.phase = "buzzing";
      io.to(`game:${gameId}`).emit("buzzers_opened");
      io.to(`spectator:${gameId}`).emit("buzzers_opened");
      broadcastAll(io, game);
    });

    socket.on("player:buzz", (payload: unknown) => {
      const parsed = BuzzPayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !game.activeQuestion?.buzzersOpen) return;
      if (game.activeQuestion.alreadyTried.includes(socket.data.userId)) return;
      const player = game.players[socket.data.userId];
      if (!player || player.eliminated) return;

      const buzz: PendingBuzz = {
        playerId: socket.data.userId,
        clientReactionMs: parsed.data.clientReactionMs,
        receivedAt: Date.now(),
      };
      let collector = buzzCollectors.get(gameId);
      if (!collector) {
        collector = {
          buzzes: [],
          timer: setTimeout(
            () => resolveBuzzes(io, gameId),
            BUZZ_COLLECTION_WINDOW_MS,
          ),
        };
        buzzCollectors.set(gameId, collector);
      }
      // Prevent double-buzz from same player
      if (!collector.buzzes.find((b) => b.playerId === buzz.playerId)) {
        collector.buzzes.push(buzz);
      }
    });

    socket.on("host:judge", (payload: unknown) => {
      const parsed = JudgePayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (!game.activeQuestion) return;
      const answerer = game.activeQuestion.currentAnswerer;
      if (!answerer) return;
      const q = getQuestion(game.activeQuestion.questionId);
      const points = q?.points ?? game.activeQuestion.points;

      if (parsed.data.correct) {
        awardPoints(game, answerer, points);
        markCellUsed(game, game.activeQuestion.category, game.activeQuestion.points);
        game.currentTurn = answerer;
        setActiveQuestion(game, null);
        game.phase = "playing";
      } else {
        awardPoints(game, answerer, -Math.floor(points / 2));
        loseHeart(game, answerer);
        game.activeQuestion.alreadyTried.push(answerer);
        game.activeQuestion.currentAnswerer = null;

        const remainingEligible = Object.values(game.players).filter(
          (p) =>
            !p.eliminated && !game.activeQuestion!.alreadyTried.includes(p.id),
        );
        if (remainingEligible.length === 0) {
          // Nobody left — burn the cell, advance turn
          markCellUsed(
            game,
            game.activeQuestion.category,
            game.activeQuestion.points,
          );
          setActiveQuestion(game, null);
          nextTurn(game);
          game.phase = "playing";
        } else {
          // Reopen buzzers for remaining eligible players
          game.activeQuestion.buzzersOpen = false;
          game.phase = "answering";
        }
      }

      const winner = checkGameOver(game);
      if (winner) {
        game.phase = "finished";
        game.winnerId = winner;
      }

      broadcastAll(io, game);
    });

    socket.on("host:set_turn", (payload: unknown) => {
      const parsed = SetTurnPayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (!game.players[parsed.data.playerId]) return;
      game.currentTurn = parsed.data.playerId;
      broadcastAll(io, game);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);
    });
  });
}
