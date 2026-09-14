# @caller/hall

The renderer: reads `PoseSample`s from `@caller/core` and draws the pixel hall —
low-res world, supersample and downsample at integer zoom, procedural bodies,
seeded people, z-order, shadows, trails. Never calls a figure.

M3 is the dancer layer. Walls, boards, the stage, the band, the caller and the
bitmap-font bubble are M4's, and paint into the `floor` layer this package
allocates.

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

## Fixtures, goldens and stories

`src/testing/fixtures.ts` holds three static frames with fixed seeds and no
animation: `facings` (one dancer at each of eight facings), `two-hand-hold`
(the contract's 14 px), and `swing` (the stacking invariant). `apps/web`'s
hidden `#/frame?fixture=<name>&zoom=6` route draws one of them, Playwright
screenshots it, and `apps/web/e2e/frame.spec.ts` compares it with
`apps/web/e2e/golden/*.png` at a 0.5% `pixelmatch` tolerance.

```bash
pnpm --filter @caller/web test:golden           # compare
pnpm --filter @caller/web test:golden:update    # rewrite the goldens
```

`src/Hall.stories.tsx` shows the same fixtures in Storybook, with a flat floor
so the outlines read.

## What was ported from the spikes

Production code never imports from `spikes/`; these behaviours were read from
the spikes and retyped.

| Here                                                | Spike                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `drawBody`, `drawArms`, `drawHead`                  | `spikes/two-dancers`'s `drawBody` / `drawArms` / `drawHead`, radius for radius     |
| the supersample-and-downsample pipeline             | its `renderLayer`: `SS = 4`, `imageSmoothingQuality = 'high'`, the alpha threshold |
| `hangingHand`                                       | its `hang(P, a, side, ph, amp)`                                                    |
| `HAND_STACK_RADIUS_PX`, the joined-hand hand radius | its `drawArms`'s `hr` and `under` flag                                             |
| `headLook`                                          | its `sampleAt` head-turn block: ±55°, fading to 0 by 115°                          |
| `mulberry32`, `shade`, the palettes                 | its people block                                                                   |
| `Trails`                                            | `spikes/hall`'s per-dancer trail colours and 0.55 alpha, made persistent           |

## Deviations from the brief and the spikes, and why

- **The palettes are the brief's, not the spikes'.** Three skin tones and eight
  shirt colours, where the spikes had six and sixteen. The milestone contract
  names those numbers; the palettes are exported, so widening them is one line.
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
