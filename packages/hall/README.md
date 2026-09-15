# @caller/hall

The renderer: reads `PoseSample`s from `@caller/core` and draws the pixel hall —
low-res world, supersample and downsample at integer zoom, procedural bodies,
seeded people, z-order, shadows, trails. Never calls a figure.

M3 is the dancer layer; M4 is everything in the hall that is not a dancer — the
world sized by its lines, the boards and walls, the stage and the band, the
caller, the side lines — plus the bitmap font and the speech bubble drawn in it.
All of that paints into the `floor` layer this package allocates.

## Allowed imports

`@caller/hall` may import `@caller/core`. Nothing else in this workspace.

## Units and the view

World px, 4 cm per px (`CM_PER_PX`), a true overhead view with y increasing
toward the bottom of the screen. **The world origin is the centre of the world
canvas**, so a dancer at `[0, 0]` stands in the middle of the hall. Every
contract number — 7.5 px bones, 15 px reach, 11 px shoulders, 14 px hold
spacing — comes from `@caller/core`'s exported constants. Changing one is a
reversal (director rubric E-look), even by a pixel.

## The rendering contract

```ts
interface World {
  w: number;
  h: number;
  zoom: number;
} // low-res size and integer zoom

function createRenderer(canvas: HTMLCanvasElement, opts?: RendererOptions): Renderer;

interface Renderer {
  render(frame: Frame): void;
  resize(world: World): void;
  clearTrails(): void;
  readonly world: World;
  readonly layers: { floor: OffscreenCanvas; trails: OffscreenCanvas; people: OffscreenCanvas };
}
```

One frame:

1. Each dancer is resolved by `layoutDancer`: the body position is quantised to
   1/256 px, `quietMotion` gives the feet and the torso sway, `shouldersAt`
   hangs the shoulders off the **swayed** torso so the arms sway with the body,
   `solveArm3d` solves both arms, and `headLook` applies the neck limit.
2. The dancers are drawn on an offscreen canvas at 4× (`SUPERSAMPLE`) in three
   passes — every body, then every pair of arms, then every head — so arms sit
   over every torso and heads over every arm, as in the spikes.
3. That layer is downsampled onto the world-sized `people` layer with smoothing
   on. With `aa: false` instead, every drawn point is snapped to a whole px and
   the downsampled alpha is thresholded at 50%, which is the hard-edged sprite
   look.
4. `floor`, `trails` and `people` are blitted to the display canvas at the
   integer `zoom` with smoothing off, over `BACKDROP_COLOUR`.

Within one dancer the order is shadow, feet, skirt, torso, arms, head.
`drawPerson` does all of that for a lone dancer in one call; the scene renderer
interleaves the passes instead, which is identical for one dancer.

Within one **arm**, the two bones are ordered by height, because from directly
above the nearer one is on top: an arm that hangs has the hand below the elbow,
so the shirt-coloured upper arm draws over the skin-coloured forearm, and an
arm that reaches up has the hand above the elbow, so the forearm draws over.
`forearmOverSleeve` is the test (`handZ > elbowZ`, both from `solveArm3d`). The
outlines of both bones and the hand go down first, as one silhouette, so
neither bone's outline cuts across the other's fill. Gate G1: "it looks like
the forearm renders _over_ the upper arm which is usually wrong."

### The resting arm

**This package does not own the resting arm.** `@caller/core`'s `drawnArms.ts`
does: `hangingHand`, `elbowPole`, the four `HAND_HANG_*` numbers and the three
`ELBOW_TUCK_*` ones live there, and `drawnArms(pose, beat, p, torsoAngle)` is
the whole of the arm half of `layoutDancer` — shoulders, both hands with a
`'down'` one filled in, both elbows, `elbowZ`/`handZ`. F3a moved them down
because `@caller/contra` starts every take from the same rest and cannot import
a renderer, and because the motion oracle has to measure the elbow that is
actually drawn. `layoutDancer` keeps the quantisation, the sway, the feet, the
head and the person, and calls `drawnArms` for the rest.

What the model does, and why it looks like it does, is in `core`'s README. The
number this package answers for is the one a golden can see: a standing dancer
measures 12.05 px across arms and all, against 11 px of shoulder, and
`layoutDancer.test.ts` is where that is asserted. Gate G1: "you can't see much
arm when someone is just standing there."

### Joined hands and z-order

