# @caller/web

The public app: Vite + React, served at `/contra/` on GitHub Pages. Today it
is a placeholder ("Contra hall — coming soon") linking to the two spikes,
which the build copies into `dist/spikes/`.

## Allowed imports

`@caller/web` may import `@caller/core`, `@caller/choreo`, `@caller/contra`,
`@caller/hall`, `@caller/music`, `@caller/ui-design`, `@caller/ui-base`.
Never `spikes/`.
