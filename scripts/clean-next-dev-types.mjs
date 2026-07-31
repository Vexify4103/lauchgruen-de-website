import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";

const projectRoot = process.cwd();
const devDirectory = resolve(projectRoot, ".next", "dev");
const generatedTypes = resolve(devDirectory, "types");

// Keep this cleanup narrowly scoped to Next's generated development types.
// An interrupted dev compilation can leave routes.d.ts and validator.ts out of sync.
if (!generatedTypes.startsWith(`${devDirectory}${sep}`)) {
	throw new Error(`Refusing to clean an unexpected path: ${generatedTypes}`);
}

await rm(generatedTypes, { recursive: true, force: true });
console.log("[prebuild] removed stale .next/dev/types");
