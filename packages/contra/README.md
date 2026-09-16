# @caller/contra

Contra as one form on top of `@caller/choreo`: the contra role set (lark,
robin), the contra figure library, and contra-specific dances and programs.

## Allowed imports

`@caller/contra` may import `@caller/choreo` and `@caller/core`. Nothing else
in this workspace.

The formations take their geometry through `@caller/choreo`, which re-exports
the slice of `@caller/core` a formation needs. The figures import
`@caller/core` directly: a figure's whole output is a `PoseSample`, and it
needs the arm solver, the quiet motion, seam easing, hand and foot
interpolation, the buzz and foot-rest constants and most of the geometry
helpers — thirty-odd names, which is a layer rather than a slice worth
re-exporting. Director ruling **DD17** settled it: a package may import any
package below it, not only the next one down. `AGENTS.md` says so, and
`scripts/check-deps.mjs` lists the edge.

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

### `proper` (M7)

Larks in one line and robins in the other, all the way down the hall and all
the way through the dance. Chorus Jig is the one encoded in it. The seating and
the progression are duple improper's — hands four from the top, a minor set's
two couples trading places every time through — and three things are not:

- **Which line you are on is your role**, not your role and your direction of
  travel together, so `SetLattice.slotOf` is two-to-one on (slot, role) and
  `placeOf` gained a `travel` argument to invert it.
- **Your neighbour is diagonal.** The other-role dancer of the couple you are
  dancing with is across the set _and_ along it, where in duple improper they
  are along your own line. The same trap becket has, in a third formation.
- **A waiting couple does not cross.** Improper's end effect is "turn round and
  come back on the other line"; proper's is "turn round", because coming back on
  the other line would put a lark in the robins'. A proper dance writes
  `"waitOut": { "cross": false }` and the wait group's frame is never reversed.

### `becket`

Partners side by side facing the couple across the set, progressing by
sliding **half a couple width** — one dancer position — to their own left.
The two lines face opposite ways, so they pass each other one whole couple
width a time through and the couple that was on your diagonal is the couple
you now face. The user's own words (DD54): _"its really shift half-way, isn't
it?"_ A couple's `place` is therefore a **half-integer** on alternate times
through, which everything that reads one copes with because a place is only
ever multiplied by `COUPLE_PITCH_PX`.

