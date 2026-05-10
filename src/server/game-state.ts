import type {
  ActiveQuestion,
  BoardData,
  ClientGameState,
  GameId,
  GameState,
  Player,
  PlayerId,
  Question,
  QuestionForClient,
  ReviewQuestion,
} from "./types";
import { STARTING_HEARTS } from "./types";
import { generateGameId } from "../lib/stream-id";

// Custom Next.js server + App Router loads this module twice (once via tsx for
// the Socket.IO handler, once via Next's bundler for API routes). Stash the
// stores on globalThis so both copies share the same in-memory state.
const globalForStore = globalThis as unknown as {
  __qd_games?: Map<GameId, GameState>;
  __qd_questions?: Map<string, Question>;
};
const games: Map<GameId, GameState> =
  globalForStore.__qd_games ?? new Map<GameId, GameState>();
const questionPool: Map<string, Question> =
  globalForStore.__qd_questions ?? new Map<string, Question>();
globalForStore.__qd_games = games;
globalForStore.__qd_questions = questionPool;

export function registerQuestionPool(questions: Question[]): void {
  questionPool.clear();
  for (const q of questions) questionPool.set(q.id, q);
}

export function getQuestion(id: string): Question | undefined {
  return questionPool.get(id);
}

export function listGames(): GameState[] {
  return [...games.values()];
}

export function getGame(id: GameId): GameState | undefined {
  return games.get(id);
}

export function createGame(args: {
  hostId: PlayerId;
  boards: BoardData[];
}): GameState {
  let id = generateGameId();
  while (games.has(id)) id = generateGameId();

  const firstBoard = args.boards[0] ?? { categories: [], board: [] };

  const state: GameState = {
    id,
    hostId: args.hostId,
    phase: "lobby",
    players: {},
    playerOrder: [],
    currentTurn: null,
    categories: firstBoard.categories,
    board: firstBoard.board,
    boards: args.boards,
    currentBoardIndex: 0,
    activeQuestion: null,
    reviewQuestion: null,
    isBonusRound: false,
    winnerId: null,
    createdAt: Date.now(),
    roundAnswered: [],
  };
  games.set(id, state);
  return state;
}

export function deleteGame(id: GameId): void {
  games.delete(id);
}

export function addPlayer(game: GameState, player: Player): void {
  if (game.players[player.id]) {
    // Update existing player (rejoin) — preserve score/hearts
    const existing = game.players[player.id];
    game.players[player.id] = {
      ...existing,
      twitchLogin: player.twitchLogin,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
    };
    return;
  }
  game.players[player.id] = player;
  if (!game.playerOrder.includes(player.id)) {
    game.playerOrder.push(player.id);
  }
}

export function setReady(game: GameState, playerId: PlayerId, ready: boolean): void {
  const player = game.players[playerId];
  if (player) player.ready = ready;
}

export function awardPoints(
  game: GameState,
  playerId: PlayerId,
  delta: number,
): void {
  const player = game.players[playerId];
  if (player) player.score += delta;
}

export function loseHeart(game: GameState, playerId: PlayerId): void {
  const player = game.players[playerId];
  if (!player) return;
  player.hearts = Math.max(0, player.hearts - 1);
  if (player.hearts === 0) player.eliminated = true;
}

export function setActiveQuestion(
  game: GameState,
  active: ActiveQuestion | null,
): void {
  game.activeQuestion = active;
}

export function setReviewQuestion(
  game: GameState,
  review: ReviewQuestion | null,
): void {
  game.reviewQuestion = review;
}

export function markCellUsed(
  game: GameState,
  category: string,
  points: number,
): void {
  // game.board is a reference to boards[currentBoardIndex].board, so mutating it
  // also mutates the boards array entry.
  const cell = game.board.find(
    (c) => c.category === category && c.points === points,
  );
  if (cell) cell.used = true;
}

/**
 * Switch the active board.  Updates the `categories` and `board` shortcuts.
 * Returns false if the index is out of range.
 */
export function switchBoard(game: GameState, index: number): boolean {
  if (index < 0 || index >= game.boards.length) return false;
  game.currentBoardIndex = index;
  game.categories = game.boards[index].categories;
  game.board = game.boards[index].board;
  return true;
}

