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

**A second roadmap's criteria follow them.** The figure-model plan
(`2026-09-14-2040-figure-model`) has seven of its own, AC1–AC7, and they are
not the ten above; M11 re-measured them and they are the last section of this
file. Where the two numbering schemes collide, the section heading says which
plan it belongs to.

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
17.8986 px (F4's starting point) → 16.1152 (F4) → 14.7814 px (F5 through F12,
the rigid courtesy turn's own reach, `robins-chain 2L R at t=5.469`) →
**15.2143 px (F13, the lark's orbit's own reach, `robins-chain 1R R at
t=0.969`)**. F13 made the chain's default the lark's orbit (F10's candidate 5) rather than the rigid pivot, which moved the registry's own worst take —
a shorter, faster pull by reaches less far but needs less time to get there —
and `docs/motion-report.md`'s derived bounds are rebuilt from the new number.
AC1's own number is unaffected by any of this: it is still `0`.

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
  take in the library — F13's own numbers, after moving the chain's default
  to the lark's orbit): hand floor speed 68.3750 px/beat, elbow floor speed
  188.3108 px/beat, elbow-speed-÷-hand-speed ratio 9.8864×, hand height rate
  65.1650 px/beat, out-and-back-in-one-beat (dip) 3.6000 px. The worst take
  itself reaches 15.2143 px from a dancer's own hip (`robins-chain 1R R at
t=0.969`, the orbit's own pull by).
- **The known-wrong table's current length: 1 row.** Empty from F3c until F7,
  which put the chain's pull-by assertion on it: the rigid turn's take could
  not reach a right-shoulder pass at the set's width. F13 replaced the
  chain's default with the lark's orbit (F10's candidate 5) and, with it, the
  row's own text — the orbit's pull by _is_ right-shoulder and exact in every
  real dance (all seven that call the chain hand it a becket-shaped
  arrangement, per F9's own finding) — but the row could not be deleted: the
  same assertion still fails in the synthetic duple-improper-alone formation
  `figureChecks.ts` dances every figure from, where no demo dance ever calls
  the chain and the plain walk never brings the two robins near enough to
  pull by at all. A different figure hitting the same synthetic gap, not the
  original defect recurring — see `packages/contra/src/figures/knownWrong.ts`.

## `(unsure: …)` markers still in the library

Left exactly as they are — the user resolves these, not this milestone.
Three `describe` texts still carry one:

- `california-twirl.ts`: "which of the two turns under varies from hall to
  hall; this turns the robin under."
- `robins-chain.ts`: "a lark can twirl her under his hand instead, and this
  only scoops." (F13 resolved the marker's other clause — the rigid turn's
  own 32-px-lines artefact — by replacing the chain's default with the lark's
  orbit, which does not have that turn to begin with.)
- `right-and-left-through.ts`: "exact pivot distance — the user judges by eye.
  And a hall turns a courtesy turn at a hold and stands in the lines at a
  hold, where this model's lines are nearly four times that far apart, so the
  couple stops short of the line to turn and opens out again as it lets go."
  (F11 reworded this one; unrelated to the chain, refreshed here in passing
  since this file predated it too.)

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

---

# The figure-model plan's AC1–AC7 — as measured (M11)

A different roadmap's criteria: `2026-09-14-2040-figure-model`, which replaced
the whole contra figure layer with set state, resolution and figures as data,
and whose last milestone deleted the coded layer. Measured on
`fm-m11-retirement`, on this agent's own machine — arm64 macOS 26.5.0
(`Darwin Kernel Version 25.5.0`, `T6020`), Node v25.2.1 — at the branch head
this file was committed with. This agent does not watch CI.

## AC1 (figure model) — the demo dances are pose-identical through the hub

**Measured at M1 and true until M11: 0 diff at 1e-9 px, 1e-9° and hands
identical**, over the ten demo dances the old path could thread, at every line
length their formations are checked at, two times through, every dancer, at
every 1/8 beat — plus the three oracle reports and `coverageProblems` empty on
both sides. `planCycle.golden.test.ts` asserted it on every run from M1 until
this milestone.

**It cannot be re-measured, and that is not a failure.** Both sides of the
comparison were the coded layer: the contra planner with **every figure
bridged** against the decider's own planner over the **coded** registry. The
user ruled the coded layer could go, so there is nothing left to put on either
side. The claim it made — that resolution against set state reproduces
`chainCalls` when the figures are the same figures — is what the whole plan was
built on, and it was true every day the two paths both existed.

**What stands in its place, at AC1's own tolerance:** `planCycle.golden.test.ts`
is now the **deletion's own proof that nothing moved**. Every demo dance, at
every line length its formation is checked at, every dancer, on every beat of
two times through, compared against the poses the same code produced at
`d834697` — the last commit that still held the coded layer — at **1e-9 px and
1e-9°**, with `timeline.dancers()` asserted in its own order. **87 cases, 0
diff.** `packages/contra/src/set/danceGolden.ts` says why at length.

## AC2 (figure model) — Butter's `endHalf` override is gone

**Gone, and the dance closes without it.** `swingDefinition.params` declares
`{ pairs, turns, handOffset, endFacing }` and no `endHalf`; the coded swing's
own defaults had one, which `library/figures/swing.test.ts` still asserts off
the recorded fixture. `pnpm dance butter`, at **every** becket line length
(4, 5, 6, 7, 8, 9, 10, 12 couples):

- closure **pass, worst 0.0000 px** (AC5's 0.01 px)
- `progressed` **0.0000 px**
- reach **pass, worst short 0.0000 px** (AC1's 0 short)
- collision **pass, closest 8.500 px** (AC6's 8 px)
- coverage **pass**

The mechanism is the one M2 predicted: the data swing reads its end spacing off
the formation's own places instead of guessing, so the override has nothing left
to correct.

## AC3 (figure model) — every migrated figure matches its coded predecessor

**Every per-figure golden passes, against a recorded fixture rather than a live
coded figure.** Each coded figure was sampled once at `d834697`, before the
deletion — every parameter case, both formations, from the stations and
displaced, every station, at every 1/8 beat, at full float precision — and
committed as `packages/contra/src/library/figures/fixtures/<id>.json`. Sixteen
files, 10 MB, written once and never regenerated: the recorder went with the
figures it recorded.

- **The five gatherers** (`balance`, `balance-ring`, `swing`,
  `balance-and-swing`, `allemande`) — DD21's tolerance, 0.01 px and 0.1°, from
  the stations, with **no** allowed difference but `"feet"` (M10's planted gait,
  which the coded twin was deliberately not retrofitted with). Displaced, the
  honest end is allowed to differ and what is asserted instead is its positive
  form: **`home` < 1e-9 px** — a gatherer leaves people _on_ the places.
- **The swing** is the exception the user ruled on at G1: **1 px and 1°**
  (DD13 — _"seems kinda intense. maybe like 1px?"_), where DD21 had proposed
  0.01/0.1. It is a ceiling, not a target; the measured worst is far under it.
- **The eleven carriers** (`circle`, `star`, `long-lines`, `do-si-do`,
  `pass-through`, `petronella`, `california-twirl`, `right-and-left-through`,
  `robins-chain`, `roll-away`, `slide-left`) — no allowed difference in either
  half, and nine of them declare exactly how far M10's cruise moved them
  (position 3.0278 px, facing 12.24°, both **ends exactly 0**). The two M10 left off
  the cruise — **the do-si-do and slide left** — agree with their predecessor to
  **1e-9 px and 1e-9°**, which is AC1's own tolerance (DD90: the assertion was bit-for-bit until the predecessor
  became a _recorded_ fixture and the comparison started crossing machines — the
  CI runner reproduces the do-si-do's pose to 7.3e-15 of the committed number).
  The fixtures are still unrounded: rounding them to four decimal places would
  put 7e-5 of error in, ten orders of magnitude above that noise.
- **The hey** has been held to a frozen weave since M5, when its own coded twin
  was deleted: `library/figures/heyWeaveGolden.ts`, every dancer's place and
  facing at every half beat, measured against the live coded figure at
  `c853767^` at **0.0000 px and 0.0000° over 9 312 pose comparisons**.

`pnpm --filter @caller/contra test src/library/figures/`: **376 passed**.

## AC4 (figure model) — the acceptance dances dance

`pnpm dance <slug>` over the acceptance set (eleven dances; Jeremy Corners is
parked — DD81, the Caller's Box marks it deprecated and the user: _"this dance
is nuts"_):

| dance                | `pnpm dance`                                                    |
| -------------------- | --------------------------------------------------------------- |
| Butter               | **green**                                                       |
| Whoosh               | **green**                                                       |
| Chorus Jig           | **green**                                                       |
| The Nice Combination | **green**                                                       |
| Are You 'Most Done?  | **green**                                                       |
| On the Prowl         | **green**                                                       |
| A Rare Bird          | **green**                                                       |
| Anna's Reel          | FAIL — collision 4.091 px, and motion on `balance-wave-of-four` |
| Contrablend          | FAIL                                                            |
| The Set Monster      | FAIL                                                            |
| Fatal Attraction     | FAIL                                                            |
| Jeremy Corners       | FAIL — parked (DD81)                                            |

The five that fail are exactly the five records with `"status": "lab"`, and each
one's own `notes` field names the thing it fails on, measured, from before this
milestone: Anna's Reel's numbers after the deletion — `collision 4.0915 px`,
`balance-wave-of-four` elbow 225.0, elbow/hand 49.19×, travel 26.3, `allemande`
elbow/hand 21.10×, travel 25.4 — are **identical in every digit** to the ones
its record already recorded, which is the evidence that the deletion moved
nothing. Four of the five are being finished in the user's own session (DD83).

The **sixteen programme dances** are green at every checked line length:
`dances.test.ts`, and `pnpm --filter @caller/contra test` is 1 792 passed.

## AC5 (figure model) — no `describe` or seam-specific hand work remains

**This milestone.** Deleted: the seventeen coded figures, `ContraFigure`'s
seventeen closures, `chain.ts`'s `chainCalls` threading of them, `pairing.ts`'s
place in the figure path, `balance-and-swing.ts`'s splice, `swing.ts`'s
`placeHalf` as a figure's own code, `sequences.ts`, the whole `pair/` package
and `#/pair`, the legacy bridge (`library/legacy.ts` and the `legacy` shape
kind), `legacyCyclePlanner`, and the old engine's route into the app. **71
files, 7 296 lines.** `docs/figure-layer-retirement.md` is the map.

The hall's goldens: see the regeneration note in the pull request — the 134
pictures held back from #93 were rewritten once here, and nothing else moved
but the one strip this machine rewrites on a clean `main`.

## AC6 (figure model) — a translator can encode a dance from the docs alone

`docs/dance-record.md` and `docs/dance-lab.md` both exist; the record doc ends
in a thirteen-step translator's checklist. The dry run's verdict is in the
milestone's `_DONE.md`.

## AC7 (figure model) — `@caller/choreo` stays form-neutral

**`square.test.ts` passes unchanged in meaning**, on the decider's own default
planner: a square still knows no `ones`, no `shadow` and no progression, and
`@caller/choreo`'s 227 tests pass. `pnpm check:deps`: _all import edges are
allowed_. Not one contra word crossed the seam in the whole plan — relations,
slots, the lattice and resolution are all in `@caller/contra`, and what choreo
gained is one additive, form-neutral `ScriptDeciderOptions.cycle`.
