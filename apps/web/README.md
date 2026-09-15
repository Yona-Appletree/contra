# @caller/web

The public app: Vite + React, served at `/contra/` on GitHub Pages. A tab bar
carries three tabs — Stage, Moves, Dances — over the hall, the pixel contra
dance that dances itself.

## Routes

A four-line hash router (`src/routes/hashRoute.ts`) and a small tab shell in
`src/App.tsx` that reads the route and either wraps it in the tab bar or
renders it bare. Three tabs, plus two routes hidden from the tab bar and
reached only by URL.

- **Stage** (`#/` and `#/dance/<slug>?tune=<slug>`, M9, P1, the default tab).
  Two lines of eight couples and seven dance every encoded dance twice
  through to a medley, with the band on stage, a caller calling each figure
  in a pixel speech bubble, and the dance card and the tune's notation
  following along. The programme runs itself: after the second time through
  the caller announces the next dance, everybody lines up and takes hands four
  in a ring, the band plays four potatoes, and the next dance starts. The URL follows the dance without reloading
  (`src/state/hallUrl.ts`). Query parameters, used by the tests:
  - `beat=<n>` freezes one frame and sets `data-hall-ready`.
  - `zoom=<1|2|3|4|6>` pins the zoom (otherwise it fits the space, up to 2×).
  - `couples=<n>` builds a hall whose lines are all `n` couples, for the perf
    test.
  - `lines=<1..4>` asks for that many sets (P1) — three lines is a real hall
    the renderer and the decider both take, but the world's width is
    `SIDE_W * 2 + SET_PITCH * lines`, so it grows from 268 px to 372 and a
    phone no longer has it to spare. There is no control for `lines` in the
    bar: the bar is already wider than a phone.
  - `seed=<n>` pins the seed for the evening's medley shuffle (T1); without
    it the seed is derived from the UTC date, so the shuffle differs day to
    day and a seeded URL still reproduces one evening exactly.
  - `tune=<slug>` pins every dance to one medley instead of the seeded
    shuffle (the tune select's own "shuffle" choice is the default).
- **Moves** (`#/moves`, F3b/U2). Every figure the registry holds and every
  figure-to-figure seam the ten demo dances actually dance, one to a row: a
  looping canvas in a shared left column, then the id, the call, the move's
  own walkthrough — the short one, the full teach behind a "teach"
  disclosure, and the caller's two registers as `SHORT · LONG`, all four
  read from `data/figures/<id>.json` and resolved against **this** tile's
  parameters (W1; `docs/move-texts.md`) — and the motion oracle's measured numbers
  (`src/galleryTiles.ts`'s `tileMetrics`), with any number over
  `@caller/contra`'s bound picked out in colour. Every seam is filed under
  the figure it comes out of. Deep links: `#/moves/<figure-id>` opens one
  figure alone at 4×; `#/moves/seam/<a>--<b>` opens one seam alone (`a` and
  `b` are figure ids). Query parameters: `beat=<n>` freezes, `zoom=<1|2|3|4|6>`,
  `speed=<0.25|0.5|1>`, `trails=1`, `strip=1&step=<beats>` shows the
  one-frame-per-`step`-beats strip in place of the row it opens from, and
  `bare=1` drops the tab bar, the controls and every row but the first,
  leaving just its canvas (or, with `strip=1`, its strip) — the route the
  gallery screenshots use.
- **Dances** (`#/dances`, D1). One card per encoded dance — the same
  `@caller/music` `Card` the Stage tab puts beside the hall, read at beat
  0 — scrollable on a phone. Tapping a card goes to `#/dance/<slug>`, which
  is the Stage tab already playing it.
- `#/pair` — **the pair page (M5, gate G1).** Hidden from the tab bar since
  M9 moved it off the front page; still linkable. The two-dancers spike's
  64-beat sequence at 112 bpm, played from `@caller/contra`'s figure
  definitions and drawn by `@caller/hall`, with a zoom selector, a scrubber
  over the 64 beats, pause, and a per-figure strip that lays out one
  rendered frame per beat of the current figure. Query parameters:
  `beat=<n>` freezes one frame and sets `data-pair-ready`,
  `zoom=<1|2|3|4|6>`, `strip=<id|index>` opens the strip on that figure (a
  figure id or an index into the sequence), `bare=1` shows the strip on its
  own.
- `#/frame?fixture=<name>&zoom=6` — the hidden single-frame route the hall
  fixture goldens and the pair perf test drive (M3). `aa=0` turns off
  antialiasing, for a pixel-exact golden.

## How the Stage tab is put together

- `src/program.ts` — the evening. Every dance of `@caller/contra`'s
  `DEMO_DANCES`, each `timesThrough` 2, handed to `@caller/choreo`'s script
  decider, which announces, lines up and loops on its own. `positionAt` reads
  a beat back as "which dance, which time through, or lining up", and
  `musicBeatOf` / `programBeatOf` convert between the evening's beat and the
  **music beat**, which counts dancing beats only. It also holds the seeded
  medley shuffle (T1, `shuffleMedleyAssignment`) and the between-dances gap's
  own beat counts (B1/B3: `APPLAUSE_BEATS`, `ANNOUNCE_BEATS`, `WALK_BEATS`,
  `RING_BEATS`, `POTATO_BEATS`). `src/state/hallUrl.ts` reads `?seed=` and `?lines=` off the
  URL for `createDemoProgram` and `layoutHall` to build the evening from.
- `src/hallFrame.ts` — the timeline turned into a `Frame`: one `Person` per
  dancer, seeded off the dancer's id so the same hall comes back every time,
  and each dancer's velocity differenced from the previous frame so the
  renderer's quiet motion has something to work with. `src/routes/moves.tsx`
  reuses it for every gallery tile, so a figure that looks wrong in the
  gallery looks wrong on the Stage tab too.
- `src/routes/hall.tsx` — the page. One clock at a time: a silent one on
  `performance.now` until somebody presses play, and `@caller/music`'s
  player clock — a linear function of `AudioContext.currentTime` — while a
  tune is playing (plan AC4). Nothing else reads a timer.

  **The dance stops between dances, and the gap carries no tune.** A dance is
  two times through of 64 beats and the medley switches tune every 64; the gap
  between two dances is 44 — 8 beats of the hall thanking its partner and
  neighbour (no clapping — the user: "no one claps in contra"), 16 of the
  caller announcing the next dance, 8 walking to places, 8 taking hands four in
  a ring, and 4 of potatoes. If the tune kept looping through it, every dance
  switch would put
  the music 44 beats out of phase with the dance and two switches would be more
  than a whole time through — which is the drift M9 measured, only worse. So
  the player stops at the end of the last time through, the silent clock
  carries the whole interval, and the next tune starts at **its own beat 0**
  exactly as the next dance does. The page's beat is the tune's beat read back
  through `programBeatOf` while the tune is the clock, so the notation, the
  card and the dancers all still read one clock.

  **The potatoes are the one sound in the gap.** Four beats before the dance
  the page calls `player.play(musicBeat, { potatoBeats: 4 })`, which schedules
  four struck chords in the next tune's key in front of the tune's own first
  cycle — and keeps the _silent_ clock running through them, because those four
  beats belong to the interval. `handOver` swaps in the player's clock at beat 0. The band's drawn motion follows the same rule (`bandPlaying`): still for
  the whole interval, moving again from the first potato.

  The interval's lengths are not written down here: `program.ts` reads them off
  `SCRIPT_DECIDER_DEFAULTS` (`betweenDancesBeats`), because the page's
  arithmetic and the decider's have to agree exactly or the tune drifts.

  **Nothing sounds between two dances but the potatoes.** The gap is silent
  from the beat the tune stops to the first potato — no clap, no cheer, nothing
  (B4: "no one claps in contra") — and the dancers dance `@caller/choreo`'s
  `thanks`: half the stretch turned to the partner, half to the neighbour
  across, each with a small nod, arms at their sides.

- `public/soundfont/` — the FluidR3 per-note mp3s abcjs' synth loads, 32 of
  them, exactly the notes the bundled tunes need, so nothing streams from
  paulrosen.github.io at run time. Built by `pnpm --filter @caller/web
soundfont` (`scripts/build-soundfont.mjs`), which writes `manifest.json`
  with a digest of the tunes; `src/soundfont.test.mjs` recomputes it, so a
  tune edited without a rebuild fails CI naming the command. The hall passes
  `` `${import.meta.env.BASE_URL}soundfont/` `` to `createPlayer`. Licence
  and source in `public/soundfont-README.md`.
- `src/hall.css` — the rules for `@caller/music`'s card and notation, which
  shipped with class names and no stylesheet because nothing had put them on
  a page yet.

## Tests

`e2e/smoke.spec.ts` (M1: the built app has the expected title),
`e2e/hall.spec.ts` (the Stage tab: it draws, the caller's calls, the dance
selector, the audio clock, the silent between-dances interval, what the
caller announces over it, and two Stage-tab goldens), `e2e/frame.spec.ts`
(the M3/M4 fixture goldens), `e2e/perf.spec.ts` (AC7, both halves),
`e2e/pair.spec.ts` (three pair goldens, the page's controls, and the
per-figure strips — gate G1's artifact), `e2e/gallery.spec.ts` (F3b: the tab
bar reaches all three tabs, every tile's own info, and the move gallery
strips). `e2e/golden.ts` is the pixel-comparison helper `hall.spec.ts` and
`pair.spec.ts` share against the plan's tolerance (`frame.spec.ts` keeps its
own copy deliberately).

Unit tests: `src/musicClock.test.ts` (the tune starts on its own beat 0 at
every dance start, over three switches), `src/hallFloor.test.ts` (every
dancer of every dance stays on the dance floor — the only place in the repo
that sees both the hall and the formations), `src/betweenDances.test.ts` (B1,
B4: the thanks/announce/walk/ready gap between two dances), `src/program.test.ts`
(T1: the seeded medley shuffle never repeats a medley on two circularly
adjacent dances, and dances every medley once before any repeats),
`src/programme.test.ts` (the whole evening danced: every dancer has a figure
at every beat, including a waiting couple's `wait-out` — the regression a
plain coverage check missed), `src/galleryTiles.test.ts` (the gallery's

figure and seam tiles cover every figure the registry holds and every seam
the demo dances actually dance).

The move gallery's strips (`e2e/strips/`) and the pair page's strips
(`e2e/strips/01-walk-in.png` … `09-fall-back.png`) are written on every
`test:golden` run and committed; neither is compared against anything — see
`e2e/strips/README.md`. Screenshots of whole pages, taken by hand for review
gates and also committed, are in `e2e/screenshots/` (see its own README).
Goldens live in `e2e/golden/` and are rewritten only by
`pnpm --filter @caller/web test:golden:update`.

Playwright serves the **built** app (`vite preview`), so run
`pnpm --filter @caller/web build` before `test:golden` after changing
anything under `src/`.

## Allowed imports

`@caller/web` may import `@caller/core`, `@caller/choreo`, `@caller/contra`,
`@caller/hall`, `@caller/music`, `@caller/ui-design`, `@caller/ui-base`.
Never `spikes/`.
