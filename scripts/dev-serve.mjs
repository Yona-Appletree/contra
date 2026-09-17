#!/usr/bin/env node
// Start one dev server on this worktree's port (see dev-port.mjs) and print
// where it is. Every way of starting a dev server in this repo goes through
// here — `pnpm dev:web`, `pnpm dev:storybook`, `pnpm dev:spikes`, the apps'
// own `dev` scripts that `pnpm dev` (turbo) runs, and the Browser pane's
// `.claude/launch.json` entries — so nothing assumes 5173 or 6006.
//
// Usage: node scripts/dev-serve.mjs <web|storybook|spikes> [extra server args]
//
// The port is the worktree hash unless PORT is set, in which case PORT is a
// pin (the Claude Code Browser pane sets it, having found a free port
// itself). The URL the server itself prints is the source of truth.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { pickPort } from "./dev-port.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const SERVICES = {
  web: {
    cwd: "apps/web",
    path: "/contra/", // vite.config.ts `base`
    command: (port) => ["pnpm", "exec", "vite", "--strictPort", "--port", String(port)],
  },
  storybook: {
    cwd: "apps/storybook",
    path: "/",
    command: (port) => ["pnpm", "exec", "storybook", "dev", "--exact-port", "-p", String(port)],
  },
  spikes: {
    cwd: ".",
    path: "/spikes/",
    command: (port) => ["python3", "-m", "http.server", String(port), "--bind", "127.0.0.1"],
  },
};

const [service, ...extraArgs] = process.argv.slice(2);
const spec = SERVICES[service];
if (!spec) {
  console.error(`usage: dev-serve.mjs <${Object.keys(SERVICES).join("|")}> [extra server args]`);
  process.exit(2);
}

const port = await pickPort({ service, pinned: process.env.PORT ?? "" }).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

const [exe, ...args] = spec.command(port);
console.error(`dev-serve: ${service} → http://localhost:${port}${spec.path}`);
console.error(`dev-serve: ${[exe, ...args, ...extraArgs].join(" ")}`);

const child = spawn(exe, [...args, ...extraArgs], {
  cwd: new URL(spec.cwd, `file://${repoRoot}`),
  stdio: "inherit",
  env: { ...process.env, PORT: String(port) },
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code, sig) => {
  process.exit(code ?? (sig ? 1 : 0));
});
