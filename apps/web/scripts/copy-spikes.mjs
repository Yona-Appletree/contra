#!/usr/bin/env node
// Copies the repo-root spikes/ directory into the built app's dist/spikes/
// so the visual record is served at /contra/spikes/ alongside the app.
import { cpSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../../spikes");
const dest = resolve(here, "../dist/spikes");

cpSync(src, dest, { recursive: true });
console.log(`copy-spikes: copied ${src} -> ${dest}`);
