# @caller/contra

Contra as one form on top of `@caller/choreo`: the contra role set (lark,
robin), the contra figure library, and contra-specific dances and programs.

## Allowed imports

`@caller/contra` may import `@caller/choreo` and `@caller/core`. Nothing else
in this workspace.

The formations take their geometry through `@caller/choreo`, which re-exports
the slice of `@caller/core` a formation needs. The pair figures in
`src/figures/` import `@caller/core` directly: a figure's whole output is a
`PoseSample`, and it needs the arm solver, the quiet motion, seam easing, hand
and foot interpolation, the buzz and foot-rest constants and most of the
geometry helpers — thirty-odd names, which is a re-export list rather than a
slice. `AGENTS.md`'s table reads `core ← choreo ← contra` as a chain, and
`scripts/check-deps.mjs` now lists the direct edge. **If the director would
rather keep contra on its single edge, the reversal is to widen the re-export
block at the bottom of `packages/choreo/src/index.ts` and drop `"core"` from
contra's `allows` — no figure code changes.**

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

## The pair figures — `src/figures/` and `src/pair/`

The five figures the gate-3 two-dancers spike settled, plus the fall back that
closes its sequence, as parameterised definitions over `@caller/core`'s pose
contract. Behaviour was read from `spikes/two-dancers/index.html` and retyped;
production code never imports from `spikes/`.

This layer is **temporary scope**. M7's choreo engine has the real
`Formation`, `Group`, `Frame` and `FigureDef`; M8 re-hosts these six on them
and `src/pair/` goes away. Until then a figure runs in a local `PairFrame` —
a centre, an axis and the hold spacing — which is the smallest thing that can
hold two dancers.

### The contract

```ts
interface FigureDef<P extends object> {
  readonly id: string;
  readonly call: string;
  readonly lead: Beat;
  readonly beats: Beat;
  readonly params: readonly (keyof P & string)[];
  readonly defaults: P;
  beatsOf?(params: P): Beat;
  sample(frame: PairFrame, role: PairRole, t: Beat, params: P): PoseSample;
}
```

`sample` computes **both** dancers from the frame and returns the one asked
for, so a joined hand is literally one floor point that both roles carry —
not two points that agree to a tolerance. `pairCall(def, frame, params)` binds
a figure to a frame and erases `P`, which is what a sequence holds.

### The figures

| id          | beats | parameters (defaults)                                      | what it does                                                                                                                                   |
| ----------- | ----- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `walk-in`   | 4     | none                                                       | From the lines, `LINE_OFFSET_PX` further apart, in to the hold; the take is animated over the last beat and a bit.                             |
| `balance`   | 4     | `rock` 1.0 px, `takeHands` false                           | Rock forward then back with two hands joined, feet planted. `takeHands` is for a balance that follows a figure with the hands down.            |
| `swing`     | 8     | `turns` 2, `handOffset` 5 px, `beats` 8, `endFacing` null  | Ballroom hold, buzz step, open out with the lark on the left. `handOffset` is how far in from the joined shoulders the outstretched hands sit. |
| `allemande` | 8     | `hand` `"L"`, `amount` 1, `inward` 20°, `startFacing` null | One hand at the centre; each body turns `inward` degrees toward that centre so the arm has something to pull against.                          |
| `do-si-do`  | 8     | none                                                       | Round back to back with the hands down and the facing kept; only the head follows.                                                             |
| `fall-back` | 8     | `release` true                                             | Let the hands go and walk back to the lines.                                                                                                   |

`endFacing` and `startFacing` default to `null`, which means "take it from the
frame": a swing ends on the line its turning stopped on, and an allemande
starts facing across the pair, which is where a swing leaves it. That default
is what makes swing → allemande close exactly.

### Tuning numbers, and where they came from

Everything below is a figure parameter or a module constant in this package.
**No rendering-contract number was changed**: shoulders are still 11 px, reach
15, hold spacing 14, lines 18 further, 4 cm per px, and the spike's 10.4 px
shoulders were not restored.

- **`balance.rock` is 1.0 px**, where the spike rocked 1.3. The back rock is
  `BALANCE_BACK_RATIO = 1.4 / 1.3` times it, the spike's own asymmetry. The
  pose's `lean` is capped at `BALANCE_LEAN_CAP = 1.0` px.
- **`HEAD_LEAN_FOLLOW` in `@caller/hall` is 0.5**, where the spike drew 0.8.
  Together with the smaller rock this moves a balancing dancer's head 2.4 px
  forward of their standing place instead of 3.0, so at the closest point of a
  balance the two head centres are 9.2 px apart instead of 8.0 — a gap of
  3.4 px between a 2.9 px skull and its partner's, where the spike had 2.2 px
  (2.8 and 1.6 for the wider `bob` and `curly` heads). Gate G1 question 2.
- **`swing.handOffset` is 5 px** and **`allemande.inward` is 20°**, the two
  gate-3 tweaks, now parameters. Gate G1 question 3.

### The invariants these hold

Every figure's test walks it at every eighth of a beat and asserts
`solveArm(...).short === 0` for both dancers (plan AC1), solving the arms
exactly as `@caller/hall` does: body position quantised, shoulders hung off
the swayed torso. `armShortfall` and `worstShortfall` are exported so M8's
figures can use the same probe.

`DEMO_PAIR_SEQUENCE` is the spike's 64 beats. Its test asserts AC1 over the
whole loop, that each figure's end pose is the next figure's start pose within
0.01 px (`poseGap`), and that a hand pair within the renderer's
`JOIN_EPSILON_PX` is the same point and the same height unless a take or a
release is in flight through that band.

`poseGap` deliberately ignores `stepRate` and `amp`. Both are rates rather
than positions, and at a figure boundary — where every figure here is
momentarily still and the step phase is exactly zero, because every figure
starts on a whole beat — neither moves a pixel.

### Deliberate differences from the spike

- **Hanging hands are explicit.** A figure emits a real `Hand` for a hand at
  the dancer's side rather than `'down'`, because `easeSeam` cannot
  interpolate `'down'` (it switches at the midpoint of the seam) and because
  every take and release has to animate out of somewhere. `handDown` restates
  `@caller/hall`'s `HAND_HANG_*` numbers, which came from the same spike;
  **that is a duplication to watch**, and the tidy fix is to move the hanging
  hand into `@caller/core`.
- **The arm swing starts and ends at zero.** The spike's `walk-in` opened with
  the arms already swinging while `fall-back` closed with them still, so the
  hanging hands jumped up to 0.8 px at three seams and the seam ease hid it.
  Ramping the swing in over the first 0.4 beats and out before the end closes
  those seams exactly.
- **`fall-back`'s weight shift tapers out** over its last beat, for the same
  reason, and is measured from the figure's own beat rather than the dance's.
- **The swing fades its sway out instead of cutting it.** `core`'s `buzz` is a
  boolean that replaces the feet outright, so the swing keeps `buzz: false`,
  places its own feet (walking cross-faded into the buzz step, as the spike
  did) and uses `amp` to fade the torso sway out as the buzz comes in.
- **Both dancers flare.** The spike gave the skirt flare to the robin only;
  flare comes from turning, so both get it. Invisible in the demo's default
  look, where nobody wears a skirt.
