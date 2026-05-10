import type {
  ActiveQuestion,
  BoardCell,
  CategoryMeta,
  ClientGameState,
  GameId,
  GameState,
  Player,
  PlayerId,
  Question,
  QuestionForClient,
} from "./types";
import { STARTING_HEARTS } from "./types";
import { generateGameId } from "../lib/stream-id";

const games = new Map<GameId, GameState>();
const questionPool = new Map<string, Question>();

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
  categories: CategoryMeta[];
  board: BoardCell[];
}): GameState {
  let id = generateGameId();
  while (games.has(id)) id = generateGameId();

  const state: GameState = {
    id,
    hostId: args.hostId,
    phase: "lobby",
    players: {},
    playerOrder: [],
    currentTurn: null,
    categories: args.categories,
    board: args.board,
    activeQuestion: null,
    winnerId: null,
    createdAt: Date.now(),
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

export function markCellUsed(
  game: GameState,
  category: string,
  points: number,
): void {
  const cell = game.board.find(
    (c) => c.category === category && c.points === points,
  );
  if (cell) cell.used = true;
}

export function nextTurn(game: GameState): PlayerId | null {
  const eligible = game.playerOrder.filter(
    (pid) => !game.players[pid]?.eliminated,
  );
  if (eligible.length === 0) return null;
  const currentIdx = game.currentTurn ? eligible.indexOf(game.currentTurn) : -1;
  const nextIdx = (currentIdx + 1) % eligible.length;
  game.currentTurn = eligible[nextIdx];
  return game.currentTurn;
}

export function checkGameOver(game: GameState): PlayerId | null {
  const alive = Object.values(game.players).filter((p) => !p.eliminated);
  const allCellsUsed = game.board.length > 0 && game.board.every((c) => c.used);

  if (alive.length === 1 && Object.keys(game.players).length > 1) {
    return alive[0].id;
  }
  if (allCellsUsed) {
    // Highest score wins on board exhaustion
    const winner = [...Object.values(game.players)].sort(
      (a, b) => b.score - a.score,
    )[0];
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
          ...(isHost ? { answer: q.answer } : {}),
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

  return {
    ...game,
    activeQuestion: activeForClient,
  };
}
