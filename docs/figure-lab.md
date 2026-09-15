# The figure lab

One figure's whole inner loop, in one command, well under a minute — built
because a figure milestone's inner loop used to be the whole repo: the
motion oracle over all ten dances, every assertion, 63 strips, 116 trace
plates, then reading PNGs. That took one to two hours and 300–470k agent
tokens a milestone, nearly all of it validating things the change could not
have touched. A figure's own move only affects that move.

## The loop a figure milestone follows

1. **`pnpm figure <id>`** until it prints `green` and the three pictures look
   right. Edit the figure, run it again. This is the whole inner loop — it
   does not touch a committed file, so there is nothing to revert between
   tries.
2. Once it is green, bring the change into the committed report and pictures,
   one figure at a time so the diff stays small:
   - `pnpm report:motion --figure <id>` — patches that figure's rows and its
     seam rows into `docs/motion-report.md`, leaving everything else alone.
   - `pnpm strips --figure <id> --out apps/web/e2e/strips` — updates that
     figure's strip and the strip of every seam either side of it, in place.
   - `pnpm traces:export --figure <id> --out apps/web/e2e/traces` — updates
     that figure's four trace SVGs, in place.
3. **One full, unflagged run before the final push** —
   `pnpm exec turbo run format:check check:deps lint typecheck test build test:golden --force`
   — which regenerates the whole motion report, every strip and every trace
   from scratch and is the only thing that can re-rank a top-ten table, add or
   drop a row, or catch a figure's effect on another figure's seam. The
   per-figure commands above are for the loop; this is the gate.

## `pnpm figure <id> [--dance <slug>] [--out <dir>] [--chain <n>]`

Runs, in order, and prints a one-screen summary of all four to stdout:

1. **Its assertions** — every `figureChecks.ts` entry whose key is the figure
   itself, or a `"prev → next"` seam key with it on either side (e.g.
   `balance → swing` for `swing`) — pass/fail with the evidence line each.
2. **Its motion row, alone** — the motion oracle over the figure by itself in
   a duple-improper group of four, and in becket too if any demo dance calls
   the figure from becket — against the library's current bounds, over-bound
   numbers marked `**like this**`. Then **its seam rows**: every `A → id` and
   `id → B` seam that occurs in the demo dances that call the figure, one
   time through each (not all ten dances, and not the full two-times-through
   sweep `pnpm report:motion` does).
3. **Its oracles** — closure (AC5), reach (AC1) and collision (AC6) over the
   same dances, one time through each, pass/fail with the worst number.
4. **Its pictures** — the figure's strip (the half-beat frames at 4×, the
   gallery's own strip), and its pen plot and figure-strip cell (the same two
   panels the Moves page draws beside every tile's canvas) — written as PNG
   to `--out` (default `data/local/figure-lab/<id>/`, gitignored), rendered
   headless through Playwright against the **built** app. `pnpm figure`
   builds `@caller/web` itself before rendering, so there is no separate
   build step in the loop.

**Exit code is non-zero on any assertion or oracle failure** (a
`figureChecks.ts` row already on `knownWrong.ts`'s list does not count — that
list is the accepted, tracked baseline, not a new regression) **or on an
unknown figure id**, so the loop really is "edit, run, read": a red run means
something to look at, a green one means move on.

`--dance <slug>` restricts the seam rows and the oracles to one dance (still
only if that dance actually calls the figure — narrowing further than "the
dances that call it", not instead of it). `--out <dir>` writes the three
pictures somewhere other than the default scratch directory.

`--chain <n>` measures one of `robins-chain`'s courtesy-turn **candidates**
instead of the shipped figure — the same numbered table the app's own
`?chain=` reads (`CHAIN_CANDIDATES` in `robins-chain.ts`), so a candidate
cannot be measured as one thing and drawn as another. It reaches all four
sections: the assertions, the motion rows alone, the seam rows, the oracles
**and** the pictures, which are screenshotted with `?chain=<n>` on the Moves
page. The pictures land in `data/local/figure-lab/<id>-chain<n>/` so a
candidate never overwrites the default's. An unknown number exits 2 and names
the ones that exist.

Expect a candidate to print `FAIL` lines and still be the thing you want: a
figure's assertions are written from the shipped geometry's own `describe`,
so a candidate that is a _different_ figure fails the sentences that are only
about the shipped one. F13 made this two-directional: the default is now
F10's orbit (`?chain=5`), which turns a whole rather than a half, so
`--chain 1`–`4` (the earlier rigid and spin candidates) fail the orbit's own
sentences — the whole-turn sweep, the antipode join — exactly as `--chain 5`
used to fail the rigid turn's half-turn sentences before F13. That is the
comparison working, not the candidate being broken; read the oracles (which
are about every dance that calls it) and the motion rows for whether it is
danceable.

## The per-figure report and picture commands

Each of these defaults to the same scratch location `pnpm figure` uses
(`data/local/figure-lab/<id>/…`, gitignored) and only writes to a committed
directory when told to:

- **`pnpm report:motion --figure <id>`** patches `docs/motion-report.md`:
  it still computes the whole report (that part was never the slow one — see
  below), but only copies over the rows and the named subsections that
  mention the target key into the file that is already there. A top-ten
  table's ranking, or an added or dropped row, only comes out right from the
  unflagged run.
- **`pnpm strips --figure <id> [--out <dir>]`** re-renders just that figure's
  strip and the strip of every seam tile either side of it. With no `--out`
  it writes to the scratch directory; `--out apps/web/e2e/strips` updates
  those files in the committed directory in place, without touching any other
  figure's or seam's PNG and without rewriting the index (only a full run
  lists every tile correctly).
- **`pnpm traces:export --figure <id> [--out <dir>]`** re-renders just that
  figure's four trace SVGs (dances are never filtered — a dance's trace is
  never one figure's alone). Same default-scratch, explicit-`--out`-for-
  committed rule as strips.

None of the three ever deletes a file outside what it was asked to write, and
none of them touches `docs/motion-report.md`'s or a strip's or a trace's
_index_ — those are only ever right after the unflagged run.

## Why `--figure` does not make the full sweep faster

It was tried and measured, not assumed: P1 found that the plan cache halves
the _test suite's_ cost (`@caller/contra`'s vitest run, 12.2s → 5.7s) but does
not move the hall's own frame time, because the plan rebuild is 2.7% of a
frame and the renderer is 72%. The figure lab's own speed comes from a
different lever entirely — running the oracle and the motion sampler over
**the handful of dances that call one figure, for one time through**, instead
of all ten dances for two — which is what steps 2 and 3 above actually do.
Building `@caller/web` (about two seconds) and starting Playwright's browser
account for most of `pnpm figure <id>`'s wall time; the figure's own
measurement is a small fraction of it.
