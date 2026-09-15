# Figure texts as three registers, the ending hint at the seam, and the calling card as a computation

Date: 2026-09-15
Status: accepted

## Context

A caller's app has to say four different things about one figure, and they are
not four lengths of one thing:

- what the figure **is**, in the third person, for somebody browsing a library;
- what the dancers **do**, in one sentence and in a whole teach;
- what the caller **says** over the band, at whatever length there is room for;
- where the figure **leaves you** — "your neighbor is beside you" — which is not
  a fact about the figure at all.

W1 wrote the first three into `data/figures/<id>.json` as four texts (a short
and a long walkthrough, a short and a long call) and generated the fourth into a
`{where}` slot at the end of the long walkthrough. The user then read the whole
set and ruled on the language (`docs/move-texts.md`, drafted from those
rulings): no negatives, no gendered word for a role, "once and a half" rather
than "one and a half", "three places" rather than "three quarters", places
rather than couples' widths, never the view from the balcony. And on the
fourth:

> "something that will really simplify this is that we can omit from the core
> language who ends where. The caller can handle that. I really like the 'Your
> neighbor is beside you.' bit at the end. so useful. … that is, the ending
> hints are good, and they can be outside the language."

Three things made the W1 shape wrong under that ruling and under the figure
model that landed with it:

1. **`{where}` was inside the written language.** A figure's text ended on a
   sentence generated from `FigureDef.ends` over a hands-four _template_, which
   is neither where a dance has its dancers nor a question every figure can
   answer. The same circle left three places leaves a becket dancer across from
   their partner and a duple dancer beside them, and the sentence a caller
   actually says is about **what comes next**, not about the figure.
2. **The call was two strings.** A caller says the whole sentence the first time
   through and one word the fifth, and which one fits depends on how many beats
   of silence the call before it leaves. Two strings cannot express that, so the
   card printed the dance file's own `call` and the bubble said the same string,
   and the two agreed only because both read one field.
3. **The texts were keyed on the coded figures' parameters.** The figure model
   (`2026-09-15-figure-model-set-state-and-resolution.md`) made a figure a
   `FigureDefinition` with a `ParamSpec` of shorthand names, and a call's `who`
   a relation word the set resolves.

## Decision

### Seven texts per figure, as data, keyed on shorthand

`data/figures/<id>.json`, one file per library definition (plus the two figures
`@caller/choreo` supplies), hand-editable JSON with no build step:

```json
{
  "id": "do-si-do",
  "description": "Two dancers walk round each other back to back and return to place.",
  "defaultLevel": "name",
  "walkthrough": { "line": "…", "teach": "…" },
  "call": { "4": "{who} DO-SI-DO {amount}", "2": "{who} DO-SI-DO", "1": "DO-SI-DO" },
  "variants": { "amount=1": { "call": { "4": "{who} DO-SI-DO" } } }
}
```

The call forms are keyed by **how many beats the words take to say**, which is
what makes the register a number the fitting rule can compare rather than a name
a person has to choose. Slots name the **shorthand parameters the definition
declares**, plus the two things a _call_ carries and a figure does not: `{who}`,
the dancer this call names, and `{to}`, the dancer a chain lands you with.

**One relation word table** (`packages/contra/src/text/relationWords.ts`) says
who a relation is, in two registers — `PARTNER` / "your partner", `NEXT
NEIGHBOR` / "your next neighbor", `ROBINS` / "the other robin" — and every text
in the app names a dancer through it. Before this the pairing words were a table
inside the loader and the hint had a second set of its own.

Texts stay in `data/` rather than moving beside each `FigureDefinition` in
TypeScript because **callers edit them** (roadmap R7): a caller correcting a
sentence should not need a build, a type checker, or a pull request that
recompiles the engine.

### Where a figure leaves you is generated at the seam, and never written

