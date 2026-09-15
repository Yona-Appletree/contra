# AGENTS.md

Doctrine and checklist for agents working in this repository. Read this,
then [README.md](./README.md), then the ADRs in [docs/adr/](./docs/adr/) —
start with
[2026-09-13-versioning-and-pages-deploy.md](./docs/adr/2026-09-13-versioning-and-pages-deploy.md).

## Where code goes

| Kind of code                                                                       | Package / path                        | Filename                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| Clock, pose sample, arm solver, stacking, seam easing, style                       | `packages/core/src/`                  | `<Name>.ts`, co-located `<Name>.test.ts` |
| The resting arm: where a `'down'` hand hangs, the elbow pole, the drawn arm points | `packages/core/src/kinematics/`       | `drawnArms.ts`                           |
| Formation, group, figure def, progression, timeline, decider                       | `packages/choreo/src/`                | `<Name>.ts`, co-located `<Name>.test.ts` |
| Contra role set, contra figures, contra dances                                     | `packages/contra/src/`                | `<Name>.ts`, co-located `<Name>.test.ts` |
| A figure written as **data** (a `FigureSpec`), not code                            | `packages/contra/src/figures/specs/`  | `<name>Spec.ts`, co-located test         |
| A dance written as **data**, loaded by `packages/contra/src/dances/`               | `data/dances/`                        | `<slug>.json`, plus `programme.json`     |
| A figure's texts as **data**, loaded by `packages/contra/src/text/`                | `data/figures/`                       | `<figure-id>.json`                       |
| The pixel-hall renderer: world, bodies, z-order, bubble                            | `packages/hall/src/`                  | `<Name>.ts`, co-located `<Name>.test.ts` |
| Audio clock, tunes, medleys, notation cursor                                       | `packages/music/src/`                 | `<Name>.ts`, co-located `<Name>.test.ts` |
| A tune as **data**: key, melody lines, hand chord chart, arrangement               | `packages/music/src/tunes/`           | `<tuneName>.ts` via `defineTune`         |
| The harmoniser: draft charts, chord plausibility                                   | `packages/music/src/chords/`          | `harmonise.ts`, co-located test          |
| Design tokens, theme, CSS variables                                                | `packages/ui-design/src/`             | `theme.css`                              |
| Primitive component (no app knowledge)                                             | `packages/ui-base/src/components/ui/` | `<name>.tsx` (shadcn layout)             |
| App screens, layout, routing, composition root                                     | `apps/web/src/`                       | `<Name>.tsx`                             |
| Full-tree stories                                                                  | `apps/storybook/src/`                 | `<Name>.stories.tsx`                     |
| Visual spikes (never imported by production code)                                  | `spikes/<name>/`                      | `index.html` + vendored assets           |

A package may keep a local file at any layer when it needs one; the table
names the default home, not a prohibition.

## The dependency rule

Arrows mean "may import", and **a package may import any package below it,
not only the next one down** (director ruling DD17): the arrows are a layering,
not a chain of single hops. `contra` therefore imports `core` directly — a
figure's whole output is a `PoseSample`, and it needs the arm solver, the quiet
motion, the seam ease and thirty-odd geometry helpers, which is a layer rather
than a slice worth re-exporting. Enforced by `scripts/check-deps.mjs`
(`pnpm check:deps`, part of `pnpm validate`): a workspace-wide scan of
import specifiers against this table, failing on any edge not listed and on
any import from `spikes/`.

```text
core ← choreo ← contra          (form-neutral model; contra is one form)
core ← contra                   (a contra figure emits poses, so it needs core)
core ← hall                     (renderer reads pose samples and the timeline)
core ← music                    (clock, tunes, medleys)
ui-design ← ui-base             (theme tokens, shadcn primitives)
apps/web → core, choreo, contra, hall, music, ui-design, ui-base
apps/storybook → everything
```

- Production code (`packages/*`, `apps/*`) never imports from `spikes/`.
  Spikes stay in the repo as the visual record and are served at
  `/spikes/` on the deployed site, unchanged.
- `@caller/core` knows nothing about dancing; `@caller/choreo` is
  form-neutral (its tests include a square formation, not only contra);
  lark and robin are role names from the contra role set, not core
  concepts.

## Naming

- No classes: factory functions returning plain objects, or plain
  functions/constants for data and pure logic.
- The primary export is the first declaration after imports; filenames
  match the primary export (`Clock.ts` exports `Clock`).
