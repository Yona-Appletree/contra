# @caller/web

The public app: Vite + React, served at `/contra/` on GitHub Pages. Today the
home page links to the two spikes, which the build copies into `dist/spikes/`,
and to the pair page.

## Routes

A four-line hash router (`src/routes/hashRoute.ts`); M9 may bring a real one.

- `#/pair` — **the pair page (M5).** The two-dancers spike's 64-beat sequence
  at 112 bpm, played from `@caller/contra`'s figure definitions and drawn by
  `@caller/hall`, with a 4/6/8 zoom selector, a scrubber over the 64 beats,
  pause, and a per-figure strip that lays out one rendered frame per beat of
  the current figure. Query parameters, used by the tests: `beat=<n>` freezes
  one frame and sets `data-pair-ready`, `zoom=<4|6|8>`, `strip=<id|index>`
  opens the strip on that figure, `bare=1` shows the strip on its own.
- `#/frame?fixture=<name>&zoom=6` — the hidden single-frame route the hall
  goldens and the perf test drive (M3).

## Tests

`e2e/frame.spec.ts` (hall goldens), `e2e/perf.spec.ts` (AC7),
`e2e/pair.spec.ts` (three pair goldens, the page's controls, and the
per-figure strips). The strips are written to `e2e/strips/` on every run and
committed: they are the gate G1 artifact. Goldens live in `e2e/golden/` and
are rewritten only by `pnpm --filter @caller/web test:golden:update`.

## Allowed imports

`@caller/web` may import `@caller/core`, `@caller/choreo`, `@caller/contra`,
`@caller/hall`, `@caller/music`, `@caller/ui-design`, `@caller/ui-base`.
Never `spikes/`.
