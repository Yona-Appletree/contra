# @caller/kinetics

Engine 3: a compiler from a dance, written as text, to proved motion. A
**formation** builds a tree of groups, places and anchors in metres; a
**dance** sequences moves in beats from every dancer's own point of view;
the moves compile, through a figure language of timed constraints and a
per-dancer per-beat assembly, into continuous trajectories for every body
point, each under a physical cap with no discontinuities, proved once on
the executor rather than per figure. Vision and plans:
`Planning/contra/_archive/2026-09-16-2348-kinetics-model/` (`vision.md`
D1–D17) and `Planning/contra/2026-09-17-0742-dance-language/`.

## The language

One grammar, one kind of module, in `.dance` files under `dances/`. What a
statement emits decides which pass reads it: the **space words** — `place`,
`anchor`, `group`, `provide`, `dancers` — are read once, for nobody, to
build the tree; everything else is read once per dancer, with a cursor, to
build the timeline; `card` and `say` are annotations either may carry.

```text
module minor-set() {
  anchor center = point(x = 0m, y = 0m);
  group ones = couple() at translate(x = -0.64m);
  group twos = couple() at translate(x = 0.64m) rotate(180);
  provide $neighbor: Place = opposite-role(other(me));
  provide $travel: Direction = if (index(me) == 0) Up else Down;
}

module major-set(minor-sets: Int = 3) {
  for i in 0..2 * minor-sets - 1 {
    group minor-set() at translate(y = 0.8m * i) {
      if (i % 2 == 0) { dancers; }
    }
  }
  group out-top = couple() at translate(x = 0.64m, y = -0.8m) rotate(180);
  provide progress() {
    if ($minor-set) { $minor-set = along($minor-set, $travel) or out-top; }
    else { $minor-set = last(minor-set, Up); $couple = "twos"; }
  }
}

module swing($partner: Place, beats: Beats = 8) { ir "swing"; }

module butter() {
  group becket(minor-sets = $minor-sets);
  card "Butter";
  repeat (7) {
    if (not $first-time) { progress(); }
    phrase(A1) { swing($neighbor, beats = 8); }
  }
}
```

- **Casing is grammar.** Names are kebab-case (`minor-set`, `do-si-do`);
  types and enum members are TitleCase (`Place`, `Robin`, `Up`). Anything
  else is a lex error that says so. `a-b` is a name, `a - b` a subtraction.
- **`$` is the only sigil.** `$name` is bound from the tree the dancer
  stands in at that beat, innermost group first; `$kind-name` (`$couple`,
  `$minor-set`) binds the innermost group of that kind; a move's `$`
  parameters are its contract and are filled from the tree unless the call
  passes them (`swing($partner = $neighbor)`). A `$` no group of the floor
  provides is a compile error with a span; one that is provided but finds
  nobody is an end effect — the move stands, `if ($neighbor)` takes its
  else. `$time`, `$times`, `$first-time`, `$last-time` and `$beat` are the
  cursor's, from the innermost loop.
- **Enums** are declared (`dances/prelude.dance`), tested with `is`
  (`$role is Robin`), and written bare wherever a parameter's type says
  which enum (`allemande($partner, Right)`, `direction(Up)`, `mirror(X)`).
- Statements end with `;`, blocks with `}`; newlines mean nothing; `//`
  comments only. Lengths carry units (`0.8m`, `60cm`); angles are degrees.
  `for i in 0..n` is exclusive, `0..=n` inclusive; `repeat (n)` is sugar.
  `match (x) { A1 => …; _ => …; }` is exhaustive over an enum unless `_`.
  `assert(cond, "why");` is a diagnostic when false.
- **`children()`** places a call's block: `phrase(A1) { … }` runs the
  block where `phrase` says `children();`. A `group m() { … }` block runs
  in the group's scope where its module says `children()`, or at its end —
  which is how `dancers;` seats a set from outside its module.
- Transforms are in the frame's own terms — `fwd`, `back`, `left`, `right`
  — with `translate(x =, y =)`, `rotate(deg)`, `mirror(X | Y)` for the
  hall's axes, applied in OpenSCAD's order (the rightmost first).
- A **formatter** (`format`) prints the one way a file looks, a **linter**
  (`lint`) names unknown types, unread bindings and space that depends on a
  dancer, and a **checker** (`check`) types enum members, `is`, calls,
  transforms and `match`. `src/lang/fixtures.test.ts` holds every `.dance`
  file in the repo format-stable, lint-clean and checked.

