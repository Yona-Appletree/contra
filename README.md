# contra

A contra dance simulator and caller workbench: a pixel hall of dancers
dancing real contras to real tunes, with a caller calling the figures.

Read [AGENTS.md](./AGENTS.md) first if you are an agent working in this
repository — it has the dependency rule, naming conventions, and validation
commands. Then [docs/adr/](./docs/adr/) for the decisions behind the
toolchain.

## Layout

```text
packages/core       form-neutral time and kinematics
packages/choreo      form-neutral choreography model and decider
packages/contra      contra: role set, figures, dances
packages/hall        the pixel-hall renderer
packages/music       audio clock, tunes, medleys
packages/ui-design    design tokens and theme
packages/ui-base      shadcn/ui primitives
apps/web              the public app (served at /contra/ on GitHub Pages)
apps/storybook        Storybook over the whole component tree
spikes/                visual spikes, served at /spikes/, never imported by production code
```

Five layers do the actual work, each a package boundary a dependency arrow
only ever points down through: `@caller/core` is a form-neutral clock,
geometry and arm solver that knows nothing about dancing; `@caller/choreo`
builds a form-neutral choreography model on top of it — formations, groups,
figures, dances and the script decider that turns a program into a timeline
of poses; `@caller/contra` is one form on that model — the lark/robin role
set, the contra figure library (coded and, increasingly, written as data) and
the ten demo dances; `@caller/hall` is the pixel renderer that turns a
timeline into a Canvas 2D hall of procedural dancers, a band, a caller and a
speech bubble, all overhead-view pixel art at an integer zoom; and
`@caller/music` is the audio clock — `AudioContext.currentTime` made linear,
thirteen public-domain tunes across six medleys, a seeded shuffle, and the
applause between dances. `apps/web` is the app that wires all five together
behind three tabs (Stage, Moves, Dances) at `/contra/`.

## Getting started

```bash
pnpm install
pnpm dev            # apps/web at http://localhost:5173
pnpm validate        # what CI runs
```

The live site: <https://yona-appletree.github.io/contra/>.

## License

[AGPL-3.0-or-later](./LICENSE).
