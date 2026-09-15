# How the moves are written: the voice rules

These are the rules for every piece of text in the app that a dancer or a
caller reads: the name of a move, the sentence that teaches it, the words a
caller says over the band, and the sentences the app writes itself about
where you are. They are written for callers to read and correct. Where a rule
has an example, the example is the standard; if a rule and its example
disagree, the example wins.

Drafted 2026-09-14 from Yona's rulings; to be refined with Lindsey and Koren.
The file format the rules are written into is the last section, "The file";
`packages/contra/src/text/figureText.test.ts` enforces every rule above that a
machine can check, over both the written texts and the texts resolved against
every dance in the programme.

## 1. Speak from where the dancer stands

Every sentence is something you do, hold, see, or feel from your own spot in
the set: your hands, your facing, who you see, who you hold.

Never describe the set from above. "The whole line slides left" is the view
from the balcony, and nobody on the floor can check it.

> Take hands in long lines up and down the set. Larks facing in, robins
> facing out. Your partner is in your right hand.

A formation, a hold, a wave: all described the same way. The hold, the facing
for each role, and who is in which hand. The opening of a becket dance:

> Take hands four from the top, then circle one place to the left. This is a
> becket dance, your partner is beside you. You will progress to the left.

## 2. Say what to do, never what to avoid

No negatives. "Nobody takes hands", "without turning", "it is a sidestep, not
a walk round" all tell the dancer what is wrong instead of what is right.

Instead of:

> The whole line slides one couple's width along to its own left, so you find
> yourselves facing a new couple. It is a sidestep, not a walk round.

say:

> Look on your left diagonal and identify your new neighbors. Slide left two
> places along the set until you are across from them.

## 3. The three things a walkthrough says, in order

1. **With whom.** "Do-si-do your neighbor."
2. **Which side.** "Pass by the right shoulder." "Take left hands."
3. **How far.** "Once and a half." "Three places."

Where you end is never written. The app works it out from the simulation
and adds it after the move, in the dance where the move is danced, because
the same circle left three places leaves you somewhere different in every
dance. See section 8.

## 4. Second person, imperative, present tense

"Take hands." "Walk forward." "Look across the set." Every sentence is an
instruction or a thing to notice. No sentence explains why a move exists,
says how it looks, or praises it.

No adjectives about the move: graceful, flowing, elegant. No hedges: usually,
typically, in most halls. No parentheses. No "note that". If a sentence is
uncertain, cut it.

## 5. The words

- **Roles:** robins and larks. Never a gendered word or pronoun for a role.
  Not "his left in her right"; "the lark's left hand in the robin's right",
  or "your left hand in theirs".
- **People:** partner, neighbor, shadow. "The other robin", "the other
  lark" for the two of a role.
- **Turns for two:** "once around", "once and a half", "twice around". Never
  "one and a half".
- **Round a ring:** places, where a place is a quarter of the ring. "Circle
  left three places." Never "three quarters".
- **Along a line:** places, where a place is one dancer's spot. A slide left
  is "two places", one minor set's width. Never "one couple's width".
- **Places in the set:** across the set, beside you, along your own line, on
  the left diagonal, on the right diagonal, up the hall, down the hall, home.
- **Hands:** "in your right hand", "in your left hand". "Take hands four."
- **Turn and circle:** "turn" is on the spot, a change of facing: "turn to
  face your partner", "turn around". Moving round the ring is "circle":
  "circle one place to the left". Never "turn one place", which sounds like
  turning in place.
- American spelling: neighbor, center, toward.

## 5a. Words callers use that dancers never hear

Callers have a vocabulary for talking to each other that is never said to
the hall: improper, duple, becket as a bare label, minor set, hands-four as
a noun, progression. The texts here are said to dancers, so they describe
what the dancer does instead. The opening of a duple improper dance:

> Take hands four from the top. Larks on the left, robins on the right,
> facing up and down the set.

and, as the app's hint under it: "Your partner is across from you. You are
facing your direction of progression."

The full list of caller-only words is to be spelled out; this section is
the place for it.

## 6. The calls

