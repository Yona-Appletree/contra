# Acceptance criteria — as measured

Written by M10 (cleanup), the milestone whose job is to leave these numbers
measured and written down rather than scattered across a dozen milestone
reports. Everything below was measured on `m10-cleanup`, at the branch head
this file was committed with, on this agent's own machine — arm64 macOS
26.5.2, Node v25.2.1 (the `uname -a` string identifies it as an Apple Silicon
Mac; prior milestones on this same plan run measured on an "Apple M2 Max
MacBook Pro, macOS 26.5.2", which this host's `T6020` chip id matches). Per
the standing brief, this agent does not watch CI; where a number is defined
as "on the CI runner" (AC7), the number below is this machine's own and the
director reads the CI number off this PR's own run and updates this file in
a follow-up if it differs materially.

The ten AC numbers are `plan.md`'s own acceptance criteria (not reproduced
in full here — see the roadmap plan for the exact wording each was written
against); this file exists to state, for each, what the shipped code
actually measures today.

## AC1 — hands meet by construction and never over-stretch

**Max `short` across every demo dance, at every line length its formation is
checked at (`linesFor`/`oraclesFor`, `packages/contra/src/dances/oracle.ts`):
`0`.** 51 (dance × line-length) cases, all ten demo dances. This is not a
tolerance met — the arm solver reports `short === 0` for every placed hand
at every 1/8 beat, which `sequence.test.ts` and `dances.test.ts` both assert
and which this milestone re-measured directly rather than trusting the
assertion alone.

