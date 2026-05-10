import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type {
  BoardCell,
  CategoryMeta,
  Question,
} from "@/server/types";

interface YamlQuestion {
  points: number;
  prompt: string;
  imageUrl?: string;
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

let cache:
  | { categories: CategoryMeta[]; questionsByCategory: Map<string, Question[]> }
  | null = null;

function loadAllYaml() {
  if (cache) return cache;
  const dir = join(process.cwd(), "content", "questions");
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
  );

  const categories: CategoryMeta[] = [];
  const questionsByCategory = new Map<string, Question[]>();

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
        answer: q.answer,
      }));

    questionsByCategory.set(parsed.category, questions);
  }

  cache = { categories, questionsByCategory };
  return cache;
}

export function loadQuestionPool(): Question[] {
  const { questionsByCategory } = loadAllYaml();
  return [...questionsByCategory.values()].flat();
}

export function pickCategoriesAndBoard(maxCategories = 6): {
  categories: CategoryMeta[];
  board: BoardCell[];
} {
  const { categories, questionsByCategory } = loadAllYaml();
  const chosen = categories.slice(0, maxCategories);
  const board: BoardCell[] = [];
  for (const cat of chosen) {
    const qs = questionsByCategory.get(cat.id) ?? [];
    for (const points of POINT_VALUES) {
      const q = qs.find((x) => x.points === points);
      if (!q) continue;
      board.push({
        category: cat.id,
        points,
        questionId: q.id,
        used: false,
      });
    }
  }
  return { categories: chosen, board };
}
