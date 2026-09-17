import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CompareOptions } from "../compareFigures.js";
import type { FigureFixture } from "../figureFixture.js";
import type { ContraFigure } from "../../figures/ContraFigure.js";
import { recordFigure } from "../recordFigureFixture.js";

/**
 * The commit the coded figures were sampled at, written into every fixture.
 *
 * `fm-m11-retirement`'s first commit, which is the last tree in which every
 * coded figure this milestone deletes was still there to be sampled.
 */
export const SAMPLED_AT = "3f44e4d (2026-09-17), whose tree is main 99ad224 plus one docs file";

/** Where the recorded coded figures live: one JSON file per figure id. */
const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** A coded figure, read back off disk. */
export const fixtureOf = (id: string): FigureFixture =>
  JSON.parse(readFileSync(join(DIR, `${id}.json`), "utf8")) as FigureFixture;

/**
 * **Temporary (M11, step 1).** The fixture for a figure, recorded or read.
 *
 * With `RECORD_FIGURE_FIXTURES=1` in the environment this samples the coded
 * figure through every one of the golden's own option sets and writes the
 * result; without it, it reads the committed file. The milestone runs it once
 * with the flag, commits what it wrote, and then deletes this function, the
 * recorder and the coded figures together — so a golden cannot be quietly
 * regenerated from the definition it is checking.
 */
export function fixtureFor(
  coded: ContraFigure,
  runs: readonly CompareOptions[],
  sampledAt: string,
): FigureFixture {
  if (process.env["RECORD_FIGURE_FIXTURES"] !== "1") return fixtureOf(coded.id);
  const parts = runs.map((options) => recordFigure(coded, options, sampledAt));
  const first = parts[0];
  if (first === undefined) throw new Error(`${coded.id}: nothing to record`);
  const fixture: FigureFixture = { ...first, runs: {} };
  for (const part of parts) Object.assign(fixture.runs, part.runs);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${coded.id}.json`), `${JSON.stringify(fixture)}\n`);
  return fixture;
}
