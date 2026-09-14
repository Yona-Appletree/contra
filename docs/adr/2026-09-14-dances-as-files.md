# Dances are files under `data/`, not TypeScript modules

Date: 2026-09-14
Status: accepted

## Context

`Dance` in `packages/choreo/src/dance/Dance.ts` has no functions and survives
`JSON.parse(JSON.stringify(dance))` unchanged — it always has. But the ten
demo dances lived in `packages/contra/src/dances/*.ts`, each a call to
`contraDance({...})` inside a TypeScript module: `export const butter: Dance
= contraDance({ slug: "butter", ... })`. A person or an agent who wants to
add, edit or review a dance's figures had to read and write TypeScript to do
it, for data that was never TypeScript's to begin with.

Vision D2 and D3 want the figure library and the dance record as data,
source text and provenance kept beside the figure calls. This milestone
(D1) does the dance record's half: the ten dances move to
`data/dances/<slug>.json`, loaded by `packages/contra/src/dances/`. Figures
as data (a `FigureSpec` compiled by `packages/contra/src/figures/language/`)
is the parallel `2026-09-14-0847-contra-move-data-layer` plan's own track,
unaffected by this one beyond a reserved key (see below).

Two things a dance module's own doc comment always computed rather than
wrote down: `from` (where each call's dancers already stand, threaded call
to call by `chainCalls`) and, since F3c, `carried` (which hands survive a
figure boundary without being let go and retaken, threaded the same way).
Both are derived from the figures themselves — `chainCalls` asks each call
what it leaves standing and what it is still holding, and hands the answer
to the next call — and neither was ever written by a dance's author. A file
format for a dance has to preserve exactly that: plain enough to read and
edit, but with no derived field for an editor to get out of sync with the
figures that actually produce it.

## Decision

### The file: `data/dances/<slug>.json`, at the repo root

Beside `data/corpus/`, not inside `packages/contra/`. Two things made this
the simpler choice rather than the one requiring a build step:

- **`resolveJsonModule` is already on** for every package
  (`tsconfig.base.json`), and this repository already has one precedent for a
  package reading a repo-root `data/` file across the package boundary:
  `packages/hall/src/font/Font.test.ts` reads `data/corpus/demo-dances.json`
  (by `readFileSync`, because that file is read only in a Node test, never
  bundled for the browser). A dance file is different — it has to reach the
  browser bundle, not just a test — so the question that actually mattered
  was whether a plain `import x from "../../../../data/dances/foo.json"`
  resolves for `tsc`, for `vitest`, and for Vite's own build, from inside
  `packages/contra/src/dances/`.
- **It does, unmodified.** Measured, not assumed: a scratch import three and
  four directories up (`packages/contra/data/…` and repo-root `data/…`) was
  added to `packages/contra/src/`, and `tsc -p tsconfig.json` (both
  `--noEmit` and the real emit the `build` script runs), `vitest run`, and
  the package's own `exports` field (`"." : "./src/index.ts"`, which is what
  lets every consumer in this workspace resolve `@caller/contra` straight to
  source rather than to a build) all resolved it with **zero** tsconfig
  changes. `rootDir: "src"` does not reject a JSON module import that
  reaches outside it, in this TypeScript version and module mode — the
  concern that motivated the brief's "or a build step" alternative turned
  out not to apply. The scratch files and their probe are not in this PR;
  the finding is recorded here because the next person to doubt it should
  not have to re-run the experiment.
- **One consumer needed the import attribute the others tolerate without
  it.** `tsc`, `vitest` and Vite all resolve a bare `import x from
"./y.json"` with no `with { type: "json" }`. `pnpm report:motion`
  (`node --import ./scripts/ts-src-resolve.mjs
packages/contra/scripts/writeMotionReport.mjs`) does not: it runs on
  plain Node's own ESM loader (the import hook only swaps `.js` specifiers
  for sibling `.ts` files; it does not touch JSON), and Node's loader
  enforces the import-attributes spec strictly — `ERR_IMPORT_ATTRIBUTE_MISSING`
  without one. Every JSON import in `dances/index.ts` carries `with { type:
"json" }`, which every other consumer accepts as well, so one spelling
  works everywhere rather than three.

