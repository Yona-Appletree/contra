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
