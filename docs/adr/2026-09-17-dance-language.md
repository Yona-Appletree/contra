# The dance language: one text for the tree and the timeline

Date: 2026-09-17
Status: accepted (round 1, on the user's look: "this looks really good"); round 2's amendments below are proposed for its gate G1

## Context

Engine 3 (the kinetics package; its vision is
`Planning/contra/_archive/2026-09-16-2348-kinetics-model/vision.md`) had,
after its first bite, a small dance language whose words — `partner`,
`neighbor`, `across`, `hands-four` — were offsets on a lattice owned by a
formation-specific "dialect". What it did not have was the structure of the
dance: the user (2026-09-17) — _"everything is in relationship to groups …
'the major set' is a group, 'the minor set' is a group, 'partner' is a group,
and the selections act on groups"_; _"the script for a move … declares what
groups (and their types) it expects"_; _"the dances, figures, etc shouldn't
care if they're in a contra, but they should care if there are certain
groups and anchors available"_. After the first round shipped, the user's
visioning walk (`Planning/contra/2026-09-17-1215-dance-language-2/vision-walk.md`)
asked for the general model: _"making progression a primitive feels wrong
… all of those things happen at once. And the invariants hold."_

## Decision

One language, OpenSCAD-like, **one kind of module**. What a statement emits
decides which pass reads it:

- The **space words** — `place`, `anchor`, `group`, `provide`, `dancers` —
  are read once, for nobody, to build a static tree of groups, places and
  anchors in metres, with `translate`/`rotate`/`mirror` and the frame's own
  `fwd`/`back`/`left`/`right` in OpenSCAD's order. A group **provides** `$`
  variables as relation expressions and **functions** (`provide progress()
{ … }`) as bodies of reassignments. Places carry roles; anchors are
  points, lines or directions (one frame, three uses).
- Everything else is read once per dancer, with a cursor, to build the
  timeline: calls to moves (a module with an `ir` line, whose `$`
  parameters are its contract), calls to other modules inlined with the
  caller's block as `children()`, `repeat`/`for`/`if`/`match`, `assert`,
  and the annotations `card` and `say`. A dance owns its floor: the
  `group becket(…)` line sits in the dance.

The one-sigil rule: `$name` is the only sigil, bound from the tree the
dancer stands in at that beat, innermost group first; `$kind-name` binds
the innermost group of that kind; bare names are lexical; types never ride
on the sigil. A `$` the floor provides nowhere is a compile error with a
span; one that is provided but finds nobody is an end effect. Contracts are
structural: names and types, never "is a contra".

**Dancers are instantiated in setup** by `dancers;`, under ordinary
conditionals. A dancer is `{ id, role, place }`, the only mutable state,
changed only by **events**: reassignments (`$minor-set = …`, `$couple =
"twos"`, `$place = …`, `$role = …`) queued during a beat and **committed as
one transaction** when every dancer at that beat has reached the sync
point (`progress()`), the reads within the beat having seen the state
before it; the invariants (no place with two dancers, nobody nowhere) are
checked at the commit. The dance is therefore evaluated in **lock-step**,
every dancer together, a beat at a time. **No progression is a primitive**:
each formation writes its own as a provided function, and role swaps,
moving between lines and odd progressions are the same reassignments.

The compiler complains, in **tool-building mode**: one diagnostic shape
for every layer — code, message, span with a caret, beat, dancers, a trace
through the layers, a suggestion — rendered as rustc-shaped text, as JSON,
and in the debugger; floor checks for overlap, hands without a hold, drift,
phrase asserts, desynchronised threads and asymmetric selections; a `dance
check` CLI with a non-zero exit.

The language opines: kebab-case names, TitleCase types and enum members,
declared enums tested with `is`, `;`-terminated statements, `//` comments
only, `for i in 0..n`, a canonical formatter and a linter shipped with the
parser, every `.dance` file in the repo held format-stable.

## Alternatives considered

- Two languages, one for structure and one for time. Rejected: the same
  expression language, types, `$` scoping and modules serve both; the
  emission decides the pass.
- Three module keywords (`formation`, `move`, `dance`), as round 1 shipped.
  Rejected on the user's question _"how do I know which to use?"_: the
  emissions are typed, the module is not, and a wrapper module (a phrase,
  a hall) is neither until you see what it wraps.
- A `setup { }` block to make the two passes visible. Rejected: the space
  words already mark the pass per line, and a called module carries its
  own setup.
- Nominal contracts (`requires contra`). Rejected on the user's ruling.
- Progression as a built-in per formation kind (`duple-progression`), as
  round 1 shipped. Rejected: _"how do you model swap-role dancers? Moving
  between lines? Odd progression dances?"_ — reassignment events with a
  validator are more general and expressible.
- Places as the only fixed things, with couples and minor sets formed by
  rule. Deferred: the declared tree with `$minor-set` reads better, and the
  half-pitch layout keeps every position the lattice's.
- Sigils per type (`@anchor`, `#group`). Rejected as Perl.

## Consequences

The dialect's relation tables and the progression built-ins are gone;
every formation on the user's list is a `.dance` file, and a new one is a
file too. Figures know nothing of contras. Time is the order of
statements, one thread per dancer; there is no `meanwhile`, because one
dancer cannot do two things at once and the scheduler joins the threads
into figure instances — the desync and asymmetry checks keep that honest.
A motion defect is a diagnostic to add before a fix. Moves in the language
(replacing the `ir` line), then the chain and the hey, are the next
rounds. A new language costs its tooling: editor support is a follow-up.
