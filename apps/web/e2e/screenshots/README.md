# Screenshots

Pictures of the whole page, kept as the record a look gate was judged on.
Nothing compares them — they are evidence, not goldens. The goldens are in
`../golden/`, and the figure strips in `../strips/`.

| File                        | What it is                                                                   |
| --------------------------- | ---------------------------------------------------------------------------- |
| `u1-phone-390.png`          | U1: the Stage tab at 390 × 844, `#/dance/airpants?beat=8&seed=1`             |
| `u1-laptop-1280.png`        | U1: the Stage tab at 1280 × 800, the same URL                                |
| `u1-dances-390.png`         | U1: the Dances tab at 390 × 844, `#/dances`                                  |
| `p1-phone-390.png`          | P1: the bigger hall — lines of 8 and 7 — at 390 × 844, the same URL, auto 1× |
| `p1-laptop-1280.png`        | P1: the same hall at 1280 × 800, auto 2×                                     |
| `p1-phone-390-lines3.png`   | P1: `&lines=3` at 390 × 844 — a 372 px world in a 390 px phone, still 1×     |
| `p1-laptop-1280-lines3.png` | P1: `&lines=3` at 1280 × 800, auto 2×                                        |
| `u2-stage-390.png`          | U2: the Stage tab at 390 × 844, `#/dance/airpants?beat=8&seed=1`, dark wood  |
| `u2-stage-1280.png`         | U2: the Stage tab at 1280 × 800, the same URL                                |
| `u2-moves-390.png`          | U2: the Moves tab at 390 × 844, `#/moves?beat=6` — the top of the rows       |
| `u2-moves-1280.png`         | U2: the Moves tab at 1280 × 800, the same URL                                |
| `u2-dances-390.png`         | U2: the Dances tab at 390 × 844, `#/dances`                                  |
| `u2-dances-1280.png`        | U2: the Dances tab at 1280 × 800, `#/dances`                                 |
| `t2-moves-row-390.png`      | T2: one Moves row at 390 × 844, `#/moves/swing?beat=6&zoom=2`                |
| `t2-moves-row-1280.png`     | T2: the same row at 1280 × 800                                               |
| `t2-dance-card-390.png`     | T2: the Dances tab at 390 × 844, `#/dances`, cards with their traces         |
| `t2-dance-card-1280.png`    | T2: the same tab at 1280 × 800                                               |
| `t2-traces-view-390.png`    | T2: all four views at 390 × 844, `#/dances/airpants/traces`                  |
| `t2-traces-view-1280.png`   | T2: the same page at 1280 × 800                                              |
| `v1-badge-390.png`          | V1: the build-info badge open at 390 × 844, `#/dance/airpants?beat=8&seed=1` |
| `v1-badge-1280.png`         | V1: the same badge open at 1280 × 800                                        |

The U1 pair are the hall as it was, lines of five and four; the P1 pair are the
same two viewports after the lines grew, so the two sets read as a before and
an after. The U2 six are the same pages after the theme went dark, so
`u1-phone-390.png` and `u2-stage-390.png` are the same URL at the same size
before and after, and `u1-dances-390.png` and `u2-dances-390.png` likewise.

Taken from a scratch Playwright spec against the built app (`pnpm build`, then
`playwright test`), deleted afterwards: `page.setViewportSize(...)`,
`page.goto(...)`, wait for `document.documentElement.dataset.hallReady`, then
`page.screenshot({ fullPage: true })`.

The two U2 Moves pictures are the viewport rather than `fullPage`: the Moves
page is fifty-four rows tall and a full-page picture of it is 20 000 px of
scroll. They wait on `data-measured="1"` on the control bar, which is how the
page says the motion oracle has finished measuring every row.

The six T2 pictures are the look gate for the traces: the figure's pen plot and
its strip cell under the tile in a Moves row, the dance cards carrying their own
strip and pen plot, and `#/dances/<slug>/traces` with all four views. The Moves
pair is one row on its own deep link at the page's default zoom, so the tile
column is the width it is on the whole page; the phone picture is the evidence
that the panel goes _inside_ the tile column and so cannot push U2's two-column
row off a 390 px screen. On the traces page the views with a beat axis keep
their own width and scroll inside their own box rather than being scaled down to
a phone, which is why the 390 picture shows the first phrases of the march and
the seismograph rather than four squeezed ones.

The two V1 pictures are the look gate for the build-info badge: the merged
outline, with the trigger's rounded box rising out of the panel's top edge and
a concave fillet where the two meet, and the panel's own contents — the build
rows, then "Recent updates". They are the viewport rather than `fullPage`
(the panel is fixed-position; a full-page picture would scroll the page out
from under it), and they need the two JSON files a deploy writes, so the
recipe for them has one extra step:

```bash
pnpm --filter @caller/web build
node scripts/pages/build-info.mjs --out apps/web/dist
pnpm --filter @caller/web exec playwright test <scratch spec>
```

Without that middle step both fetches 404 and the badge shows its dev-build
state, which is the right behaviour and the wrong picture.

The SVGs themselves — every figure and every dance, four ways — are in
`../traces/`, written by `pnpm traces:export`.
