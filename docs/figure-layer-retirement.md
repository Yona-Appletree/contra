# The coded figure layer: what it was, and where each piece went

M11 of the figure-model roadmap deletes the hand-coded contra figure layer.
The user's ruling: _"yes, you can delete the old code, please do, it'll live
on in git."_ This file is the map the deletion was made from — every module
the coded layer exported, every reader of it, and what happened to each.

It is written once and kept because the coded layer was not one thing. Half of
`packages/contra/src/figures/` was seventeen figures written as code; the other
half was the **contract and the kinematics those figures were written on**,
which the data library in `packages/contra/src/library/` was deliberately built
on top of rather than beside. Deleting the first half is the milestone.
Deleting the second half would be rewriting the new layer, which is not.

## The surface, before

`packages/contra/src/figures/` — 11 343 lines over 52 files (28 modules,
24 co-located tests); `packages/contra/src/pair/` — 2 116 lines over 24 files.

### A. The seventeen coded figures — **deleted**

Each is a `ContraFigure`: a `plan(ctx, params)` that answers "where does this
figure leave the four dancers of a hands-four", plus `sample`, `ends`, `joins`.
Each has a `FigureDefinition` twin in `library/figures/` that replaced it.

| Coded module                            | Data twin                                       | Readers of the coded module before M11                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `allemande.ts`                          | `library/figures/allemande.ts`                  | barrel, `registry.ts`, own test, `library/figures/allemande.test.ts`                                                                                                           |
| `balance.ts` (`balance`, `balanceRing`) | `library/figures/balance.ts`, `balance-ring.ts` | barrel, `registry.ts`, `balance-and-swing.ts`, own test, two library tests                                                                                                     |
| `balance-and-swing.ts`                  | `library/figures/balance-and-swing.ts`          | `registry.ts`, `library/figures/balance-and-swing.test.ts`                                                                                                                     |
| `california-twirl.ts`                   | `library/figures/carriers.ts`                   | barrel, `registry.ts`, `roll-away.ts`, own test, `carriers.test.ts`                                                                                                            |
| `circle.ts`                             | `library/figures/carriers.ts`                   | barrel, `registry.ts`, own test, `carriers.test.ts`                                                                                                                            |
| `do-si-do.ts`                           | `library/figures/do-si-do.ts`                   | barrel, `registry.ts`, own test, `carriers.test.ts`                                                                                                                            |
| `long-lines.ts`                         | `library/figures/carriers.ts`                   | barrel, `registry.ts`, own test, `carriers.test.ts`                                                                                                                            |
| `pass-through.ts`                       | `library/figures/carriers.ts`                   | barrel, `registry.ts`, `right-and-left-through.ts`, `library/kinds/pairing.ts`, `library/kinds/courtesyTurn.ts`, own test, `carriers.test.ts`                                  |
| `petronella.ts`                         | `library/figures/carriers.ts`                   | barrel, `registry.ts`, own test, `carriers.test.ts`                                                                                                                            |
| `right-and-left-through.ts`             | `library/figures/right-and-left-through.ts`     | barrel, `registry.ts`, own test, `carriers.test.ts`                                                                                                                            |
| `robins-chain.ts`                       | `library/figures/robins-chain.ts`               | barrel, `registry.ts`, `figureChecks.ts`, own test, `carriers.test.ts`                                                                                                         |
| `roll-away.ts`                          | `library/figures/carriers.ts`                   | barrel, `registry.ts`, own test, `carriers.test.ts`                                                                                                                            |
| `slide-left.ts`                         | `library/figures/slide-left.ts`                 | barrel, `registry.ts`, `library/kinds/path.ts`, own test, `carriers.test.ts`                                                                                                   |
| `star.ts`                               | `library/figures/star.ts`                       | barrel, `registry.ts`, `figureChecks.ts`, `library/kinds/holds.ts`, own test, `carriers.test.ts`                                                                               |
| `swing.ts`                              | `library/figures/swing.ts`                      | barrel, `registry.ts`, `allemande.ts`, `do-si-do.ts`, `balance-and-swing.ts`, `library/kinds/orbitPair.ts`, `library/kinds/path.ts`, own test, `library/figures/swing.test.ts` |
| `courtesyTurn.ts`                       | `library/kinds/courtesyTurn.ts`                 | barrel, `right-and-left-through.ts`, `robins-chain.ts`, `library/kinds/courtesyTurn.ts`, `library/figures/right-and-left-through.ts`                                           |
| `sequences.ts`                          | `library/kinds/sequence.ts`                     | `sequence.test.ts` only                                                                                                                                                        |

