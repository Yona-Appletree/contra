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
// A tune is data the ABC is written from — src/tunes/Tune.ts
interface TuneSource {
  slug: string;
  title: string;
  type: "reel" | "jig";
  key: string; // the ABC K: field: "D", "G", "Em", "AMix"
  defaultBpm: number;
  lines: readonly [string, string, string, string]; // the melody, one phrase a line, 8 bars a line
  chords: ChordChart; // the hand chart: 4 × 8 of Chord | [Chord, Chord]
  arrangement?: Arrangement; // default BAND
}
interface Tune extends TuneSource {
  arrangement: Arrangement;
  abc: string; // written by defineTune: headers, %%MIDI directives, chord symbols
  meter: Meter;
  beatsPerCycle: 64;
  source: "traditional, transcribed by hand";
}
type Chord = string; // "D", "A7", "Em"
type BarChords = Chord | readonly [Chord, Chord];
type ChordChart = readonly (readonly BarChords[])[];
interface Voice { program: number; volume: number } // General MIDI program, MIDI velocity
interface Arrangement { melody: Voice; chords: Voice; bass: Voice }
const BAND: Arrangement; // fiddle 40 @ 105, piano 0 @ 48, acoustic bass 32 @ 64
function defineTune(source: TuneSource): Tune;
function writeAbc(tune: Pick<TuneSource, …> & { arrangement: Arrangement }): string;
function barsOf(line: string): string[];
function halvesOf(bar: string): [string, string];
function chordPair(chords: BarChords): readonly [Chord, Chord];

// The harmoniser — src/chords/harmonise.ts
function harmonise(tune: Pick<Tune, "key" | "lines">): ChordChart; // a draft chart
function plausibility(tune: Pick<Tune, "key" | "lines" | "chords">): ChordReport[];
const PLAUSIBILITY_MARGIN: number; // 4
function candidates(key: string): Candidate[]; // the key's five stock chords, tonic first
function inKey(chord: Chord, key: string): boolean;
function notesOf(half: string, key: string): { pc: number; w: number }[];
function parseKey(key: string): ParsedKey;

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
interface PlayerOptions {
  soundFontUrl?: string; // where abcjs loads <instrument>-mp3/<Note>.mp3 from
}
function createPlayer(ctx?: AudioContext, options?: PlayerOptions): Player;

// The potatoes: four chords that count a dance in, src/player/potatoes.ts
function renderPotatoes(sampleRate: number, options?: Partial<PotatoOptions>): Float32Array;
function playPotatoes(
  ctx: AudioContext,
  when?: number,
  options?: Partial<PotatoOptions>,
): AudioBufferSourceNode;
function potatoesFor(tune: Pick<Tune, "key" | "arrangement">, bpm: number): Partial<PotatoOptions>;
function keyOf(tune: Pick<Tune, "key">): { rootHz: number; mode: "major" | "minor"; name: string };
type PotatoVoice = "bowed" | "struck" | "plucked";
function voiceOf(program: number): PotatoVoice;
function loudestVoice(arrangement: Arrangement): Voice;

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

### The potatoes

`renderPotatoes` writes its buffer sample by sample, the same way every buffer
in this package is built, for the four chords a band counts a dance in with
(B3, the user: "four chords or strong notes … its basically '5 6 7 8' before
the '1 2 3 4 …' of the dance"). Four strikes, one a beat: the root,
its fifth, the octave, the third above that and the twelfth, under eight
milliseconds of noise and a plucked decay. The buffer is exactly four beats
long, so `Player.play(atBeat, { potatoBeats: 4 })` schedules it to finish where
the tune's first cycle starts and the fourth chord lands one beat before bar 1
with no gap and no overlap. The **key comes from the tune's own data** (`keyOf`
reads its `key` field, the same text its ABC's `K:` is written from), so a tune
added tomorrow gets potatoes in its own key with nothing else written. So does
the **voice**: `potatoesFor` takes the loudest voice of the tune's arrangement
(`loudestVoice`; the melody wins a tie) and plays the chords in that
instrument's family (`voiceOf`) — the strings **bow** them (a bow bite, a
twenty-millisecond swell, an octave up where a fiddle's chord sits, a shorter
stroke), the pianos **strike** them (the hammer the potatoes always had), and
everything else **plucks** them. With the default `BAND` that is the fiddle.
This closes the state-and-debts note's item 16 ("potatoes want an
arrangement"): the arrangement now exists, on the tune.

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

