/**
 * Production entry point — called by the hosting panel as `node index.js`.
 * Spawns the TypeScript server via tsx (which is a real dependency, not dev-only).
 */
const { spawn } = require("child_process");
const path = require("path");

const tsx = path.join(__dirname, "node_modules", ".bin", "tsx");

const proc = spawn(tsx, [path.join(__dirname, "server.ts")], {
  stdio: "inherit",
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
});

proc.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => proc.kill("SIGTERM"));
process.on("SIGINT",  () => proc.kill("SIGINT"));
