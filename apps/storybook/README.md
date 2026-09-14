# @caller/storybook

Storybook for the whole component tree. `.storybook/main.ts`'s `stories` glob
covers both `apps/storybook/src/**/*.stories.tsx` and every
`packages/*/src/**/*.stories.tsx`, so a component's story stays co-located
with it rather than living here — see `AGENTS.md`'s naming conventions.
`apps/storybook/src` itself holds one smoke story, `Button.stories.tsx` for
`ui-base`'s `Button`, kept here because `ui-base` has no story convention of
its own yet. `@caller/hall` (`Hall`, `HallWorld`, `Font`) and `@caller/music`
(`Card`, `Notation`) each keep their own stories alongside their components.

## Allowed imports

`@caller/storybook` may import everything in this workspace (`@caller/core`,
`@caller/choreo`, `@caller/contra`, `@caller/hall`, `@caller/music`,
`@caller/ui-design`, `@caller/ui-base`, `@caller/web`). Never `spikes/`.
