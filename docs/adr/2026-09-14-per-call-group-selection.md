# Per-call group selection, and the two outs

Date: 2026-09-14
Status: accepted

## Context

Every figure in the library so far dances inside one minor set of four.
`Formation.groups(set)` was asked once per time through, the decider played
the whole dance into each group it got back, and any couple left over was
handed `wait-out` for the length of the cycle by a branch that ran before the
schedule did.

A large part of contra does not fit in that. A shadow allemande reaches into
the minor set above or below; "on the left diagonal, ladies chain" moves two
dancers across a seam; long lines forward and back is the whole line, and the
couple standing out joins in ("dancers standing out normally do participate in
long lines forward and back" — the user); "down the hall" sweeps the couple out
at the bottom along with everybody else. None of these is a different _figure_
from the one danced inside a four. What differs is **who is in the group**.

The first design for this was a merge: a form-neutral `mergeGroupPlans(a, b,
pitch)` gluing two adjacent `GroupPlan`s into one eight-station group for a
call marked `wide: "up" | "down"`. It was built as far as a design and then
withdrawn. The user, asked directly, ruled: **"I think per call makes sense
rather than merging, yes."**

Two independent problems with the merge stand behind that ruling, and both are
worth recording because they are the reason the shape below is what it is.

1. **The merge double-claims.** Each group finding "my one neighbour" and
   widening toward it means every interior group is merged twice — once as
   somebody's far side and once as its own near side. Nothing in the merge's
   own shape prevents it; it would have had to be prevented by convention, and
   the mechanism never got far enough past design for anyone to notice.
2. **The geometry was wrong anyway.** Re-reading the corpus, every genuinely
   cross-group figure names a wave or a chain of **four total** dancers, not
   eight: "form a wave of four with N2", "shadow allemande", "on the left
   diagonal, ladies chain to shadow". A seam is 2 + 2, not 4 + 4.

## Decision

**Groups are formed per figure call, by a selector resolved over the whole set
into a partition.**

### The contract

```ts
/** Open, like `Selector`: one built-in meaning, the rest formation-defined. */
type GroupSelector = "hands-four" | (string & Record<never, never>);
const HANDS_FOUR_GROUP: GroupSelector = "hands-four";

/** `"set"` dances the call; the other two are the two outs. */
type GroupKind = "set" | "wait-top" | "wait-bottom";

interface GroupPlan {
  id: GroupId;
  kind: GroupKind; // was `"set" | "wait"`
  frame: Frame;
  stations: readonly Station[];
  members: Record<StationId, DancerId>;
  couples: readonly CoupleId[];
}

interface Formation {
  // …
  group(n: number): Station[]; // unchanged, still the wait layout's only name
  groupFor(selector: GroupSelector): Station[]; // new: the authoring template
  groupsFor(selector: GroupSelector, set: SetState): GroupPlan[]; // was groups(set)
  tags(selector: GroupSelector): Record<string, StationId[]>; // was tags(n)
}

interface FigureCall {
  // …
  group?: GroupSelector; // default "hands-four"
}
// `ContraCall` gains the same field, and `chainCalls` carries it through.

function resolveSelector(
  who: Selector | undefined,
  formation: Formation,
  group: GroupSelector, // new: was inferred from `stations.length`
  stations: readonly Station[],
): StationId[];
```

### Why a partition rather than a merge

`groupsFor` returns **a partition of the set for that one call**: every dancer
in exactly one resulting `GroupPlan`, dancing and standing out alike. This is
the whole reason for the shape. `Timeline.add()` already refuses to bind a
dancer into two figures over overlapping beats, so a `groupsFor` that is not a
true partition fails loudly the first time a dance exercises it — where the
merge's double-claiming would have had to be avoided by everyone remembering
to avoid it. Double-claiming is now impossible by construction rather than by
convention.

`src/testing/assertPartition.ts` checks the property one step earlier still,
against a formation rather than against a danced timeline, so a new selector
can be proved right before any dance is written on it.

### Why per call rather than per time through

Two calls of the same dance may draw their dancers from different widths — a
diagonal chain in A2 and an ordinary swing in B1 — so the width cannot be a
property of the time through. Resolving per call also means the _call_ is the
thing that says how wide it reaches, which is how a caller thinks of it, and
leaves `who` doing exactly the job it already did: picking dancers _within_ a
group, in the wider layout as in the narrow one.

### Why `tags` is keyed by selector

A `"shadow-pair"` seam group and an ordinary `"hands-four"` group are both four
stations, so a station count cannot say what a tag means. `resolveSelector`
already filters a tag's station list down to the ids the call's own group
actually has, so **one** abstract definition per selector is correct at every
runtime instance of it — the six-station shape at a true end of a line and the
plain four in the interior alike.

### Two outs, not one

`GroupPlan.kind` distinguishes `wait-top` from `wait-bottom` from this change
onward, closed. The user: _"there are two outs in contra: top out and bottom
out. I think that's a good model though."_ They behave differently — the top
out is the couple "hands four from the top" is reckoned from and the one long
lines addresses; the bottom out is the one a "down the hall" sweeps along, and
the one a becket line's shift pushes off the end — and which end a couple is at
therefore decides which calls can ever claim it.

Every formation already carried the signal: it is what decides whether a
waiting couple's frame is turned end for end. Duple improper reads it off the
leftover couple's own travelling direction (the scan pairs a couple travelling
down with the couple travelling up below it, so the only leftover travelling up
is the one at the top and the only leftover travelling down is the one at the
bottom); becket reads it off the slide direction the same way. Surfacing it on
`kind` means no later consumer has to derive it again, and no closed union has
to be widened after it shipped.