## The band

Every tune is played by the same band, and the band is written into the ABC.
A tune file is a `defineTune({ key, lines, chords, … })` source: four lines of
bare melody, a hand chord chart over them (one chord a bar, or a `[first,
second]` pair at the half-bar — every bar has a space at its half-bar, which
is where the second chord goes), and an `arrangement` that defaults to `BAND`:
a fiddle (General MIDI 40) on the melody, a piano (0) on the chords and an
acoustic bass (32) on the beat. `writeAbc` turns that into the `abc` string
`Player` and `Notation` read — `%%MIDI program 40`, `%%MIDI chordprog 0`,
`%%MIDI bassprog 32`, the chord and bass volumes, and a `"D"`-style chord
symbol before each half-bar its chord starts on — and abcjs does the rest: it
reads the chord symbols and writes its own boom-chick accompaniment, bass on
the beat and chord off it, the pattern chosen by the meter. This is what the
original hall spike sounded like, and what the music-sound listening spike's
route 2 chose (gate ruling 2026-09-15; ADR
`docs/adr/2026-09-15-tunes-carry-chords-and-arrangement.md`). The notation
draws the chord symbols above the stave, as a caller's card would.

**The samples are self-hosted.** abcjs loads one mp3 per note from
`soundFontUrl`; the app passes its own `public/soundfont/` (see
`apps/web/README.md`), built by `pnpm --filter @caller/web soundfont` from
exactly the notes these tunes need, so nothing streams from
paulrosen.github.io at run time. `createPlayer` states abcjs' own 3.0 volume
multiplier for it, because abcjs would otherwise give a custom URL 1.0.

**The chords are hand charts, and the harmoniser checks them.** The
listening spike's harmoniser lives in `src/chords/harmonise.ts`: `harmonise`
scores each half-bar's notes against the key's five stock chords (I, IV, V7,
vi, ii in a major key; i, VII, III, iv, v in minor; I, bVII, IV, v, ii in
mixolydian) and runs a Viterbi pass over each line with a cost for every
change, which makes it a **draft generator** for a tune that arrives without a
chart. `plausibility` scores every hand chord against the best stock chord
over the span it covers, with no priors; `harmonise.test.ts` requires every
bundled chart to stay within `PLAUSIBILITY_MARGIN` (4) of the best — a chord
sharing no tone with the notes under it opens a gap of 8 and more, the widest
taste call in the bundled charts (the standard `G A7` cadence over Haste to
the Wedding's `efg fdc`) opens 3.2. It is deliberately **not** an equality
test: the draft's transition costs and priors are its own taste, and the hand
chart is allowed a different one. What it cannot catch is a wrong chord that
shares a tone with the notes; the ear is for those.

## Tunes

Thirteen traditional public-domain tunes (nine reels, four jigs), typed as
ABC from the agent's own memory (not copied from any transcription site —
see each tune file's own provenance comment for a confidence note on both the
melody and, since 2026-09-15, the chord chart). Three charts (Soldier's Joy,
Haste to the Wedding, The Kesh Jig) started as the music-sound spike's; the
Kesh's had three cells moved off a D the melody never touches. The
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

Each tune's melody is written out in full — AABB, 32 bars, four source lines
of 8 bars each (one line per phrase) — rather than with `|: :|` repeat signs.
Two reasons: (1) it makes "32 bars" a plain, unambiguous count instead of
depending on how abcjs expands repeats for the synth's audio buffer, and
(2) explicit one-phrase-per-source-line layout is what lets `Notation` map
`beat -> .abcjs-l{0-3}.abcjs-m{0-7}` with plain arithmetic (see
`ui/Notation.tsx`), instead of guessing line-wrap points the way the hall
spike did (`bar<16?0:1`, tuned to one specific `staffwidth`).
`tunes.test.ts` checks all thirteen parse, have exactly 32 bars of the
declared meter, have exactly eight bars on each of their four source lines,
carry the arrangement's `%%MIDI` directives, have a chord on every bar in
their own key, and have two halves of the right length (four eighths for a
reel, three for a jig) in every bar — which is also a check on the
transcriptions themselves.

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
