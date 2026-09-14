# The rendering contract: true overhead, Canvas 2D, supersampled at integer zoom

Date: 2026-09-13
Status: accepted

## Context

The simulator's whole point is that an expert dancer recognises every figure
(plan.md, the goal). Two spikes went looking for a look that carries that:
`spikes/hall` (gate 2) and `spikes/two-dancers` (gate 3). Both gates ruled, and
M3 has to turn those rulings into `@caller/hall` without importing a line of
spike code.

The constraints that shaped the answer:

- **A hall, not a pair.** The demo is two lines of nine couples at 1× and a pair
  page at 6×, under 16 ms and 8 ms per frame respectively (AC7).
- **Geometry is the truth.** The inviolable invariant — a hand is never drawn
  where the arm cannot reach — means the renderer draws what the solver returns
  and nothing else. Anything that fudges positions to look better is out.
- **The look is pixel art with real motion.** Gate 2 ruled integer display zoom
  and 1/256 px positions; gate 3 ruled smooth motion with only a little beat.
  Those two pull against each other: a pixel grid wants snapping, smooth motion
  wants sub-pixel.

## Decision

### A true overhead view, procedural bodies

The camera looks straight down. No front view, no three-quarter, no sprite
sheets: each body is drawn procedurally from ellipses and round-capped
segments — shadow, feet, skirt, torso, arms, head with a face sliver and a nose
— and rotated by the dancer's facing. The head turns separately toward `look`,
limited to ±55° off the facing and fading to the facing by 115°.

Why: a true overhead view is the only projection in which a floor position is
the drawing position, so what the choreography computes is exactly what is
drawn. It is also the only one in which a hall of 36 dancers never occludes
itself. Procedural bodies mean an appearance is a seed, not an asset: a hall of
36 distinct dancers costs nothing to author, and a figure can flare a skirt or
lean a torso by changing a number.

Rejected: a front or three-quarter view (gate 2 rejected it outright — dancers
occlude each other and the floor position stops being the drawing position),
and pre-rendered sprite sheets (eight facings is not enough for a rotating
swing, and every appearance would need its own sheet).

### Canvas 2D, not PixiJS or WebGL

The renderer is `CanvasRenderingContext2D` and `OffscreenCanvas`, with no
rendering dependency at all.

Why: the scene is tens of filled ellipses and segments per frame at
128 × 88 world px. The measured frame cost is far inside the budget (see the
pull request for the number and the runner), so a GPU pipeline would buy
nothing and cost a dependency, a build step, a shader-compilation stall on
first frame, and a second way for the pixel grid to go wrong. Canvas 2D also
gives us `getImageData` for the hard-edged mode and an `OffscreenCanvas` per
layer for free.

Rejected: PixiJS (plan D-settled, restated here), and raw WebGL.

### Supersample the dancers, blit the world at an integer zoom

Three world-sized offscreen layers — `floor`, `trails`, `people` — are blitted
to the display canvas at an integer `zoom` with `imageSmoothingEnabled = false`.
The `people` layer is redrawn every frame from a 4× supersampled canvas,
downsampled with smoothing on.

Why: this is what resolves the tension above. The world grid stays hard, so the
picture is pixel art at any zoom and the boards, walls and bubble (M4) land on
whole pixels. The dancers get 16 samples per world pixel, so a body that moves
1/256 px changes the picture slightly rather than not at all, and a rotating
dancer's edge does not crawl. Positions are quantised to 1/256 px
(`q256`, `RENDERING_CONTRACT.positionQuantumPx`) — fine enough that motion reads
as continuous, coarse enough that a frame is reproducible to the bit, which is
what makes golden frames possible.

An `aa: false` mode keeps the alternative gate 2 looked at: every point snapped
to a whole px and the downsampled alpha thresholded at 50%.

### The contract numbers live in `@caller/core`

`RENDERING_CONTRACT` and the named constants — 7.5 px bones, 15 px reach, 11 px
shoulders, 14 px hold spacing, 18 px line offset, 4 cm per px, ±2.6 px foot
swing, 1.5° torso sway, 0 px vertical bounce, 1/256 px quantum, 0.4 beat seam —
are exported by `@caller/core` and asserted there. `@caller/hall` never writes
one as a literal.

Why: the renderer draws what the solver returns, so the two have to agree by
construction rather than by discipline. It also makes AC3's "any change to these
numbers is a reversal" enforceable: there is one place to change and a test
sitting on it.

### Goldens at a 0.5% tolerance

Three fixtures (`facings`, `two-hand-hold`, `swing`) are rendered by a hidden
`#/frame` route and compared with committed PNGs using `pixelmatch` at a 0.5%
pixel tolerance, with anti-aliased pixels excluded (pixelmatch's default) and a
0.1 per-pixel colour threshold. `test:golden:update` rewrites them, and the pull
request that does says so.

Why: the look is the deliverable and nothing else can catch a one-pixel
regression in it. The tolerance is not zero because the renderer runs in a real
browser on two operating systems; it is small enough that any body part moving
by a pixel fails. Excluding anti-aliased pixels means the test fails on shape
changes rather than on rasteriser noise.

## Consequences

- M4's walls, boards, stage and bubble paint into `layers.floor`, which the
  renderer allocates and never touches. Trails have their own layer so a floor
  repaint cannot wipe a dance's trails.
- M5's figures produce `PoseSample`s and a velocity; they never draw.
- Every fixture added from here on is one more golden. A deliberate look change
  means regenerating them and saying so — which is the point.
- A hall at 1× with 36 dancers has not been measured yet; AC7's second half is
  M9's to prove.