So there is no generated index, no codegen step and no `readFileSync`
anywhere in the loader: `data/dances/<slug>.json` is a native ES module
import, exactly like any other, bundled by Vite the same way any other JSON
import in this toolchain would be.

### The shape: `ContraDanceSpec`, formation named by id, provenance added

A dance file is `ContraDanceSpec` (`packages/contra/src/figures/chain.ts`) —
the thing a TypeScript dance module used to hand to `contraDance()` — with
one change (`formation: Formation` becomes `formation: string`, because a
JSON file cannot hold the object) and one addition (`source`):

```ts
interface DanceFile {
  slug: string;
  title: string;
  author: string;
  formation: string; // a formation id; see formationById
  phrases: ContraPhrase[]; // figure calls, no `from`, no `carried`
  notes?: string;
  startPlaces?: Spots; // Butter only
  waitOut?: object; // Butter only
  source: {
    callersBoxId: number;
    url: string;
    permission: string;
    transcript: string; // the A1/A2/B1/B2 sequence, quoted
  };
  figures?: Record<string, unknown>; // reserved, unread — see below
}
```

`source` is the provenance every dance file's TypeScript header carried in a
doc comment — the Caller's Box id, the page URL, its own `Permission:`
field — now readable by a script instead of only by a person, per the corpus
ADR's own rule that a dance's figures are encoded from that page with the
`permission` field read, not assumed. `source.transcript` is new: the quoted
A1/A2/B1/B2 text used to live only in the module's doc comment; keeping it in
the data file is what "source text ... kept beside the figure calls" (vision
D2, D3) means concretely — an agent reading the JSON has the same evidence a
person reviewing the TypeScript did, without opening a second file.

