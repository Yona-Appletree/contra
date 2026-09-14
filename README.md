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

## Getting started

```bash
pnpm install
pnpm dev            # apps/web at http://localhost:5173
pnpm validate        # what CI runs
```

The live site: <https://yona-appletree.github.io/contra/>.

## License

[AGPL-3.0-or-later](./LICENSE).