`sceneOrder` finds every pair of hands within `JOIN_EPSILON_PX` (0.1 px) of each
other — joined hands are one shared floor point, so they are exactly equal in
practice — and asks `core`'s `stackJoined` which of the two roles is on top.
The role set's `top` role (contra: `robin`) gets its hand drawn a little
narrower and its arms drawn _after_ the other dancer's, so the robin's hand is
always on top of the lark's and the robin's arms always draw over the lark's
(plan AC2). Bodies and heads are sorted up the screen; arms are sorted up the
screen too, subject to those constraints.

### A hand on somebody's arm (FR-C1)

A **wrist star** has no shared hand point at all: everybody's hand is half way
down the giving arm of the dancer ahead of them, so the rule above sees nothing
and, before FR-C1, the four arms were drawn in plain screen order — which
changes four times a revolution, and with it which hand was buried under whose
forearm. `sceneOrder` therefore also asks whether a hand is drawn **on** another
dancer's arm: within `REST_ON_ARM_PX` (1.6 px, half a drawn forearm and its
outline) of either bone and more than `REST_OFF_HAND_PX` (2 px) from the far end
of it, which is where two hands closing on a join would otherwise read as a
grip. Measured on the star itself, a dancer's hand is 0.78 px from the arm it
holds and 3.26 px from the next nearest, steady through the turn.

Four hands round a star are a **cycle** — the clover leaf — and no flat painter
can put every hand over the arm beneath it; one has to give. Which one is
decided by dancer **id**, not by where anybody is standing, so it is the same
overlap for the whole figure instead of a new one every time two dancers cross
on the screen. A pair that is genuinely holding hands is never asked this
question: the role rule owns them.

### Trails

