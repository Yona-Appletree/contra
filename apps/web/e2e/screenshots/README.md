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

The U1 pair are the hall as it was, lines of five and four; the P1 pair are the
same two viewports after the lines grew, so the two sets read as a before and
an after.

Taken from a scratch Playwright spec against the built app (`pnpm build`, then
`playwright test`), deleted afterwards: `page.setViewportSize(...)`,
`page.goto(...)`, wait for `document.documentElement.dataset.hallReady`, then
`page.screenshot({ fullPage: true })`.