- Tests are co-located (`<Name>.test.ts` beside `<Name>.ts`) and run with
  `vitest`. Stories are co-located in app/component packages; the M1
  scaffold's one smoke story lives in `apps/storybook/src` because
  `ui-base` has no story convention of its own yet.
- Conventional commits: `feat(hall): …`, `fix(core): …`, `spike(hall): …`.
  Squash merges to `main`.
- ADRs: `docs/adr/YYYY-MM-DD-<slug>.md`.
- Every package has a `README.md` stating its purpose and its allowed
  imports (the edges from the table above that apply to it).

## Invariants (rendering contract)

From `plan.md` AC2 and AC3 — any change to these numbers is a reversal
(director rubric E-look), even by a pixel:

- Arms are two fixed **7.5 px** bones in three dimensions.
- Joined hands are **one shared floor point** that both dancers compute
  from the same figure frame.
- The **robin's hand stacks on top**, the lark's underneath; the robin's
  arms draw over the lark's.
- Foot swing **±2.6 px**, torso sway **1.5°**, both on the beat, with
  **no vertical bounce**.
- Shoulders **11 px**, arm reach **15 px**, hold spacing **14 px**, the two
  lines **18 px** further apart than a single pair's spacing, **4 cm per
  px**.
- **Role colours are lark = gold `#e0a32e`, robin = red `#c8362f`.** Nothing
  that distinguishes the roles may be blue-ish for larks or pink-ish for
  robins — in any renderer, view, trace, chart, card or document. One
  exported constant carries the two (`ROLE_COLOURS` in
  `packages/hall/src/appearance/roleColours.ts`) and every renderer reads
  it: the dancers' clothes, their floor trails, the trace pens, the
  legends. A user ruling of 2026-09-14; see [docs/role-colours.md](./docs/role-colours.md).
  The blue-and-pink it replaced read as a claim about gender, which is
  exactly what contra's role names exist to avoid. Written as a test —
  blue is hue 190°–270°, pink 290°–350°, in
  `packages/hall/src/appearance/roleColours.test.ts` — so it cannot
  regress.
- **Dress is never role.** A skirt is decided by a dancer's seed alone, and
  is drawn only where the renderer's `skirts` option says so: the Stage,
  and nowhere else. A move example — the Moves tiles, the pair page, the
  strips, the trace views — shows the clothes colours and the move.
- All of the above are unit tests in `@caller/core` (and, for the role
  colours, in `@caller/hall`), not just numbers in this file. Gate G1
  confirms the pair against the two-dancers spike; gate G2 confirms the
  hall against the hall spike.

## Validation

```bash
pnpm validate                  # what CI runs: format:check, check:deps, lint, typecheck, test, build, test:golden
pnpm --filter @caller/<pkg> test
pnpm --filter @caller/web build && ls apps/web/dist/spikes/hall/index.html
pnpm fix                       # prettier + eslint --fix
```

CI (`ci.yml`, job `CI`) runs `pnpm validate` on every pull request and on
`main`. `main-push.yml` runs on push to `main`: it tags the commit
`vYYYY.MM.DD-N` and deploys `apps/web`'s build (with the two spikes copied
into `dist/spikes/`) to GitHub Pages. Do not suppress warnings, skip tests,
or loosen `tsconfig` to get green; report the problem instead.

`pnpm validate`'s `lint` task is per package (turbo runs each workspace
package's own scoped `eslint .`); root-level tooling under `scripts/` sits
outside every workspace package (`pnpm-workspace.yaml` lists only
`packages/*` and `apps/*`) and is therefore not reached by it, or by
`check:deps`'s package-table scan. `pnpm fix` (a repo-root `eslint --fix .`,
which does cover `scripts/`) is the way to catch a lint problem there — run
it before committing a change under `scripts/`. M10 (cleanup) considered
adding a dedicated root-level lint task to `validate` and chose not to: the
exact task list in the command above is quoted verbatim by every milestone's
own "Final check" instruction across this whole plan run, and widening it is
a bigger, more cross-cutting change than a cleanup milestone should make
unilaterally. `pnpm exec eslint scripts/` reaches the same files directly in
the meantime.

Every package's `vitest.config.ts` excludes `**/dist/**` (`tsc`'s build emits
compiled `*.test.js` there, which vitest's default include glob would
otherwise pick up too, double-running — and possibly running a stale copy
of — every test after a local build). M10 made this uniform across every
package that has one; a package with no test script (`apps/storybook`) needs
none.