Five of those coded modules also exported **geometry** that the data layer
adopted rather than re-derived, and that geometry is what makes them not a
straight `rm`. It moved with the deletion, to the file that uses it:

| Kept export                                                                                                       | Was in                    | Now in                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `stepped`, `STEP_BEATS`                                                                                           | `figures/slide-left.ts`   | `library/kinds/path.ts`, `library/figures/slide-left.ts`                            |
| `placeHalf`, `endFacingOf`, `EndFacing`                                                                           | `figures/swing.ts`        | `library/kinds/orbitPair.ts` (`endFacingOf`), `library/kinds/path.ts` (`placeHalf`) |
| `wristPoint`, `WRIST_ALONG`                                                                                       | `figures/star.ts`         | `library/kinds/holds.ts`                                                            |
| `aheadPairs`, `facingPairs`                                                                                       | `figures/pass-through.ts` | `library/kinds/pairing.ts`                                                          |
| `CHAIN_JOIN_BEAT`, `CHAIN_PASS_PX`                                                                                | `figures/robins-chain.ts` | `library/figures/robins-chain.ts`                                                   |
| `COURTESY_*`, `ORBIT_FULL_TURN`, `courtesyTurn`, `orbitTurn`, `courtesyHold`, `courtesyBackHands`, `larkAndRobin` | `figures/courtesyTurn.ts` | `library/kinds/courtesyTurn.ts`                                                     |

### B. The contract and the shared kinematics — **kept**

`figures/ContraFigure.ts` is imported by 64 files, of which 27 are the new
layer: every `library/kinds/*.ts`, `library/interpret.ts`, `library/expr.ts`,
`set/resolve.ts`, `set/planCycle.ts`, `text/landmark.ts`. What they take is the
**figure contract** (`ContraFigure`, `FigurePlan`, `Spot`, `Spots`, `HandJoin`,
`LocalHand`, `LocalSample`, `HoldWindow`, `PlanContext`, `Carried`) and the
thirty-odd geometry helpers written on it (`bearing`, `polar`, `midpoint`,
`joinPoint`, `joinedHands`, `centreOf`, `takeAndRelease`, `isHeld`, `worldPose`,
`worldHand`, `worldSpot`, `asPose`, `spotGap`, `passRight`, `holdWindow`,
`planContext`, `contraFigure`, `CLEARANCE_PX`, `CHAIN_FRAME`, the plan cache).

A `FigureDefinition` is **interpreted into a `ContraFigure`** — that is what
`library/interpret.ts`'s `figureFor` returns, and what the registry holds and
`poseAt` samples. The contract is therefore the new layer's own output type,
not the old layer's private business, and it stays.

The same is true of these, none of which is a figure:

| Module                                            | What it is                                                                                                     | Who reads it                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `figures/pairing.ts`                              | who is paired with whom in a hands-four                                                                        | `library/kinds/{pairing,sequence,courtesyTurn}.ts`, `text/landmark.ts`, `set/relations.test.ts` |
| `figures/ring.ts`                                 | the ring of four: order, hands, walk, shift                                                                    | `library/kinds/{ringWalk,rock}.ts`                                                              |
| `figures/chain.ts`                                | the dance-record types (`ContraCall`, `ContraPhrase`, `ContraDanceSpec`, `DanceProgression`) and `contraDance` | `dances/{loadDances,candidates,danceLab}.ts`, `set/lattice.ts`, `corpus/importCallersBox.ts`    |
| `figures/registry.ts`                             | `createContraRegistry`, the registry every path resolves ids in                                                | `library/engine.ts`, `dances/{oracle,loadDances}.ts`, `text/figureText.ts`, 10 tests            |
| `figures/wait-out.ts`                             | the contra wrapper round choreo's wait-out; not a figure a dance calls                                         | `registry.ts`, `text/figureText.ts`                                                             |
| `figures/testing.ts`                              | `probeFigure`, `probeGroup`, `PROBE_STEP` — the probe the lab and every figure test reads                      | `library/compareFigures.ts` and 20 tests                                                        |
| `figures/figureChecks.ts`                         | the whole-figure checks `pnpm figure` prints                                                                   | `figureLab.ts`, `reportMotion.ts`                                                               |
| `figures/figureLab.ts`                            | `pnpm figure`                                                                                                  | `packages/contra/scripts/figureLab.mjs`                                                         |
| `figures/motionBounds.ts`                         | `CONTRA_MOTION_BOUNDS`, the motion oracle                                                                      | `dances/danceLab.ts`, `figureLab.ts`, `reportMotion.ts`                                         |
| `figures/reportMotion.ts`, `motionReportPatch.ts` | `docs/motion-report.md`                                                                                        | `packages/contra/scripts/writeMotionReport.mjs`                                                 |
| `figures/knownWrong.ts`                           | the lab's "known wrong" annotations                                                                            | `figureChecks.test.ts`, `figureLab.ts`, `reportMotion.ts`                                       |

