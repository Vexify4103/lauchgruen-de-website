export type GameId = string;
export type PlayerId = string;
export type CategoryId = string;

export type GamePhase =
  | "lobby"
  | "playing"
  | "answering"
  | "buzzing"
  | "bonus_pending"   // round ended; host hasn't opened bonus buzzers yet (talk window)
  | "bonus_buzzing"   // post-round bonus buzz: all buzzers open, winner picks a question
  | "finished";

export interface Player {
  id: PlayerId;
  twitchLogin: string;
  displayName: string;
  avatarUrl: string;
  vdoStreamId: string;
  score: number;
  ready: boolean;
  /** True while the player has at least one active socket. Updated by socket
   *  connect/disconnect; used in the lobby to grey out offline players. */
  connected: boolean;
}

export interface Question {
  id: string;
  category: CategoryId;
  points: 100 | 200 | 300 | 400 | 500;
  prompt: string;
  imageUrl?: string;
  audioUrl?: string;
  answer: string;
}

export interface BoardCell {
  category: CategoryId;
  points: number;
  questionId: string;
  used: boolean;
}

export interface CategoryMeta {
  id: CategoryId;
  displayName: string;
}

/** A single board (6 categories × 5 point values). Games have 1–3 boards. */
export interface BoardData {
  categories: CategoryMeta[];
  board: BoardCell[];
}

export interface ActiveQuestion {
  questionId: string;
  category: CategoryId;
  points: number;
  pickedBy: PlayerId;
  buzzersOpen: boolean;
  buzzersOpenedAt: number | null;
  currentAnswerer: PlayerId | null;
  alreadyTried: PlayerId[];
  /** Set by host:reveal_and_close — answer is shown to everyone, modal auto-closes after ~4 s. */
  answerRevealed: boolean;
}

/** Set when the host opens a used question for everyone to review. */
export interface ReviewQuestion {
  questionId: string;
  category: CategoryId;
  points: number;
}

export interface GameState {
  id: GameId;
  hostId: PlayerId;
  phase: GamePhase;
  players: Record<PlayerId, Player>;
  playerOrder: PlayerId[];
  currentTurn: PlayerId | null;
  /** Shortcut to boards[currentBoardIndex].categories — kept in sync by switchBoard(). */
  categories: CategoryMeta[];
  /** Shortcut to boards[currentBoardIndex].board — kept in sync by switchBoard(). */
  board: BoardCell[];
  /** All available boards. */
  boards: BoardData[];
  /** Index of the currently displayed board. */
  currentBoardIndex: number;
  activeQuestion: ActiveQuestion | null;
  /** When set, shows a used-question review modal on all clients. */
  reviewQuestion: ReviewQuestion | null;
  /** True while a bonus-buzzer image round is active (image shown, buzz race in progress). */
  isBonusRound: boolean;
  /** IDs of bonus-buzzer rounds already used in this game (so we don't repeat). */
  usedBonusBuzzerIds: string[];
  winnerId: PlayerId | null;
  createdAt: number;
  /** Players who have had their turn resolved in the current round (for end-of-round bonus-buzz trigger). */
  roundAnswered: PlayerId[];
}

export interface QuestionForClient {
  id: string;
  category: CategoryId;
  points: number;
  prompt: string;
  imageUrl?: string;
  audioUrl?: string;
  answer?: string;
}

export interface ClientGameState extends Omit<GameState, "activeQuestion" | "reviewQuestion"> {
  activeQuestion:
    | (ActiveQuestion & { question: QuestionForClient })
    | null;
  /** Review question always includes the answer (it's already been played). */
  reviewQuestion:
    | (ReviewQuestion & { question: QuestionForClient })
    | null;
  /**
   * Full question data (prompt + answer) for every used cell across all boards.
   * Keyed by questionId. Sent to ALL clients so anyone can view answered questions locally.
   */
  usedQuestionData: Record<string, QuestionForClient>;
}

export const BUZZ_COLLECTION_WINDOW_MS = 300;

/** Magic category used for synthetic bonus-buzzer image questions. */
export const BONUS_BUZZER_CATEGORY = "_bonus_buzzer";

/**
 * Pre-drawn image rounds for the post-round bonus buzz. Each entry corresponds
 * to a file in content/questions/buzzer/. Loaded once at server startup.
 */
export interface BonusBuzzerRound {
  /** Synthetic question id, e.g. "_bonus_buzzer_3" — never on the board. */
  id: string;
  /** Public URL of the image (served via /questions/buzzer/<file>). */
  imageUrl: string;
  /** The single accepted answer (host judges with leeway). */
  answer: string;
  /** Points awarded for a correct answer / deducted on wrong (per rule #1). */
  points: number;
}
