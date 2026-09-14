# @caller/music

The audio clock, tunes, medleys, notation cursor and card readout: abcjs
wired to `AudioContext.currentTime` so the clock is a linear function of it.
Nothing above reads a wall clock once music plays.

## Allowed imports

`@caller/music` may import `@caller/core`. Nothing else in this workspace.
**It does not currently import `@caller/core`** — see "The local clock"
below.

## API

```ts
type Beat = number;
interface Meter {
  beatsPerBar: number;
  barsPerPhrase: number;
}
interface Clock {
  beat(): Beat;
  rebase(now: number, beat: Beat, bpm: number): void;
  setTempo(bpm: number): void;
  pause(): void;
  resume(): void;
}
function createClock(now: () => number): Clock;

interface Tune {
  slug: string;
  title: string;
  type: "reel" | "jig";
  abc: string;
  meter: Meter;
  beatsPerCycle: 64;
  defaultBpm: number;
  source: "traditional, transcribed by hand";
}
interface Medley {
  slug: string;
  tunes: Tune[];
  timesThroughEach: number;
}

interface Player {
  load(medley: Medley): Promise<void>;
  play(atBeat: Beat): void;
  stop(): void;
  setTempo(bpm: number): void;
  clock: Clock;
  onCycle(cb: (cycle: number, tune: Tune) => void): void;
}
function createPlayer(ctx?: AudioContext): Player;

// React components, src/ui/
function Notation(props: { tune: Tune; beat: Beat }): JSX.Element;
function Card(props: { dance: CardDance; beat: Beat }): JSX.Element;
interface CardDance {
  title: string;
  phrases: Array<{ name: string; figures: Array<{ beats: number; call: string }> }>;
}
```

## The local clock

`@caller/core` (M2) had not merged when this package was built, so
`packages/music/src/clock/Clock.ts` defines its own `createClock`, matching
`m02-core-kinematics.md`'s "time" contract verbatim (`Beat`, `Meter`,
`Clock`, `createClock(now)`). Per the director's note, the swap to
`@caller/core`'s `createClock` is deliberately left to a later milestone
dispatch, even though **M2 merged into `main` while this milestone was in
progress** (PR #3, `feat(core): clock, geometry, pose sample and the arm
solver`) — see the next section for why the swap isn't a plain drop-in.

When it happens: delete `src/clock/Clock.ts` and `src/clock/Clock.test.ts`,
import `Beat`, `Meter`, `Clock`, `createClock` from `@caller/core` instead,
add `@caller/core` back to this package's `package.json` dependencies —
and resolve the beat-convention mismatch below first, since it changes
`meter` on all three bundled tunes and the beat math in `Notation`/`Card`.

## The `beatsPerBar` convention — now a confirmed conflict with `@caller/core`

`m02-core-kinematics.md`'s example read `// reel: 4, 2 (8-beat phrases)` for
`Meter`, and **the merged `@caller/core` ships exactly that**:
`packages/core/src/time/Meter.ts` defines `REEL = { beatsPerBar: 4,
barsPerPhrase: 2 }`, with the comment "a reel is 4 beats per bar and 2 bars
per phrase, so phrases are the 8 beats a contra figure is written against."

That is a **different, smaller unit** than this package's own numbers:
`Tune.beatsPerCycle` is 64 for one full AABB pass (32 bars), and the card
readout (ported from the hall spike) treats A1/A2/B1/B2 as 16-beat musical
phrases — i.e. 2 beats/bar and 8 bars/phrase for the _tune's_ structure, not
4 and 2. `@caller/core`'s 8-beat unit is a _figure_ phrase (what a call like
"circle left 3/4" spans); this package's 16-beat unit is a _tune_ phrase
(A1/A2/B1/B2). Both are real, just not the same thing, and they don't
share a name. This package uses `{ beatsPerBar: 2, barsPerPhrase: 8 }` for
every tune (both reels and jigs — see "Tempo and `millisecondsPerMeasure`"
below for why the two forms share the same beat/bar convention), consistent
with its own `beatsPerCycle: 64` and with the hall spike's A1/A2/B1/B2
readout.

**This is now a confirmed conflict the director needs to rule on before the
`createClock` swap**, not a hypothetical one: is a tune's `Meter` the
figure-phrase unit `@caller/core` ships, the tune-phrase unit this package
uses, or does `Tune` need two separate fields (one for each)? Whichever way
it goes, the swap needs a matching change to `meter` on the three bundled
tunes and to the beat arithmetic in `ui/Notation.tsx` and `ui/Card.tsx`.

## Tempo and `millisecondsPerMeasure`

The contract says `millisecondsPerMeasure = 2*60000/bpm` for reels,
"adjust for jigs". In this package's convention both reels and jigs are
danced at 2 beats per bar (one walking step per half note for a 2/2 reel,
one per dotted quarter for a 6/8 jig), so the formula is actually the same
for both: `millisecondsPerMeasure = 60000 * meter.beatsPerBar / bpm`, with
`meter.beatsPerBar` always 2 here. `Player` computes it this way (generic
over `beatsPerBar`, so it would in fact "adjust for jigs" if a future jig
ever needed a different beats-per-bar).

## Tunes

Three traditional public-domain tunes, typed as ABC from the agent's own
memory (not copied from any transcription site — see each tune file's
provenance comment for a confidence note):

- `soldiersJoy.ts` — Soldier's Joy (reel, D). High confidence.
- `stAnnesReel.ts` — St. Anne's Reel (reel, D). Moderate confidence on the
  exact notes (my own transcription of its driving, repeated-note
  character); high confidence it's a genuine traditional public-domain
  reel.
- `hasteToTheWedding.ts` — Haste to the Wedding (jig, D). High confidence.

Each tune is written out in full — AABB, 32 bars, four source lines of 8
bars each (one line per phrase) — rather than with `|: :|` repeat signs.
Two reasons: (1) it makes "32 bars" a plain, unambiguous count instead of
depending on how abcjs expands repeats for the synth's audio buffer, and
(2) explicit one-phrase-per-source-line layout is what lets `Notation` map
`beat -> .abcjs-l{0-3}.abcjs-m{0-7}` with plain arithmetic (see
`ui/Notation.tsx`), instead of guessing line-wrap points the way the hall
spike did (`bar<16?0:1`, tuned to one specific `staffwidth`).

## Medleys

`reelMedley` (Soldier's Joy, St. Anne's Reel, twice through each) and
`jigMedley` (Haste to the Wedding, twice through).

## Deviations from the contract text

- `createPlayer(ctx?: AudioContext)`: the contract types `ctx` as
  non-optional, but the same paragraph describes "silence mode: with no
  `AudioContext` (tests, autoplay blocked)". `AudioContext` does not exist
  in jsdom/Node at all, so silence mode is only reachable if `ctx` can
  actually be omitted; the parameter is optional here so that text is
  possible to implement and test.
- Stories are plain CSF3 objects (no `Meta<T>`/`StoryObj<T>` from
  `@storybook/react-vite`), because that package is not one of the
  dependencies this milestone was authorized to add to `packages/music`,
  and adding it would have broken `typecheck` without it. See the M6
  Implementation Result in `m06-music.md` for the full note.
