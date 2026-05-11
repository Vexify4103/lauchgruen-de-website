import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type {
  BoardCell,
  BoardData,
  BonusBuzzerRound,
  CategoryMeta,
  Question,
} from "@/server/types";

interface YamlQuestion {
  points: number;
  prompt: string;
  imageUrl?: string;
  audioUrl?: string;
  answer: string;
}

interface YamlCategoryFile {
  category: string;
  displayName: string;
  questions: YamlQuestion[];
}

const POINT_VALUES: ReadonlyArray<100 | 200 | 300 | 400 | 500> = [
  100, 200, 300, 400, 500,
];

function loadYamlFilesFromDir(dir: string): {
  categories: CategoryMeta[];
  questionsByCategory: Map<string, Question[]>;
} {
  const categories: CategoryMeta[] = [];
  const questionsByCategory = new Map<string, Question[]>();

  if (!existsSync(dir)) return { categories, questionsByCategory };

  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
  );

  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf-8");
    const parsed = yaml.load(raw) as YamlCategoryFile;
    if (!parsed?.category || !parsed.questions) {
      console.warn(`[questions] skipping malformed file: ${file}`);
      continue;
    }
    categories.push({
      id: parsed.category,
      displayName: parsed.displayName ?? parsed.category,
    });

    const questions: Question[] = parsed.questions
      .filter((q) => POINT_VALUES.includes(q.points as 100))
      .map((q) => ({
        id: `${parsed.category}-${q.points}`,
        category: parsed.category,
        points: q.points as 100 | 200 | 300 | 400 | 500,
        prompt: q.prompt,
        imageUrl: q.imageUrl,
        audioUrl: q.audioUrl,
        answer: q.answer,
      }));

    questionsByCategory.set(parsed.category, questions);
  }

  return { categories, questionsByCategory };
}

function buildBoard(
  categories: CategoryMeta[],
  questionsByCategory: Map<string, Question[]>,
): BoardCell[] {
  const board: BoardCell[] = [];
  for (const cat of categories) {
    const qs = questionsByCategory.get(cat.id) ?? [];
    for (const points of POINT_VALUES) {
      const q = qs.find((x) => x.points === points);
      if (!q) continue;
      board.push({ category: cat.id, points, questionId: q.id, used: false });
    }
  }
  return board;
}

/**
 * Load all boards from content/questions/board_1/, board_2/, board_3/, …
 * Each subdirectory is one board (up to 6 .yml files = 6 categories).
 *
 * Falls back to the old flat layout (content/questions/*.yml → single board)
 * if no board_N subdirectories exist, so nothing breaks during migration.
 */
export function pickAllBoards(maxBoards = 3): BoardData[] {
  const rootDir = join(process.cwd(), "content", "questions");
  const result: BoardData[] = [];

  for (let b = 1; b <= maxBoards; b++) {
    const boardDir = join(rootDir, `board_${b}`);
    if (!existsSync(boardDir)) break;

    const { categories, questionsByCategory } = loadYamlFilesFromDir(boardDir);
    if (categories.length === 0) break;

    result.push({ categories, board: buildBoard(categories, questionsByCategory) });
  }

  // ── Legacy fallback: flat content/questions/*.yml → one board ──────────
  if (result.length === 0) {
    const { categories, questionsByCategory } = loadYamlFilesFromDir(rootDir);
    result.push({ categories, board: buildBoard(categories, questionsByCategory) });
  }

  return result;
}

/**
 * Load bonus-buzzer image rounds from `content/questions/buzzer/buzzer.yml`.
 *
 * Expected shape:
 *   default_points: 500
 *   rounds:
 *     - image: buzzer_1.png
 *       answer: "Eren Yeager"
 *     - image: buzzer_2.jpg
 *       answer: "Mikasa"
 *       points: 800   # optional per-round override
 *
 * Image files themselves live next to the YAML at content/questions/buzzer/<file>
 * and are served by the /questions/[...path] route handler.
 *
 * Returns an empty array if the file is missing — bonus buzz then simply
 * never fires (regular play continues uninterrupted).
 */
interface YamlBuzzerFile {
  default_points?: number;
  rounds?: Array<{ image: string; answer: string; points?: number }>;
}

export function loadBonusBuzzerRounds(): BonusBuzzerRound[] {
  const file = join(process.cwd(), "content", "questions", "buzzer", "buzzer.yml");
  if (!existsSync(file)) {
    console.log("[questions] no buzzer.yml — bonus buzz rounds disabled");
    return [];
  }
  const raw = readFileSync(file, "utf-8");
  const parsed = yaml.load(raw) as YamlBuzzerFile | null;
  if (!parsed?.rounds) {
    console.warn("[questions] buzzer.yml has no `rounds` — skipping");
    return [];
  }
  const defaultPoints = parsed.default_points ?? 500;
  return parsed.rounds.map((r, i) => ({
    id:       `_bonus_buzzer_${i + 1}`,
    imageUrl: `/questions/buzzer/${r.image}`,
    answer:   r.answer,
    points:   r.points ?? defaultPoints,
  }));
}

/**
 * Return ALL questions from ALL boards so the server-side question pool
 * can look up any question by ID at runtime.
 */
export function loadQuestionPool(): Question[] {
  const rootDir = join(process.cwd(), "content", "questions");
  const allQuestions: Question[] = [];
  const seen = new Set<string>();

  const addFromDir = (dir: string) => {
    const { questionsByCategory } = loadYamlFilesFromDir(dir);
    for (const qs of questionsByCategory.values()) {
      for (const q of qs) {
        if (!seen.has(q.id)) {
          seen.add(q.id);
          allQuestions.push(q);
        }
      }
    }
  };

  // Try subdirectory layout first.
  let foundSubdirs = false;
  for (let b = 1; b <= 10; b++) {
    const boardDir = join(rootDir, `board_${b}`);
    if (!existsSync(boardDir)) break;
    addFromDir(boardDir);
    foundSubdirs = true;
  }

  // Fall back to flat layout.
  if (!foundSubdirs) addFromDir(rootDir);

  return allQuestions;
}
