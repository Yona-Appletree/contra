# The dance language: one text for the tree and the timeline

Date: 2026-09-17
Status: proposed (to be accepted at the dance-language plan's gate G1)

## Context

Engine 3 (the kinetics package, `docs/adr` has no ADR for it yet; its vision
is `Planning/contra/_archive/2026-09-16-2348-kinetics-model/vision.md`) had,
after its first bite, a small dance language whose words — `partner`,
`neighbor`, `across`, `hands-four` — were offsets on a lattice owned by a
formation-specific "dialect". What it did not have was the structure of the
dance: the user (2026-09-17) — _"everything is in relationship to groups …
'the major set' is a group, 'the minor set' is a group, 'partner' is a group,
and the selections act on groups"_; _"the script for a move … declares what
groups (and their types) it expects"_; _"the dances, figures, etc shouldn't
care if they're in a contra, but they should care if there are certain
groups and anchors available"_.

## Decision

One language, OpenSCAD-like, three kinds of module:

- A **formation** builds a static tree of groups, places and anchors in
  metres, with `translate`/`rotate`/`mirror` in OpenSCAD's order. A group
  **provides** `$` variables as relation expressions over a few built-ins;
  places carry roles; anchors are points, lines or directions (one frame,
  three uses).
- A **dance** sequences moves in beats, compiled once per dancer from their
  own place in the tree.
- A **move** declares its contract as `$` parameters and names its figure IR.

The one-sigil rule: `$name` is the only sigil, bound from the tree the
dancer stands in at that beat, innermost group first; `$kind-name` binds the
innermost group of that kind; bare names are lexical; types never ride on
the sigil. A `$` the formation provides nowhere is a compile error with a
span; one that is provided but finds nobody is an end effect (the move
stands). Contracts are structural: names and types, never "is a contra".

Membership — who stands where — is the only mutable state, declared rather
than measured: bodies move continuously; membership changes only at
`progress()`, which runs the formation's own `next`. The lattice's truth
that a progression moves a couple half a minor set along the hall is kept by
laying minor sets at half their own length apart and seating every other
one.

The language opines: kebab-case names, TitleCase types and enum members,
declared enums tested with `is`, `;`-terminated statements, `//` comments
only, a canonical formatter and a linter shipped with the parser, every
`.dance` file in the repo held format-stable.

## Alternatives considered

- Two languages, one for structure and one for time. Rejected: the same
  expression language, types, `$` scoping and modules serve both; the
  module keyword decides what a body may contain.
- Nominal contracts (`requires contra`). Rejected on the user's ruling:
  a promenade needs a couple and something to go around, not a contra.
- Places as the only fixed things, with couples and minor sets formed by
  rule (truer to the drifting lattice; costs the declared reading of
  `$minor-set`). Deferred to the gate as a question.
- Sigils per type (`@anchor`, `#group`). Rejected as Perl.

## Consequences

The dialect's relation tables are gone; every formation on the user's list
(proper, improper, becket, reverse becket, triple minor, square,
four-face-four, big circle) is a `.dance` file, and a new one is a file too.
Figures know nothing of contras. The debugger draws a formation from its
text with nobody on it, and the tree in time. The chain and the hey, whose
line of four is the first transient group, are the next bite. A new
language costs its tooling: a CLI and editor support are follow-ups.
