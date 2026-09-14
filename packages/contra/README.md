# @caller/contra

Contra as one form on top of `@caller/choreo`: the contra role set (lark,
robin), the contra figure library, and contra-specific dances and programs.

## Allowed imports

`@caller/contra` may import `@caller/choreo`. Nothing else in this
workspace.

Everything geometric comes through `@caller/choreo`, which re-exports the
slice of `@caller/core` a formation needs, so the one allowed edge stays one
edge.

`src/corpus/normaliseTitle.ts` normalises dance titles (whitespace, a
leading program-order number, case) for `scripts/corpus/import-portland.mjs`,
which derives `data/corpus/portland-programs.json` — see `data/README.md`.

## The role set — `src/roles.ts`

`CONTRA_ROLES` is `{ roles: ["lark", "robin"], top: "robin" }`. This is the
only place in the workspace those two words mean anything: `@caller/core`
reads `top` to stack joined hands and `@caller/choreo` never reads a role
name at all.

## The formations — `src/formation/`

Both lay their stations out in frame-local px, with local +y down the set
and local +x across it (see `@caller/choreo`'s README). The two long lines
are `ACROSS_PX = HOLD_SPACING_PX + LINE_OFFSET_PX = 32` apart, the plan's
AC3 number, and adjacent dancers along a line stand `PLACE_PITCH_PX = 20`
apart, which is the hall spike's 10 px per half-place retyped.

### `duple-improper`

Two long lines, larks alternating down each one, the ones travelling down
and the twos up. Hands four from the top is a scan down the line: pair each
couple travelling down with the couple travelling up below it, and let
anyone left over wait. With an even number of couples the pairing alternates
between starting at place 0 and place 1, so one couple waits at each end
every other time through; with an odd number one couple waits every time.
Both fall out of the scan, so there is no special case for either.

One time through swaps the two couples of a minor set, which moves the ones
one place down the line and the twos one place up. A waiting couple stays
where it is and changes direction; `wait-out` swaps its two stations, which
puts its lark back on the line the next time through expects.

### `becket`

Partners side by side facing the couple across the set, progressing by
sliding to their own left. A becket set has a waiting place beyond each end
(places `-1` and `places`), so it holds `2 × places + 2` couples. A couple
that has slid to the end spends one time through on the waiting place and
comes back in on the other line, one place along: that crossing is
`wait-out`'s `'mirror'`, in a frame centred halfway between the two places,
so the one built-in figure does becket's end effect and duple improper's.

**No becket dance exists yet.** M7's placeholder figure `walk-to-station`
maps stations of one group onto stations of the same group, and a becket
couple's progression takes it _out_ of its group frame, so the closure
fixture that proves AC5 for duple improper cannot be written for becket.
Becket's stations, grouping and progression are tested here — including that
a waiting couple lands within 0.01 px of where the next time through wants
it — but the closure oracle over a real becket dance waits for M8's figures.
