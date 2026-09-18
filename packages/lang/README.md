# @caller/lang

The dance language, **draft 3**: a program is a tree of **groups** built once,
with dancers as its leaves, and a **script** every dancer runs against that
tree, one beat at a time. Space is the tree; time is the order of the script;
everything a dancer knows, it knows from the groups above it.

Design: `Planning/contra/dance-language-design.md`. Plan:
`Planning/contra/2026-09-17-1758-dance-language-spike/`.

## Allowed imports

**None.** `@caller/lang` imports no workspace package, and no workspace package
imports it. It is a spike beside the engines, not on top of one: no geometry,
no renderer, no figures — a move's body is the name in its `ir`, and the
kinematics are somebody else's problem (§7). `scripts/check-deps.mjs` says so
from the outside and `src/allowedImports.test.ts` from the inside.

## What is here

| Path                   | What                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `src/syntax/lexer.ts`  | Tokens. Casing is grammar: kebab names, TitleCase groups, types and enum members.          |
| `src/syntax/parser.ts` | `parseFile(text, name)` — recursive descent to the tree, or one diagnostic.                |
| `src/syntax/ast.ts`    | The tree. Every node carries a `Span`; nothing is resolved.                                |
| `src/diagnostics/`     | `Diagnostic`, the codes, and rustc-shaped rendering — text and JSON.                       |
| `dances/`              | The fixtures: the formations, Butter, a medley, and the deliberate errors under `broken/`. |
| `cli/lang.mjs`         | `pnpm lang check\|tree\|run` — a stub until P4.                                            |

## The language in one screen

```text
group Couple {
  id: enum { Ones, Twos }          // the type of its ids
  spacing: Length = 0.8m           // parameters
  body {                           // once, for nobody, for the node being built
    left(spacing / 2)  Role(Lark);
    right(spacing / 2) Role(Robin);
  }
  partner = other(Role);           // a member: read by any dancer under the node
}

fn swing(with: Role, beats: i32 = 8) { ir "swing"; }   // an `ir` makes it a move

fn butter(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }      // a `setup` makes it a dance
  phrase(A1) { swing(neighbor, beats = 8); }
}
```

- **The group is the one first-class idea.** Declared once, invoked to build a
  node, and named in an expression to mean _mine_ — no `self`, no sigil.
- **No dots.** `id(K)`, `other(K)`, `dancers(K)`, `anchor(K, name)`, `one!(…)`,
  `count(…)` reach everything.
- **One pattern grammar** (Rust's) in four places: `is`, `match`, `select` and
  `assign`. `_` is the only wildcard; `other`, `first` and `last` mean something
  only where there is a candidate to compare against the reader.
- **One keyword, `fn`**, for a move, a compound, a dance and a medley; the
  checker tells them apart by `ir` and `setup`.
- **A file is a module.** `use becket::{MajorSet};`, or the qualified
  `improper::MajorSet`, which needs no import at all.
- **Events commit at the end of their beat.** `assign(K = …)` is the event and
  is a `Bool`, so `or` chains fallbacks; `progress()` is set-wide.
- **Beats are a plain count** (`beats = 8`). The two units are `m` and `deg`.

### Three places this parser bends the written grammar

1. A group invocation may carry **one trailing statement**, not only `;` or a
   block — design §8 writes `Station(OutTop) Couple(Ones, seated = false);`.
2. **Any expression is a pattern**; the design's parentheses round a computed
   pattern are optional, which is what lets §8's
   `select(MinorSet = id + travel, …)` stand as written.
3. **A block's last expression, written without a `;`, is its value** —
   `fn wrap(n: i32) { ((n - 1) % 4 + 4) % 4 + 1 }`.

## Diagnostics

Codes are stable and banded: `L001–L009` parse, `L010–` check, `L100–` run.
The shape is round 2's (`packages/kinetics/src/diagnostics/`), rustc's really:
a code, a message, a span with a caret, the beat and the dancers, a trace of
the facts on the way down, and a suggestion.

```text
error[L007] no sigil: "$partner" has a sigil the language does not have
  --> butter.dance:12:9
   |
12 |   swing($partner, beats = 8);
   |         ^^^^^^^^
   = help: a relation is a member of a group and is read bare: write "partner"
```

## Validation

```bash
pnpm --filter @caller/lang test
pnpm --filter @caller/lang typecheck
pnpm lang check dances/butter.dance    # P4
```
