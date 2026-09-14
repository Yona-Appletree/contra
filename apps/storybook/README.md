# @caller/storybook

Storybook for the whole component tree: `ui-base` primitives today, app-level
components as later milestones add them. One smoke story renders the
`ui-base` `Button`.

## Allowed imports

`@caller/storybook` may import everything in this workspace (`@caller/core`,
`@caller/choreo`, `@caller/contra`, `@caller/hall`, `@caller/music`,
`@caller/ui-design`, `@caller/ui-base`, `@caller/web`). Never `spikes/`.
