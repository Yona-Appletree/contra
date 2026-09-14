# Screenshots

Pictures of the whole page, kept as the record a look gate was judged on.
Nothing compares them — they are evidence, not goldens. The goldens are in
`../golden/`, and the figure strips in `../strips/`.

| File                 | What it is                                                       |
| -------------------- | ---------------------------------------------------------------- |
| `u1-phone-390.png`   | U1: the Stage tab at 390 × 844, `#/dance/airpants?beat=8&seed=1` |
| `u1-laptop-1280.png` | U1: the Stage tab at 1280 × 800, the same URL                    |
| `u1-dances-390.png`  | U1: the Dances tab at 390 × 844, `#/dances`                      |

Taken from a scratch Playwright spec against the built app (`pnpm build`, then
`playwright test`), deleted afterwards: `page.setViewportSize(...)`,
`page.goto(...)`, wait for `document.documentElement.dataset.hallReady`, then
`page.screenshot({ fullPage: true })`.
