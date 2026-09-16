// The self-hosted soundfont matches the tunes: public/soundfont/manifest.json
// was built from the tunes as they are now, and every note it lists is on
// disk. See scripts/build-soundfont.mjs.
import { tunes } from "@caller/music";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { instrumentNameOf } from "../scripts/instrumentName.mjs";
import { tunesDigest } from "../scripts/soundfontDigest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const soundfont = resolve(here, "../public/soundfont");
const REBUILD = "run `pnpm --filter @caller/web soundfont` and commit public/soundfont";

/**
 * What the repo will carry in per-note mp3s. Not a technical limit — a budget:
 * a tune given a band nobody else plays costs a few hundred kilobytes of
 * committed audio, which is worth it a few times and not worth it fifteen
 * times. A band that blows this should be a decision, not a surprise in a diff.
 */
const BUDGET_BYTES = 3 * 1024 * 1024;

/** Every instrument any tune's band names, as abcjs would name its directory. */
const played = new Set(
  tunes.flatMap((tune) =>
    [tune.arrangement.melody, tune.arrangement.chords, tune.arrangement.bass].map((voice) =>
      instrumentNameOf(voice.program),
    ),
  ),
);

/** Every mp3 under public/soundfont, with its size. */
function samples() {
  return (existsSync(soundfont) ? readdirSync(soundfont) : [])
    .filter((dir) => dir.endsWith("-mp3"))
    .flatMap((dir) =>
      readdirSync(resolve(soundfont, dir)).map((file) => ({
        instrument: dir.slice(0, -"-mp3".length),
        key: `${dir.slice(0, -"-mp3".length)}/${file.replace(/\.mp3$/, "")}`,
        bytes: statSync(resolve(soundfont, dir, file)).size,
      })),
    );
}

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

  it("covers every instrument every tune's band names", () => {
    // Read off the tunes rather than off a fixed list of programs: a tune
    // given a new band brings its instrument into this check for free, and
    // fails here — naming the rebuild — rather than going silent in the hall.
    const instruments = new Set(manifest.notes.map((key) => key.split("/")[0]));
    for (const instrument of played) {
      expect(instruments.has(instrument), `${instrument} has no notes; ${REBUILD}`).toBe(true);
    }
  });

  it("carries no instrument no tune plays", () => {
    // The other direction: a band dropped from a tune leaves its samples
    // behind, and the build script only reports those rather than deleting
    // them. This is what makes the report actionable.
    for (const { instrument, key } of samples()) {
      expect(played.has(instrument), `${key} belongs to no band any tune plays; ${REBUILD}`).toBe(
        true,
      );
    }
  });

  it("stays inside its size budget", () => {
    const bytes = samples().reduce((total, sample) => total + sample.bytes, 0);
    const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
    expect(
      bytes,
      `public/soundfont is ${mb(bytes)}, over the ${mb(BUDGET_BYTES)} budget`,
    ).toBeLessThan(BUDGET_BYTES);
  });

  it("names its source and licence", () => {
    expect(manifest.source).toContain("midi-js-soundfonts/FluidR3_GM");
    expect(manifest.licence).toContain("MIT");
  });
});
