import type { Server as SocketIOServer, Socket } from "socket.io";
import { z } from "zod";
import {
  addPlayer,
  awardPoints,
  checkGameOver,
  getGame,
  getNonHostPlayers,
  getQuestion,
  makePlayer,
  markCellUsed,
  nextTurn,
  pickNextBonusBuzzerRound,
  registerBonusBuzzerRounds,
  registerQuestionPool,
  removePlayer,
  serializeFor,
  setActiveQuestion,
  setPlayerConnected,
  setReady,
  setReviewQuestion,
  switchBoard,
} from "./game-state";
import { generateStreamId } from "../lib/stream-id";
import { loadBonusBuzzerRounds, loadQuestionPool } from "../lib/questions";
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
  registerBonusBuzzerRounds(loadBonusBuzzerRounds());
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

/** Pending auto-close timers after host:reveal_and_close. */
const revealCloseTimers = new Map<string, NodeJS.Timeout>();

/**
 * Tracks active socket IDs per (gameId, userId). Lets us tell when a user has
 * truly disconnected (no remaining sockets) vs. just closed one tab while
 * another is still open. Key format: `${gameId}:${userId}`.
 */
const userSocketsByGame = new Map<string, Set<string>>();
function trackUserSocket(gameId: string, userId: string, socketId: string): void {
  const key = `${gameId}:${userId}`;
  const set = userSocketsByGame.get(key) ?? new Set<string>();
  set.add(socketId);
  userSocketsByGame.set(key, set);
}
function untrackUserSocket(gameId: string, userId: string, socketId: string): number {
  const key = `${gameId}:${userId}`;
  const set = userSocketsByGame.get(key);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) {
    userSocketsByGame.delete(key);
    return 0;
  }
  return set.size;
}

function broadcastState(io: SocketIOServer, game: GameState) {
  for (const [, sock] of io.sockets.sockets) {
    const s = sock as AuthedSocket;
    if (s.data.gameId !== game.id) continue;
    s.emit("state", serializeFor(game, s.data.userId));
  }
}

