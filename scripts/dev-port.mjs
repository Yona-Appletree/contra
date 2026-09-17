#!/usr/bin/env node
// Pick a dev-server port that lets multiple worktrees (agent sessions) coexist
// on one machine. A node port of photomancer/lp2025's scripts/dev-port.sh —
// same hash (POSIX cksum of "<worktree>:<service>"), same range, same rules.
//
// Usage: node scripts/dev-port.mjs [--query] <service-name> [pinned-port]
//
// Prints the chosen port on stdout; everything else goes to stderr.
//
// --query computes the same port with NO side effects: no eviction, no
// probing. Use it to predict where a server will land without disturbing
// anything that is running. If a process outside this worktree holds the
// port, --query warns on stderr but still prints the hash slot — the real
// launch will probe past it.
//
// The default port is derived from a hash of (worktree root, service name), so
// each worktree gets a stable port across restarts and different worktrees
// almost never collide. If the port is already bound:
//   - by a process whose cwd is inside THIS worktree → kill it (last-wins:
//     restarting a dev server always evicts its own stale predecessor);
//   - by anything else (a genuine hash collision with a live session) → probe
//     upward to the next free port instead of killing someone else's server.
// A pinned port (arg 2, or PORT in the caller's environment — which is how
// the Claude Code Browser pane hands one over) skips hashing and probing:
// same-worktree occupants are still evicted, but a foreign occupant is a hard
// error — pinned means pinned.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const PORT_BASE = 20000;
const PORT_RANGE = 20000;
const MAX_PROBES = 50;

/** POSIX `cksum`: CRC-32 (0x04C11DB7, MSB-first, init 0), then the byte
 *  length fed in little-endian, then complemented. Kept so a worktree hashes
 *  to the same slot here as lp2025's bash script would put it. */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i << 24;
  for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
  CRC_TABLE[i] = c >>> 0;
}

export function cksum(text) {
  const bytes = Buffer.from(text, "utf8");
  let crc = 0;
  const step = (b) => {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  };
  for (const b of bytes) step(b);
  for (let n = bytes.length; n !== 0; n >>>= 8) step(n & 0xff);
  return ~crc >>> 0;
}

export function worktreeRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function lsof(args) {
  try {
    return execFileSync("lsof", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    // lsof exits 1 when nothing matches.
    return "";
  }
}

/** Pids listening on a TCP port, if any. */
function listeners(port) {
  return lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(Number);
}

function cwdOf(pid) {
  const line = lsof(["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
    .split("\n")
    .find((l) => l.startsWith("n"));
  return line ? line.slice(1) : "";
}

/** True if every listener on the port has its cwd inside this worktree. */
function ownedByThisWorktree(pids, root) {
  return pids.every((pid) => {
    const cwd = cwdOf(pid);
    return cwd === root || cwd.startsWith(`${root}/`);
  });
}

function signal(pids, sig) {
  for (const pid of pids) {
    try {
      process.kill(pid, sig);
    } catch {
      // Already gone.
    }
  }
}

async function waitUntilFree(port, ticks) {
  for (let i = 0; i < ticks; i++) {
    if (listeners(port).length === 0) return true;
    await sleep(100);
  }
  return false;
}

async function evict(service, port, pids) {
  console.error(
    `dev-port: evicting stale ${service} server on port ${port} (pid ${pids.join(" ")})`,
  );
  signal(pids, "SIGTERM");
  if (await waitUntilFree(port, 50)) return;
  signal(pids, "SIGKILL");
  if (await waitUntilFree(port, 20)) return;
  throw new Error(`dev-port: port ${port} still bound after killing pid ${pids.join(" ")}`);
}

function parsePort(text, what) {
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`dev-port: ${what} "${text}" is not a port number`);
  }
  return port;
}

/**
 * Resolve the port for `service`. Returns the port; throws with a
 * `dev-port:` message when it cannot honour the rules above.
 *
 * @param {{service: string, pinned?: string | number, query?: boolean}} opts
 */
export async function pickPort({ service, pinned = "", query = false }) {
  const root = worktreeRoot();
  const pinnedText = String(pinned ?? "").trim();

  if (pinnedText !== "") {
    const port = parsePort(pinnedText, "pinned port");
    const pids = listeners(port);
    if (query) {
      if (pids.length > 0 && !ownedByThisWorktree(pids, root)) {
        console.error(
          `dev-port: pinned port ${port} is currently held by another process (pid ${pids.join(" ")}, not this worktree)`,
        );
      }
      return port;
    }
    if (pids.length > 0) {
      if (!ownedByThisWorktree(pids, root)) {
        throw new Error(
          `dev-port: pinned port ${port} is in use by another process (pid ${pids.join(" ")}, not this worktree). Refusing to steal it.`,
        );
      }
      await evict(service, port, pids);
    }
    return port;
  }

  let port = PORT_BASE + (cksum(`${root}:${service}`) % PORT_RANGE);

  if (query) {
    const pids = listeners(port);
    if (pids.length > 0 && !ownedByThisWorktree(pids, root)) {
      console.error(
        `dev-port: hash port ${port} is currently held by another worktree's server; a real launch would probe upward`,
      );
    }
    return port;
  }

  for (let probe = 0; probe < MAX_PROBES; probe++) {
    const pids = listeners(port);
    if (pids.length === 0) return port;
    if (ownedByThisWorktree(pids, root)) {
      await evict(service, port, pids);
      return port;
    }
    console.error(`dev-port: port ${port} is held by another worktree's server; probing ${port}+1`);
    port += 1;
  }
  throw new Error(`dev-port: no free port found after ${MAX_PROBES} probes from the hash slot`);
}

async function main(argv) {
  let query = false;
  while (argv[0]?.startsWith("--")) {
    const flag = argv.shift();
    if (flag === "--query") query = true;
    else throw new Error(`dev-port: unknown flag ${flag}`);
  }
  const [service, pinned = ""] = argv;
  if (!service) {
    throw new Error("usage: dev-port.mjs [--query] <service-name> [pinned-port]");
  }
  console.log(await pickPort({ service, pinned, query }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
