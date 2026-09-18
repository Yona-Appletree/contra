#!/usr/bin/env node
/**
 * `pnpm lang <command> <file.dance>` — the dance language's one command.
 *
 * P1 is a stub: the parser exists, the checker (P2), the evaluator (P3) and
 * this CLI's real body (P4) do not. It prints its usage and exits non-zero so
 * nothing downstream mistakes it for a success.
 */
const USAGE = `pnpm lang <command> <file.dance>

  check <file>            read the file and print every complaint
  tree  <file>            build the tree with setup and print it
  run   <file> [--times n]  run the dance and print the timelines

Fixtures live in packages/lang/dances/. Not built yet: P1 is the parser,
P4 is this command.
`;

const [command] = process.argv.slice(2);
process.stdout.write(USAGE);
if (command !== undefined) {
  process.stderr.write(`\nlang: "${command}" is not wired up yet (P4).\n`);
}
process.exit(1);