`chain.ts`'s **`chainCalls`** is the one exception in that table: it is the
sequential load-time threading the hub replaced, and it goes with the figures
that could answer it. Its record types stay, because the dance record is still
written in them.

`registry.ts` stays as a name and a function and loses its contents: after M11
`createContraRegistry` builds from `library/figures/index.ts` alone.

### C. `packages/contra/src/pair/` — **deleted**

The two-dancer engine behind `#/pair` (gate G1's artifact). Q5 ruled it goes
once the data swing and allemande match its strips; M2 already moved the three
kinematics the figure layer shares — `trapezoid`, `handDown`, `armShortfall` —
into `@caller/core`, and `pair/trapezoid.ts`, `pair/PairFrame.ts` and
`pair/armShortfall.ts` were re-exports of those by the time M11 ran. What the
new layer still took from `pair/` and what happened to it:

| Kept export                                                       | Was in              | Now in                                |
| ----------------------------------------------------------------- | ------------------- | ------------------------------------- |
| `balanceRock`, `BALANCE_BACK_RATIO`, `BALANCE_LEAN_CAP`           | `pair/balance.ts`   | `library/kinds/rock.ts`               |
| the twelve swing constants (`SWING_RADIUS_PX` … `SWING_FLARE_PX`) | `pair/swing.ts`     | `library/figures/swing.ts`            |
| `TURN_RADIUS_PX`                                                  | `pair/allemande.ts` | `library/figures/allemande.ts`        |
| `trapezoid`, `handDown`, `armShortfall`                           | re-exports          | imported from `@caller/core` directly |

`apps/web/src/routes/pair.tsx`, `apps/web/e2e/pair.spec.ts`, its three goldens
(`e2e/golden/pair-beat-{6,12,20}.png`) and its nine strips
(`e2e/strips/0*.png`) go with it. `e2e/perf.spec.ts`'s pair budget does **not**:
it renders `#/frame?fixture=two-hand-hold`, which is `@caller/hall`'s own
fixture and has nothing to do with this package.

### D. The readers that exist only because the coded figures do — **deleted**

P7 (#72) took the first round of these. What M11 owns:

| Reader                                               | Where                                                           | Why it goes                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `RETIRED_SLOTS` (`where`, `pairs`, `couples`)        | `text/figureText.ts`, re-exported by `text/index.ts`            | the slots were the coded figures' parameter names                 |
| `pairingParamOf`                                     | `apps/web/src/moveCatalogue.ts`                                 | mapped a coded figure's `pairs`/`couples` parameter to a tile row |
| `call.call ?? def.call ?? def.id`                    | `choreo/decider/createScriptDecider.ts`, `library/interpret.ts` | `def.call` was the coded figure's own call string                 |
| `"gives every figure a call, a lead and a duration"` | `figures/registry.test.ts`                                      | asserts the coded table's shape                                   |
| the `engine === "old"` half                          | `apps/web/src/{program,state/engineQuery}.ts`                   | `old` was `defaultCyclePlanner` over the coded registry           |

`?engine=old`'s **backing** goes; the word survives as a no-op so an old link
still draws, and the toggle's UI in `hall.tsx` is left for the user's open #95,
which rewrites that file.

### E. The goldens that compared against a coded twin — **recorded fixtures**

`library/compareFigures.ts` dances a `FigureDefinition` and its coded
predecessor side by side and asserts they agree. The predecessor goes, so the
coded side is **sampled once, before the deletion, and committed** — every
case, every formation, every station, every 1/8 beat. The test then compares
the definition against the file at the tolerance its milestone stated.

See `_DONE.md` in the planning directory for the list, the tolerances and the
sha each fixture was sampled at.
