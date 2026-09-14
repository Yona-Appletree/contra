# @caller/music

The audio clock, tunes, medleys, notation cursor and card readout: abcjs
wired to `AudioContext.currentTime` so the clock is a linear function of it.
Nothing above reads a wall clock once music plays.

## Allowed imports

`@caller/music` may import `@caller/core`, and does: the clock, `Beat` and
`Meter` are all `@caller/core`'s. Nothing else in this workspace.

## API

`Beat`, `Meter`, `Clock` and `createClock` are imported from `@caller/core`
and are not re-exported here — take them from `@caller/core` directly.

```ts
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

// The applause between two dances, src/player/applause.ts
function renderApplause(sampleRate: number, options?: Partial<ApplauseOptions>): Float32Array;
function playApplause(
  ctx: AudioContext,
  when?: number,
  options?: Partial<ApplauseOptions>,
): AudioBufferSourceNode;

// React components, src/ui/
function Notation(props: { tune: Tune; beat: Beat }): JSX.Element;
function Card(props: CardProps): JSX.Element;
interface CardProps {
  dance: {
    title: string;
    phrases: readonly { name: string; figures: readonly CardFigure[] }[];
  };
  beat: Beat;
}
interface CardFigure {
  beats: number;
  call?: string | undefined;
}
```

### The applause

`renderApplause` writes 3.2 seconds of a hall clapping into a `Float32Array`,
sample by sample: fourteen clappers, each at its own rate between 2.6 and 4.6
claps a second with a fifteen per cent jitter on every clap so no two of them
stay in phase, each clap a burst of white noise under a two-part exponential
decay (a 6 ms transient and a 35 ms body), one-pole-filtered at that clapper's
own brightness, all of it under a swell that rises over 0.2 s and dies away
over the last second, and the sum normalised so the peak does not depend on how
many people are clapping. It is plain arithmetic, so it is pure, seeded and
testable with no `AudioContext` at all; `playApplause` is the three lines that
copy it into a buffer and start it. **No sample file and no new dependency** —
which is the point, and why it is written out rather than synthesised through a
graph of `AudioNode`s.

`CardProps["dance"]` is structural, and `@caller/choreo`'s `Dance` satisfies
it exactly — so the card draws a real dance with no shim and no conversion
step. It is written out rather than imported because `scripts/check-deps.mjs`
gives `music` one edge, to `core`; importing `@caller/choreo` here would have
been a change to that table, and the card only ever reads a title, four
phrase names, and each figure's duration and call text.

## The clock is `@caller/core`'s

M9 made the swap the M6 note left open: `src/clock/Clock.ts` and its test are
gone, `Beat`, `Meter`, `Clock` and `createClock` come from `@caller/core`, and
`@caller/core` is back in this package's dependencies.

It was a plain drop-in, because the beat-convention conflict M6 recorded had
already been settled the other way. Director ruling DD11 makes a dance beat
the dance count: a reel or jig bar is 2 beats, a 32-bar tune is 64 beats, and
a phrase (A1, A2, B1, B2) is 8 bars — 16 beats. `@caller/core` now ships
`REEL` and `JIG` as `{ beatsPerBar: 2, barsPerPhrase: 8 }`, which is exactly
what this package's three tunes already carried, so no tune's `meter` moved
and neither did the beat arithmetic in `Notation` or `Card`.

`@caller/core`'s `Clock` is a superset of the local one: it adds `setBeat`,
`isPaused` and `tempo`, and `createClock` takes an optional starting tempo.
`Player.clock` is therefore richer than it was; nothing in this package reads
the new members, and the demo page uses `setBeat` to seek the silent clock.

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
