# @caller/web

The public app: Vite + React, served at `/contra/` on GitHub Pages. The front
page is the hall — a pixel contra dance that dances itself.

## Routes

A four-line hash router (`src/routes/hashRoute.ts`).

- `#/` and `#/dance/<slug>?tune=<slug>` — **the hall (M9).** Two lines of five
  couples and four dance every encoded dance twice through to a medley, with
  the band on stage, a caller calling each figure in a pixel speech bubble,
  and the dance card and the tune's notation following along. The programme
  runs itself: after the second time through the caller announces the next
  dance, everybody lines up over eight beats, and the next dance starts. The
  URL follows the dance without reloading. Query parameters, used by the
  tests: `beat=<n>` freezes one frame and sets `data-hall-ready`,
  `zoom=<1|2|3|4|6>` pins the zoom (otherwise it fits the space, up to 2×),
  `couples=<n>` builds a hall of two lines of `n` couples for the perf test.
- `#/pair` — **the pair page (M5, gate G1).** The two-dancers spike's 64-beat
  sequence at 112 bpm, played from `@caller/contra`'s figure definitions and
  drawn by `@caller/hall`, with a zoom selector, a scrubber over the 64 beats,
  pause, and a per-figure strip that lays out one rendered frame per beat of
  the current figure. Query parameters: `beat=<n>` freezes one frame and sets
  `data-pair-ready`, `zoom=<1|2|3|4|6>`, `strip=<id|index>` opens the strip on
  that figure, `bare=1` shows the strip on its own.
- `#/frame?fixture=<name>&zoom=6` — the hidden single-frame route the hall
  fixture goldens and the pair perf test drive (M3).

## How the front page is put together

- `src/program.ts` — the evening. Every dance of `@caller/contra`'s
  `DEMO_DANCES`, each `timesThrough` 2, handed to `@caller/choreo`'s script
  decider, which announces, lines up and loops on its own. `positionAt` reads
  a beat back as "which dance, which time through, or lining up", and
  `musicBeatOf` / `programBeatOf` convert between the evening's beat and the
  **music beat**, which counts dancing beats only.
- `src/hallFrame.ts` — the timeline turned into a `Frame`: one `Person` per
  dancer, seeded off the dancer's id so the same hall comes back every time,
  and each dancer's velocity differenced from the previous frame so the
  renderer's quiet motion has something to work with.
- `src/routes/hall.tsx` — the page. One clock at a time: a silent one on
  `performance.now` until somebody presses play, and `@caller/music`'s
  player clock — a linear function of `AudioContext.currentTime` — while a
  tune is playing (plan AC4). Nothing else reads a timer.

  **The line-up is silent.** A dance is two times through of 64 beats and the
  medley switches tune every 64; the line-up between two dances is 8. If the
  tune kept looping through the line-up, every dance switch would put the
  music eight beats out of phase with the dance, and after eight switches the
  drift would be a whole time through — which is what M9 measured. So the
  player stops at the end of the last time through, the silent clock carries
  the eight line-up beats, and the next tune starts at **its own beat 0**
  exactly as the next dance does. The page's beat is the tune's beat read back
  through `programBeatOf` while the tune is the clock, so the notation, the
  card and the dancers all still read one clock.

- `src/hall.css` — the rules for `@caller/music`'s card and notation, which
  shipped with class names and no stylesheet because nothing had put them on
  a page yet.

## Tests

`e2e/hall.spec.ts` (the front page: it draws, the caller's calls, the dance
selector, the audio clock, the silent line-up, and the two front-page
goldens),
`e2e/frame.spec.ts` (the M3/M4 fixture goldens), `e2e/perf.spec.ts` (AC7,
both halves), `e2e/pair.spec.ts` (three pair goldens, the page's controls,
and the per-figure strips). Unit tests: `src/musicClock.test.ts` (the tune
starts on its own beat 0 at every dance start, over three switches),
`src/hallFloor.test.ts` (every dancer of every dance stays on the dance
floor — the only place in the repo that sees both the hall and the
formations), `src/handHang.test.ts`. The strips are written to `e2e/strips/` on every
run and committed: they are the gate G1 artifact. Goldens live in
`e2e/golden/` and are rewritten only by
`pnpm --filter @caller/web test:golden:update`.

Playwright serves the **built** app (`vite preview`), so run
`pnpm --filter @caller/web build` before `test:golden` after changing
anything under `src/`.

## Allowed imports

`@caller/web` may import `@caller/core`, `@caller/choreo`, `@caller/contra`,
`@caller/hall`, `@caller/music`, `@caller/ui-design`, `@caller/ui-base`.
Never `spikes/`.
