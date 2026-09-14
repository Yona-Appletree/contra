# @caller/hall

The renderer: reads `PoseSample`s and the `Timeline` from `@caller/core` and
draws the pixel hall — low-res world, supersample and downsample at integer
zoom, procedural bodies, seeded people, z-order, shadows, trails, the
bitmap-font caller bubble. Never calls a figure directly.

## Allowed imports

`@caller/hall` may import `@caller/core`. Nothing else in this workspace.