**The M9-era `easeSeam` 0.0787 px overreach (a named debt) is resolved, not
merely bounded.** F4 through F6 each tightened the registry's own worst
"take" (a hand travelling from a dancer's hip to a joined point over one
beat) while fixing the hey, the chain, right-and-left-through and the star:
17.8986 px (F4's starting point) → 16.1152 (F4) → 14.7814 px (F5, the
courtesy turn's own reach, `robins-chain 2L R at t=5.469`) → unchanged by F6.
`docs/motion-report.md`'s own derived bounds are built from that number.
Nothing this milestone touched changed it further; there is no longer a
known overreach to record as a bound — the number to record is `0`.

## AC4 — music is the master clock

Not independently re-verified live by this milestone (that needs a browser
with real audio, which this worktree does not have — DD12). Quoting the
director's own live verification on the deployed page, which this file
records per the morning director notes: **the beat advances 1.866 per second
of `AudioContext.currentTime`, exactly 112 bpm, with the context running and
the synth primed.** `apps/web/e2e/hall.spec.ts`'s "play primes the tune and
starts the audio clock (AC4, DD12)" test is the Playwright proxy this
worktree can run, and it passed as part of this milestone's final validation
run (see the PR body's checks table).

A known, bounded, left-alone quirk in the same area: `Player.play`'s first
~0.06 s (see `packages/music/README.md`'s own section on it) — recorded
there rather than fixed, since fixing it would change observable timing
behaviour and this milestone changes no number.

## AC5 — closure and progression

**Max position error at any figure seam, across all ten demo dances at every
line length: `5.2814885788587076 × 10⁻¹⁴` px** (dance `kitchen-stomp`, 3
couples, dancer `set0/c2/lark`, the `star → balance-and-swing` seam, beat 128) — floating-point noise, not a tolerance being approached. The bound is
0.01 px; the measured worst is nine orders of magnitude under it.

## AC6 — no collisions

**Minimum torso distance across all ten demo dances at every line length:
9.192388155425107 px** (dance `butter`, 5 couples, `set0/c2/lark` and
`set0/c4/robin`, beat 100), against the 8 px bound — no pair is declared
exempt (every figure in the library, including every swing and allemande,
clears 8 px on its own).

## AC7 — frame budget

Three cases now (P1 added the shipped-hall case at its new, larger size).
Measured on this machine, Playwright's bundled headless Chromium,
`--workers` per the config, 300 frames after warm-up,
`apps/web/e2e/perf.spec.ts`, from the final validation run (below), first
attempt, no straddle, no rerun needed:

| case                                                       | budget |    median |       p90 |       p99 |       max |
| ---------------------------------------------------------- | -----: | --------: | --------: | --------: | --------: |
| pair at zoom 6                                             |   8 ms |  0.400 ms |  0.500 ms |  0.600 ms |  0.800 ms |
| 18-couple hall at zoom 1                                   |  33 ms | 10.300 ms | 10.800 ms | 15.000 ms | 15.900 ms |
| shipped hall (8+7 couples, 15 total, 30 dancers) at zoom 1 |  33 ms |  9.200 ms |  9.700 ms | 13.900 ms | 14.200 ms |

All three comfortably inside budget, consistent with every prior milestone's
own local numbers on this plan run (P1: 10.3–10.7 ms / 9.1–9.4 ms on an M2
Max; U2, H1, F5, F6: 34/34 golden Playwright cases green with no reported
`perf.spec.ts` straddle). Run twice in this session (once alongside the
golden regeneration, once as part of the final forced `turbo` run); both
passed first try with numbers within noise of each other (9.0–9.2 ms /
10.1–10.3 ms), so the table above quotes the final run. **On the CI runner
(`ubuntu-latest`):** not observed by this agent — the director reads the
number off this PR's own CI run, per the standing brief, and updates this
section if the CI number moves the picture (CI's headless Chromium on
`ubuntu-latest` has historically run somewhat slower than this machine's,
per AC7's own amendment note about runner noise).

**Where a frame's milliseconds go** (P1's own instrumented measurement,
unchanged by anything since — nothing this milestone or the milestones
between P1 and M10 touched the renderer's own hot path): the timeline
sample (`hallFrame`/`poseAt`) is about 2.7% of a frame, the floor/furniture/
bubble layer about 25%, and **the renderer itself about 72%** — reported
here as the frame-cost split, per the brief.

## AC8 — demo content

**Ten dances, thirteen tunes, six medleys, shuffle default.** Counts taken
directly from `DEMO_DANCES.length`, `@caller/music`'s `tunes`/`medleys`
arrays (T1 added ten tunes and four medleys on top of M6's three and two).
The hall's tune selector defaults to "Shuffle" (`?tune=` unset), per T1.
Every dance plays twice through before the tune switches (`timesThrough: 2`
throughout `DEMO_DANCES`' program items); the programme cycles with nobody
touching it (B1's between-dances interval, F2's silent line-up).

**Hall size:** lines of 8 and 7 (P1), 15 couples, **30 dancers** — up from
the original 9-couple/18-dancer hall. World size at 1×: 268 × 342 px; the
width is independent of line length (`SIDE_W * 2 + SET_PITCH * lines`).

## AC9 — the caller calls

Not independently re-measured as a number here (there is no single AC9
"number" the way AC1/AC5/AC6/AC7 have one) — verified by the existing
passing test suite: every figure's call text renders in the caller's pixel
bubble, in the bitmap font, starting its lead beats before the figure
starts. Confirmed green as part of this milestone's final validation run
(`apps/web/e2e/hall.spec.ts` and the unit tests around `Timeline`'s
utterance events).

## AC10 — published

Unaffected by this milestone. `docs/adr/2026-09-13-versioning-and-pages-deploy.md`
describes the mechanism; `https://yona-appletree.github.io/contra/` continues
to serve current `main` after every merge, versioned `vYYYY.MM.DD-N`.

## The motion oracle's headline numbers

`docs/motion-report.md` (`pnpm report:motion`) is the oracle's own current
output; this section is a pointer with the numbers a reader would otherwise
have to find by scrolling it.

- **Non-finite samples: 0** of 688,128 measurements across the ten demo
  dances (unchanged since F3a fixed the `NaN`-producing balance seam; every
  milestone since has re-confirmed it at 0).
- **The derived bounds** (re-derived, not picked, at 3× the worst legitimate
  take in the library): hand floor speed 66.4295 px/beat, elbow floor speed
  195.9615 px/beat, elbow-speed-÷-hand-speed ratio 10.5893×, hand height
  rate 65.1650 px/beat, out-and-back-in-one-beat (dip) 3.6000 px. The worst
  take itself reaches 14.7814 px from a dancer's own hip (`robins-chain`'s
  courtesy turn).
- **The known-wrong table's current length: 0 rows.** F3a found fourteen;
  F3c fixed three; F4, F5 and F6 fixed the remaining eleven (the hey, the
  robins chain, right-and-left-through, do-si-do) by fixing the choreography
  itself, never by loosening an assertion. `KNOWN_WRONG` is `[]` in
  `packages/contra/src/figures/knownWrong.ts`, and its own doc comment says
  why an empty list is the interesting state rather than the end of the
  table.

## `(unsure: …)` markers still in the library

Left exactly as they are — the user resolves these, not this milestone.
Three `describe` texts still carry one:

- `california-twirl.ts`: "which of the two turns under varies from hall to
  hall; this turns the robin under."
- `robins-chain.ts`: "a lark can twirl her under his hand instead, and this
  only scoops; and the couple's own line barely turns while the two bodies
  turn a half, because the places it ends on are a whole set's width apart."
- `right-and-left-through.ts`: "a hall turns a courtesy turn at a hold and
  stands in the lines at a hold, where this model's lines are more than
  twice that far apart, so the couple has to close up before it turns and
  open out again as it lets go — and the two couples turning at once pass
  8.5 px, which is as much room as a place pitch leaves them."

(`star.ts`'s own marker was resolved by F6, per the user's ruling on the
wrist grip.)

## `pnpm validate` time

The full forced check
(`pnpm exec turbo run format:check check:deps lint typecheck test build test:golden --force`,
which forces every task to actually run rather than serve from cache — the
worst case, and the one this number is worth recording as) took **26.6 s**
wall time on this machine (turbo's own reported `Time:` line; `45
successful, 45 total`, `0 cached, 45 total`), well under the 10-minute
threshold the checklist asks about. **On the CI runner:** not observed by
this agent (the standing brief does not have this agent watch CI); if the
director finds CI's own `pnpm validate` (uncached, on every PR) is over 10
minutes there, that is noted as future work per the checklist, not
optimised here — but a 26.6 s local uncached run makes a CI runner north of
10 minutes unlikely absent a very different bottleneck (network, runner
contention) than anything this repository's own task graph creates.
