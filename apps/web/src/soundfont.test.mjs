// The self-hosted soundfont matches the tunes: public/soundfont/manifest.json
// was built from the tunes as they are now, and every note it lists is on
// disk. See scripts/build-soundfont.mjs.
import { BAND, tunes } from "@caller/music";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tunesDigest } from "../scripts/soundfontDigest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const soundfont = resolve(here, "../public/soundfont");
const REBUILD = "run `pnpm --filter @caller/web soundfont` and commit public/soundfont";

/** abcjs' General MIDI instrument names for the three programs of the band. */
const INSTRUMENT = { 40: "violin", 0: "acoustic_grand_piano", 32: "acoustic_bass" };

describe("the self-hosted soundfont", () => {
  const manifest = JSON.parse(readFileSync(resolve(soundfont, "manifest.json"), "utf8"));

  it("was built from the tunes as they are now", () => {
    expect(
      manifest.tunesDigest,
      `the tunes changed since the soundfont was built; ${REBUILD}`,
    ).toBe(tunesDigest(tunes));
  });

  it("has every note it lists on disk", () => {
    expect(manifest.notes.length).toBeGreaterThan(30);
    for (const key of manifest.notes) {
      const [instrument, note] = key.split("/");
      const file = resolve(soundfont, `${instrument}-mp3`, `${note}.mp3`);
      expect(existsSync(file), `${key} is missing; ${REBUILD}`).toBe(true);
    }
  });

  it("covers every instrument of the band", () => {
    const instruments = new Set(manifest.notes.map((key) => key.split("/")[0]));
    for (const voice of [BAND.melody, BAND.chords, BAND.bass]) {
      expect(instruments.has(INSTRUMENT[voice.program]), `program ${String(voice.program)}`).toBe(
        true,
      );
    }
  });

  it("names its source and licence", () => {
    expect(manifest.source).toContain("midi-js-soundfonts/FluidR3_GM");
    expect(manifest.licence).toContain("MIT");
  });
});
