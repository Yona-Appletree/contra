# @caller/web

The public app: Vite + React, served at `/contra/` on GitHub Pages. A tab bar
carries three tabs — Stage, Moves, Dances — over the hall, the pixel contra
dance that dances itself.

## Routes

A four-line hash router (`src/routes/hashRoute.ts`) and a small tab shell in
`src/App.tsx` that reads the route and either wraps it in the tab bar or
renders it bare. Three tabs, plus the routes below them that have no tab of
their own and are reached by URL or by a link on the page above them.

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
  - `engine=<new|old>` (M3) picks which engine the hall dances on. **`new` is
    the default**: the contra `CyclePlanner` resolving every call against live
    set state, with the five migrated gatherers read as `FigureDefinition`s.
    `old` is `@caller/choreo`'s `defaultCyclePlanner` over the coded figures —
    the path every golden before M3 was taken against — and stays reachable
    until M11 deletes the old figure layer. The two are the _same dancing_
    everywhere in the demo programme except Jubilation's `hey → swing`. Not a
    control in the bar: it is a reviewer's switch, and the page says which
    engine it is on under the status line with a link to the other.
- **Moves** (`#/moves`, F3b/U2, rebuilt in M12). **A browser of the figure
  definitions the library holds**: one row per `FigureDefinition`, filed in
  families read off the definitions' own shape kinds (balances, turns for two,
  rings and stars, crossings, courtesy turns, lines, waves, couples as one,
  heys, walks, figures made of parts) with a wrapping band of chips to jump
  between them. There is no hand-written list of figure ids anywhere in the app
  any more: the page asks `DATA_DEFINITIONS` what it holds, then adds whatever
  the **registry** has that the library does not (`wait-out` and
  `walk-to-station`, which the decider needs and no dance calls — they are
  filed as "the engine's own" and say they have no definition).

  A row is a looping canvas in a shared left column, then:

  - **what the figure is**, off the definition: its nominal count, how a call
    becomes instances (`actors`), where the shape is anchored, whether it
    gathers people home / carries them / makes a shape (`ends`), its timing
    profile, and its figure-roles — with a role word that names a contra role
    lightly coloured in the role colour (D5; `ROLE_COLOURS`, `docs/role-colours.md`);
  - the figure's own texts — what it is in the third person, the mechanics line,
    the full teach behind a "teach" disclosure with the generated ending hint
    under it, and the caller's three forms longest first as `4 · 2 · 1`, all read
    from `data/figures/<id>.json` and resolved against **this** tile's
    parameters and the dancer its call names (M13; `docs/move-texts.md`);
  - the motion oracle's measured numbers (`src/galleryTiles.ts`'s
    `tileMetrics`), with any number over `@caller/contra`'s bound picked out in
    colour;
  - **parameters (n)** — the canonical parameter spec and the value each takes
    when a call is silent, with the ones some dance in the record actually
    writes marked;
  - **parameter rows (n)** — the same figure at another tuning, **generated**
    from the record, from the move's texts' own `"<param>=<value>"` variant
    keys, and from the parameter spec read through the caller's vocabulary
    (`src/moveParams.ts`: a handed or directional word's one opposite,
    `amount`'s half, a hey `for` one fewer than its cast). Each has a deep link
    `#/moves/<id>~<param>=<value>` (several joined by `+`) and its own strip. A
    tuning that expands and that a tile of one two-couple set cannot draw — a
    hey for three has nobody to stand out — says so on its row rather than
    throwing;
  - **danced in (n)** — the dance ↔ figure index: every call of this figure in
    every dance file, `while` branches and lab dances included, the programme
    first;
  - **transitions (n)** — the figure-to-figure seams that leave it, one row
    each, in the same shape (U4).

  All four lists are disclosures, closed (phone first, U1). Deep links:
  `#/moves/<figure-id>` opens one definition alone at 4×;
  `#/moves/<figure-id>~<param>=<value>` opens one parameter row;
  `#/moves/seam/<a>--<b>` opens one seam alone (`a` and `b` are figure ids);
  `#/moves/<figure-id>?dance=<slug>&figure=<index>` opens that figure **as one
  dance dances it** — that dance's formation, that call's own parameters and
  dancers — which is what the walkthrough card's "show" link asks for (D23), with
  `&branch=<n>` for one branch of a concurrent call and the teach open. A slug or
  an index that names nothing falls back to the ordinary tile.
  Query parameters: `beat=<n>` freezes, `zoom=<1|2|3|4|6>`,
  `speed=<0.25|0.5|1>`, `trails=1`, `strip=1&step=<beats>` shows the
  one-frame-per-`step`-beats strip in place of the row it opens from, and
  `bare=1` drops the tab bar, the controls and every row but the first,
  leaving just its canvas (or, with `strip=1`, its strip) — the route the
  gallery screenshots and `pnpm figure <id>` both use.

  Since M3 a tile is **one two-couple set run through a cycle planner** — a
  real `HallState`, a real synthetic `Dance` of the tile's calls, and the same
  planner the Stage hands the decider — rather than a private loop of this
  page's own. `engine=<new|old>` builds every tile on that engine; the default
  is `new`, as on the Stage.

- **The seam lab** (`#/lab`, `#/lab/seam/<a>--<b>`, M3, gate G1). One seam of
  the corpus danced through both engines at once, from one clock, slowed
  (`speed=<0.25|0.5|1>`, default ½×), looping the four beats before the
  boundary and the eight after it (`reach=<seam|figure>`), with a strip per
  treatment underneath in the same columns (`step=<1|0.5>`). Each page
  measures how far apart the two treatments actually get before it asks which
  is right, and says under the strips which look decisions are still open.
  `#/lab` lists the shortlist; any seam key the Moves page files a tile under
  opens. Other query parameters: `beat=<n>` freezes on that count from the
  boundary, `zoom=<2|3|4|6>`, `trails=1`. Filed under the
  Moves tab, on a route of its own.
- **Dances** (`#/dances`, D1). One card per encoded dance — the same
  `@caller/music` `Card` the Stage tab puts beside the hall, read at beat
  0 — scrollable on a phone. Tapping a card goes to `#/dance/<slug>`, which
  is the Stage tab already playing it. A **lab dance** (`DanceFile.status:
"lab"`) has no card here — that is what the status means — but has its own
  dance page and dances on the Stage from `#/dance/<slug>`.
- `#/dances/<slug>` — one dance's own reference sheet (U3): the head, **two
  cards** (M13), the shapes, and (M3) **how it resolves** — every figure
  instance the planner makes of the dance, one time through, with its cast,
  anchor, ends, carried hands and anybody it left standing, the same table
  `pnpm dance <slug>` prints, from the same function.

  The **calling card** (`dance-page-calling-card`) is what a caller says for
  this dance at every register: one row per written call, one column per time
  through — the whole sentence the first time, the middle form for the next
  two, a word after that. Only the first column is coloured, by part (who /
  what / which way / how far, D26; `cards/callColours.ts`), and the short forms
  are plain ink (D32).

  The **walkthrough card** (`dance-page-walkthrough`) is the dance as a caller
  would teach it: the formation's own opening, one `walkthrough-entry` per call
  with its beats in their own column, its name, one `walkthrough-more` and a
  `walkthrough-show` link into the figure from **this dance's own resolution**
  (`#/moves/<figure>?dance=<slug>&figure=<index>`), and the ending hint
  (`walkthrough-hint`) under "more". Both cards are computed — nothing about
  either is stored — from the same `callScript` and `danceWalkthrough` the
  Stage's own bubble and note card read.

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
per-figure strips — gate G1's artifact), `e2e/gallery.spec.ts` (F3b, M12: the tab
bar reaches all three tabs, the definitions in their families with each row's
own facts, the generated parameter rows and one of them deep-linked, every
tile's own info, and the move gallery strips). `e2e/golden.ts` is the pixel-comparison helper `hall.spec.ts` and
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
the demo dances actually dance) and `src/moveCatalogue.test.ts` (M12: the
catalogue is the library's own list, every row's facts come off the
definition rather than being restated, the dance index holds every call in
every dance file, and every generated parameter row either draws or says why
not).

The move gallery's strips (`e2e/strips/`, one per figure, per seam and — since
M12 — per parameter row) and the pair page's strips
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