## The tree, the dancers, and events on the beat

A module's space evaluates (`src/tree/evaluate.ts`) to a static tree:
**groups** (a kind, a name, a frame, children, anchors, the `$` variables
and the functions it `provide`s), **places** (a frame a dancer can occupy,
with a role) and **anchors** (a point, a line, or a direction — one frame,
three uses). Every frame is in the root's coordinates, in metres; the
engine's px are 25 to the metre. A dance owns its floor: `group becket(…)`
in the dance builds the tree, and `$minor-sets` from the hall says how long
the set is.

**Dancers** are instantiated by `dancers;` — every unfilled place under the
group it sits in, under ordinary conditionals, so the odd-couple end is a
line of dance text. A dancer is `{ id, role, place }`, and that is the only
mutable state. It changes only by **events**: `progress();` runs the
formation's `provide progress() { … }` for the dancer, whose `$minor-set =
…`, `$couple = "twos"`, `$place = …` and `$role = …` are queued; the dance
is evaluated in **lock-step** (`src/lang/compile.ts`), every dancer at the
same beat reading the same state, and the queue **commits** as one
transaction when everyone at the beat has reached the sync point, then the
invariants are checked (no place with two dancers, nobody nowhere). "The
same slot as before unless told otherwise": `$minor-set = G` keeps the
dancer's couple slot and role under `G`. No progression is a primitive;
every formation in `dances/formations/` writes its own — proper, improper,
becket, reverse becket, triple minor (approximate), square, four-face-four,
big circle — with `along`, `first`, `last`, `around`, `or`.

A formation is a file: it is read with the prelude and `common.dance` (the
couple) and nothing else, so every formation names its modules `minor-set`
and `major-set` and a move's `$minor-set` means the same thing on every
floor. The lattice's truth (DA9): a progression moves a couple half a minor
set along the hall, so the contra formations lay minor sets at half their
own length apart and seat every other one.

## Diagnostics, and `dance check`

Every complaint of every layer is one shape (`src/diagnostics/`): a code, a
message, the span with a caret, the beat, the dancers, a **trace** through
the compiled call (its text, its `$` bindings, the seating it read), the
scheduled window with the scheduler's notes, the assembly slot, and the
point at fault; and a suggestion where the fix is known. The floor checks
see what no layer does: bodies overlapping (K101, hips within 0.40 m with no
hold), hands meeting with no hold (K102), a figure ending off its place
(K103), a phrase assert (K104), dancers' threads desynchronised at a
`progress()` (K105), a partner or ring that does not name back (K106).

```bash
pnpm --filter @caller/kinetics check dances/butter.dance --minor-sets 2          # rustc-shaped
pnpm --filter @caller/kinetics check dances/butter.dance --minor-sets 2 --brief  # no traces
pnpm --filter @caller/kinetics check dances/butter.dance --minor-sets 2 --json   # for an agent
pnpm --filter @caller/kinetics dance format dances/butter.dance
```

The exit code is 1 on any error. In the debugger the same diagnostics are
the strip: click one and the bar goes to the beat, the dancer is followed,
and the trace shows.

## Allowed imports

`@caller/core` (the geometry, the time layer, `RENDERING_CONTRACT` — never
`core/src/kinematics/*`, which this engine replaces;
`src/allowedImports.test.ts` fails on their names) and, for the debugger's
pixels pane only, `@caller/hall`'s people drawing. **Nothing imports this
package**: `scripts/check-deps.mjs` lists `kinetics` in no other package's
allowed set.

## The layers, and who owns each

| layer             | what it is                                                                                                                                                                    | file                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| language          | lexer, parser, syntax tree, formatter, linter, checker                                                                                                                        | `src/lang/*`                           |
| tree              | a module's space evaluated to groups, places and anchors; relations; dancers, events and commits                                                                              | `src/tree/*`, `dances/formations/*`    |
| compiled sequence | every dancer's script in lock-step: calls with beats, casts, `$` bindings, the seatings and the events                                                                        | `src/lang/compile.ts`                  |
| diagnostics       | one shape for every layer, with a trace; the floor checks; the CLI                                                                                                            | `src/diagnostics/*`, `src/cli.ts`      |
| moves             | each move's contract, parameters and figure                                                                                                                                   | `dances/moves.dance`                   |
| figure IR         | a figure as timed constraints: `pre`, soft `post`, windows (orbit, walk, pass, pivot, walk-to-seat, stand, intrinsic), look rules, casts                                      | `src/ir/Figure.ts`, `src/figures/*.ts` |
| dialect           | what the rest of the stack reads of the floor: who, which role, where at beat 0, home; made from the tree                                                                     | `src/dialect/tree/TreeDialect.ts`      |
| schedule          | entry, body and exit per call, the exit back-chained from the next figure's `pre` onto this one's soft end; hand seams; nobody stands; elision; home is the place at the call | `src/schedule/schedule.ts`             |
| assembly          | one slot per dancer per beat: step, pivot, hold, drop, lean, look, buzz, stand; the listing in a dancer's words                                                               | `src/asm/*`                            |
| executor          | slots to continuous effector trajectories: hips and facing on a natural cubic spline, feet by cadence, hands on cosine ramps                                                  | `src/executor/*`                       |
| solver            | joints from effectors: shoulders, two-bone arms with a hold's swivel, hand plates, a head solved toward a point                                                               | `src/solver/*`, `src/holds/*`          |
| proof             | speed and acceleration under each point's cap, no jumps, at 16 samples a beat                                                                                                 | `src/motion/prove.ts`                  |
| debugger          | every layer on one page, one bar through all of them                                                                                                                          | `debugger/`                            |

## The debugger

`pnpm --filter @caller/kinetics dev` → http://localhost:5177. A preset (the
pair, the solo, the fixture on a becket, Butter) and the hall's size; one
dancer to follow. Panes: **source** (the dance, editable, with the call
under the bar, its `$` bindings and its figure IR), **layout** (a formation
from its text with nobody on it: places, anchors, group hulls; the
interleaved minor sets faint), **timeline** (calls with entry, body, exit
and seams; a membership lane per dancer coloured by minor set, hatched
when out), **listing**, **3d** and **pixels** (the bodies, with group boxes
at the bar's seating; the pixels pane draws the app's own people on black,
the wireframe behind a toggle), **graphs** (every point against its cap),
**tree** (the dance's floor with the seating at the bar, the followed
dancer's chain lit). The strip above them lists the diagnostics.

## The caps

Physical constants in cm/s and cm/s², converted at the dance's tempo
(`px/beat = cm/s × 60/bpm ÷ 4`), never derived from any library
(`src/units/caps.ts`). At 112 bpm: hip 140 cm/s and 250 cm/s² (18.75
px/beat, 17.9 px/beat²); feet 300 / 1200; hands 220 / 900; shoulders and
head 170 / 350; elbows 200 / 800. Angular: yaw 400°/s, lean ±15° at 60°/s,
look ±70° at 300°/s. Assembly limits (`src/units/limits.ts`): a step ≤ 75 cm
(a warning above 60), a pivot ≤ 90° while stepping, a take ramps over
`TAKE_BEATS` = 2.

## The seams

A hold the next figure needs and this one already has is **carried**; a take
whose hands are free during the previous figure's last beats **overlaps**
them; otherwise it costs an entry slot; a drop overlaps the next figure's
first beat when its `pre` needs no hands. A walk ramps (half a step to start
from standing, half to stop). An orbit **spirals out** over its last beats to
where the next figure starts, its rotation frozen unless the next figure
orbits too. A `free` orbit turns as many times as its rate allows and ends
where its `post` says (a swing: beside the partner, facing home, in the line).

## Running

```bash
pnpm --filter @caller/kinetics test
pnpm --filter @caller/kinetics dev     # the debugger, http://localhost:5177
pnpm --filter @caller/kinetics build   # dist/debugger/
```

## What is deliberately not here yet

Moves in the language (the `ir` line still names a TypeScript figure); the
robins chain and the hey (a partner swing stands in for both in
`butter.dance`, and the diagnostics say what that costs: two couples' swings
on one axis); a buzz-step swing; the holds gallery and approvals; the other
becket end (Q1 of the kinetics plan); triple minor's twos and threes are an
approximation; moving the engine to metres; editor support; publishing the
debugger at `/spikes/`. And the seams the tests
pin rather than hide: a straight entry walk turning into an orbit, a swing
opening out to the line from hands taken across the set — over the hip's
acceleration cap, to be fixed by curved entries in the scheduler, not by a
bigger cap.