export function nextTurn(game: GameState): PlayerId | null {
  const eligible = game.playerOrder.filter(
    (pid) => pid !== game.hostId && !game.players[pid]?.eliminated,
  );
  if (eligible.length === 0) return null;
  const currentIdx = game.currentTurn ? eligible.indexOf(game.currentTurn) : -1;
  const nextIdx = (currentIdx + 1) % eligible.length;
  game.currentTurn = eligible[nextIdx];
  return game.currentTurn;
}

export function getNonHostPlayers(game: GameState): Player[] {
  return game.playerOrder
    .filter((pid) => pid !== game.hostId)
    .map((pid) => game.players[pid])
    .filter((p): p is Player => Boolean(p));
}

export function checkGameOver(game: GameState): PlayerId | null {
  const contestants = getNonHostPlayers(game);
  const alive = contestants.filter((p) => !p.eliminated);
  // Game ends when ALL boards are exhausted.
  const allBoardsUsed =
    game.boards.length > 0 &&
    game.boards.every((b) => b.board.every((c) => c.used));

  if (contestants.length > 1 && alive.length === 1) {
    return alive[0].id;
  }
  if (contestants.length > 0 && alive.length === 0) {
    return null;
  }
  if (allBoardsUsed) {
    const winner = [...contestants].sort((a, b) => b.score - a.score)[0];
    return winner?.id ?? null;
  }
  return null;
}

const STARTING_PLAYER_DEFAULTS: Pick<
  Player,
  "score" | "hearts" | "eliminated" | "ready"
> = {
  score: 0,
  hearts: STARTING_HEARTS,
  eliminated: false,
  ready: false,
};

export function makePlayer(args: {
  id: PlayerId;
  twitchLogin: string;
  displayName: string;
  avatarUrl: string;
  vdoStreamId: string;
}): Player {
  return {
    ...args,
    ...STARTING_PLAYER_DEFAULTS,
  };
}

/**
 * Strip secret fields (question answers, etc.) before sending to a non-host.
 */
export function serializeFor(
  game: GameState,
  viewerId: PlayerId | null,
): ClientGameState {
  const isHost = viewerId !== null && viewerId === game.hostId;

  // --- activeQuestion ---
  let activeForClient: ClientGameState["activeQuestion"] = null;
  if (game.activeQuestion) {
    const q = questionPool.get(game.activeQuestion.questionId);
    const questionForClient: QuestionForClient = q
      ? {
          id: q.id,
          category: q.category,
          points: q.points,
          prompt: q.prompt,
          imageUrl: q.imageUrl,
          audioUrl: q.audioUrl,
          ...(isHost || game.activeQuestion.answerRevealed ? { answer: q.answer } : {}),
        }
      : {
          id: game.activeQuestion.questionId,
          category: game.activeQuestion.category,
          points: game.activeQuestion.points,
          prompt: "",
        };
    activeForClient = {
      ...game.activeQuestion,
      question: questionForClient,
    };
  }

  // --- reviewQuestion (answer always visible — question already played) ---
  let reviewForClient: ClientGameState["reviewQuestion"] = null;
  if (game.reviewQuestion) {
    const q = questionPool.get(game.reviewQuestion.questionId);
    if (q) {
      reviewForClient = {
        ...game.reviewQuestion,
        question: {
          id: q.id,
          category: q.category,
          points: q.points,
          prompt: q.prompt,
          imageUrl: q.imageUrl,
          audioUrl: q.audioUrl,
          answer: q.answer, // always reveal for reviewed questions
        },
      };
    }
  }

  // --- usedQuestionData (full data for all answered cells, visible to everyone) ---
  const usedQuestionData: Record<string, import("./types").QuestionForClient> = {};
  for (const boardData of game.boards) {
    for (const cell of boardData.board) {
      if (cell.used) {
        const q = questionPool.get(cell.questionId);
        if (q) {
          usedQuestionData[cell.questionId] = {
            id: q.id,
            category: q.category,
            points: q.points,
            prompt: q.prompt,
            imageUrl: q.imageUrl,
            audioUrl: q.audioUrl,
            answer: q.answer, // always include for used questions
          };
        }
      }
    }
  }

  return {
    ...game,
    activeQuestion: activeForClient,
    reviewQuestion: reviewForClient,
    usedQuestionData,
  };
}