`{where}` is gone from the language. The sentence is computed at each **call
boundary** from the planner's own honest ends — `danceBoundaries(dance,
formation)` dances the dance headlessly on a probe line and reports every
dancer's spot, holds, slot and partner at every boundary, with the instances on
either side — and `seamHint` turns that into the user's own form: "Your neighbor
is beside you. Your partner is across from you."

Five shapes over eight places and nothing else is ever said, so a hint that
reads wrong is a rule to change in one file rather than prose to rewrite in
forty-five. It is said **only when something changed**: silent when the next
call puts you with the dancer this one did, silent when the next call pairs
people and leaves you out, silent before a ring or a line unless a role has just
danced on its own. It splits by role when the roles disagree and stands down
entirely when the four dancers disagree about something finer than their roles,
because anything finer is not a sentence a caller says. Where the model says a
hand is joined, it says so — "your neighbor is in your left hand" — whatever the
geometry says about distance.

The same vocabulary answers the figure-level question the Moves page asks
(`landmark`), so the two surfaces say one thing one way.

### The calling card, the note card and the bubble are one computation

`callScript(dance, timeThrough)` and `callingCard(dance)` are one function read
two ways — along a time through, and down the record. A call is said at the
longest of its forms that fits two numbers:

- the **window**, `min(4, beats(previous call))`: how many beats of silence the
  call before this one leaves, bounded by how far ahead a caller speaks;
- the **budget**, `[4, 2, 2, 1]` per time through by default and `Dance.callBudgets`
  where a record says otherwise: how much a caller is still saying this many
  times through.

Where the window is too short for a whole sentence and the budget is not, the
call is said in the same breath as the one before it, inside its own phrase —
"SHIFT LEFT, CIRCLE LEFT THREE PLACES". Two figures danced **at once** are one
call, their forms of the same length joined by `WHILE` and their beats summed.

The bubble reaches it through a form-neutral hook on the script decider,
`callsFor(dance, timeThrough) => { offset, text, beats? }[]`, supplied by the
app's composition root. `@caller/choreo` carries beats and text and learns
nothing contra, which is the dependency rule the whole engine rests on.

### A dance file's `call` is a flourish, and only ever that

Every call whose words any of its figure's own forms can say has had its `call`
deleted — 119 of them across the twenty-one records — and a test refuses one
that creeps back. What is left is the line no form can say: Butter's "SHIFT
LEFT", After the Solstice's "AND SWING", The Carousel's "FULL HEY FOR FOUR", and
the corpus's own phrasings in the dances added since the vision.

### A schedule figure's teach is generated from its schedule

The hey's teach is a **list**, and there are more heys a caller can ask for —
half a hey, by the left, a ricochet on one pass, a hey for three, a diagonal
one, one that ends short — than anybody will write teach texts for. So the file
keeps the opening sentence and `scheduleTeach` reads the rest off the pass list,
one clause per meeting, in the user's own shape.

### A caller's edits are an overlay, keyed by phrase and figure

`Dance.teach`, keyed `<phrase>/<figure>` (`/2` for a repeat, a branch by its own
figure name, `opening` and `wrap` for the two dance-level sentences), each edit
writing any of `before`, `after` and `replace`. **Generated text is never
written to disk**: the moment it is, re-encoding a dance or correcting a
figure's words stops reaching the dances that were corrected. A stale key warns
at load and the dance still loads, because a re-encoding must not take a dance
off the programme.

### The words the hall hears come from the words it reads

Each formation supplies its walkthrough opening beside its line-up calls
(`Formation.walkthroughOpening`), and becket's bubbles say "CIRCLE ONE PLACE TO
YOUR LEFT … YOUR PARTNER IS BESIDE YOU" — the user's own sentence, in the
vocabulary the card is written in.

## Alternatives

- **A text per cell of the register grid** (Q1) — six texts per figure, written
  out. Rejected: the grid is two axes, not one ladder, and the call axis is
  derivable from three forms and a number.
- **The landmark attached to the figure** (W1, Q2). Rejected: it is a fact about
  the figure _in this dance_, and W1's own version read a hands-four template
  that no dance's dancers are standing on.
- **Texts beside each definition in TypeScript.** Rejected: callers edit these,
  and a build step between a caller and a sentence is the thing this format
  exists to avoid (R7).
- **Calls stored per dance** (D7, as amended by the vision's §3). Rejected: the
  same figure is said five different ways across one evening, and storing the
  words per dance is what made the corpus's vocabulary — "ONE AND A HALF",
  "THREE QUARTERS" — the app's.
- **Storing the generated walkthrough** so a caller can edit it. Rejected in
  favour of the overlay, above.

## Consequences

- One vocabulary. Adding a relation word, or changing "three quarters" to "three
  places", changes every card, every hint and every bubble at once.
- `docs/move-texts.md` is the user's own document plus the file format, and
  `packages/contra/src/text/figureText.test.ts` enforces every rule in it a
  machine can check — over the written texts **and** over every text of every
  figure a programme dance calls, resolved.
- A figure whose texts name a dancer the vocabulary cannot say fails at **load**,
  by name. A generated tuning on the Moves page catches that and shows no call
  line, because a row for a tuning nobody has written prose for is not a fault.
- The dance page, the Stage's note card and the caller's bubble cannot drift:
  `apps/web/src/callsFollowTheCard.test.ts` dances the evening and compares what
  the caller said with what the card prints, dance by dance.
- The hint's rules are pinned by a count — 47 of the programme's 105 seams speak
  — so a change to when it speaks is visible in the diff rather than only on the
  page.

Links: [`docs/move-texts.md`](../move-texts.md),
[the figure model's ADR](./2026-09-15-figure-model-set-state-and-resolution.md),
[dances as files](./2026-09-14-dances-as-files.md),
[`docs/dance-record.md`](../dance-record.md).
