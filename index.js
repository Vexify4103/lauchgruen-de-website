/**
 * Production entry point — called by the hosting panel as `node index.js`.
 *
 * 1. If `.next/` doesn't exist (or has no BUILD_ID), runs `next build` first.
 *    Pterodactyl's Node.js egg only does `npm install` + `node index.js`, so
 *    without this auto-build the production server crashes with
 *    "Could not find a production build in the '.next' directory".
 *
 * 2. Then spawns the TypeScript server via tsx (a real dep, not dev-only).
 *
 * To skip the auto-build (e.g. you already built locally and rsync'd .next/),
 * set SKIP_BUILD=1 in the environment.
 */
const { spawn, spawnSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

// Load .env, .env.local, .env.production, .env.production.local in the order
// Next.js itself uses. Without this, `tsx server.ts` (our custom server) only
// sees vars set in the host shell — Pterodactyl users putting secrets in
// .env.local would otherwise hit "PORT not applied" surprises.
require("@next/env").loadEnvConfig(__dirname);

const ROOT      = __dirname;
const TSX       = path.join(ROOT, "node_modules", ".bin", "tsx");
const NEXT_BIN  = path.join(ROOT, "node_modules", ".bin", "next");
const BUILD_ID  = path.join(ROOT, ".next", "BUILD_ID");

const isWindows = process.platform === "win32";
const tsxCmd  = isWindows ? `${TSX}.cmd`  : TSX;
const nextCmd = isWindows ? `${NEXT_BIN}.cmd` : NEXT_BIN;

function ensureBuild() {
  if (process.env.SKIP_BUILD === "1") {
    console.log("[index] SKIP_BUILD=1 — skipping next build");
    return;
  }
  if (existsSync(BUILD_ID)) {
    console.log("[index] Found .next/BUILD_ID — using existing build");
    return;
  }
  console.log("[index] No .next build found — running `next build`…");
  const r = spawnSync(nextCmd, ["build"], {
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production" },
  });
  if (r.status !== 0) {
    console.error(`[index] next build failed (exit ${r.status}) — aborting`);
    process.exit(r.status ?? 1);
  }
}

ensureBuild();

console.log("[index] Starting server…");
const proc = spawn(tsxCmd, [path.join(ROOT, "server.ts")], {
  stdio: "inherit",
  cwd: ROOT,
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
});

proc.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => proc.kill("SIGTERM"));
process.on("SIGINT",  () => proc.kill("SIGINT"));
