# @caller/ui-base

Primitive components with no app knowledge: shadcn/ui generated over Radix
primitives (`Button`, `Select`, `Slider` so far), styled with the tokens
from `@caller/ui-design`. A component here never imports app state or knows
what a dancer, figure or dance is.

## The contiguous popover

`Popover` (`src/components/ui/popover.tsx`) is not from shadcn: it is a port
of lightplayer's `base/popover.rs`. Its trigger and its panel paint no chrome
of their own — while open, one SVG path draws the rounded **union** of their
two rects, with concave fillets where they meet, so the pair reads as a single
piece of chrome the button opened out of rather than a card dropped beside it.
The geometry is `src/lib/mergedOutlinePath.ts`: pure, DOM-free and unit-tested
against the same cases as the Rust original. The path's colours come from
`--popover-fill` / `--popover-border`, which default to the theme's
`--color-secondary` and `--color-border`, so it follows the theme like
everything else here.

The panel is portalled to `document.body` and positioned in viewport
coordinates, which is what lets it escape the tab bar's `overflow`. It
dismisses on outside click and on Escape and returns focus to the trigger;
content inside it can close it with `usePopoverClose()`. Anchored mode — the
outline welding to an element that is not the trigger — is not ported.

## Allowed imports

`@caller/ui-base` may import `@caller/ui-design`. Nothing else in this
workspace.