What the caller says over the band, in capitals, said in rhythm. Every move
has three forms, and each form has a length in beats:

| beats | example                             |
| ----- | ----------------------------------- |
| 4     | WITH YOUR PARTNER BALANCE AND SWING |
| 2     | BALANCE AND SWING                   |
| 1     | SWING                               |

| 4 | ROBINS CHAIN TO YOUR PARTNER |
| 2 | ROBINS CHAIN |
| 1 | CHAIN |

The 4-beat form and the move's name in a walkthrough are coloured by part:
who, what, which way, how far. The short forms are plain.

The first time through a dance the caller says the long form. Later times
get shorter, down to one word or nothing. The words a caller can fit before
a move are limited by the move before it: a two-beat slide leaves room for
two beats of words, so short moves get called together ("SHIFT LEFT, CIRCLE
LEFT THREE PLACES").

## 7. The levels

A move in a dance walkthrough is shown at one of two levels:

1. **The name.** "Neighbor balance and swing."
2. **The mechanics**, one sentence under the name, with where you end.
   "Take both hands, rock in and out, then swing."

Every move has a default level. Common easy moves show the name alone.
Unusual moves (contra corners, a slice, a hey in a new hall) open at the
mechanics. One "more" switches between them, and "show" opens the move
itself: start position, the animation, end position, and the **full
teach**, the whole thing in a caller's words.

The full teach for a hey, which is the standard for length and tone:

> Note where you are standing. You will return here after walking across the
> set. Robins start by passing right shoulders in the middle, neighbors by
> the left on the outside, loop around, partner by the left on the outside,
> neighbor by the right in the center, face your partner on your side.

## 8. Where you are: the sentences the app writes

After a move the app says where you are, worked out from the simulation.
Two short sentences, one for your neighbor and one for your partner, each
"who is where":

> Your neighbor is beside you. Your partner is across from you.

The places: beside you, across from you, on your left diagonal, on your
right diagonal, along your line, behind you, in your right hand, in your
left hand.

Shown with the mechanics line and the full teach, under "more"; a move
shown by its name alone shows no hint.

Said only when something changed: if the next move is with the person you
just danced with, nothing is said. When the two roles are in different
places, the sentence splits by role: "Robins: your partner is across from
you. Larks: your partner is beside you."

Before a move that takes you to new people, the sentence names them first:
"Your new neighbors are on your left diagonal." Then the move.

## 9. Lengths

| text               | budget                                      |
| ------------------ | ------------------------------------------- |
| the mechanics line | one sentence, under 25 words                |
| the full teach     | under 80 words; the hey above is the length |
| 4-beat call        | under 9 words                               |
| 1-beat call        | one or two words                            |

## To refine with Lindsey and Koren

- When is the where-you-are sentence unwelcome? The rule now is "only when
  something changed". Is that too often, or not often enough?
- The one-beat call forms. "BALANCE" for a balance and swing, "LINES" for
  long lines, "THROUGH" for a pass through: which of these does a caller
  actually say?
- Whether to speak in hands ("your partner is in your right hand") whenever
  the dancers are holding on, or only for waves and lines.
- Which moves open at the mechanics line by default.
- Any word above that is not what a caller says.

---

## The file

One file per figure the library holds, at `data/figures/<id>.json`, plus the
two the engine supplies (`wait-out`, `walk-to-station`). A **dance-local**
figure's texts live in its own dance file, under the definition's `texts` key,
so that promoting the figure is a copy of one thing rather than of two.

```json
{
  "id": "do-si-do",
  "description": "Two dancers walk round each other back to back and return to place.",
  "defaultLevel": "name",
  "walkthrough": {
    "line": "Pass right shoulders with {who}, slide back to back, and back up passing left shoulders, {amount}.",
    "teach": "Walk forward and pass right shoulders with {who}, … Go {amount}."
  },
  "call": {
    "4": "{who} DO-SI-DO {amount}",
    "2": "{who} DO-SI-DO",
    "1": "DO-SI-DO"
  },
  "variants": {
    "amount=1": { "call": { "4": "{who} DO-SI-DO" } },
    "who=robins": { "walkthrough": { "line": "…", "teach": "…" } }
  }
}
```

- **`description`** — one sentence, third person, under 20 words, no "you" or
  "your". What the figure is, for the Moves page's own line.
- **`defaultLevel`** — `"name"` or `"line"`: whether a dance walkthrough opens
  this figure's entry on its name alone or on its mechanics line. Common easy
  figures open on the name; unusual ones open on the line.
- **`walkthrough.line`** — the mechanics, one sentence, under 25 words (§7's
  level 2).
- **`walkthrough.teach`** — the full teach, under 80 words (§7's "show").
- **`call`** — keyed by how many **beats** the form takes to say. Every file
  writes `"4"`, `"2"` and `"1"`; a caller may add others. Capitals, digits,
  spaces and the hyphen of `DO-SI-DO`; lowercase only inside a `{slot}`. Every
  form is at most 9 words and the `"1"` form is one or two.
- **`variants`** — `"<param>=<value>"`, applied in the order they are written,
  each overriding the last, any subset of the shape above. `<param>` is a
  shorthand parameter the figure's `FigureDefinition` declares, or `who` / `to`.

### The slots

A text is a template. `{slot}` names a **shorthand parameter of the figure's
definition**, or one of the two things a _call_ carries rather than the figure:

| slot                                                                     | what it is                                                               | call                                                                                                                  | prose                                                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{who}`                                                                  | the dancer this call names — its pairing parameter, or its role selector | `PARTNER`, `NEIGHBOR`, `NEXT NEIGHBOR`, `PREVIOUS NEIGHBOR`, `SHADOW`, `OPPOSITE`, `NUMBER THREE`; `ROBINS` / `LARKS` | your partner, your neighbor, your next neighbor, your previous neighbor, your shadow, your opposite, number three; the other robin / the other lark |
| `{to}`                                                                   | the dancer a chain lands you with, derived from the resolution           | as `{who}`                                                                                                            | as `{who}`                                                                                                                                          |
| `{hand}`, `{by}`, `{firstHand}`, `{secondHand}`                          | a hand or a shoulder                                                     | `RIGHT` / `LEFT`                                                                                                      | right / left                                                                                                                                        |
| `{amount}`                                                               | how far round a turn goes                                                | `HALF WAY`, `ONCE`, **`ONCE AND A HALF`**, `TWICE`, a quarter, a third                                                | half way round, once around, once and a half, twice around                                                                                          |
| `{places}`                                                               | how far round a ring, a place being a quarter of it                      | `ONE PLACE`, `HALF WAY`, **`THREE PLACES`**, `ONCE`                                                                   | one place, half way round, three places, all the way round                                                                                          |
| `{direction}`                                                            | which way                                                                | `LEFT` / `RIGHT` / `ACROSS` / `ALONG` / `CLOCKWISE`                                                                   | the same words                                                                                                                                      |
| `{hold}`                                                                 | what is held                                                             | both hands, one hand, hands round the ring, a wrist hold, hands across                                                |                                                                                                                                                     |
| `{chains}`, `{start}`, `{centre}`, `{facesIn}`, `{roller}`, `{leadRole}` | a role                                                                   | `ROBINS` / `LARKS`                                                                                                    | the robins / the robin                                                                                                                              |

`relationWords.ts` is the one table for "who", in both registers, and nothing
else in the app has a second one: the call form, the walkthrough and the hint
all name a dancer through it. A relation it has no words for fails **at load**,
by name — a `{slot}` showing on the page is worse than a page that refused to
build. The slots W1 wrote and this milestone retired — `{where}`, `{pairs}`,
`{couples}` — fail at load too, with the name of what replaced them.

### Where you end is not written

`{where}` is gone. The written language stops at **how far** (§3); where the
figure leaves you is generated at the seam from the engine's own honest ends
and rendered beside the text, never baked into it, because the same circle left
three places leaves a becket dancer and a duple dancer in different places. The
relation table for those sentences is `packages/contra/src/text/seam.ts` and
nothing else.
