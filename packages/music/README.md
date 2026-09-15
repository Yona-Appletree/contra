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
  play(atBeat: Beat, options?: { potatoBeats?: Beat }): void;
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

// The potatoes: four chords that count a dance in, src/player/potatoes.ts
function renderPotatoes(sampleRate: number, options?: Partial<PotatoOptions>): Float32Array;
function playPotatoes(
  ctx: AudioContext,
  when?: number,
  options?: Partial<PotatoOptions>,
): AudioBufferSourceNode;
function potatoesFor(tune: Tune, bpm: number): Partial<PotatoOptions>;
function keyOf(tune: Tune): { rootHz: number; mode: "major" | "minor"; name: string };

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

`renderPotatoes` is built the same way, for the four chords a band counts a
dance in with (B3, the user: "four chords or strong notes … its basically '5 6
7 8' before the '1 2 3 4 …' of the dance"). Four strikes, one a beat: the root,
its fifth, the octave, the third above that and the twelfth, under eight
milliseconds of noise and a plucked decay. The buffer is exactly four beats
long, so `Player.play(atBeat, { potatoBeats: 4 })` schedules it to finish where
the tune's first cycle starts and the fourth chord lands one beat before bar 1
with no gap and no overlap. The **key comes from the tune's own ABC** (`keyOf`
reads the `K:` field), so a tune added tomorrow gets potatoes in its own key
with nothing else written. What it cannot come from is the tune's arrangement:
a `Tune` here is one melody line rendered by `abcjs` as a single voice, so
there is no "loudest instrument" to pick, and the potato voice is one loud,
bright, plucked timbre for every tune.

With potatoes in front of it, `play` still rebases the clock against the
**tune** rather than against the count-in, and defers the cycle-boundary event
so `onCycle` fires on the dance's own beat 0 rather than four beats early.

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

Thirteen traditional public-domain tunes (nine reels, four jigs), typed as
ABC from the agent's own memory (not copied from any transcription site —
see each tune file's own provenance comment for a confidence note). The
first three are M6's; T1 added the other ten so a whole evening does not
repeat the same reel:

- `soldiersJoy.ts`, `stAnnesReel.ts` — reels (D). M6, high/moderate
  confidence.
- `hasteToTheWedding.ts` — jig (D). M6, high confidence.
- `arkansasTraveler.ts`, `oldJoeClark.ts`, `goldenSlippers.ts`,
  `fishersHornpipe.ts`, `whiskeyBeforeBreakfast.ts`, `mississippiSawyer.ts` —
  reels. T1, moderate-to-high confidence each; see each file's own provenance
  comment.
- `swallowtailJig.ts`, `irishWasherwoman.ts`, `keshJig.ts`,
  `morrisonsJig.ts` — jigs. T1, moderate-to-high confidence each.

T1 dropped several of its own candidate list (Reel de Montréal, Red Haired
Boy, Liberty, Ragtime Annie, Salt Creek, Angeline the Baker, The Girl I Left
Behind Me, Flowers of Edinburgh, Rakes of Mallow, Off to California) rather
than transcribe a tune it was not confident it remembered correctly, or (Reel
de Montréal) whose pre-1900 public-domain status it could not confirm — see
`t01-tunes.md`'s Implementation Result for the reasoning per tune.

Each tune is written out in full — AABB, 32 bars, four source lines of 8
bars each (one line per phrase) — rather than with `|: :|` repeat signs.
Two reasons: (1) it makes "32 bars" a plain, unambiguous count instead of
depending on how abcjs expands repeats for the synth's audio buffer, and
(2) explicit one-phrase-per-source-line layout is what lets `Notation` map
`beat -> .abcjs-l{0-3}.abcjs-m{0-7}` with plain arithmetic (see
`ui/Notation.tsx`), instead of guessing line-wrap points the way the hall
spike did (`bar<16?0:1`, tuned to one specific `staffwidth`).
`tunes.test.ts` checks all thirteen parse, have exactly 32 bars of the
declared meter, and have exactly eight bars on each of their four source
lines.

## Medleys

Six, all `timesThroughEach: 2` (a whole number of 64-beat cycles per dance):
`reelMedley` (`reel-set`: Soldier's Joy, St. Anne's Reel), `jigMedley`
(`jig-set`: Haste to the Wedding, Irish Washerwoman), `arkansasSet`
(Arkansas Traveler, Golden Slippers, Fisher's Hornpipe), `mississippiSet`
(Mississippi Sawyer, Old Joe Clark, Whiskey Before Breakfast), `keshSet`
(The Kesh Jig, Morrison's Jig), `swallowtailSet` (Swallowtail Jig, Irish
Washerwoman). `medleys: Medley[]` in `medleys.ts` lists all six, which is
what a shuffle (below) draws from.

### The shuffle

The shuffle itself is **not** in this package: `apps/web/src/program.ts`'s
`shuffleMedleyAssignment`/`shuffleProgramme` assign one of these six medleys
to every dance in the programme's circular order, seeded from `?seed=<n>` in
the hall URL (or the date), so no two adjacent dances repeat a medley and
every medley is heard once before any repeats. What this package contributes
is `medleys` (the list to shuffle over) and the fact that `Player.load`/
`play`/`setTempo` already worked as a plain function of whichever `Medley` is
handed to them — the shuffle needed no change to `Player` at all, only to
which `Medley` `apps/web` calls `load` with. See `apps/web/README.md` and
`docs/adr/`'s milestone notes for the shuffle rule itself.

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

## A known, left-alone rebase quirk: `play()`'s first 0.06 s

`play(atBeat)` schedules the first audio buffer `START_LATENCY` (0.06 s)
ahead of `ctx.currentTime` and rebases `clock` to that future instant, so
`clock.beat()` briefly reports a beat slightly behind `atBeat` — by up to
`START_LATENCY × beatsPerSecond`, well under a tenth of a beat at 112 bpm —
until real time catches up to the scheduled start, after which the beat and
the audio agree exactly for the rest of playback (this is what AC4's steady-
state rate, verified live on the deployed page, measures). Rebasing the
clock immediately at call time instead (to `ctx.currentTime`) would remove
the transient but decouple the reported beat from the actual audio start by
that same 0.06 s in the other direction — a real behaviour change to a
number the plan's own acceptance criteria are read from, not a pure
refactor. M10 (cleanup) identified this, confirmed B1 did not touch it, and
left it rather than change any observable timing: recorded here as a known,
bounded quirk rather than fixed silently.

## `Player.onCycle` has no caller today, and is kept anyway

`apps/web`'s hall route reads `player.clock` and calls `play`/`load`/
`setTempo`/`stop` directly; nothing subscribes to `onCycle`. It is not dead
in the sense of unreachable code — it is the only observable window onto
`fireCycle`/`lastFiredCycle`/`tuneAt`, the internal bookkeeping that decides
which tune plays each 64-beat cycle, and `Player.test.ts`'s cycle-boundary
and mid-medley tests exercise that bookkeeping entirely through it. It is
also part of the milestone-plan's own `Player` contract (`onCycle` was
specified, not added speculatively), and a natural hook for a future "now
playing" indicator the demo does not have yet. M10 (cleanup) considered
removing it as unused API surface and chose to keep and document it instead,
since removing it would mean either deleting the only tests of the internal
cycle-selection logic or rewriting them against private state.