**`from` and `carried` are absent by construction, not by convention.**
`ContraCall` (what a phrase's `figures` array holds, before threading) has no
`from` field at all — `FigureCall` (after threading) does, and `ContraCall`
is deliberately a different, narrower type. A dance file is typed as
`ContraCall[]`, so there is no field to accidentally fill in.

### The loader: `packages/contra/src/dances/loadDances.ts`

`danceFromFile(file: DanceFile): Dance`:

1. **Resolve the formation.** `formationById(file.formation)` looks the
   string up in `CONTRA_FORMATIONS` (`formations.ts`) and throws, naming the
   id, if it is not one of the two this package knows. `oracle.ts`'s
   `formationFor(dance: Dance)` is refactored to call the same function
   rather than duplicate the two-line `if`/`if`/`throw` it had — the same
   lookup, whether the string came from a `Dance` already built or a file
   not yet turned into one.
2. **Check every call's figure id and parameter names.** For each phrase's
   each call, `contraFigureOf(call.figure)` must resolve (the same check
   `chainCalls` performs when it threads the dance, run here first so a
   loader's own error, not a threading failure three figures later, names
   the actual mistake), and every key of `call.params` must be one the
   figure's own `defaults` declares — `Object.keys(figure.defaults)`, less
   `from` and `carried`, which are on every figure's `defaults` but are
   exactly the two things a dance file must never set. A parameter a figure
   does not have fails at load, naming the figure, the dance, the phrase and
   the declared parameter list.
3. **Thread it.** Build a `ContraDanceSpec` (the formation object swapped
   in, `source` and `figures` dropped) and call the existing `contraDance()`
   — unchanged — which runs `chainCalls` and `validateDance` exactly as it
   did for a TypeScript module's literal.

`packages/contra/src/dances/index.ts` imports the ten JSON files as plain
modules, orders them by `data/dances/programme.json`'s `{ slugs: [...] }`
(the programme order that used to be the `DEMO_DANCES` array literal's own
order), and exports `DEMO_DANCES` — the same shape, same ten dances, same
public surface (`DEMO_DANCES`, `DEMO_DANCE_SLUGS`, `danceBySlug`) as before.
The per-dance named exports (`butter`, `airpants`, ...) are dropped: nothing
outside `packages/contra/src/dances/` imported any of them (checked by
grep across the workspace), and a JSON file has no natural JS binding to
export one as — `danceBySlug("butter")` is the replacement, and it already
existed.

### `from` and `carried` stay derived, never stored

Restated because it is the rule the whole file shape serves: `chainCalls`
computes both by asking each figure what it leaves standing (`moves`) and
what it is still holding (`joins`) and handing the answer to the next call.
A dance file that wrote either by hand would be a second, independent
statement of something the figures already determine, and the two would
drift the first time a figure's geometry changed. Nothing in this milestone
changes that: `danceFromFile` calls the same `contraDance()` a TypeScript
module called, unmodified.

### `figures` is reserved, not implemented

The move-data-layer plan's decision 3 gives `Dance` an eventual `figures?:
Record<string, FigureSpec>` for dance-local figures a phrase's calls may
reference by name (M4; and M1's own finding that `chainCalls` resolves
figures through the module-level `CONTRA_FIGURES` table rather than through
a registry — a dance-local or compiled figure can be _sampled_ through the
registry today but not _chained_ — is unresolved here and is M4's to fix,
not this milestone's). `DanceFile` has an optional `figures?:
Record<string, unknown>` key for exactly that, so a future dance file
gains it without every existing file changing shape — but no demo dance
sets it, and `danceFromFile` does not read it. This is the only place D1
touches the move-data-layer plan; encoding a real dance-local figure is out
of scope here (DD22: the ten dances stay exactly the ten, no new dance, no
change to any dance's choreography).

## Consequences

- **A dance is edited as JSON.** Adding a figure, a parameter or a phrase to
  one of the ten demo dances no longer requires a TypeScript build; it
  requires JSON that `danceFromFile` accepts, which a schema-checking
  editor or an agent can validate before it ever reaches a test run.
- **The loader's checks are the new failure surface.** A dance file with a
  typo'd figure id or an unknown parameter now fails at import time with a
  message naming the dance, the phrase, the figure and — for a bad
  parameter — the figure's whole declared list, rather than surfacing as an
  obscure `chainCalls` error or, worse, a parameter silently ignored because
  nothing downstream reads unknown keys.
- **The round-trip is proven once, structurally, not asserted.** Before each
  of the ten TypeScript dance modules was deleted, its JSON file was put
  through `danceFromFile` and compared with `toEqual` (deep structural
  equality — exact, not a tolerance) against the module's own `Dance`
  export, for all ten. All ten matched byte-for-byte; the comparison itself
  could not survive the modules' deletion (it needs both sides), so it is
  not in the permanent test suite — `dances.test.ts`'s own per-dance
  `JSON.parse(JSON.stringify(dance)) toEqual dance` check remains as the
  ongoing regression, and the module-vs-file numbers are in this
  milestone's `## Implementation Result`.
- **`packages/contra/src/dances/` no longer has a `.ts` file per dance.**
  What remains is `index.ts` (the loader's entry and `DEMO_DANCES`),
  `loadDances.ts` (the loader itself), `formations.ts` (the id lookup),
  `oracle.ts` (the three-oracle harness, unchanged in behaviour), `pairs.ts`
  (`LARKS`/`ROBINS`, still used by three dance files' `pairs` parameter,
  now written out as the same literal tuples directly in JSON — the module
  is kept because it is still exported from the package's public surface and
  nothing forces its removal) and `dances.test.ts`.
- **`AGENTS.md`'s where-code-goes table gains a `data/dances/` row.**

## What this ADR does not decide

Whether `packages/choreo`'s `Dance` type itself should grow the `figures`
field, what a dance-local figure's namespacing convention is, and how
`chainCalls` should resolve a figure it cannot find in the module table —
all M4's, per the move-data-layer plan. This ADR only reserves the JSON key.