`trails` is a persistent offscreen layer. Each frame appends only the step just
taken, so a whole dance's worth of trail costs nothing per frame, and nothing
clears it within a dance — `clearTrails()` is for the gap between dances.
`FrameDancer.trail` is the list of points to add this frame (omitted: the
dancer's current position); a gap longer than `TRAIL_BREAK_PX` starts a new
stroke rather than drawing a line across the hall after a seek. Colours are the
role colours, the ones darker (`roleTrailColour`) — the same two hues the trace
pens draw with, so a dancer and their own ink match.

### Appearance

`createPerson({ id, role, seed })` is a pure function of the seed: six skin
tones, seven hair styles (short, long, bob, curly, bald, cap, bun), a skirt and
a pair of trousers, and a shirt.

`roleShirts: true` — every dancer — dresses that shirt in the **role colour**
(`appearance/roleColours.ts`: larks gold, robins red, everybody else a warm
neutral) with a per-person spread of hue ±8°, saturation ×0.90–1.18 and
lightness ×0.74–1.10, so a hall of thirty is thirty shirts and every one of
them still reads gold or red from above at 1×. Without it a person is dressed
from `SHIRT_COLOURS`, the spikes' sixteen, which is what the band, the caller
and the sitters get: they are not dancing a role. `ROLE_COLOURS` is a user
ruling of 2026-09-14 and a rendering-contract invariant — see
[`docs/role-colours.md`](../../docs/role-colours.md), and
`appearance/roleColours.test.ts`, which is the ruling written as a test.

**A skirt is never role.** `wearsSkirt` comes from the seed alone, and both a
skirt colour and a trousers colour are always decided, so turning skirts on or
off changes what is drawn and nothing else. They are only drawn where the
renderer's `skirts` option says so: the Stage sets it, the Moves tiles, the
pair page, the strips and the trace views do not, and the default is false.

## The hall: world, floor, furniture

```ts
layoutHall({ lines: 2, couplesPerLine: [5, 4] }): HallWorld;
drawFloor(g, hall, theme: "grange" | "gym" | "night"): void;
drawFurniture(g, hall, beat): void;
```

`layoutHall` is the whole geometry of a room: a world `SIDE_W * 2 + SET_PITCH *
lines` wide (30 and 104) and as tall as the longest line needs, the centre of
each line of dancers, the stage, the four-piece band, the caller, the chairs
down both walls, the sitters in them and the snack table. Every coordinate it
returns is a **world** coordinate — origin at the centre — so a set centre goes
straight to a figure and a prop goes straight to the floor.

`drawFloor` and `drawFurniture` take that hall and paint in world coordinates
too: they set the origin themselves, so both can be handed a raw
`layers.floor.getContext("2d")`. The floor is cached per layout and theme, since
none of it moves; the furniture is redrawn each frame because the band is alive
— the fiddle bows, the guitar strums, the bass nods and leans, the pianist's
hands slide along the keys a quarter beat apart — on the same sine as the
dancers' quiet motion — and it is drawn on a 4× supersampled layer and
downsampled, so the band is the same kind of pixels as the dancers.

The band takes the right of the stage and the caller the left: the caller's
bubble hangs above their head, and centred on the stage it would sit on the
fiddler for the whole of every call.

## Text is pixels

```ts
FONT: Font; // glyphW 4, glyphH 6, glyph(ch): Uint8Array, has(ch)
drawText(g, font, text, x, y, colour): void;
drawBubble(g, font, text, anchor, { maxCols, tail, world }): BubbleBox;
```

Our own glyph data in `src/font/glyphs.ts`, written as pixel art: uppercase,
digits, `& ' , . ? ! -`, `½ ¾ ¼` and `°`. Lowercase draws as uppercase; a
character with no glyph draws a hollow box, and the tests assert that nothing in
the corpus's dance titles or the demo's figure calls reaches it. One glyph is a
4 × 6 cell packed into six bytes, leftmost column in the high bit; the advance
is 5 px across and 7 px down.

The bubble wraps at 22 columns, sits above its anchor with a tail back to it,
and clamps inside the world it is given. It is a rounded one-px-bordered box of
paper with a one-px shadow — **pixels, never HTML text over the canvas**, which
was rejected outright. See the rendering-contract ADR.

## Fixtures, goldens and stories

`src/testing/fixtures.ts` holds six static frames with fixed seeds and no
animation. Three are dancers on the bare backdrop: `facings` (one dancer at each
of eight facings), `two-hand-hold` (the contract's 14 px), and `swing` (the
stacking invariant). Three are the hall with nobody dancing in it:
`hall-empty-2-lines`; `hall-bubble`, with the caller calling "HANDS FOUR FROM
THE TOP"; and `hall-announcement`, the band **at rest** while the caller talks
between two dances (B3's R1). A hall fixture carries a `paint(renderer)` that
paints the floor layer before the frame is drawn, which is the only thing that
makes a hall frame a hall.

`hall-announcement` is frozen at a **quarter** beat rather than a whole one on
purpose: every beat-driven term in `drawFurniture` rides `sin(2πbeat)`, which is
zero at every whole beat, so a rest-pose golden at beat 0 would look the same
whether the band was playing or not and would prove nothing. A quarter beat in
is where a playing band is at the top of its bow.

`apps/web`'s hidden `#/frame?fixture=<name>&zoom=<n>` route draws one of them,
Playwright screenshots it, and `apps/web/e2e/frame.spec.ts` compares it with
`apps/web/e2e/golden/*.png` at a 0.5% `pixelmatch` tolerance. The dancer frames
are pinned at 6×; the hall at 1× (a phone) and 3× (a laptop, and the zoom the
bubble has to be legible at).

```bash
pnpm --filter @caller/web test:golden           # compare
pnpm --filter @caller/web test:golden:update    # rewrite the goldens
```

`src/Hall.stories.tsx` shows the dancer fixtures in Storybook with a flat floor
so the outlines read; `src/world/HallWorld.stories.tsx` shows the hall itself in
all three themes, at one to four lines, with a beat slider for the band and a
call for the bubble; `src/font/Font.stories.tsx` shows every glyph in the font.

## Traces — `src/traces/`

Four SVG drawings of where the dancers went: `penPlotSvg` (the whole window on
the set), `marchSvg` (the set sliding right as the beats pass), `seismographSvg`
(each dancer across the set, then along it, against time) and `figureStripSvg`
(one small plot per call, the cell as wide as the call is long). They are the
exploration post's four views, redrawn from the simulation.

SVG rather than canvas because these are meant to be looked at large, printed
and pasted into a post, and because a string is easy to make deterministic:
every number goes through `num` (hundredths, never minus zero), every drawing
walks its pens in the order the trace lists them, and nothing reads a clock or a
random source. The same trace gives the same bytes.

**They take plain data, not a `Timeline`.** The sampler that measures a trace
lives in `@caller/choreo`, a layer this package may not import (see _Allowed
imports_), so `src/traces/TraceView.ts` declares the shape structurally and
`@caller/choreo`'s `Trace` is assignable to it with no adapter;
`apps/web/src/traces/traceViewShape.test.ts` typechecks that the two stay the
same shape in both directions.

**`ROLE_COLOURS` is larks gold and robins red**, the ones darker than the twos
(a user ruling of 2026-09-14, replacing the blue-and-pink of the exploration
post, which read as a claim about gender that contra's role names exist to
avoid). It lives in `appearance/roleColours.ts`, not here, because it is one
exported constant for everything that colours by role: `penColour` shades it by
rank for the plates, `roleTrailColour` shades it the same way for the floor,
and `roleShirtColour` spreads it per person for the clothes.

Two things the post's plates could not do, both from community feedback on it:
each pen's whole path is nudged a couple of pixels along a **diagonal**, so the
last one drawn does not bury the other three (a contra's straight tracks are
axis-aligned, and a horizontal nudge is invisible on a horizontal track — a
diagonal is the only direction that separates both families); and a **facing
tick** is drawn out of the path on every beat, because a track with no facing on
it cannot tell a forward pass from a backward one. Only the two views with a
floor in them get ticks: on the seismograph an axis is position against time and
a direction on the floor has nowhere to point, and a strip cell is too small.

## What was ported from the spikes

Production code never imports from `spikes/`; these behaviours were read from
the spikes and retyped.

| Here                                                | Spike                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `drawBody`, `drawArms`, `drawHead`                  | `spikes/two-dancers`'s `drawBody` / `drawArms` / `drawHead`, radius for radius        |
| the supersample-and-downsample pipeline             | its `renderLayer`: `SS = 4`, `imageSmoothingQuality = 'high'`, the alpha threshold    |
| `core`'s `hangingHand`                              | its `hang(P, a, side, ph, amp)`, retuned at gate G1 (5.6 px out, 14.5 px down)        |
| `HAND_STACK_RADIUS_PX`, the joined-hand hand radius | its `drawArms`'s `hr` and `under` flag                                                |
| `headLook`                                          | its `sampleAt` head-turn block: ±55°, fading to 0 by 115°                             |
| `mulberry32`, `shade`, the palettes                 | its people block                                                                      |
| `Trails`                                            | `spikes/hall`'s per-dancer trail colours and 0.55 alpha, made persistent              |
| `layoutHall`                                        | `spikes/hall`'s `buildWorld`: `SET_PITCH` 104, `SIDE_W` 30, the stage and its offsets |
| `drawFloor`, `HALL_THEMES`                          | its `floorLayer` and `HALLS`, the non-facade (LttP) branch                            |
| the chairs, the table, the piano                    | the props `floorLayer` draws on the floor                                             |

## Deviations from the brief and the spikes, and why

- **The palettes are the spikes', not the brief's** (director ruling DD13). Six
  skin tones and sixteen shirt colours, where the milestone contract said three
  and eight: a hall of thirty-six dancers drawn from three skins reads as
  repetitive.
- **The props are redrawn, not ported.** The spike's fiddle, guitar, bass and
  mic were drawn for the front view gate 2 rejected; here they are the same four
  objects seen from the ceiling.
- **The band's places on the stage are not the spike's.** Its four musicians
  were laid out for the front view and overlap badly from above, and the
  caller's bubble sat on the fiddler.
- **`layers` has three entries, not two.** The brief's behaviour section asks
  for trails "in a separate offscreen layer"; keeping them out of `floor` is
  what stops M4's floor repaints from wiping a dance's trails.
- **`drawPerson` takes a fifth, optional options argument** (outline, shadow,
  snapping, hand stacking). The four in the brief's signature cannot say
  whether a hand is joined, which the hand radius depends on.
- **`ArmPair` is two `Arm3dSolution`s, not `ArmSolution[]`.** The hand radius
  shades by `handZ`, which only the 3D solution carries.
- **`Ctx2D` is a structural interface**, not `CanvasRenderingContext2D`. The
  dancer layer is an `OffscreenCanvas`, and a union of the two DOM context
  types is not callable for their overloaded methods.
- **`FrameDancer` carries `velocity` and `style`.** `quietMotion` needs both and
  a single frame cannot be differenced. Both default to standing still and
  neutral.
- **Shoulders are 11 px** (core's AC3 number), where the spike drew 10.4. That
  is core's settled deviation, not a new one.
- **The band's hands hold closer to the body, and the piano moved 5 px closer
  to the bench (H1).** F1 measured a band member at 18.6–19.9 px across the
  elbows against a dancer's 12.1, because the instruments were held with the
  same 8 px drop that leaves the elbow's tuck (`elbowPole` in
  `@caller/core`) nearly off: a hand that far out of the tuck's reach draws
  with the pre-G1 winged elbow regardless of the figure. Raising the drop to
  14 px (12 for the seated pianist) and tightening the forward/lateral reach
  brings every band member to 12.6–14.4 px, without touching a dancer's own
  numbers. The pianist's hands also needed to reach the keyboard — 6+ px
  forward left no reach to spare, so `layoutHall.ts`'s `stage.piano` moved
  toward the bench instead (`stageTop + 8` to `stageTop + 15`, 7 px — the
  milestone's own report said 5 px, which the shipped code's own comment
  does not match; corrected here in M10 cleanup, code left untouched), which
  is the one place this milestone touched a prop position.
