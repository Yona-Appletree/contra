# @caller/kinetics

Engine 3: a compiler from a dance program to proved motion. A program is
text; it compiles, through a figure language of timed constraints and a
per-dancer per-beat assembly, into continuous trajectories for every body
point, each under a physical cap with no discontinuities, proved once on the
executor rather than per figure. This package is the first bite — the
vertical stack on a two-figure program — and the debugger that shows every
layer of it. See the vision and plan under the planning root
(`Planning/contra/2026-09-16-2348-kinetics-model/`).

## Allowed imports

`@caller/core` only, and of it only the geometry (`Vec2`, angles, `q256`,
`smooth`), the time layer (`Beat`, `DEFAULT_BPM`) and `RENDERING_CONTRACT`.
Never `core/src/kinematics/*` — the arm solver, the drawn arms, the planted
gait and the rest are what this engine replaces, and
`src/allowedImports.test.ts` fails on any of their names.

## Nothing imports this package

`scripts/check-deps.mjs` lists `kinetics` with `core` as its only edge and
lists it in no other package's allowed set, so an import from `apps/web` or
`packages/contra` fails `pnpm check:deps`. The engine reaches the app in a
later bite.

## The debugger

```bash
pnpm --filter @caller/kinetics dev     # http://localhost:5177
pnpm --filter @caller/kinetics build   # dist/debugger/
```

A vite root under `debugger/`, the only consumer of `src/`.
