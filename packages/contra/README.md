# @caller/contra

Contra as one form on top of `@caller/choreo`: the contra role set (lark,
robin), the contra figure library, and contra-specific dances and programs.

## Allowed imports

`@caller/contra` may import `@caller/choreo`. Nothing else in this
workspace.

`src/corpus/normaliseTitle.ts` normalises dance titles (whitespace, a
leading program-order number, case) for `scripts/corpus/import-portland.mjs`,
which derives `data/corpus/portland-programs.json` — see `data/README.md`.
