/**
 * Production entry point for hosts that run `node index.js`.
 *
 * It builds the Next app if needed, then starts the standard Next server.
 */
const { spawn, spawnSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

require("@next/env").loadEnvConfig(__dirname);

const ROOT = __dirname;
const NEXT_BIN = path.join(ROOT, "node_modules", ".bin", "next");
const BUILD_ID = path.join(ROOT, ".next", "BUILD_ID");

const isWindows = process.platform === "win32";
const nextCmd = isWindows ? `${NEXT_BIN}.cmd` : NEXT_BIN;

function ensureBuild() {
  if (process.env.SKIP_BUILD === "1") {
    console.log("[index] SKIP_BUILD=1; skipping next build");
    return;
  }
  if (existsSync(BUILD_ID)) {
    console.log("[index] Found .next/BUILD_ID; using existing build");
    return;
  }

  console.log("[index] No .next build found; running `next build`...");
  const result = spawnSync(nextCmd, ["build"], {
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production" },
  });

  if (result.status !== 0) {
    console.error(`[index] next build failed (exit ${result.status}); aborting`);
    process.exit(result.status ?? 1);
  }
}

ensureBuild();

console.log("[index] Starting Next server...");
const proc = spawn(nextCmd, ["start"], {
  stdio: "inherit",
  cwd: ROOT,
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
});

proc.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => proc.kill("SIGTERM"));
process.on("SIGINT", () => proc.kill("SIGINT"));