function broadcastSpectatorState(io: SocketIOServer, game: GameState) {
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

// ---------------------------------------------------------------------------
// Buzz resolution — shared between regular buzz and bonus-buzz phases
// ---------------------------------------------------------------------------
function resolveBuzzes(io: SocketIOServer, gameId: string) {
  const collector = buzzCollectors.get(gameId);
  if (!collector) {
    console.log(`[buzz] resolveBuzzes(${gameId}): no collector, abort`);
    return;
  }
  buzzCollectors.delete(gameId);

  const game = getGame(gameId);
  if (!game) {
    console.log(`[buzz] resolveBuzzes(${gameId}): no game, abort`);
    return;
  }

  const isBonusBuzz = game.phase === "bonus_buzzing";
  console.log(
    `[buzz] resolveBuzzes(${gameId}): phase=${game.phase} buzzes=${collector.buzzes.length} bonus=${isBonusBuzz}`,
  );

  // Guard: during regular buzz, activeQuestion.buzzersOpen must be true.
  if (!isBonusBuzz && !game.activeQuestion?.buzzersOpen) {
    console.log(`[buzz] resolveBuzzes(${gameId}): regular buzz but buzzers closed, abort`);
    return;
  }

  const winner = collector.buzzes.sort(
    (a, b) =>
      a.clientReactionMs - b.clientReactionMs ||
      a.receivedAt - b.receivedAt,
  )[0];

  if (isBonusBuzz) {
    if (!winner) {
      // Nobody buzzed during the bonus image — drop the image, advance turn.
      console.log(`[buzz] bonus: no winner → discard image, nextTurn, phase=playing`);
      game.isBonusRound = false;
      setActiveQuestion(game, null);
      nextTurn(game);
      game.phase = "playing";
      broadcastAll(io, game);
      return;
    }
    console.log(
      `[buzz] bonus winner: ${winner.playerId} (${winner.clientReactionMs}ms) → answering the image`,
    );
    // The winner now answers the bonus image (just like a regular buzz-winner
    // answers a regular question). The host judges via host:judge as usual;
    // wasBonus=true tells the judge handler to advance turn normally.
    if (game.activeQuestion) {
      game.activeQuestion.buzzersOpen     = false;
      game.activeQuestion.currentAnswerer = winner.playerId;
    }
    game.phase = "answering";
    io.to(`game:${gameId}`).emit("buzz_winner", {
      playerId: winner.playerId,
      reactionMs: winner.clientReactionMs,
    });
    io.to(`spectator:${gameId}`).emit("buzz_winner", {
      playerId: winner.playerId,
      reactionMs: winner.clientReactionMs,
    });
    broadcastAll(io, game);
    return;
  }

  // Regular buzz resolution
  if (!winner) return;

  game.activeQuestion!.buzzersOpen = false;
  game.activeQuestion!.currentAnswerer = winner.playerId;
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

// ---------------------------------------------------------------------------
// Zod payload schemas
// ---------------------------------------------------------------------------
const JoinGamePayload      = z.object({ gameId: z.string().min(1) });
const SpectateGamePayload  = z.object({ gameId: z.string().min(1) });
const PickCellPayload      = z.object({ category: z.string(), points: z.number().int().positive() });
const JudgePayload         = z.object({ correct: z.boolean() });
const JudgeUsedPayload     = z.object({
  category: z.string(),
  points: z.number().int().positive(),
  playerId: z.string(),
  correct: z.boolean(),
});
const SetTurnPayload       = z.object({ playerId: z.string() });
const BuzzPayload          = z.object({ clientReactionMs: z.number().min(0).max(60_000) });
const SetReadyPayload      = z.object({ ready: z.boolean() });
const SwitchBoardPayload   = z.object({ index: z.number().int().min(0) });
const OpenReviewPayload    = z.object({ category: z.string(), points: z.number().int().positive() });

// ---------------------------------------------------------------------------
export function registerSocketHandlers(io: SocketIOServer): void {
  ensureQuestionPool();

  io.use(async (socket, nextFn) => {
    const role = (socket.handshake.auth?.role as string) ?? "player";
    if (role === "spectator") {
      (socket as AuthedSocket).data.userId = "";
      (socket as AuthedSocket).data.twitchLogin = "";
      (socket as AuthedSocket).data.displayName = "spectator";
      (socket as AuthedSocket).data.avatarUrl = "";
      return nextFn();
    }
    const ident = await decodeSessionFromCookie(socket.handshake.headers.cookie);
    if (!ident) return nextFn(new Error("UNAUTHENTICATED"));
    const data = (socket as AuthedSocket).data;
    data.userId      = ident.userId;
    data.twitchLogin = ident.twitchLogin;
    data.displayName = ident.displayName;
    data.avatarUrl   = ident.avatarUrl;
    nextFn();
  });

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AuthedSocket;
    console.log(`[socket] connected: ${socket.id} (${socket.data.twitchLogin || "spectator"})`);

    // ── join / spectate / leave ───────────────────────────────────────────

    socket.on("join_game", (payload: unknown, ack?: (resp: unknown) => void) => {
      const parsed = JoinGamePayload.safeParse(payload);
      if (!parsed.success) { emitError(socket, "BAD_PAYLOAD", "Invalid join_game payload"); ack?.({ ok: false }); return; }
      const game = getGame(parsed.data.gameId);
      if (!game) { emitError(socket, "GAME_NOT_FOUND", "Game does not exist"); ack?.({ ok: false }); return; }

      const existing = game.players[socket.data.userId];

      // Enforce the 5-contestant cap (host is separate). New contestants who
      // arrive after the lobby is full get bounced. Re-joiners (existing
      // players) are always allowed — they're already accounted for.
      if (!existing && socket.data.userId !== game.hostId) {
        const contestantCount = game.playerOrder.filter((pid) => pid !== game.hostId).length;
        if (contestantCount >= 5) {
          emitError(socket, "LOBBY_FULL", "Lobby ist voll (5 Teilnehmer)");
          ack?.({ ok: false });
          return;
        }
      }

      socket.data.gameId = game.id;
      void socket.join(`game:${game.id}`);
      trackUserSocket(game.id, socket.data.userId, socket.id);

      const player = existing ?? makePlayer({
        id:           socket.data.userId,
        twitchLogin:  socket.data.twitchLogin,
        displayName:  socket.data.displayName,
        avatarUrl:    socket.data.avatarUrl,
        vdoStreamId:  generateStreamId(),
      });
      addPlayer(game, player);
      // addPlayer flips connected→true for rejoiners; new players default true.

      ack?.({ ok: true, vdoStreamId: player.vdoStreamId });
      broadcastAll(io, game);
    });

    socket.on("spectate_game", (payload: unknown, ack?: (resp: unknown) => void) => {
      const parsed = SpectateGamePayload.safeParse(payload);
      if (!parsed.success) { ack?.({ ok: false }); return; }
      const game = getGame(parsed.data.gameId);
      if (!game) { ack?.({ ok: false }); return; }

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

    // ── lobby ─────────────────────────────────────────────────────────────

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

    socket.on("host:kick_player", (payload: unknown) => {
      const parsed = z.object({ playerId: z.string() }).safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      // Only allow kicks during lobby — once gameplay starts, removing players
      // mid-round would break turn rotation, round-tracking, etc.
      if (game.phase !== "lobby") return;
      // Hosts can't kick themselves.
      if (parsed.data.playerId === game.hostId) return;
      if (!game.players[parsed.data.playerId]) return;

      removePlayer(game, parsed.data.playerId);

      // Detach the kicked user's sockets from the game and tell them.
      for (const [, sock] of io.sockets.sockets) {
        const s = sock as AuthedSocket;
        if (s.data.gameId === gameId && s.data.userId === parsed.data.playerId) {
          s.emit("kicked");
          s.data.gameId = undefined;
          void s.leave(`game:${gameId}`);
          untrackUserSocket(gameId, parsed.data.playerId, s.id);
        }
      }

      broadcastAll(io, game);
    });

    socket.on("host:start_game", () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (game.phase !== "lobby") return;
      const contestants = game.playerOrder.filter((pid) => pid !== game.hostId);
      if (contestants.length < 1) { emitError(socket, "NO_PLAYERS", "Need at least 1 contestant"); return; }
      game.phase = "playing";
      game.currentTurn = contestants[0];
      broadcastAll(io, game);
    });

    // ── board switching ───────────────────────────────────────────────────

    socket.on("host:switch_board", (payload: unknown) => {
      const parsed = SwitchBoardPayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      // Only allow switching when no question is active
      if (game.phase !== "playing") return;
      switchBoard(game, parsed.data.index);
      broadcastAll(io, game);
    });

    // ── question pick ─────────────────────────────────────────────────────

    socket.on("host:pick_cell", (payload: unknown) => {
      const parsed = PickCellPayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;

      // Safety net: if we're still in bonus_buzzing (e.g., 300ms window hadn't
      // elapsed when the host clicked, or the timer somehow stalled), force-
      // resolve any pending buzzes right now. After resolveBuzzes the phase
      // becomes "playing" with currentTurn = buzz winner, then we proceed.
      if (game.phase === "bonus_buzzing") {
        const collector = buzzCollectors.get(gameId);
        if (collector) {
          console.log(`[buzz] host:pick_cell during bonus_buzzing — force-resolving`);
          clearTimeout(collector.timer);
          resolveBuzzes(io, gameId);
        } else {
          console.log(`[buzz] host:pick_cell during bonus_buzzing with no buzzes — ignoring`);
          return;
        }
      }

      if (game.phase !== "playing") {
        console.log(`[buzz] host:pick_cell rejected — phase=${game.phase}`);
        return;
      }

      const cell = game.board.find(
        (c) => c.category === parsed.data.category && c.points === parsed.data.points,
      );
      if (!cell || cell.used) return;

      setActiveQuestion(game, {
        questionId:      cell.questionId,
        category:        cell.category,
        points:          cell.points,
        pickedBy:        game.currentTurn ?? game.hostId,
        buzzersOpen:     false,
        buzzersOpenedAt: null,
        currentAnswerer: game.currentTurn,
        alreadyTried:    [],
        answerRevealed:  false,
      });
      game.phase = "answering";
      broadcastAll(io, game);
    });

    // ── review (view used question on all screens) ────────────────────────

    socket.on("host:open_review", (payload: unknown) => {
      const parsed = OpenReviewPayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (game.activeQuestion) return; // can't review during active question

      const cell = game.board.find(
        (c) => c.category === parsed.data.category && c.points === parsed.data.points && c.used,
      );
      if (!cell) return;

      setReviewQuestion(game, {
        questionId: cell.questionId,
        category:   cell.category,
        points:     cell.points,
      });
      broadcastAll(io, game);
    });

    socket.on("host:close_review", () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      setReviewQuestion(game, null);
      broadcastAll(io, game);
    });

    /**
     * Judge a used (already answered) question — adjusts a player's score.
     * Used when the host reviews an old question and wants to credit/deduct a player.
     */
    socket.on("host:judge_used", (payload: unknown) => {
      const parsed = JudgeUsedPayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (!game.reviewQuestion) return;

      const q = getQuestion(game.reviewQuestion.questionId);
      const points = q?.points ?? game.reviewQuestion.points;

      // Review-judge fully reverses a past award. Wrong = -points (not the
      // half-penalty used during live answering), so e.g. a previously-awarded
      // 400 correctly nets back to 0 when retroactively marked wrong.
      if (parsed.data.correct) {
        awardPoints(game, parsed.data.playerId, points);
      } else {
        awardPoints(game, parsed.data.playerId, -points);
      }

      // Close the review after judging
      setReviewQuestion(game, null);

      io.to(`game:${gameId}`).emit("judge_result", { correct: parsed.data.correct });
      io.to(`spectator:${gameId}`).emit("judge_result", { correct: parsed.data.correct });
      broadcastAll(io, game);
    });

    // ── buzzing ───────────────────────────────────────────────────────────

    socket.on("host:open_buzzers", () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (!game.activeQuestion) return;

      game.activeQuestion.buzzersOpen     = true;
      game.activeQuestion.buzzersOpenedAt = Date.now();
      game.activeQuestion.currentAnswerer = null;
      game.phase = "buzzing";
      io.to(`game:${gameId}`).emit("buzzers_opened");
      io.to(`spectator:${gameId}`).emit("buzzers_opened");
      broadcastAll(io, game);
    });

    /**
     * Host skips remaining buzzers: reveals the answer to everyone for 4 s,
     * then auto-closes the question and advances the turn.
     */
    socket.on("host:reveal_and_close", () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (!game.activeQuestion) return;
      // Only valid while buzzers are open and nobody is currently answering.
      if (!game.activeQuestion.buzzersOpen || game.activeQuestion.currentAnswerer) return;

      // Cancel any pending buzz collection so no late buzz sneaks in.
      const collector = buzzCollectors.get(gameId);
      if (collector) {
        clearTimeout(collector.timer);
        buzzCollectors.delete(gameId);
      }

      // Cancel any existing reveal timer for this game.
      const existing = revealCloseTimers.get(gameId);
      if (existing) clearTimeout(existing);

      const aq = game.activeQuestion;
      const pickedBy  = aq.pickedBy;
      const wasBonus  = game.isBonusRound;

      // Reveal the answer to everyone.
      aq.buzzersOpen    = false;
      aq.answerRevealed = true;
      game.phase        = "answering"; // keeps modal open
      broadcastAll(io, game);

      // Auto-close after 4 seconds.
      const savedQuestionId = aq.questionId;
      const timer = setTimeout(() => {
        revealCloseTimers.delete(gameId);
        const g = getGame(gameId);
        if (!g?.activeQuestion?.answerRevealed) return;
        if (g.activeQuestion.questionId !== savedQuestionId) return;

        const category = g.activeQuestion.category;
        const points   = g.activeQuestion.points;

        markCellUsed(g, category, points);
        g.isBonusRound = false;
        setActiveQuestion(g, null);
        nextTurn(g);
        g.phase = "playing";

        // Round tracking — same logic as host:judge, but reveal-and-close
        // doesn't trigger bonus buzz (host explicitly skipped the question).
        if (pickedBy !== g.hostId && !wasBonus) {
          if (!g.roundAnswered.includes(pickedBy)) {
            g.roundAnswered.push(pickedBy);
          }
          const contestants = getNonHostPlayers(g);
          const roundComplete =
            contestants.length > 0 &&
            contestants.every((p) => g.roundAnswered.includes(p.id));

          if (roundComplete) {
            g.roundAnswered = [];
          }
        }

        const winner = checkGameOver(g);
        if (winner) {
          g.phase    = "finished";
          g.winnerId = winner;
        }

        broadcastAll(io, g);
      }, 4000);

      revealCloseTimers.set(gameId, timer);
    });

    socket.on("host:open_bonus_buzzers", () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (game.phase !== "bonus_pending") return;

      console.log(`[buzz] host:open_bonus_buzzers — phase: bonus_pending → bonus_buzzing`);
      game.phase = "bonus_buzzing";
      // Also flip the buzz flag on the staged image-question so QuestionModal
      // shows the BUZZ button (its buzzersOpen check reads aq.buzzersOpen).
      if (game.activeQuestion) {
        game.activeQuestion.buzzersOpen     = true;
        game.activeQuestion.buzzersOpenedAt = Date.now();
      }
      io.to(`game:${gameId}`).emit("buzzers_opened");
      io.to(`spectator:${gameId}`).emit("buzzers_opened");
      broadcastAll(io, game);
    });

    socket.on("host:cancel_bonus_buzz", () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      // Allow cancel during the pre-open pending phase, the buzz window itself,
      // AND the post-buzz pick window (phase = "playing" + isBonusRound = true).
      const inPendingPhase = game.phase === "bonus_pending";
      const inBuzzPhase    = game.phase === "bonus_buzzing";
      const inPickWindow   = game.phase === "playing" && game.isBonusRound && !game.activeQuestion;
      if (!inPendingPhase && !inBuzzPhase && !inPickWindow) return;

      // Cancel pending buzz collection
      const collector = buzzCollectors.get(gameId);
      if (collector) {
        clearTimeout(collector.timer);
        buzzCollectors.delete(gameId);
      }

      // Drop the staged bonus image so it doesn't linger on screen.
      setActiveQuestion(game, null);
      game.isBonusRound = false;
      nextTurn(game);
      game.phase = "playing";
      broadcastAll(io, game);
    });

    socket.on("host:force_resolve_bonus", () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (game.phase !== "bonus_buzzing") return;
      const collector = buzzCollectors.get(gameId);
      console.log(`[buzz] host:force_resolve_bonus — buzzes=${collector?.buzzes.length ?? 0}`);
      if (collector) {
        clearTimeout(collector.timer);
        resolveBuzzes(io, gameId);
      } else {
        // No buzzes at all — bail out of bonus, advance turn.
        game.isBonusRound = false;
        nextTurn(game);
        game.phase = "playing";
        broadcastAll(io, game);
      }
    });

    socket.on("player:buzz", (payload: unknown) => {
      const parsed = BuzzPayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game) return;

      const isBonusBuzz = game.phase === "bonus_buzzing";
      console.log(
        `[buzz] player:buzz from ${socket.data.twitchLogin} (${socket.data.userId}) phase=${game.phase} bonus=${isBonusBuzz}`,
      );

      // Gate: during bonus buzz there is no activeQuestion; during regular buzz there must be.
      if (!isBonusBuzz && !game.activeQuestion?.buzzersOpen) {
        console.log(`[buzz] player:buzz rejected — regular buzz but buzzers closed`);
        return;
      }

      const player = game.players[socket.data.userId];
      if (!player) return;
      // Host can't buzz, hosts only judge.
      if (socket.data.userId === game.hostId) return;

      // During regular buzz, check alreadyTried.
      if (!isBonusBuzz && game.activeQuestion!.alreadyTried.includes(socket.data.userId)) return;

      const buzz: PendingBuzz = {
        playerId:        socket.data.userId,
        clientReactionMs: parsed.data.clientReactionMs,
        receivedAt:      Date.now(),
      };

      let collector = buzzCollectors.get(gameId);
      if (!collector) {
        collector = {
          buzzes: [],
          timer: setTimeout(() => resolveBuzzes(io, gameId), BUZZ_COLLECTION_WINDOW_MS),
        };
        buzzCollectors.set(gameId, collector);
      }
      if (!collector.buzzes.find((b) => b.playerId === buzz.playerId)) {
        collector.buzzes.push(buzz);
      }
    });

    // ── judging ───────────────────────────────────────────────────────────

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

      // Snapshot state we'll need after mutations.
      const pickedBy  = game.activeQuestion.pickedBy;
      const aqCategory = game.activeQuestion.category;
      const aqPoints   = game.activeQuestion.points;
      const q          = getQuestion(game.activeQuestion.questionId);
      const points     = q?.points ?? aqPoints;
      const wasBonus   = game.isBonusRound; // capture BEFORE any mutations

      let questionResolved = false;

      // Rule #1: the original picker's *first* attempt at their own cell is
      // penalty-free. They had to pick a number — no risk on wrong. Buzz
      // attempts (alreadyTried.length > 0) AND bonus-image answers DO get
      // the half-point deduction, since those are voluntary risks.
      const isPickerFirstAttempt =
        !wasBonus &&
        answerer === game.activeQuestion.pickedBy &&
        game.activeQuestion.alreadyTried.length === 0;

      if (parsed.data.correct) {
        awardPoints(game, answerer, points);
        // Bonus image is not on the board, so no cell to mark used.
        if (!wasBonus) {
          markCellUsed(game, aqCategory, aqPoints);
        } else {
          // Track this bonus-buzzer round as used so it never repeats.
          if (!game.usedBonusBuzzerIds.includes(game.activeQuestion.questionId)) {
            game.usedBonusBuzzerIds.push(game.activeQuestion.questionId);
          }
        }

        // Turn advancement rule:
        //   - Picker answers their own pick correctly → next contestant (round-robin)
        //   - Buzz winner (steal) answers correctly → THEY take the turn (Jeopardy steal)
        //   - Bonus image correct → next contestant (round-robin, no steal mechanic)
        if (wasBonus || isPickerFirstAttempt) {
          nextTurn(game);
        } else {
          // Buzz winner stole the answer — they get the next pick.
          game.currentTurn = answerer;
        }
        game.isBonusRound = false;

        setActiveQuestion(game, null);
        game.phase = "playing";
        questionResolved = true;
      } else {
        // Wrong answer.
        if (!isPickerFirstAttempt) {
          // Buzz attempt or bonus answer — apply half-point penalty.
          awardPoints(game, answerer, -Math.floor(points / 2));
        }
        game.activeQuestion.alreadyTried.push(answerer);
        game.activeQuestion.currentAnswerer = null;

        // For bonus rounds: only one shot. If the buzz winner gets it wrong,
        // burn the image and advance — don't reopen for someone else.
        if (wasBonus) {
          if (!game.usedBonusBuzzerIds.includes(game.activeQuestion.questionId)) {
            game.usedBonusBuzzerIds.push(game.activeQuestion.questionId);
          }
          setActiveQuestion(game, null);
          game.isBonusRound = false;
          nextTurn(game);
          game.phase = "playing";
          questionResolved = true;
        } else {
          const remainingEligible = Object.values(game.players).filter(
            (p) => p.id !== game.hostId && !game.activeQuestion!.alreadyTried.includes(p.id),
          );

          if (remainingEligible.length === 0) {
            // Nobody left to try — burn the cell, advance turn.
            markCellUsed(game, aqCategory, aqPoints);
            setActiveQuestion(game, null);
            game.isBonusRound = false;
            nextTurn(game);
            game.phase = "playing";
            questionResolved = true;
          } else {
            // Auto-open buzzers for remaining eligible players.
            game.activeQuestion.buzzersOpen     = true;
            game.activeQuestion.buzzersOpenedAt = Date.now();
            game.phase = "buzzing";
            io.to(`game:${gameId}`).emit("buzzers_opened");
            io.to(`spectator:${gameId}`).emit("buzzers_opened");
          }
        }
      }

      // ── Round-end bonus-buzz trigger ────────────────────────────────────
      // Once every contestant has played one question this round, fire a
      // bonus-image buzz race. No hearts, no eliminations — everyone stays.
      let startBonusBuzz = false;

      if (questionResolved && pickedBy !== game.hostId && !wasBonus) {
        if (!game.roundAnswered.includes(pickedBy)) {
          game.roundAnswered.push(pickedBy);
        }
        const contestants = getNonHostPlayers(game);
        const roundComplete =
          contestants.length > 0 &&
          contestants.every((p) => game.roundAnswered.includes(p.id));

        if (roundComplete) {
          game.roundAnswered = [];
          const next = pickNextBonusBuzzerRound(game);
          if (next) {
            // Stage the synthetic image-question now so the pre-buzz UI can
            // already show the image during bonus_pending (host's talk window).
            setActiveQuestion(game, {
              questionId:      next.id,
              category:        "_bonus_buzzer",
              points:          next.points,
              pickedBy:        game.hostId,    // synthetic — picker is host
              buzzersOpen:     false,
              buzzersOpenedAt: null,
              currentAnswerer: null,
              alreadyTried:    [],
              answerRevealed:  false,
            });
            startBonusBuzz = true;
          }
          // If no image rounds remain → no bonus, regular play continues.
        }
      }

      // Emit sound/flash cue to all clients.
      io.to(`game:${gameId}`).emit("judge_result", { correct: parsed.data.correct });
      io.to(`spectator:${gameId}`).emit("judge_result", { correct: parsed.data.correct });

      // ── Game-over check ──────────────────────────────────────────────────
      const winner = checkGameOver(game);
      if (winner) {
        game.phase    = "finished";
        game.winnerId = winner;
      } else if (startBonusBuzz) {
        // Image is already in activeQuestion — visible to everyone now.
        // Host clicks "Bonus-Buzzer öffnen" → phase becomes bonus_buzzing +
        // buzzers_opened emitted. Gives host a talk window first.
        game.isBonusRound = true;
        game.phase        = "bonus_pending";
      }

      broadcastAll(io, game);
    });

    // ── misc host controls ────────────────────────────────────────────────

    socket.on("host:set_turn", (payload: unknown) => {
      const parsed = SetTurnPayload.safeParse(payload);
      if (!parsed.success) return;
      const gameId = socket.data.gameId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game || !isHost(socket, game)) return;
      if (!game.players[parsed.data.playerId]) return;
      if (parsed.data.playerId === game.hostId) return;
      game.currentTurn = parsed.data.playerId;
      broadcastAll(io, game);
    });

    // ── disconnect ────────────────────────────────────────────────────────

    socket.on("disconnect", (reason) => {
      console.log(`[socket] disconnected: ${socket.id} (${reason})`);
      const gameId = socket.data.gameId;
      if (!gameId || !socket.data.userId) return;
      const game = getGame(gameId);
      if (!game) return;

      // Was this the user's last open socket? If so they're truly offline.
      const remaining = untrackUserSocket(gameId, socket.data.userId, socket.id);
      const player = game.players[socket.data.userId];

      // No more elimination — everyone stays in the game. On true disconnect,
      // just flip the connected flag so the lobby greys them out / camera
      // tile shows "offline".
      if (player && remaining === 0 && player.connected) {
        setPlayerConnected(game, socket.data.userId, false);
        broadcastAll(io, game);
      }
    });
  });
}
