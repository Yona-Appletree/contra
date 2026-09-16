// abcjs' General MIDI program -> instrument name table: the names it builds
// soundfont URLs from, and therefore the names public/soundfont's directories
// carry. `build-soundfont.mjs` reads it to name what it downloads and
// `src/soundfont.test.mjs` reads it to check that every band a tune names has
// its samples on disk — one lookup rather than a hand-written map that would
// go stale the first time a tune picked up a new instrument.
//
// abcjs is @caller/music's dependency and this file is not part of its public
// API; both readers here are build/test code, so they borrow it through that
// package the way build-soundfont.mjs already borrows the flattener.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, "../../../packages/music/package.json"));

/** @type {string[]} indexed by General MIDI program number. */
export const instrumentNames = require("abcjs/src/synth/instrument-index-to-name.js");

/**
 * The name abcjs gives a program, e.g. 40 -> "violin", 105 -> "banjo".
 *
 * @param {number} program
 * @returns {string}
 */
export function instrumentNameOf(program) {
  const name = instrumentNames[program];
  if (name === undefined) throw new Error(`no General MIDI instrument for program ${program}`);
  return name;
}
