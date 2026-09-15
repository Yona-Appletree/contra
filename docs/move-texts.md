# The four texts every move is written in

Every figure in the registry has a file at `data/figures/<id>.json` holding
four texts: a **short walkthrough**, a **long walkthrough**, a **short call**
and a **long call**. They are plain JSON, hand-editable without a build, and
they are the words the app shows. `FigureDef.describe` is only the fallback
for a figure with no file, and the next cleanup removes it.

This page is the rule book for whoever writes the next one.

## Why they are written and not generated

The user, who calls:

> "the moves all have a lot of ai generated text description. it feels very
> ai-generated. what we're going to want is a few descriptions for each move,
> and we really want them not to sound like ai slop. the two main ones are the
> short and long walkthrough texts, and the short and long calls. long
> walkthrough can be used as description, too, probably."

and, as the standard to write to, a hey:

> "note where you are standing. you will return here after walking across the
> set. robins start by passing right shoulders in the middle, neighbors by the
> left on the outside, loop around, partner by the left on the outside,
> neighbor by the right in the center, face your partner on your side"

and a circle left:

> "take hands in a ring. circle three places to your left. you should be across
> the set from your partner, next to your neighbor"

Read those twice before writing anything. Everything below is those two
sentences, generalised.

## The four rules of a walkthrough

In this order, and all four in a long one:

1. **With whom** — "do-si-do your neighbor". `{pairs}`, `{couples}`,
   `{chains}`, `{roller}`, or the ring, or the line.
2. **Which side** — "pass by the right shoulder". `{hand}`, or the shoulder
   written out.
3. **How far** — "once, and a half". `{amount}`, `{places}`, or the beats.
4. **Where you end** — the landmark. **You do not write this one**: the long
   walkthrough ends in `{where}` and the engine fills it (see below).

A short walkthrough may squeeze 3 and 4 into one clause, or leave 4 out; a long
one states all four.

## The voice

- Second person, imperative, present tense. Every sentence is something a
  dancer **does** or **notices**.
- No sentence explains why, praises the figure, or describes how it looks from
  above.
- No adjectives about the figure — "graceful", "flowing", "elegant". No hedges
  — "usually", "typically", "in most halls". No parentheses. No "note that". No
  `(unsure: …)`: an uncertain sentence is a sentence to cut.
- Contra vocabulary as callers use it: robins, larks, neighbor, partner,
  shadow, set, line, across, up, down, right and left shoulder, hands four,
  home.
- **American spelling** in the texts — center, neighbor, toward — because the
  corpus is American. (Code comments stay British, like the rest of the
  repository.)

### Lengths

| Text              | Budget         | Shape                                                  |
| ----------------- | -------------- | ------------------------------------------------------ |
| short walkthrough | under 25 words | one or two sentences                                   |
| long walkthrough  | under 80 words | the full teach; the user's hey above is the length     |
| short call        | 1–4 words      | what a caller drops mid-phrase: "HEY", "LONG LINES"    |
| long call         | under 9 words  | the full first-time call: "CIRCLE LEFT THREE QUARTERS" |

The budget is on the **written** text — what you see in the file, a `{slot}`
counting as the one word it becomes — not on the resolved text, because the
landmark is not yours to shorten. `packages/contra/src/text/figureText.test.ts`
enforces every line of this section that a machine can.

Calls are written in capitals, because that is how the caller's bubble draws
them, and hold letters, digits, spaces and the hyphen of `DO-SI-DO` and nothing
else. A `{slot}` inside a call is written in lowercase and shouted when it is
filled in.

## Slots: the text depends on who is where

A text is a template over the figure's own parameters. `{pairs}` in a
do-si-do's text is "your neighbor" in one dance and "your partner" in the next,
which is the whole reason these are not four fixed strings.

**A slot names a parameter the figure declares**, and one the vocabulary has
words for. Anything else fails at load, by name. The vocabulary, in
`figureText.ts`:

