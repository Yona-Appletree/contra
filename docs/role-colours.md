# Role colours: larks gold, robins red

**A lark is gold `#e0a32e` and a robin is red `#c8362f`, everywhere a role is
drawn, and nothing that distinguishes the two may be blue-ish for a lark or
pink-ish for a robin.** A user ruling of 2026-09-14; this file is the one-line
version, and `AGENTS.md`'s rendering contract is where it binds.

Contra's role names exist to take the gender out of "gents and ladies", and the
simulator's first rendering handed it straight back by dressing the larks in
blue and the robins in rose. The dance's own convention for role-coloured
wristbands or badges is not blue-and-pink either; gold and red are two warm
colours that read apart from directly above at 1×, on a wooden floor, in nine
pixels of shirt, and say nothing about who is wearing them.

## What it means in code

One exported constant, `ROLE_COLOURS` in
`packages/hall/src/appearance/roleColours.ts`, carries the two colours and the
warm neutral (`#9c8f7a`) that everybody outside the contra role set gets. Every
renderer reads it and none of them keeps its own copy:

| What                            | Colour                                                        |
| ------------------------------- | ------------------------------------------------------------- |
| A dancer's shirt                | their role's colour, moved by three draws from their own seed |
| A dancer's floor trail          | their role's colour; the ones ×0.72, the twos ×1.24           |
| A trace pen, on all four plates | the same, so a pen and the dancer who drew it match           |
| The band, caller, sitters       | the sixteen-colour palette — they are not dancing a role      |

The per-person spread on a shirt is hue ±8°, saturation ×0.90–1.18 and
lightness ×0.74–1.10 of the role colour, held inside stated bounds: wide enough
that thirty dancers are thirty shirts, narrow enough that gold still reads as
gold and red as red from above. Measured over three thousand seeds, that is
larks hue 31.3–47.6°, saturation 66.5–87.9%, lightness 39.0–58.2%; robins hue
354.4–10.9°, saturation 55.6–73.4%, lightness 35.7–53.3%.

**Dress is never role.** A skirt is decided by the seed alone, never by which
role a dancer is dancing, and is drawn only where the renderer's `skirts`
option says so — the Stage, which is where a hall full of them looks like a
hall. The Moves tiles, the pair page, the strips and the trace views leave it
off: a move example is about the move, so it shows the clothes colours and
nothing else.

## The rule as a test

`packages/hall/src/appearance/roleColours.test.ts` states the two forbidden
bands in HSL hue degrees — **blue 190°–270°** (cyan through violet-blue) and
**pink 290°–350°** (magenta through rose) — and checks every colour any
renderer puts on a role against them: the two bases, the pens at all three
ranks, both trails, and six hundred seeded shirts with the darker and lighter
shades the body is drawn with. A colour under 8% saturation has no hue worth
judging, so black, white and the greys are neither.