The relative motion is one couple place a time through, which is duple
improper's, so the ends are duple improper's too. Both lines start on the same
couple places and every couple dances; a time through later the two grids are
half a place out of step, the couple at each end has nobody across from it and
stands out; a time through after that the grids line up again and the two that
stood out have crossed the set and come back in on the other line. The crossing
is `wait-out`'s `'mirror'`, in a frame centred halfway along the half-place
step, so the one built-in figure does becket's end effect and duple improper's.
Nothing crosses straight over (S2's odd-line case): a half-place slide never
runs a couple off the end without a time out first.

**An odd number of couples** puts one more couple on one line than the other,
so exactly one couple is out every time through and it is the other end each
time — again exactly what an odd duple improper line does. The oracle checks
the odd lengths as well as the even ones, because the demo hall's shorter line
is seven.

**Lining a hall up in becket.** A becket hall does not walk into becket
places: it lines up **improper** — partners across the set, larks and robins
alternating down each line — takes hands four like anybody else, and the ring
moves one place round, which is what turns the improper line becket. The words
are the user's own (`becketHandsFourCalls`: "move one place to the left. this
is a becket dance. your partner should be on the side of the set with you")
and the **direction is measured, not typed**: `@caller/choreo`'s
`lineUpShiftOf` reads it off this formation's own progression. `BECKET_RIGHT`
(`src/formation/becketRight.ts`) is a right-progressing becket — the user:
"_technically_ if its a right-progressing becket dance, you should move one
place _to the right_." Since FR-C2 it is a formation a **record may name**, and
Are You 'Most Done? is one: its transcript calls B1 "on right diagonal, hey"
with `N2` and its author says the dance begins with the same neighbours as the
hey, and those three sentences hold together only if you progress to your
right. It is made by the same factories as `BECKET` with the sign of the slide
turned round, so the right-progressing branch is not a branch: it is the same
body of code with `step = +1`.

**Where a becket set sits.** `SetSpec.centre` is where a line's _first_ dancer
stands, which is what it means for a duple improper set, and a hall hands the
same point to both formations. The topmost dancer a becket set ever has is the
lark of the couple standing out beyond the top, at position `-1`, so
`BECKET.start` puts the frame `BECKET_TOP_OFFSET_PX` (one waiting position plus
half a place, 30 px) down the hall from it. Without that a becket line in the
demo hall would start above the top of the dance floor, on the stage.

**A dance that progresses in its first figure** — Butter shifts left in its
first two beats — begins on {@link BECKET_BEFORE_SLIDE} rather than on the
stations: every dancer, the waiting couple included, is **half** a couple place
back along their own line and slides in. That is `Dance.startPlaces`; see
`@caller/choreo`'s README.

Becket's closure is proved the same way duple improper's is, by a sequence in
`src/figures/sequences.ts` that the script decider dances: everything in it
returns to the places it started on, and `slide-left` at the end is the
progression. It closes to 3.4 × 10⁻¹⁴ px at every line length from four
couples to twelve. (M7 could not write that fixture, because the engine's
placeholder figure maps a station of a group on to a station of the _same_
group and a becket couple's progression takes it out of its group frame
entirely — which is what `slide-left` is for.)

### `"shadow-pair"` and `"line"` (M2)

Both formations define two selectors beyond `"hands-four"`, per
`@caller/choreo`'s per-call `groupsFor(selector, set)` contract.

**`"shadow-pair"`** partitions the whole set **seam by seam**, not group by
group: ordering every couple by `place`, a couple travelling `direction: -1`
(duple improper's "twos", becket's `-1` line) is always the _near_ half of
the seam immediately below it, paired with whichever couple sits at the very
next place — always `direction: 1`, since the two directions alternate
strictly by place within one minor set and a seam only ever sits between two
different minor sets. The four-station seam group's stations are `NL`/`NR`
(near couple) and `FL`/`FR` (far couple) — "near"/"far", not the brief's own
sketched `1L+`/`2R-`, because which couple is `"1"` or `"2"` in its _own_
minor set is not fixed relative to the seam (a couple can be a seam's near
half one cycle and would be a different seam's far half were it read the
other way). A couple with no seam partner — the true top or bottom of the
whole line — is a smaller, two-station element (`NL`/`NR` alone), not a merge
failure: `who: "shadow"` resolves to nothing there and the existing
`who`-complement stand path takes over for that one call, exactly as a
`who: "larks"` selector already stands out a formation's other role. `shadow`
is a pairing tag (`tags("shadow-pair")["shadow"]` is the whole group, the
same shape `neighbors`/`partners` already are at `"hands-four"`); which two
stations actually dance together is a figure's own business (M6).
**`left-diagonal`/`right-diagonal`** are the seam's two cross-role pairs
(`["NL","FR"]`/`["NR","FL"]`) — the two dancers who are, in duple improper,
on the _same physical line_ either side of the seam (duple improper
alternates lark and robin down a line, so this pairing is cross-role) and,
in becket, on the same line but never alternating (so becket's "diagonal" is
really a straight, same-role pairing kept under the same tag names for one
figure library to use both). Which of the two reads as "left" versus "right"
from a dancer's own facing is unconfirmed by hand-check against real dance
text and is one of gate G1's open questions — see the M2 report.

**`"line"`** is each minor set's own four stations, widened — only at a true
end, only when one exists — to fold in the waiting couple beyond it: six
stations there (`1L`/`1R`/`2L`/`2R` plus `WL-<end>`/`WR-<end>`, suffixed
`"top"`/`"bottom"` since a formation can in principle widen at both ends of
the same call, as `long-lines` on a short becket line does), four everywhere
else, identical in the interior to `"hands-four"`. A `"line"`-selector call
always dances as one `kind: "set"` group — `groupsFor("line", set)` never
returns a separate `"wait-*"` plan, because that would double-claim a couple
this selector already folded in — and the _call's_ own `ends: "both" | "top"
| "bottom"` field (see `@caller/choreo`'s README) is what actually decides,
per call, whether a given true end's waiting couple dances or stands for it.
A waiting place that is not immediately adjacent to the dancing line is left
an unwidened true end of its own (`"line"` only ever widens with the couple
next to it) — flagged for whichever milestone's dance needs that shape. Neither
becket nor duple improper ever builds one, so nothing in the corpus reaches it.

## The hub — `src/set/` and `src/library/`

The figure model's middle layer (`docs/adr/2026-09-15-figure-model-set-state-and-resolution.md`).
It is being built beside the coded figure library below, not instead of it: M1
stands the hub up and proves it dances the ten demo dances **pose-identical** to
the old path with every coded figure bridged, and the figures move over to it one
at a time after that.

### Set state — `src/set/SetModel.ts`

`SetModel` is what the engine knows about a whole set at a figure boundary: per
dancer, a **slot** on the set's lattice (`{ line: 0 | 1, position }`, one
position per dancer place along the set), a **travel** direction, a **spot** in
world px, the **holds** they have, and their **partner** binding. All plain data,
`JSON.parse(JSON.stringify(model))`-safe, which is why it names its formation by
id rather than holding the object; `src/set/SetRules.ts` turns that id back into
the two things the hub needs from a formation.

It replaces two unreconciled places: `chain.ts`'s load-time threading of
`params.from` on the hands-four _template_, and the script decider's per-dancer
world-space `standingAt`.

### Relations — `src/set/relations.ts`, and the formations' own tables

A relation is a signed offset on the lattice, derived live and never stored, and
**which offset it is, is the formation's** (`DUPLE_IMPROPER_RELATIONS`,
`BECKET_RELATIONS`). Duple improper: your partner is the other line at the same
position, your neighbour the same line one position along the way you travel.
Becket: your partner is the same line one position along, your neighbour
straight across. Same two words, opposite two answers, from the same lattice —
which is exactly why relations cannot be `@caller/choreo` meanings.

**The table is complete since M6.** Every relation the acceptance set's twelve
transcripts name resolves in both contra formations, and
`dances/acceptance.test.ts`'s list of owed relations is empty.

| word                       | duple improper                                                                                                                                                                                                                                                                                                                                          | becket                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `partner`                  | the **binding**, seeded from the other line at the same position                                                                                                                                                                                                                                                                                        | the binding, seeded from the same line one position along                                                             |
| `opposite`                 | straight across the set — which here is your partner                                                                                                                                                                                                                                                                                                    | straight across — which here is your neighbour                                                                        |
| `N0` … `Nk`                | same line, `(2k − 1) × travel` positions along                                                                                                                                                                                                                                                                                                          | the other line, `(k − 1) × 2 × step × travel` positions along — one couple place a step, the way your couple is going |
| `shadow` k, `S0` … `Sk`    | the other line, `−partnerSide × 2k × travel`                                                                                                                                                                                                                                                                                                            | your own line, `−partnerSide × (2k − 1) × travel`                                                                     |
| `trail-buddy`, `T1` …      | same line, `2k × travel` — **(unsure)**, nothing calls it                                                                                                                                                                                                                                                                                               | same                                                                                                                  |
| `corner`, `C1`, `C0`, `C2` | `C1` your **first** corner (the right diagonal) and `C0` your **second** (the left) — across the set and one dancing place along it, the sign being your own role, since the two of a couple look at each other across the set (FR-B1, DD45); `C2` and up keep M6's own row, the dancer straight along your own line, which is what a cast off pairs on | the same offsets                                                                                                      |

Three things make the table what it is rather than a set of guesses.

- **`N_k` is the k-th couple along the set in the direction you progress**, and
  in becket that is a **couple place** a step (the user, E3: _"N2 would be your
  next neighbor"_). With `step` the positions one progression moves a dancer
  whose travel is `+1` (`SetLattice.progressionStep`: `+1` improper, `−1`
  becket, because a becket couple slides half a place to its own left), **one
  rule serves both**: `Δ₁ + (k − 1) × 2 × step × travel`.
  **That it is one rule is a measurement, and FR-C2 is what made it one.**
  It derives from an invariant — the neighbour you have _next_ is the neighbour
  you have after one more time through — which `lattice.test.ts` checks for every
  dancer, every k, at every round, in both formations. While a becket line slid a
  whole couple place the two lines passed each other **two** couple places a time
  through, only a two-place step could track them, and the caller's word (`N2`
  for the couple one place along) and the geometry disagreed at all 216 compared
  cases; FR-C1 followed the word and counted the cost, and FR-C2's half-width
  slide removed it. `relations.test.ts` measures the table against the hall and
  finds not one disagreement in either formation.
- **A shadow is the opposite-role dancer who progresses the way you do**, on the
  opposite side of you from your partner, and the side is `partnerSide` so that
  the relation is its own inverse. The sign is evidence rather than convention:
  Contrablend's transcript says its shadow roll-away leaves you with a **new
  partner**, which is true for the dancer this row names and false for the one
  two places the other way.
- **`partner` is a binding, not an offset.** It is seeded from the lattice and
  re-seeded at every progression, so the two agree everywhere nothing has
  rebound anything — but a call may carry `params.rebind: { partner: "shadow" }`
  and every "partner" after it means the new one.

A relation that answers **nobody** is an ordinary answer, not a failure: at the
end of a line the slot an offset points at is off the end. M6's end-of-set rule
is the simplest one there is — that dancer dances hold-place for the call — and
`pnpm dance` prints an end-effects table saying who, in which call, at which
end.

Since M7b the rule also applies **inside** a figure. A grand right and left is
three pull-bys and one call, so near either end of the line one of them has
nobody in it: a waypoint route stops at the first pass that finds no partner and
that dancer stands where the pass before left them, for that pass and the ones
after it. It is found geometrically — a pass finds its own partner — and the
relation word each pass names (`meets` on the step) is only so the end-effects
table can say which pass left whom out.

### Resolution — `src/set/resolve.ts`

One call against the live set becomes concurrent **figure instances over
disjoint actors**, plus one hold-place instance per group for everybody the call
did not select. `who` takes everything it always took — `"all"`, a station
array, a tag the formation defines — and now also a **relation word**
(`who: "N2"`). An instance is a `Group` whose stations are figure-roles, which
is what leaves `FigureEvent`, `poseAt`, the oracles and the renderer untouched.

Four actor rules so far. `"all"` is the legacy bridge's: one instance per minor
set over everybody the call selected. `"pairs"` makes an instance per pair, the
pairs named by `params.pairs` — a relation word resolved against the live set,
or the station pairs a dance record writes today (`[["1L","2L"]]`, "larks
allemande left") — and everybody the pairing leaves out dances hold-place, which
is what the two robins really do. `"ring"` takes everybody in one instance.
`"line"` (M6) is one instance **per line of the lattice**, which is what a long
wave is and what a grand right and left is.

A figure for four whose `who` is a **relation** is cut into rings of four that
need not be a minor set (M7b): you, your partner, the dancer the relation names,
and their partner. Contrablend's `circle right 3/4 [with shadow]` is the case —
four dancers standing on a 32 × 20 rectangle across the seam between two minor
sets — and the lane is used for it only when one of those rings really does span
two, measured rather than declared.

#### The lane (M6, Q15 and Q16)

A call that reaches past the four is resolved in the **lane**: the whole set as
one pool, with a station per dancer named by the slot they stand on (`L1@3`), in
the set's own frame. `groupsFor` is left doing the two things it is the
authority on — the hall's **seating** and **the outs**, so the couples standing
out at the ends are not in the pool and still get their own `wait-out` — and
everything else is an offset.

Which calls go there is **measured, not declared**: the pairing is worked out
over the whole set first, and the lane is used only if some pair it produces
spans two minor sets. Every call written before M6 pairs partners or neighbours,
which are inside the four by construction, so every one of them keeps the
minor-set frame and the minor-set group ids it always had.

A definition whose `roles` is `["*"]` has **one part per dancer**, because how
many parts a long wave has is how long the hall is. Its shape reads the wildcard
track (`kinds/waypoints.ts`) instead of a part per name.

The **anchor** is where a shape's own origin sits _inside_ the instance's frame,
not a frame of its own: `"meet"` is the pair's midpoint where they stand when the
call starts, `"centroid"` the centre of the cast. The instance's frame stays the
set's, because a frame per pair would mean converting every spot out of the set
frame and back — and `localPoint(f, framePoint(f, x))` is `x` plus 2 × 10⁻¹⁵ px,
which is harmless as a position and turns a facing of exactly 180° into −180°.

### The cycle planner — `src/set/planCycle.ts`

`contraCyclePlanner` is a `@caller/choreo` `CyclePlanner`: one time through,
planned against set state instead of against a dance's pre-threaded places. Per
set it builds a model at the top of the cycle, resolves each call against it,
mints a group per instance, derives `from` from where the cast actually stand and
`carried` from the holds the set is already carrying, and moves the model on by
each instance's honest ends.

Since M3 the app runs this planner: `?engine=new` is the Stage's default and
`?engine=old` is the decider's own `defaultCyclePlanner`, kept reachable until
M11. `planCycle.golden.test.ts` is the proof that the two agree — on
`legacyCyclePlanner`, the all-bridged planner, which is what AC1 is about.

**Where a time through starts** is `ContraCyclePlannerOptions.start`. `"standing"`
— the default, and M3's deliberate switch — picks every dancer up where the last
figure really left them, so a figure's honest end survives the cycle boundary
instead of everyone snapping back on to their station between one time through
and the next. `"first-places"` restarts from `Dance.startPlaces` or the
formation's stations, which is what `chainCalls` does and therefore what a
planner being compared against `chainCalls` has to do; `legacyCyclePlanner`
keeps it.

### The library — `src/library/`

`FigureDefinition` is a figure as data: figure-roles, an actor rule, an anchor
rule, a parameter spec, a shape, holds, an ends rule, a timing profile and a
nominal count. Every definition survives `JSON.parse(JSON.stringify(def))`.

`{ kind: "legacy", figure }` is the **legacy bridge**, which wraps a coded
`ContraFigure` as a definition whose figure-roles are the hands-four station ids
and whose anchor is the formation's own minor-set frame. A figure leaves the
bridge when it is rewritten as data; by M11 the bridge is empty and
`src/library/legacy.ts` is deleted.

**The shape kinds** are implemented once each in `src/library/kinds/`, and no
figure has code of its own:

| kind           | what it is                                                         | figures                                                                                                              |
| -------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `rock`         | a pair or a ring closes up, rocks and rocks back                   | `balance`, `balance-ring`                                                                                            |
| `orbitPair`    | two dancers turning about a shared centre                          | `swing`, `allemande`                                                                                                 |
| `sequence`     | several shapes in a row, ends and hands threaded                   | `balance-and-swing`                                                                                                  |
| `ringWalk`     | so many places round the instance's own ring, or round the set     | `circle`, `star`, `petronella`, `single-file-promenade`                                                              |
| `path`         | a dancer's own written path along a named curve                    | `pass-through`, `long-lines`, `do-si-do`, `slide-left`, `roll-away`, `california-twirl`                              |
| `waypoints`    | a written route, waypoint by waypoint, with the passes marked      | `pull-by`, `grand-right-and-left`, `cast-off`, `circulate`, `loop`, `turn-alone`, `go-down-outside`, `go-up-outside` |
| `courtesyTurn` | a couple turning as one rigid body, solved backwards from its ends | `right-and-left-through`, `robins-chain`                                                                             |
| `schedule`     | who you meet, when, and by which shoulder, laid along a lane       | `hey`                                                                                                                |
| `lineWalk`     | a line with an **order**, forming and travelling                   | `down-the-hall`, `up-the-hall`, `lead-down`, `lead-up`, `bend-the-line`                                              |
| `unit`         | two dancers as one actor with its own orientation                  | `turn-as-couples`                                                                                                    |
| `wave`         | a line of joined hands facing alternately in and out, rocking      | `balance-wave`, `balance-wave-of-four`                                                                               |

`src/library/expr.ts` is the expression calculus a definition's numbers, angles
and points are written in — the data layer's own, with its leaves re-targeted on
to figure-roles (`{ station }` became `{ role }`, `ringShift` became a role shift
within the instance, `ringCentre` became the shape's `anchor`). It runs in three
passes — ends, then every role's place at `t`, then the hands against those
places — because a joined hand is the shared floor point of two _moving_ bodies
and cannot be substituted from a template.

**Holds are data** (`src/library/kinds/holds.ts`): a take-and-release window, the
one shared floor point, the role stacking, and a `when` guard so a balance
declares its two-hand hold, its one-hand hold and neither in the same list and
the call's own `hold` parameter picks.

**Honest ends.** `ends: "relative"` is "wherever the shape put them"; a
**gatherer** says `ends: "home"` and reads its end places off the formation's own
lattice instead of guessing them. Resolution hands it `params.places`, the home
points of every dancer in the group; a swing settles on the two of them square
across the way it opens out, a ring takes one each. That is what removed Butter's
hand-written `endHalf: 10` (AC2) — and note it is _the nearest places_, not each
dancer's own slot: a becket neighbour's slot is 32 px across the set, and a swing
that went there would leave the pair on opposite sides of it.

**`pnpm figure <id>`** prints the definition of any figure the library has, and
runs on a figure that has no coded predecessor at all.

**Two registries, one pair.** `@caller/choreo`'s registry holds what a figure
_draws_ and the library holds what a figure _is_; `poseAt` resolves a figure by
**id in the registry**, so a migrated figure must be in both. `contraDataEngine()`
(`src/library/engine.ts`) builds the consistent pair, and `planCycle` refuses a
mismatch by name rather than planning one figure and drawing another.

## The figure library — `src/figures/`

Every figure the demo's dances call, on `@caller/choreo`'s `FigureDef` and
`Group` contract, plus the registry a decider dances from
(`createContraRegistry()`).

### The table

`lead` is how many beats before the figure the caller starts saying it; every
figure here is 4, except the engine's `wait-out`, which nobody calls. `beats` is
the figure's natural duration — a dance may say otherwise, and the figure is
told what it actually got. Every parameter list starts with `from`, which is
where the dancers already stand (below); the defaults given are the rest.

| id                           | beats | call                           | parameters (defaults)                                                                                                                                                                                                                                                                |
| ---------------------------- | ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `balance`                    | 4     | `BALANCE`                      | `rock` 1.0 px, `hold` `"two"` (or `"one"`, `"none"`), `hand` `"R"`, `pairs` `"neighbors"`, `holdDrop` 5, `stackPx` 1 — **data**                                                                                                                                                      |
| `balance-ring`               | 4     | `BALANCE THE RING`             | the same, with `hold` `"ring"` and `holdDrop` 6 — **data**                                                                                                                                                                                                                           |
| `swing`                      | 8     | `SWING`                        | `pairs` `"neighbors"`, `turns` 2, `handOffset` 5 px, `endFacing` `"across"` (or `"up"`, `"down"`, degrees) — **data**                                                                                                                                                                |
| `balance-and-swing`          | 16    | `BALANCE AND SWING`            | `balanceBeats` 4, then the balance's and the swing's own parameters — **data**                                                                                                                                                                                                       |
| `allemande`                  | 8     | `ALLEMANDE`                    | `pairs` `"neighbors"`, `hand` `"L"`, `amount` 1, `inward` 45°, `holdDrop` 2 — **data**                                                                                                                                                                                               |
| `pull-by`                    | 2     | `PULL BY`                      | `pairs` `"neighbors"`, `hand` `"R"`, `holdDrop` 2 — **data**, no coded twin                                                                                                                                                                                                          |
| `grand-right-and-left`       | 6     | `GRAND RIGHT AND LEFT`         | none; three passes along the line, right, left, right — **data**, no coded twin, `actors: "line"`                                                                                                                                                                                    |
| `do-si-do`                   | 8     | `DO-SI-DO`                     | `pairs` `"neighbors"`, `amount` 1, `passPx` 5, `endHalf` `null` — **data**                                                                                                                                                                                                           |
| `long-lines`                 | 8     | `LONG LINES FORWARD AND BACK`  | `forwardPx` 9, `holdDrop` 8, `stackPx` 1 — **data**                                                                                                                                                                                                                                  |
| `circle`                     | 8     | `CIRCLE LEFT`                  | `direction` `"left"`, `places` 3 (quarters), `holdDrop` 13 — the **lowest** the joined hands hang, not their height (FR-A2) — `stackPx` 1 — **data**                                                                                                                                 |
| `star`                       | 8     | `STAR RIGHT`                   | `hand` `"R"`, `places` 4 (quarters), `amount` 1 (a fraction of the whole star; multiplies `places`, M8), `holdDrop` 3, `stackPx` 1.2, `hold` `"wrist"` (the grip is `WRIST_ALONG` = half way down the arm of the dancer ahead, FR-A1) — **data**                                     |
| `petronella`                 | 4     | `PETRONELLA TURN`              | `places` 1 (to the right), `spins` 1, `bowPx` 3 — **data**                                                                                                                                                                                                                           |
| `california-twirl`           | 4     | `CALIFORNIA TWIRL`             | `pairs` `"partners"`, `holdDrop` 0, `direction` 1, `raises` `"lark"`, `hand` `"right-in-left"` (the raiser's named first), `closePx` 12, `closeBeats` 1, `duckPx` 2, `archBackPx` 1.5 — **data** (FR-A1)                                                                             |
| `right-and-left-through`     | 8     | `RIGHT AND LEFT THROUGH`       | `couples` `"partners"`, `passBeats` 3.5, `bowPx` 5, `holdDrop` 6, `stackPx` 1, `pivotFromLark` 2.875 — **data**                                                                                                                                                                      |
| `robins-chain`               | 8     | `ROBINS CHAIN`                 | `chains` `"robin"`, `holdDrop` 6, `stackPx` 1, `joinBeat` 2, `passPx` 4.25 — **data** (A6: the orbit is the only regime)                                                                                                                                                             |
| `pass-through`               | 4     | `PASS THROUGH`                 | `direction` `"across"` or `"along"`, `bowPx` 5 — **data**                                                                                                                                                                                                                            |
| `roll-away`                  | 4     | `ROLL AWAY WITH A HALF SASHAY` | `pairs` `"partners"`, `roller` `"robin"`, `bowPx` 4.5, `spins` 1 (**how many turns, not which way**: the roll is inward, FR-A1), `holdDrop` 6 — **data**                                                                                                                             |
| `slide-left`                 | 4     | `SLIDE LEFT ALONG THE SET`     | `alongPx` 40 (a couple place), `direction` 1 — **data**                                                                                                                                                                                                                              |
| `hey`                        | 16    | `HEY FOR FOUR`                 | `passes` `""` (a pass list, `RR NL LR PL RR NL LR`), `start` `"robin"`, `by` `"right"`, `amount` 1, `ricochet` `""`, `for` 4, `idle` `""`, `axis` `"spread"`, `hands` false, `weavePx` 6.5, `joinBeats` 2, `passDrop` 6 — **data**, no coded twin                                    |
| `mad-robin`                  | 8     | `MAD ROBIN`                    | `pairs` `"neighbors"` (the dancer **beside** you, whom you circle), `amount` 0.5, `direction` `"clockwise"` — the body faces **across the set** and is pinned there (FR-A1) — **data**, no coded twin                                                                                |
| `shoulder-round`             | 8     | `RIGHT SHOULDER ROUND`         | `pairs` `"neighbors"`, `hand` `"R"`, `amount` 1 — **data**, no coded twin, side by side a shoulder's width apart with the body on the tangent and the eyes on each other (FR-B1)                                                                                                     |
| `single-file-promenade`      | 8     | `SINGLE FILE PROMENADE`        | `direction` `"clockwise"`, `amount` 0.25 (of the ring, whose size is read off the cast since M9) — **data**, no coded twin; the `chain` travel round the set's own outline, not a circle about its middle (FR-A2)                                                                    |
| `down-the-hall`              | 6     | `DOWN THE HALL FOUR IN LINE`   | `order` `null` (else the roles across the line), `travelPx` 13.5, `spacing` 14, `settleBeats` 1.5, `holdDrop` 8 — **data**, no coded twin                                                                                                                                            |
| `up-the-hall`                | 6     | `UP THE HALL FOUR IN LINE`     | the same — **data**, no coded twin                                                                                                                                                                                                                                                   |
| `turn-as-couples`            | 2     | `TURN AS COUPLES`              | `pairs` `"neighbors"`, `turn` 180°, `spacing` 14, `holdDrop` 8 — **data**, no coded twin                                                                                                                                                                                             |
| `bend-the-line`              | 2     | `BEND THE LINE`                | `order` `null`, `spacing` 14, `settleBeats` 1, `releaseBeats` 1, `holdDrop` 8 — **data**, no coded twin, ends in a **ring**                                                                                                                                                          |
| `lead-down`                  | 4     | `LEAD DOWN THE CENTRE`         | `pairs` `"partners"`, `travelPx` 9, `spacing` 14, `settleBeats` 1, `releaseBeats` 0, `holdDrop` 8 — **data**, no coded twin                                                                                                                                                          |
| `lead-up`                    | 4     | `LEAD UP THE CENTRE`           | the same, with `releaseBeats` 3 — **data**, no coded twin                                                                                                                                                                                                                            |
| `turn-alone`                 | 4     | `TURN ALONE`                   | `amount` 0.5 turns, `direction` 1 — **data**, no coded twin, `actors: "each"`                                                                                                                                                                                                        |
| `go-down-outside`            | 8     | `DOWN THE OUTSIDE`             | `outPx` 10, `places` 1, `stepBeats` 2 — **data**, no coded twin, `actors: "each"`                                                                                                                                                                                                    |
| `go-up-outside`              | 8     | `UP THE OUTSIDE`               | the same — **data**, no coded twin, `actors: "each"`                                                                                                                                                                                                                                 |
| `cast-off`                   | 4     | `CAST OFF`                     | `pairs` `"C2"`, `outPx` 10, `inPx` 4 (the inactive's step in, FR-A1) — **data**, no coded twin, `anchor: { pivot }`                                                                                                                                                                  |
| `turn-contra-corners`        | 16    | `TURN CONTRA CORNERS`          | `holdDrop` 2; four turns, 4 + 4 + 4 + 4, over **six** dancers — the actives and the two couples beside them, declared by `cast` and cut out of the lane (FR-B1, DD45) — **data**, no coded twin                                                                                      |
| `balance-wave`               | 4     | `BALANCE THE WAVE`             | `facesIn` `"lark"`, `rock` 1 px (FR-A2: bounded by the shoulder, and it never goes through the line), `closeBeats` 1, `holdDrop` 2 — **data**, no coded twin, `actors: "line"`; `hand` is the record's own word, checked rather than obeyed (M7b)                                    |
| `circulate`                  | 4     | `CIRCULATE`                    | `facesIn` `"lark"`, `hand` `"R"`, `radius` 6 — **data**, no coded twin, `actors: "line"`, the **box** circulate: whoever faces in crosses and whoever faces out loops to the other place of their own box, facing in (FR-B1, DD43)                                                   |
| `loop`                       | 4     | `LOOP`                         | `hand` `"R"`, `amount` 1, `radius` 5 — **data**, no coded twin, `actors: "each"`                                                                                                                                                                                                     |
| `cast-back`                  | 2     | `CAST BACK`                    | `outPx` 10 — **data**, no coded twin, `actors: "each"` (M8)                                                                                                                                                                                                                          |
| `promenade`                  | 8     | `PROMENADE AROUND THE SET`     | `pairs` `"neighbors"`, `direction` `"counterclockwise"`, `places` 2, `spacing` 14, `handDrop` 7, `topRise` 3, `stackPx` 1 — **data**, no coded twin, `actors: "pairs"`, the `unit` kind (M8) in its `promenade` hold: left in left and right in right, the right pair on top (FR-A2) |
| `balance-wave-of-four`       | 4     | `BALANCE THE WAVE OF FOUR`     | `centre` `"robin"`, `hand` `"R"`, `direction` `"forward"` (also `left`, `right`, `left-and-back`, `right-and-back` — FR-A2), `rock` 1 px, `spacing` 14, `closeBeats` 1, `holdDrop` 2 — **data**, no coded twin, the wave **across** the set (M8)                                     |
| `square-through`             | 4     | `SQUARE THROUGH`               | `firstPass` `"neighbors"`/`firstHand` `"R"`, `secondPass` `"partners"`/`secondHand` `"L"`, `holdDrop` 2 — **data**, no coded twin (M9)                                                                                                                                               |
| `interrupted-square-through` | 8     | `INTERRUPTED SQUARE THROUGH`   | the square through's four, plus `balanceWith` `"neighbors"`, `rock` 1.0, `stackPx` 1 — **data**, no coded twin, a named composite (M9)                                                                                                                                               |
| `jersey-twirl`               | 4     | `JERSEY TWIRL`                 | `pairs` `"partners"`, `holdDrop` 0, `direction` −1 — **data**, no coded twin, the California twirl's mirror with the dancer beside you (M9)                                                                                                                                          |
| `wait-out`                   | 64    | `WAIT IT OUT AND CROSS OVER`   | the engine's, less `crossTo` — see below                                                                                                                                                                                                                                             |

A figure marked **data** is a `FigureDefinition` in `src/library/figures/`; its
row above is the coded figure it replaced, which stays in this directory until
M11 deletes it and is what the per-figure golden holds it to. After M5 that is
**every figure**, and `src/figures/hey.ts` is the first coded figure actually
**deleted**: the hey's own gate ran against it and its numbers are frozen in
`library/figures/heyWeaveGolden.ts`, which the definition is still held to.
`endHalf` is gone from the swing and the allemande: a gatherer reads its end
spacing off the formation rather than guessing it.

Four rows say **no coded twin**: M6's two travellers, M5's hey (whose twin was
deleted with the milestone) and M5's three new figures. Those are the ones
`dataOnlyFigureIds()` names, and the ones `createContraRegistry()` seeds from
the library so that everything which draws a figure can find them.

The eleven M4 migrated are the **carriers** — they leave people wherever their
own shape put them, where the five M2 migrated are **gatherers** and settle on
to the formation's own places. That decides the gate each passes: a gatherer is
allowed to differ from the figure it replaced once the dancers are off their
places, and a carrier is not. All eleven agree with their coded predecessors
**exactly** — 0 px, 0°, 0 px of hand, from the stations and displaced alike;
see `src/library/figures/carriers.test.ts`.

A `pairs` (or `couples`) parameter names who dances with whom: `"partners"` is
`1L`–`1R` and `2L`–`2R`, `"neighbors"` is `1L`–`2R` and `1R`–`2L`, and a dance
may write the pairs out instead. Both contra formations name the same pairs with
the same station ids, which is what lets one library serve both: in duple
improper your partner is across the set and your neighbour is beside you down
the line, and in becket it is the other way round.

### Where the dancers already are — `from`

A figure is a pure function of the group, so a figure that does not begin at the
stations has to be told where its dancers stand. `ContraParams.from` carries
that, as places in the group frame's own axes, and defaults to the stations.

Threading it by hand would be unreadable and wrong within two figures, so
`chainCalls` and `contraDance` do it: each figure answers `moves(params,
stations)` with where it leaves everybody, and the next call is handed the
answer. What comes out is still plain data — numbers — so a dance survives
`JSON.parse(JSON.stringify(dance))`, which is what the engine requires. A call's
`who` is honoured: dancers a selector leaves out stay where they are.

Every figure does its geometry in those frame-local px and is turned into world
px once, at the boundary. The transform is rigid, so `shouldersAt`, `bodyPoint`
and the arm solver mean the same thing either side of it, and a figure's `ends`
come out exact rather than through a round trip. Every figure's test runs on a
frame that is deliberately **not** the identity, because a figure that has
quietly worked in world px passes at the origin and fails there.

### What nobody lets go of — `carried`

When one figure ends holding a hand and the next begins holding the **same**
hand of the **same** two dancers, nobody lets go: the hand is one shared floor
point across the boundary and moves continuously from where the first figure
held it to where the second does. Only a hold that actually changes — a
different partner, a different hand, or none — is released and retaken.

`ContraParams.carried` says which, and is threaded exactly as `from` is:
`chainCalls` asks each call what it is holding at its last beat (`joins(params,
beats, …)`) and what the next one holds through its middle, and writes the
overlap into the first call's `carried.out` and the second's `carried.in`. A
carried hold makes the figure's take or release a window of no length, so
`takeAndRelease` returns the joined point rather than a ramp off the hip. It is
plain data — station, side, and whose hand it is in — so a dance still survives
`JSON.parse(JSON.stringify(dance))`, and a dance never writes one by hand.

`contraDance` threads the whole dance as one run and cuts it back into phrases,
so a hold carries across a phrase boundary as well as inside one.

### Two dancers passing

In this coordinate system — y down, angles from +x toward +y — two dancers pass
**right shoulders** when each bows to their own **left**. `passRight` is the
helper; `@caller/choreo`'s `walkStep` bows the other way, and its comment says
that is a right-shoulder pass, which it is not.

### Making room for the pair beside you

Two pairs of a minor set dance a figure for two at the same time, and in duple
improper their centres are one place pitch — 20 px — apart while the lines are
32 px apart. A swing at M5's radius, or an allemande at M5's, or a do-si-do at
half the line's width, does not fit into that: two dancers of _different_ pairs
pass 7.86 px apart, inside AC6's 8 px.

So a figure for two takes a tighter hold when another pair is close:
`orbitRadius` (and the swing's own `SWING_CLEARANCE_PX`) shrink the turning
radius until the gap is 8.5 px, and at any wider spacing nothing changes and the
figure is M5's exactly. **This is a scale tension, not a figure bug**: the place
pitch is 20 px where a real line's is nearer the width of the set. If the
director widens `PLACE_PITCH_PX`, these clamps stop firing on their own.

### `wait-out`, wrapped

`@caller/choreo`'s `wait-out` knows two crossings — `'swap'` for a couple facing
each other across the set, `'mirror'` for a becket couple side by side — but the
script decider hands every waiting couple the figure's own **defaults**, so a
becket set got the duple improper crossing and ended 51 px from its station.
`src/figures/wait-out.ts` is registered under the engine's id and reads the
crossing off the couple's own stations instead: dancers who face each other
swap, dancers who face the same way mirror.

It also dances the mirror as a couple. The engine sends each dancer along their
own straight line to the point opposite through the frame centre, and for a
couple standing side by side those two lines cross — 1.74 px apart at the
tightest. Turning the couple about its own midpoint while the midpoint travels
reaches exactly the same two places, because a point reflection _is_ a half
turn, and it loops 10 px beyond the end of the set so it does not share a lane
with the couple sliding out of the place it is coming back to.

Since F2 the crossing is reckoned from where the couple _started_ the figure
rather than from the waiting place, so a becket dance that progresses in its
own first figure — the waiting couple slides off the end of the line with
everybody else — lands one place short of the waiting place, ready to slide in
again. With no `startPlaces` the two are the same point and nothing moves.

(M9 closed the engine's other debt here: `createScriptDecider` now takes
`wait-out` from the registry, so the wrapper's `ends` are the ones the
between-dance line-up walks from.)

### What the tests hold every figure to

`probeFigure` walks a figure at every eighth of a beat and `figureProblems`
turns what it finds into sentences. Four questions, the plan's numbers:

| question                                                                                         | limit          |
| ------------------------------------------------------------------------------------------------ | -------------- |
| Does every arm reach the hand the figure placed? (AC1)                                           | `short === 0`  |
| Is every hand the figure says is joined one floor point?                                         | 0.1 px         |
| Is the pose at `t = beats` where `ends` says, and at `t = 0` where the figure was told to start? | 0.01 px        |
| Does anybody come closer than AC6 allows?                                                        | more than 8 px |

Nothing in the library needs a declared contact: even a swinging pair stays
further apart than AC6's distance, so the sequences check every pair with no
exemption at all.

### The sequences — `src/figures/sequences.ts`

Two dances the script decider dances, one per formation, which is where AC5
lives:

- **duple improper** — circle left ¾, swing your partner; long lines, robins
  chain; star left half, do-si-do; balance and swing your neighbour. The star
  goes **half** way round: the brief that asked for this sequence does not say
  how far, and the dance only progresses for that answer, because the neighbour
  swing at the end is the identity on places from a becket-like arrangement.
- **becket** — circle left once, long lines; right and left through, and back;
  star right once, star left once; balance and swing your partner, slide left.
  Everything but the slide returns to the places it started on, and the slide is
  becket's progression.

Closure, reach and collisions over eight times through, at every line length:

| formation      | couples | closure        | `short` | min torso distance |
| -------------- | ------- | -------------- | ------- | ------------------ |
| duple improper | 2–6     | 1.8 × 10⁻¹⁴ px | 0       | 9.516 px           |
| becket         | 4–12    | 3.4 × 10⁻¹⁴ px | 0       | 10.000 px          |

`data/dances/*.json` (repo root, beside `data/corpus/`) holds the ten encoded
dances, each sourced from its own page on The Caller's Box; `dances.test.ts`
runs every one of them through the same three oracles at every line length
its formation is checked at. **Butter** (Gene Hubert, becket) is the one that
progresses in its own first figure: closure ≤ 2.9 × 10⁻¹⁴ px, `short` 0, min
torso distance 10.000 px, at 4, 5, 6, 8, 10 and 12 couples.

### The demo dances — `data/dances/*.json`, loaded by `src/dances/`

A dance is plain data (`Dance` in `@caller/choreo` has no functions and
survives a JSON round trip), so the ten demo dances are files rather than
TypeScript modules: `data/dances/<slug>.json` is a `ContraDanceSpec` as
written — title, author, a formation **id** (a JSON file cannot hold the
`Formation` object itself), phrases with figure calls and params, `notes`,
and `startPlaces`/`waitOut` where a dance has them (Butter's own) — plus a
`source` block carrying the same provenance every dance file's header used to
carry in a comment: the Caller's Box id, the page URL, its `permission` field
and the quoted A1/A2/B1/B2 transcript. `data/dances/programme.json` holds the
programme's own order, a plain `{ "slugs": [...] }`.

**What a dance file must never hold**: `from` (where each figure's dancers
already stand) and `carried` (which hands cross a figure boundary without
letting go) are both _derived_, not written — `chainCalls`/`contraDance`
compute them fresh at load, exactly as they did when a TypeScript module
called `contraDance({...})` directly. A dance file that tried to write either
by hand would drift from what the figures actually do the first time a figure
changed.

**The loader**, `src/dances/loadDances.ts`: `DanceFile` is `ContraDanceSpec`
with `formation: string` (see `formationById`) and the `source` block added.
`danceFromFile` resolves the formation id, checks every call's figure id is
real (`contraFigureOf`) and every one of its parameter names is something
that figure actually declares (`Object.keys(figure.defaults)`, less `from`
and `carried` — the two the loader itself supplies), then calls `contraDance`
to thread `from`/`carried` through and hand back a `Dance`. A bad dance file
fails at import time, naming the dance, the phrase and the figure or
parameter, rather than failing quietly on stage.

`src/dances/index.ts` imports the ten JSON files as plain Vite/TypeScript
JSON modules (`resolveJsonModule` is on for every package; no code generation
step, no `readFileSync` — the same import works in `vitest`, in `tsc`, and
in the browser bundle, because all three already treat repo-root `data/` as
part of the module graph the same way `packages/hall/src/font/Font.test.ts`
already read `data/corpus/demo-dances.json`), runs each through
`danceFromFile` in `programme.json`'s order, and exports the result as
`DEMO_DANCES` — exactly the shape and the ten dances this package exported
before, now with no TypeScript dance module behind any of them.

**`status: "lab"`** marks a dance that loads but is not shipped: it is exported
as `LAB_DANCES`, is reachable by `pnpm dance <slug>` and by `danceBySlug`, and is
excluded from `DEMO_DANCES` and from the check that every dance file is in the
programme. So the demo never shows a dance that does not dance, and a milestone
encoding a hard dance can commit the record and work on it in the lab. No dance
file sets it yet; the acceptance set's twelve arrive this way from M5.

**The dance lab**, `pnpm dance <slug>`: one dance's whole inner loop — how every
call resolves against the live set, the oracles at every checked line length, the
motion rows for its own figures and seams (over-bound values **fail** unless
`src/dances/motionAllowlist.ts` names a reason), and its four trace SVGs. See
[docs/dance-lab.md](../../docs/dance-lab.md). The pure half is
`src/dances/danceLab.ts`; `src/dances/acceptance.ts` holds the twelve acceptance
transcripts and the list of figure names and relation words the rebuild still
owes, which `acceptance.test.ts` keeps honest in both directions.

**The `figures` key is reserved, not implemented.** The move-data-layer
plan's decision 3 gives `Dance` an optional `figures?: Record<string,
FigureSpec>` for dance-local figures a phrase's calls may reference by name
(M4). `DanceFile` already has room for the same key so a future dance file
does not need every existing file to change shape to gain it, but no demo
dance sets it and this loader does not read it.

### Where the library is a model rather than a transcription

- **The hey** is one weave — `u = U·cos ψ` along the set against
  `v = weavePx·sin 3ψ` across it — walked by all four dancers a quarter of it
  apart. The three in `sin 3ψ` is what alternates the shoulders: right in the
  centre, left at the sides. The passes land on counts 2, 4, 6, 8, 10, 12 and
  14 exactly, which is closer than a hall gets. Since M5 the weave is the
  `schedule` shape kind's rather than the figure's, and what the figure carries
  is the **list of meetings** it is made of — the pass list, `RR NL LR PL RR NL
LR` (D5) — so half a hey is that list's first three, a ricochet is one meeting
  you bounce out of, and ending short is stopping on one. What is a model rather
  than a
  transcription is the ends: the weave reaches `√2 ×` the set's half width, so
  a dancer loops about 6 px outside the line, and the four places are off the
  weave, so everybody steps on to it over `joinBeats` and off it again. Who
  steps off first is the role `start` names, and mirroring the side-step
  mirrors the whole weave.
- **A courtesy turn** is a **half turn of the two bodies**: each of them turns
  exactly 180°, the way round that leaves the lark's feet behind him, from
  facing out of the set when the hands close to facing in when it is over, with
  the robin on the lark's right and both their right hands on her back. The
  couple closes up on to a hold first, wheels, and opens out on to its two
  places only over the last beat and a half, as the hands let go — because a
  couple standing in the lines is 32 px wide and a couple turning is a hold
  spacing, and joined hands on a couple that has already opened out are further
  apart than two arms reach.
- **What the couple's own line does is not free.** Which of the lark's sides
  the robin is on is `bearing(lark, robin) − larkFacing`, and it changes by
  `sweep − bodyTurn`, so a body turn of 180° and a side change together mean a
  sweep of nothing. Both figures arrive with the robin already on the lark's
  right and leave her there, so the line sweeps a clean 180° with the bodies
  and she is on his right at every sample in between. Asking for a 180° sweep
  _and_ a side change describes no motion at all, which is what F5 shipped and
  F7 undid.
- **The pivot sits near the lark** (`pivotFromLark`, a user ruling of
  2026-09-14): he backs round a circle of 2.875 px while she walks the arc of
  the rest of the hold round him — 9 px of walking against her 18 over the two
  beats of the turn. Midway between the two bodies, which is where F7 put it,
  is 18 px each.
- **The hold is capped twice, and is now a sum.** The robin's arc is what has
  to clear the couple turning beside it — their centres are one place pitch
  apart — so `courtesyHold` shrinks _her radius_ until `CLEARANCE_PX` is left,
  which is 5.75 px, and the hold is her radius plus his circle: 8.625 px where
  the library's own hold spacing is 14. It is capped again at
  `COURTESY_REACH_HOLD_PX`, which is how far apart two dancers can stand and
  still have the lark's right hand on the robin's back rather than past the end
  of his arm. A pivot of 0 — the lark turning on the spot — would leave the
  couple turning 5.75 px apart, which is two torsos inside AC6's 8 px, and that
  is why the default is a quarter of the hold and not nothing.
- **The rigid turn is `right-and-left-through`'s, and the orbit is the
  chain's, and since A6 those are the only two.** F13 made the chain's default
  `orbitTurn` (F10's candidate 5): the lark orbits a whole turn backward round a
  circle `hold / 2` off his own place, and the robin joins him at the antipode
  of it at `joinBeat` (2, the user's own number) rather than being walked to a
  reflected take. M4 takes the four earlier candidates away with
  `CHAIN_CANDIDATES`, the app's `?chain=` and `pnpm figure --chain`, and with
  them the chain's `pullBeats`, `bowPx`, `pivotFromLark` and `stepInPx`: an
  orbit has one circle and no pivot to choose. Both regimes are now one shape
  kind, `courtesyTurn` in `src/library/kinds/`, over the same geometry in
  `figures/courtesyTurn.ts`.
- **A roll away** lets the hands go as the roll turns: a dancer spinning a whole
  turn cannot keep a hand on a point 10 px away and still have an arm that
  reaches it.

### The demo dances this library covers

`data/corpus/demo-dances.json` names twelve dances but holds no choreography;
`data/corpus/portland-programs.json` holds the callers' own feature notes, which
is the most this repository can say. Against those notes:

| dance                       | covered | what is missing                                                  |
| --------------------------- | ------- | ---------------------------------------------------------------- |
| Butter                      | yes     | "full hey" — `hey`                                               |
| Heartbeat Contra            | yes     | "Petronellas" — `balance-ring` and `petronella`                  |
| Airpants                    | yes     | "Glossary": standard figures only                                |
| Simplicity Swing            | yes     | "glossary": standard figures only                                |
| A Thing of Trust            | no      | pousette (M8 scope says later)                                   |
| Theory of Mind              | no      | Rory O'More — short waves (later)                                |
| You Can Get There From Here | no      | Rory O'More, give and take (both later)                          |
| Diamond Allotrope           | no      | short waves and a diamond (later); its ricochet hey is here      |
| Spring Break                | no      | its ricochet hey, balances and petronellas are all here          |
| Frederick Contra            | no      | down the hall four in line — a figure that leaves the minor set  |
| Zag It Back                 | no      | slice, weave the line                                            |
| The Judge                   | no      | a diagonal chain — a pairing with a couple outside the minor set |

Two of those are worth calling out as _structural_, not merely unwritten:
**down the hall** and a **diagonal chain** both need dancers who are not in the
group, and a `Group` is one minor set. A figure over a bigger frame — a hall
figure, or a group of eight — is a model change, not another file in here.

## The pair figures — `src/pair/`

The five figures the gate-3 two-dancers spike settled, plus the fall back that
closes its sequence, as parameterised definitions over `@caller/core`'s pose
contract. Behaviour was read from `spikes/two-dancers/index.html` and retyped;
production code never imports from `spikes/`.

This is the **pair page's own model**, and it stays: the G1 goldens and the
nine per-figure strips are pixel comparisons against exactly this code, so
nothing in it has changed. What M8 added is `src/figures/`, the library on
`@caller/choreo`'s group contract — the same dancing, on the engine's terms.
Where a number was settled at gate 3 the library **imports it from here**
rather than restating it: the swing's radius, lateral offset, body turn, hand
drop, back and shoulder hands, lean, flare and buzz feet; the balance's rock
profile, back ratio and lean cap; the allemande's turn radius; the trapezoid
speed profile. Four of those are now `@caller/core`'s own and are re-exported
from here under the names both layers already import — the hanging hand
(`handDown`), the trapezoid profile, the swing's buzz feet (`swingFeet`) and the
`armShortfall` probe; nothing about them is contra, and a second copy is the
only way the two swings could ever put a foot in a different place.

The package exports these six under `pair`-prefixed names — `pairBalance`,
`pairSwing`, `pairAllemande`, `pairDoSiDo`, `pairWalkIn`, `pairFallBack` —
because the library exports a `balance` and a `swing` of its own, and those are
the ones a dance calls.

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
| `allemande` | 8     | `hand` `"L"`, `amount` 1, `inward` 45°, `startFacing` null | One hand at the centre; each body turns `inward` degrees toward that centre so the arm has something to pull against.                          |
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
- **`swing.handOffset` is 5 px** and **`allemande.inward` is 45°**, the two
  gate-3 tweaks, now parameters. The allemande's was 20° at gate G1 and the
  user rejected it — "the torso should be rotated towards the other person so
  the arm is angled _forward_ not back" — so 45° is F1's answer. `handForwardAngle`
  measures it: the joined hand stays 70° forward of the shoulder line for the
  whole of the turn, against 43.2° at 20°.

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
  every take and release has to animate out of somewhere. `handDown` **is**
  `@caller/core`'s `hangingHand` — F3a moved the resting-arm model down into
  `core`, so this package no longer keeps its own copy of the `HAND_HANG_*`
  numbers and there is nothing left for the two copies to disagree about.
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
  flare comes from turning, so both get it — a skirt is decided by a dancer's
  seed and never by their role. Invisible on any surface the renderer's
  `skirts` option is off for, which is everything but the Stage.

## The figure library as data — `src/library/`

A figure **is** data. A `FigureDefinition` says what a figure is — its actors,
its figure-roles, the anchor its shape is drawn about, that shape, its holds,
where it leaves people, its timing and its symmetries — and a **shape kind** in
`src/library/kinds/` draws it. `interpretDefinition(def)` returns the same
`ContraFigure` `contraFigure({ plan })` returns, so a definition and a coded
figure are the same thing to the registry, the decider, `chainCalls`, the three
oracles and the renderer. See
[`docs/adr/2026-09-14-figure-primitive-language.md`](../../docs/adr/2026-09-14-figure-primitive-language.md)
for why the calculus is an expression language rather than flat JSON.

The short version: a hand join round a ring is the midpoint of two dancers'
shoulders **at the beat being drawn**, so a figure language with no
cross-references cannot express a figure this library already ships.
`{ point: "live", role }` is the minimum that can, and it makes the interpreter
a three-pass evaluator — ends, then every role's place at `t`, then hands
against that — rather than a template.

- `library/expr.ts` is the calculus (`NumberExpr`, `AngleExpr`, `RoleExpr`,
  `PointExpr` and their evaluators), re-targeted from stations on to
  figure-roles in M2.
- `library/FigureDefinition.ts` is the data shape, and `library/kinds/` the
  seven shapes that draw one: `rock`, `orbitPair` and `sequence` (M2),
  `ringWalk`, `path` and `courtesyTurn` (M4), and the `legacy` bridge that is
  down to the hey.
- `library/figures/` holds the definitions themselves, and
  `library/symmetry.ts` the `mirror` and `roleSwap` transforms that make a
  circle right the mirror image of a circle left rather than a second figure.
- `library/compareFigures.ts` is the per-figure golden: a definition against the
  coded figure it replaces, in a real set, resolved through the real
  `resolveCall`.

### Timing profiles (M10)

`FigureDefinition.timing.profile` says **how a figure's travel spends its
beats**, and since M10 the walking kinds read it rather than each easing on a
smoothstep of their own.

| profile     | what it means                                                                                                                                                                                                                       | which definitions                                                                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cruise`    | `@caller/core`'s constant-speed trapezoid, ramps of `min(1 beat, leg / 4)` — up to speed in about a beat, hold it, down in about a beat. Peak-over-average 4/3 on a leg of four beats or fewer, 8/7 on eight.                       | `long-lines`, `circle`, `star`, `petronella`, `pass-through`, `roll-away`, `california-twirl`, `right-and-left-through`, `robins-chain`                                                                                                                            |
| `trapezoid` | the figure's own **explicit** four-corner speed window, written out in the shape (`SpeedWindow`) and read by `kinds/orbitPair.ts`. A figure that already says exactly how it accelerates does not need a general rule laid over it. | `swing`, `allemande`, `do-si-do`, `shoulder-round`, `balance-and-swing`, `turn-contra-corners`                                                                                                                                                                     |
| `smooth`    | one smoothstep over the leg: the pre-M10 default, and what a figure that is not a walk keeps.                                                                                                                                       | everything else — `balance` and `balance-ring` (a 1 px rock; the feet are the point), the hey (its weave is already traversed at a constant rate and its two-beat step on and off is deliberately linear), `slide-left` (its `stepped()` pace was ruled by S2 #52) |

Three things ride the travel's profile rather than having one of their own, per
the move-motion plan's Q8: the petronella's spin (it rides the chord's own
progress), the california twirl's `withArc` facing (it rides the arc's sweep),
and the courtesy turn's rotation. The roll-away's spin keeps its own smoothstep,
which is why the roller still turns at her own rate under a cruising walk.

Two of the switches are worth naming. **Long lines** becomes two legs rather
than one curve — four beats down the hall and four back, each with its own ramps
— instead of a single cosine over the eight. And **the chain's orbit** now turns
at a constant rate for the middle of the figure, which puts the lark about 77°
round at the two-beat join instead of 56°; the robin is still handed on to it at
its own analytic speed (`profileSpeed`), so she joins the orbit rather than being
picked up standing still.

The **feet** are not a profile: they are `@caller/core`'s planted gait, applied
by `@caller/choreo`'s `poseAt` to every figure that does not place its own, and
by `kinds/orbitPair.ts` to the walking half of a swing.

**`src/figures/language/` and `src/figures/specs/` are gone** (M4). They were
M1's first pass at the same idea, with the calculus written against stations
rather than figure-roles; their only figure was `circle-data`, which the real
`circle` definition replaces. The proof that made `circle-data` worth having —
the identical `PoseSample` at every 1/8 beat in both formations across every
parameter set — is what `compareFigures` does for all sixteen now.

## The motion oracle and the figure checks (F3a)

Three files and a report, built to make jank _measurable_ rather than to fix
any of it. F3a deliberately fixed no figure: a figure fixed then is a figure
whose defect the instrument never got to prove it could see.

- **`figures/motionBounds.ts`** — how fast a drawn arm is allowed to move,
  derived from this library rather than picked. The fastest legitimate hand
  motion here is a one-beat `takeAndRelease` take; `takeExtremes` finds the
  registry's own worst geometry (a hand 17.8986 px from its hip in
  `right-and-left-through`, lifted to a drop of 0 in `swing`) and
  `deriveTakeMotion` measures what that take does at 1/32 beat. Each bound is a
  **guard at 3×** the measured maximum — 80.44 px/beat of hand, 65.17 px/beat
  of height, 3.6 px of out-and-back — not a tuning target. `motionBounds.test.ts`
  re-derives every one and fails if the code moves underneath.
  **The elbow bound is useless and that is a finding**: a straight take moves the
  elbow at 9.33× the hand's speed, because a hanging hand sits 0.14 px from its
  own shoulder on the floor and the elbow's azimuth is very nearly undefined
  there. Read the report's elbow column against its hand column instead.
- **`figures/figureChecks.ts`** — each figure's `describe` turned into
  `@caller/choreo` trajectory assertions, with the windows taken from the
  figure's own declared joins where there is one.
- **`figures/knownWrong.ts`** — the fourteen assertions that fail today, each
  with its measurement and one line of why. `figureChecks.test.ts` holds both
  halves of the contract: everything **off** the list passes, everything **on**
  it still fails, so a fix has to delete its row. Nothing is skipped and nothing
  was loosened.
- **`pnpm report:motion`** writes [`docs/motion-report.md`](../../docs/motion-report.md):
  the derived bounds and their derivation, the ten worst figures and the ten
  worst seams over the ten demo dances, every figure measured alone, the
  known-wrong table, every assertion with its evidence, and what every figure
  says it does.

Every figure in `createContraRegistry()` carries a `describe`: two to four
sentences of what the dancers do, in a caller's words. `star` and
`california-twirl` are marked `(unsure: …)` — a caller should correct those
two. `slide-left`'s marker is gone: S1 settled it as a sidestep with the torso
square to the other line, danced in two steps, and the figure now says so.

**`describe` is the fallback now, not what the app shows** (W1). Every move's
prose lives in `data/figures/<id>.json` — a short and a long walkthrough, a
short and a long call, each a template over that figure's own parameters —
loaded by `src/text/`. `resolveFigureText(id, params, group)` fills every slot
from one call's own tuning, and `landmark(def, params, group)` writes the last
sentence of the long walkthrough from `FigureDef.ends`: "you should be across
the set from your partner, next to your neighbor". See
[`docs/move-texts.md`](../../docs/move-texts.md) for the voice and the slot
vocabulary. `describe` stays on the figure contract until the cleanup that
removes it.
