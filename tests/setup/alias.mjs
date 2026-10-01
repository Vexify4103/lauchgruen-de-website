// Resolves the `@/` path alias for `node --test`, mirroring tsconfig's "@/*": ["./src/*"].
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourceRoot = path.resolve(import.meta.dirname, "../../src");
const isFile = (candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile() ?? false;

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith("@/")) {
			const base = path.join(sourceRoot, specifier.slice(2));
			const match = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(isFile);
			if (match) return nextResolve(pathToFileURL(match).href, context);
		}
		return nextResolve(specifier, context);
	},
});