### The decider's waiting-couple special case is gone

It used to run before the schedule: a `"wait"` plan got one whole-cycle
`wait-out` and the schedule was skipped for it entirely. Now every call
resolves its own partition, a group the call's selector did not put to work is
simply not danced, and after the schedule whatever beats nobody claimed for a
couple standing out are filled with `wait-out`. With `"hands-four"` the only
selector any call names, nothing ever claims them and the fill is the whole
cycle — byte-identical to the special case, by the general path.

## Consequences

- **No observable behaviour changes.** `docs/motion-report.md` regenerates
  byte-identical; every golden and strip is untouched.
- Group ids change (a fresh `Group` per call per plan rather than per cycle).
  Nothing reads a group id but `Timeline.group()`, which is a lookup.
- The two-station tag tables the contra formations kept under `tags(2)` are
  gone. Nothing reached them: `resolveSelector` is the only caller of `tags`,
  and a waiting group never went through it — `wait-out` is emitted over all
  of a group's members directly. Under the new contract a couple standing out
  that _is_ swept into a call is in that call's own wider group, whose tags are
  that selector's, so the two-station table has no successor rather than a
  renamed one.
- `chainCalls` carries `ContraCall.group` through to the threaded `FigureCall`
  and resolves `who` against it, but still threads a dance's places through the
  single dance-wide `group(4)` template. Widening `places` to the union of every
  template a dance's calls use is the work that lands with the first selector
  that needs more than four stations.
- Formations throw for a selector they do not define. `"shadow-pair"`,
  `"line"` and `"set"` are named in the plan and implemented by nothing yet; a
  dance that asks for one gets an error rather than quietly dancing in fours.

## Alternatives rejected

- **`mergeGroupPlans(a, b, pitch)` with a call-level `wide: "up" | "down"`** —
  the superseded design. Double-claims by construction; its eight-station
  geometry does not match what the corpus actually calls; and the direction
  field it needed is exactly the thing that has to be formation-specific, since
  becket's shadow is progression-relative rather than geometric. Under a
  seam-scoped partition each station's own progression decides which seam it
  belongs to, and the call never says "up" or "down" at all.
- **A permanent wide `Group`** — every figure would carry neighbour data it
  never reads, and `Group`'s one-frame-per-station invariant breaks.
- **Widening `tags` with an overload rather than replacing it** — a grep found
  `resolveSelector` to be the only caller of the numeric signature, so there
  was nothing an overload would have preserved but the ambiguity itself.
