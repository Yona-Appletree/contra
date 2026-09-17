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

One grammar, three kinds of module, in `.dance` files under `dances/`:

```text
formation minor-set() {
  anchor centre = point(x = 0m, y = 0m);
  group ones = couple() at translate(x = -0.64m);
  group twos = couple() at translate(x = 0.64m) rotate(180);
  provide $neighbor: Place = opposite-role(other(me));
}

move swing($partner: Place, beats: Beats = 8) { ir "swing"; }

dance butter($partner: Place, $neighbor: Place, $minor-set: Group) {
  repeat (7) {
    if ($time != 1) { progress(); }
    if ($neighbor) { swing($neighbor, beats = 8); } else { wait-out($partner); }
  }
}
```

- **Casing is grammar.** Names are kebab-case (`minor-set`, `do-si-do`);
  types and enum members are TitleCase (`Place`, `Robin`). Anything else is
  a lex error that says so. `a-b` is a name, `a - b` a subtraction.
- **`$` is the only sigil.** `$name` is bound from the tree the dancer
  stands in at that beat, innermost group first; `$kind-name` (`$couple`,
  `$minor-set`) binds the innermost group of that kind; a move's `$`
  parameters are its contract and are filled from the tree unless the call
  passes them (`swing($partner = $neighbor)`). A `$` no group of the
  formation provides is a compile error with a span; one that is provided
  but finds nobody is an end effect — the move stands, `if ($neighbor)`
  takes its else.
- **Enums** are declared (`dances/prelude.dance`), tested with `is`
  (`$role is Robin`), and written bare wherever a parameter's type says
  which enum (`allemande($partner, Right)`).
- Statements end with `;`, blocks with `}`; newlines mean nothing; `//`
  comments only. Lengths carry units (`0.8m`, `60cm`); angles are degrees.
- A **formatter** (`format`) prints the one way a file looks, a **linter**
  (`lint`) names unknown types, unread bindings and statements in the wrong
  kind of module, and a **checker** (`check`) types enum members, `is`,
  calls and transforms. `src/lang/fixtures.test.ts` holds every `.dance`
  file in the repo format-stable, lint-clean and checked.

## The tree

A formation evaluates (`src/tree/evaluate.ts`) to a static tree: **groups**
(a kind, a name, a frame, children, anchors, the `$` variables it
`provide`s), **places** (a frame a dancer can occupy, with a role) and
**anchors** (a point, a line, or a direction — one frame, three uses;
facing a line means facing its normal). `at translate(…) rotate(…)
mirror(…)` is OpenSCAD's order: the rightmost op first. Every frame is in
the root's coordinates, in metres; the engine's px are 25 to the metre.

**Membership** — who stands on which place — is the only mutable state
(`src/tree/membership.ts`). It is declared, not measured: bodies move
continuously, membership changes only when the dance says `progress()`,
which runs the formation's `next` (`duple-progression`,
`triple-progression`, `circle-progression`, `none`). `seat = …` says which
groups are filled at beat 0.

The lattice's truth (DA9 in the plan's notes): a progression moves each
couple **half a minor set** along the hall, so the standard contra
formations lay their minor sets at half their own length apart, seat every
other one, and let `next` move a couple one minor set along — every dancer
position is exactly the lattice's, and adjacent minor sets are never both
occupied. `dances/formations/` has proper, improper, becket, reverse
becket, triple minor, square, four-face-four and big-circle, plus the pair
and the solo the vertical stack was built on. A formation is a file: it is
read with the prelude and `common.dance` (the couple) and nothing else, so
every formation names its modules `minor-set` and `major-set` and a move's
`$minor-set` means the same thing on every floor.

Relations are a handful of built-ins evaluated with `me` (the member of
the providing group on the way down to the asking dancer): `other`,
`opposite-role`, `same-role`, `across(me, line)`, `child`, `index`, `at`,
`role`, `my-role`; geometry: `point`, `line`, `direction`, `midpoint`,
`centre`; `group(a, b, …)` forms a group on the fly.

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
| tree              | a formation evaluated to groups, places and anchors; relations; seating and progression                                                                                       | `src/tree/*`, `dances/formations/*`    |
| compiled sequence | one script per dancer: calls with beats, this dancer's cast, the `$` bindings and the seating each was read from                                                              | `src/lang/compile.ts`                  |
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
pair, the solo, the fixture on a becket, Butter), a formation and a size;
one dancer to follow. Panes: **source** (the dance, editable, with the call
under the bar, its `$` bindings and its figure IR), **layout** (a formation
from its text with nobody on it: places, anchors, group hulls; the
interleaved minor sets faint), **timeline** (calls with entry, body, exit
and seams; a membership lane per dancer coloured by minor set, hatched
when out), **listing**, **3d** and **pixels** (the bodies, with group boxes
at the bar's seating; the pixels pane draws the app's own people on black,
the wireframe behind a toggle), **graphs** (every point against its cap),
**tree** (the formation with the seating at the bar, the followed dancer's
chain lit).

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

The robins chain and the hey (a partner swing stands in for both in
`butter.dance`); a buzz-step swing; the holds gallery and approvals; the
other becket end (Q1 of the kinetics plan); triple minor's progression is
an approximation; moving the engine to metres; a `dance` CLI and editor
support; publishing the debugger at `/spikes/`. And the seams the tests
pin rather than hide: a straight entry walk turning into an orbit, a swing
opening out to the line from hands taken across the set — over the hip's
acceleration cap, to be fixed by curved entries in the scheduler, not by a
bigger cap.
