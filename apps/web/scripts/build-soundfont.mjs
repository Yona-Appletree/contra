#!/usr/bin/env node
// Builds public/soundfont/: the FluidR3_GM per-note mp3s the bundled tunes
// need, so nothing streams from paulrosen.github.io at run time. Modelled on
// spikes/music-sound/build-samples.mjs. Source: FluidR3_GM (MIT, Frank Wen)
// rendered to per-note mp3s by gleitz/midi-js-soundfonts (MIT), served at
// paulrosen.github.io — abcjs' own default soundfont.
//
// Which notes: every tune's written ABC (programs, chord symbols and all) is
// parsed and sequenced by abcjs, then flattened into MIDI events the way
// abcjs' synth does before it loads samples; the (instrument, note) pairs of
// every note event are the subset. Idempotent: a file already on disk is not
// fetched again. Writes manifest.json with the note list and a digest of the
// tunes, which src/soundfont.test.mjs checks.
//
// Run: pnpm --filter @caller/web soundfont
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { instrumentNames } from "./instrumentName.mjs";
import { tunesDigest } from "./soundfontDigest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const out = resolve(root, "public/soundfont");
const BASE = "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/";

// abcjs is @caller/music's dependency, and the flattener is not part of its
// public API; this is a build script, so it borrows both through that package.
const require = createRequire(resolve(root, "../../packages/music/package.json"));
const abcjs = require("abcjs");
const flatten = require("abcjs/src/synth/abc_midi_flattener.js");
const noteName = require("abcjs/src/synth/pitch-to-note-name.js");

// The tunes are TypeScript in a workspace package; Vite loads them the way the
// dev server does, so this script needs no build step and no second copy.
const server = await createServer({
  root,
  configFile: resolve(root, "vite.config.ts"),
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  logLevel: "error",
});
let tunes;
try {
  // The tunes module alone, by path: it imports nothing but @caller/core, so
  // abcjs (CommonJS, awkward under SSR) stays out of the loader entirely.
  const tunesModule = resolve(root, "../../packages/music/src/tunes/index.ts");
  ({ tunes } = await server.ssrLoadModule(`/@fs${tunesModule}`));
} finally {
  await server.close();
}

const need = new Set();
for (const tune of tunes) {
  const [visualObj] = abcjs.parseOnly(tune.abc);
  const sequence = abcjs.synth.sequence(visualObj, {});
  const flat = flatten(sequence, {}, visualObj.formatting.percmap, visualObj.formatting.midi);
  for (const track of flat.tracks) {
    let instrument = 0;
    for (const event of track) {
      if (event.cmd === "program") instrument = event.instrument;
      if (event.cmd === "note") {
        need.add(`${instrumentNames[event.instrument ?? instrument]}/${noteName[event.pitch]}`);
      }
    }
  }
}
const notes = [...need].sort();
console.log(`build-soundfont: ${String(tunes.length)} tunes need ${String(notes.length)} notes`);

let fetched = 0;
for (const key of notes) {
  const [instrument, note] = key.split("/");
  const dir = resolve(out, `${instrument}-mp3`);
  const file = resolve(dir, `${note}.mp3`);
  if (existsSync(file)) continue;
  mkdirSync(dir, { recursive: true });
  const url = `${BASE}${instrument}-mp3/${note}.mp3`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`build-soundfont: ${url} -> ${String(response.status)}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  fetched += 1;
}

// Anything on disk the tunes no longer need is reported, not deleted: the
// manifest is what the test checks, and a stray file costs a few kilobytes.
const stray = [];
for (const dir of existsSync(out) ? readdirSync(out) : []) {
  if (!dir.endsWith("-mp3")) continue;
  for (const file of readdirSync(resolve(out, dir))) {
    const key = `${dir.slice(0, -4)}/${file.replace(/\.mp3$/, "")}`;
    if (!need.has(key)) stray.push(key);
  }
}
if (stray.length > 0)
  console.log(`build-soundfont: ${String(stray.length)} files no tune needs: ${stray.join(", ")}`);

const manifest = {
  source: BASE,
  licence:
    "FluidR3_GM by Frank Wen (MIT), rendered to per-note mp3s by gleitz/midi-js-soundfonts (MIT)",
  generatedBy: "apps/web/scripts/build-soundfont.mjs",
  tunesDigest: tunesDigest(tunes),
  notes,
};
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`build-soundfont: fetched ${String(fetched)}, wrote manifest.json`);
