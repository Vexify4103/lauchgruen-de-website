/**
 * Copies buzzer images from content/questions/buzzer/ → public/buzzer/
 * so Next.js serves them as static files (no route-handler overhead).
 *
 * Run automatically via the prebuild / predev npm lifecycle hooks.
 * Add new images to content/questions/buzzer/ — they'll be picked up next run.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const src  = join(root, "content", "questions", "buzzer");
const dest = join(root, "public", "buzzer");

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"]);

if (!existsSync(src)) {
  console.log("[sync-buzzer] content/questions/buzzer/ not found — nothing to copy");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });

const files = readdirSync(src).filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()));
for (const file of files) {
  cpSync(join(src, file), join(dest, file));
}
console.log(`[sync-buzzer] copied ${files.length} image(s) → public/buzzer/`);
