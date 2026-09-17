import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FigureFixture } from "../figureFixture.js";

/**
 * The commit the coded figures were sampled at, written into every fixture.
 *
 * `main` at **d834697** — #101, the swing's thirty degrees — which is the last
 * commit that held every coded figure this milestone deletes. The first
 * recording was taken a commit earlier and #101 moved the swing under it; the
 * goldens caught that, which is what they are for, and every fixture was
 * re-recorded against the figures as that commit left them.
 */
export const SAMPLED_AT =
  "d834697 (2026-09-17), the last commit on main that held the coded figures";

/** Where the recorded coded figures live: one JSON file per figure id. */
const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/**
 * A coded figure, read back off disk.
 *
 * **There is deliberately nothing here that can write one.** The recorder that
 * sampled these files needed a coded figure to sample, and the coded figures
 * are deleted — a golden regenerated from the thing it is checking is not a
 * golden. `figureFixture.ts` says the rest.
 */
export const fixtureOf = (id: string): FigureFixture =>
  JSON.parse(readFileSync(join(DIR, `${id}.json`), "utf8")) as FigureFixture;