| Slot                   | Values                                                | In a call        | In a walkthrough            |
| ---------------------- | ----------------------------------------------------- | ---------------- | --------------------------- |
| `{pairs}`, `{couples}` | `partners`                                            | `PARTNER`        | your partner                |
|                        | `neighbors`                                           | `NEIGHBOR`       | your neighbor               |
|                        | the two robins written out                            | `ROBINS`         | the other robin             |
|                        | the two larks written out                             | `LARKS`          | the other lark              |
| `{hand}`               | `R` / `L`                                             | `RIGHT` / `LEFT` | right / left                |
| `{amount}`             | `0.5`, `1`, `1.5`, `2`                                | `ONE AND A HALF` | once and a half             |
| `{places}`             | `1`, `2`, `3`, `4` quarters of a ring                 | `THREE QUARTERS` | three places                |
| `{direction}`          | `left`/`right`, `across`/`along`, `1`/`-1`            | `LEFT`           | left                        |
| `{chains}`, `{roller}` | `lark` / `robin`                                      | `ROBINS`         | the robins / the robin      |
| `{hold}`               | `two`, `one`, `ring`, `none`, `wrist`, `hands-across` | —                | both hands, a wrist hold, … |
| `{start}`              | `robins-right` / `larks-left`                         | —                | the robins, by the right    |
| `{where}`              | —                                                     | —                | the landmark, below         |

A call and a teach are different English — "NEIGHBOR SWING" against "swing your
neighbor" — so one slot writes both, and the dance card and the walkthrough
cannot drift apart.

A walkthrough may open on a slot; the loader capitalises the first letter of
the resolved text, so write the slot's words in the case they take in the
middle of a sentence.

## Variants: when a slot is not enough

A hey with the larks starting is a **different sentence**, not the same
sentence with one word changed. For that, a variant:

```json
"variants": {
  "start=lark": { "walkthrough": { "short": "…", "long": "…" } },
  "amount=0.5": { "call": { "short": "HALF A HEY" } }
}
```

Keyed `"<param>=<value>"`, any subset of the shape, applied **in the order they
are written**, each overriding what came before. A pairing value is written by
its name — `pairs=robins`, `pairs=neighbors` — not as the station ids.

The order rule is also this mechanism's limit: two parameters that vary the
prose independently cannot both be honoured for the same call. `hey` is the
only figure where that bites, and no dance calls the combination — see the W1
report.

## The landmark: the one sentence nobody writes

The user's circle left ends "you should be across the set from your partner,
next to your neighbor". That is not a fact about the figure; it is a fact about
the figure **in this dance**. The same circle left three quarters leaves a
becket dancer across the set from their partner and a duple improper dancer
beside them.

So it is generated. `landmark()` in `packages/contra/src/text/landmark.ts`
reads `FigureDef.ends` — the very end places the decider chains the next figure
on to — turns them into the set's own axes, and says where you are:

- **Home**: "You are back where you started", plus who you ended up looking at
  when it is squarely your partner or your neighbor.
- **Moved**: "You should be _R_ your partner, _R_ your neighbor", where each
  _R_ is one of four relations — **across the set from**, **next to**, **on the
  diagonal from**, **along the line from**.
- **Split by role**, when the figure leaves the two roles in different places
  (a chain, an allemande for the robins alone): "Larks, you …; Robins, you …".
- Nothing at all, when the group is not a minor set of four. A figure danced
  outside one — `wait-out` — must not use `{where}`.

Two clauses, never three: the relations already imply which way you are facing,
and the user's own example stops at two.

## Where the texts show up

- **Moves row** (`#/moves`): the short walkthrough, the long one behind
  "teach", the two calls as `SHORT · LONG`.
- **Per-move traces** (`#/moves/<id>/traces`): the long walkthrough at the top.
- **Dance card**: the dance's own `call` where it writes one — which is what
  the caller's bubble says, and they must match — and the resolved **long**
  call where it does not.
- The caller's bubble itself is untouched: it says `call.call ?? def.call`, and
  every demo dance writes its own.
