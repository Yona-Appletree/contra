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

### Joined hands and z-order

`sceneOrder` finds every pair of hands within `JOIN_EPSILON_PX` (0.1 px) of each
other — joined hands are one shared floor point, so they are exactly equal in
practice — and asks `core`'s `stackJoined` which of the two roles is on top.
The role set's `top` role (contra: `robin`) gets its hand drawn a little
narrower and its arms drawn _after_ the other dancer's, so the robin's hand is
always on top of the lark's and the robin's arms always draw over the lark's
(plan AC2). Bodies and heads are sorted up the screen; arms are sorted up the
screen too, subject to those constraints.

### Trails

`trails` is a persistent offscreen layer. Each frame appends only the step just
taken, so a whole dance's worth of trail costs nothing per frame, and nothing
clears it within a dance — `clearTrails()` is for the gap between dances.
`FrameDancer.trail` is the list of points to add this frame (omitted: the
dancer's current position); a gap longer than `TRAIL_BREAK_PX` starts a new
stroke rather than drawing a line across the hall after a seek. Colours are the
hall spike's: larks blue, robins rose, the ones darker (`roleTrailColour`).

### Appearance

`createPerson({ id, role, seed })` is a pure function of the seed: three skin
tones, eight shirt colours, seven hair styles (short, long, bob, curly, bald,
cap, bun), a skirt or trousers. `roleShirts` puts the role set's `top` role in
the warm half of the palette and everyone else in the cool half — the
two-dancers spike's default look — but dress is not role, so it is opt-in.

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
— the fiddle bows, the guitar strums, the bass nods, the pianist leans, one px
each on the same sine as the dancers' quiet motion — and it is drawn on a 4×
supersampled layer and downsampled, so the band is the same kind of pixels as
the dancers.

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

`src/testing/fixtures.ts` holds five static frames with fixed seeds and no
animation. Three are dancers on the bare backdrop: `facings` (one dancer at each
of eight facings), `two-hand-hold` (the contract's 14 px), and `swing` (the
stacking invariant). Two are the hall with nobody dancing in it:
`hall-empty-2-lines` and `hall-bubble`, the second with the caller calling
"HANDS FOUR FROM THE TOP". A hall fixture carries a `paint(renderer)` that
paints the floor layer before the frame is drawn, which is the only thing that
makes a hall frame a hall.

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

## What was ported from the spikes

Production code never imports from `spikes/`; these behaviours were read from
the spikes and retyped.

| Here                                                | Spike                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `drawBody`, `drawArms`, `drawHead`                  | `spikes/two-dancers`'s `drawBody` / `drawArms` / `drawHead`, radius for radius        |
| the supersample-and-downsample pipeline             | its `renderLayer`: `SS = 4`, `imageSmoothingQuality = 'high'`, the alpha threshold    |
| `hangingHand`                                       | its `hang(P, a, side, ph, amp)`                                                       |
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
