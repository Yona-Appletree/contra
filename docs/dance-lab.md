# The dance lab

One dance's whole inner loop, in one command: does every call **resolve**
against the live set, does the dance **close, reach and miss** at every line
length it is checked at, does anything **move** faster than the figure library
allows, and what does it **look** like.

The counterpart of [the figure lab](./figure-lab.md), and built for a different
consumer. `pnpm figure <id>` is what somebody editing a figure runs. `pnpm dance
<slug>` is what somebody **encoding a dance** runs — which, from the figure
model's M8 onwards, is a small agent holding a Caller's Box transcript and
`docs/dance-record.md`, with one command to tell it whether the record it just
wrote actually dances.

## The loop a dance milestone follows

1. Write or edit `data/dances/<slug>.json`. A dance that does not dance yet is
   `"status": "lab"`, which keeps it out of `DEMO_DANCES` and out of the
   programme while still loading, so the record can be committed and worked on
   without the demo ever showing a dance that does not dance.
2. **`pnpm dance <slug>`** until it prints `green`. Edit the record, run it
   again. Nothing it writes is a committed file, so there is nothing to revert
   between tries.
3. When it is green, take the dance out of `"status": "lab"` and put its slug
   in `data/dances/programme.json`.
4. **One full, unflagged run before the final push** —
   `pnpm exec turbo run format:check check:deps lint typecheck test build test:golden --force`.
   The per-dance command is for the loop; this is the gate.

## `pnpm dance <slug> [--couples n] [--out dir] [--no-traces]`

Prints four sections and exits non-zero if anything in the first three failed,
or if the slug names no dance.

### 0. Still owed

Only for a dance that calls a figure a later milestone owns. A lab dance is
encoded from its transcript whether or not every figure in it exists yet — the
record is complete and the test says exactly what is missing — and such a dance
cannot resolve at all, so this section names the figures and their milestones
and the report stops there. `@caller/web`'s own `danceOrder` asks the same
question (`danceOwes`) and keeps the dance out of the evening.

### 1. Resolution

Every call of the dance, in schedule order, as the **new layer** actually
resolved it: which figure instances it became, which dancer played each
figure-role, which anchor rule placed the frame, which ends rule the definition
declares, which hands were carried in from the call before and handed on to the
call after, and everybody the call left on hold-place.

This is read back off a real run through `contraCyclePlanner`, not computed a
second way, so the table is what happened rather than what a parallel code path
thinks would have. A call that does not resolve at all — an unknown figure, a
relation the formation has not built, an actor rule the interpreter has not got
— fails here with the milestone that owns it in the message
(`unsupported: N2 (M6)`).

`--couples n` reads the table at that line length; the default is the first
length the dance's formation is checked at.

### 2. Oracles

Closure (AC5, 0.01 px), reach (AC1, 0 short), collision (AC6, 8 px) and timeline
coverage, **at every line length the formation is checked at** — 2 to 6 couples
for duple improper, 4 to 12 for becket — over two times through, run through the
contra planner. Plus `progressed`, the distance from the progressed set's own
first places, which is AC5 read the other way.

A dance that closes at four couples and not at five is a dance that does not
close, which is why the lab sweeps rather than sampling.

### 3. End effects

**Which calls leave whom out, at which end** (M6). The end-of-set rule is the
simplest one there is — a relation that resolves to nobody leaves that dancer on
hold-place for the call — and this section reads it out loud: for every call
that names a relation, every dancer that relation answers nobody for, at
whichever end of the line they are standing, at every checked line length.

It is computed from the lattice rather than from the timeline, so it says _why_
somebody stood still rather than only that they did. It is **evidence, not
failure**: a dance that reaches to N3 or N4 has busier ends in a short line by
construction, and this is how the lab says how long a line the dance is asking
for.

### 3b. Shapes

**Which calls say they form a shape, and whether they formed one** (M7, Q6). A
figure's `ends` may name a **target shape** — a line of four, a ring, a wave, a
diamond — and a call may name one too, in its own `form` parameter, which is how
a transcript's exit clause is written down (`; form wave of four (men in
center)`). Either way the claim is checkable: the shape is solved from where the
figure _really_ left its dancers, and the row says how far the worst of them is
from the place it gives them.

A call that states **both** a turn and a shape is stating one thing twice, and
the row prints the turn the shape asks for beside the turn the call gave.

It is a **warning, never a failure**, and deliberately: a shape clause describes
where a figure leaves you, and a caller wants to be told when the description
and the dancing part company rather than have the dance refuse to load. The
caller's word wins on the amount, for the same reason.

One standing warning is worth knowing about: **a bent line is not a _regular_
ring**. `bend-the-line` settles its four dancers on the formation's own places,
which are 32 px across the set and 20 along it — four dancers who can all take
hands, and not a circle — so The Nice Combination's row reads 8.742 px off one.
The row says so in as many words.

### 4. Motion

The motion oracle's rows for the dance's own figures and its own seams, against
the library's derived bounds (`figures/motionBounds.ts`). **A value over its
bound fails the lab** unless `src/dances/motionAllowlist.ts` names it, with a
sentence saying why it is tolerated and what would remove it.

This is director debt 11 and the figure model's R6: the motion oracle used to be
advisory — the report printed a number in bold and nothing failed. It is now a
gate with a written list of known defects, so a _new_ one is a failure and an
old one is a debt with a name. Nothing in the allowlist is a tolerance being
raised: the bounds are derived and do not move.

### 5. Traces

The dance's four trace SVGs — the pen plot, the march, the seismograph and the
figure strip — written to `--out` (default `data/local/dance-lab/<slug>/traces/`,
gitignored) through the same `traces:export` path the committed plates use.
`--no-traces` skips them, which is what a batch run over every dance wants.

## The pure half

Everything except the traces comes from `packages/contra/src/dances/danceLab.ts`
and is pure — `danceLabReport(slug, couples?)` returns `{ slug, ok, text }` and
writes nothing. `packages/contra/scripts/danceLab.mjs` is the part that prints
it, spawns the trace export and turns both into one exit code. Same split as
`figureLab.ts`/`figureLab.mjs`, and the same reason: a test can assert the
report without a temp directory, and `danceLab.test.ts` runs it over all ten
demo dances as the gate that they are all green.
