export type GameId = string;
export type PlayerId = string;
export type CategoryId = string;

export type GamePhase =
  | "lobby"
  | "playing"
  | "answering"
  | "buzzing"
  | "finished";

export interface Player {
  id: PlayerId;
  twitchLogin: string;
  displayName: string;
  avatarUrl: string;
  vdoStreamId: string;
  score: number;
  hearts: number;
  eliminated: boolean;
  ready: boolean;
}

export interface Question {
  id: string;
  category: CategoryId;
  points: 100 | 200 | 300 | 400 | 500;
  prompt: string;
  imageUrl?: string;
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

export interface ActiveQuestion {
  questionId: string;
  category: CategoryId;
  points: number;
  pickedBy: PlayerId;
  buzzersOpen: boolean;
  buzzersOpenedAt: number | null;
  currentAnswerer: PlayerId | null;
  alreadyTried: PlayerId[];
}

export interface GameState {
  id: GameId;
  hostId: PlayerId;
  phase: GamePhase;
  players: Record<PlayerId, Player>;
  playerOrder: PlayerId[];
  currentTurn: PlayerId | null;
  categories: CategoryMeta[];
  board: BoardCell[];
  activeQuestion: ActiveQuestion | null;
  winnerId: PlayerId | null;
  createdAt: number;
}

export interface QuestionForClient {
  id: string;
  category: CategoryId;
  points: number;
  prompt: string;
  imageUrl?: string;
  answer?: string;
}

export interface ClientGameState extends Omit<GameState, "activeQuestion"> {
  activeQuestion:
    | (ActiveQuestion & { question: QuestionForClient })
    | null;
}

export const STARTING_HEARTS = 3;
export const BUZZ_COLLECTION_WINDOW_MS = 300;
