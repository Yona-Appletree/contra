# Tunes carry a chord chart and an arrangement; the ABC is written from them

Date: 2026-09-15. Status: accepted.

## Context

The app plays its tunes through abcjs' synth. The original hall spike's ABC
carried `%%MIDI program 40` (a fiddle) and chord symbols, which is what made it
sound like a band: abcjs writes its own bass-and-chord accompaniment from chord
symbols. Production lost both when the thirteen tunes were typed in as bare
melodies, so the app played one piano line, alone, streaming FluidR3 samples
from paulrosen.github.io at run time. The music-sound listening spike
(`spikes/music-sound/`) compared five routes; the gate ruling of 2026-09-15
chose route 2 — abcjs' synth, driven only by the ABC: fiddle on the melody,
piano and acoustic bass on abcjs' boom-chick — and asked for the chords to be
hand charts checked for plausibility, the samples self-hosted, and the potatoes
played by the arrangement's loudest instrument.

## Decision

1. **A `Tune` is data the ABC is written from.** A tune file states its `key`,
   four `lines` of bare melody (one phrase a line, eight bars a line, a space
   at every half-bar), a `chords` chart (4 × 8, one chord or a `[first, second]`
   pair per bar) and an `arrangement` (three General MIDI voices with
   volumes; the default `BAND` is fiddle 40, piano 0, acoustic bass 32).
   `defineTune` writes `abc` — headers, `%%MIDI program`/`chordprog`/`bassprog`
   /`chordvol`/`bassvol`, chord symbols before the half-bar they start on —
   exactly as the spike's `abcWith` did. `Player`, `Notation` and every test
   keep reading `tune.abc`.
2. **Hand charts are the data; the harmoniser checks them.** The spike's
   harmoniser lives in `@caller/music` (`src/chords/harmonise.ts`) as a pure
   module: `harmonise` drafts a chart for a tune that arrives without one, and
   `plausibility` scores every hand chord against the best stock chord for the
   span it covers (a whole bar, or a half) with no priors. A chart passes when
   no gap exceeds `PLAUSIBILITY_MARGIN` (4; the widest taste call in the bundled
   charts is 3.2, a chord sharing no tone with the notes under it opens 8 and
   more). It is never an equality test.
3. **The sample subset is committed and digest-checked.** `apps/web/scripts/
build-soundfont.mjs` sequences every tune the way abcjs' synth does and
   downloads exactly the `instrument/note` mp3s it will ask for (FluidR3_GM,
   MIT, via gleitz/midi-js-soundfonts, MIT) into `apps/web/public/soundfont/`,
   with a `manifest.json` carrying a SHA-256 of every tune's ABC.
   `src/soundfont.test.mjs` recomputes the digest, so a tune edited without a
   rebuild fails CI naming the command. `createPlayer(ctx, { soundFontUrl })`
   points abcjs there, with `soundFontVolumeMultiplier` 3.0 stated (abcjs
   gives a custom URL 1.0).
4. **The potatoes' voice is the loudest arrangement voice's family.**
   `potatoesFor` reads the tune's arrangement, takes the loudest voice (the
   melody wins a tie) and maps its program to a family: strings bow the chord
   (a bow bite, a swell, an octave up), pianos strike it, everything else
   plucks it.

## Consequences

- The thirteen tune files are sources, not ABC strings; a new tune is written
  the same way and gets a draft chart from `harmonise` to start from.
- The arrangement is one place — the tune — and the 16-bit pipe the spike
  parked (routes 4 and 5) can be added later as one post-process over the
  sequence abcjs produces from that same ABC, touching neither the charts nor
  the player's scheduling.
- Nothing streams from GitHub at run time; the repo carries about 800 KB of
  mp3 for 32 notes, and the digest test keeps that subset honest.
- `@caller/music` gained no dependency; the build script borrows abcjs'
  private flattener through `packages/music` and is not production code.

## Alternatives

- **Chord symbols typed into the ABC strings.** Rejected: the harmoniser and
  every test would parse chords back out of ABC, and the arrangement would
  have no home but a header line.
- **A range-based sample subset** (every chromatic note per instrument).
  Rejected: the ruling names the subset the tunes need, and the digest test
  makes the exact subset safe.
- **Streaming from abcjs' default host**, as before. Rejected by the ruling.
