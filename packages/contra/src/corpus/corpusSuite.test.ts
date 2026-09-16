import { danceBeats } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DANCE_FILES } from "../dances/danceFiles.js";
import { danceFromFile } from "../dances/loadDances.js";
import { LAB_RUN } from "../dances/danceLab.js";
import { danceAlone, linesFor } from "../dances/oracle.js";
import {
  corpusPresent,
  corpusStatus,
  derivedDanceIds,
  hasDerivedDance,
  readCorpusSet,
  readDerivedDance,
} from "./corpusData.js";
import type { DerivedDance } from "./importCallersBox.js";
import { importCallersBox, phraseLengths } from "./importCallersBox.js";

/**
 * **The corpus suite**: every dance of the hand set, imported, loaded through
 * the same door `data/dances/*.json` come in by, and planned one time through.
 *
 * It is the check the whole derived tree exists for (`docs/corpus-derived.md`
 * §"Why it exists"): a named set of real dances the engine is run against on
 * every push, so that a change to resolution, to the planner or to the record
 * format is measured against forty dances rather than against the twenty-one
 * this repository happens to have encoded.
 *
 * **Skipped, with a message, when the corpus is not there.** It is private
 * (`docs/adr/2026-09-13-corpus-and-permission.md`), most checkouts will not have
 * it, and CI reads it only when `CONTRA_DATA_TOKEN` is set — so
 * `CONTRA_DATA=/nonexistent pnpm --filter @caller/contra test` is green and says
 * why, rather than red.
 *
 * ## The set
 *
 * `derived/sets/hand.json` when the derive chain has written one. Until it has,
 * a **stand-in** of the same shape and for the same purpose: the twenty-one
 * dances this package already encodes — so the suite covers every figure the
 * library has — plus the thirty derived records with the most videos, which is
 * the popularity proxy `hand.json` itself is built on.
 *
 * ## What it asserts
 *
 * That an imported record **loads and plans**, and that every phrase of it sums
 * to the length its own `phraseStructure` declares. A record whose formation is
 * not one of the three this package builds is not a failure: it is counted,
 * named and skipped, which is what `importCallersBox`'s one refusal means.
 */

/** How many derived records the stand-in set takes by popularity. */
const STAND_IN_POPULAR = 30;

/** The couples the suite plans each dance at: one length, the shortest it is checked at. */
const SUITE_COUPLES = 4;

/** One dance's line of the summary. */
interface SuiteRow {
  id: string;
  title: string;
  calls: number;
  customs: number;
  /** How many `custom` figure events the planner really emitted. */
  events?: number;
  /** What went wrong, or `undefined`. */
  fault?: string;
  /** Set when the record's formation is not one we build. */
  refused?: string;
}

// The status is in the suite's **name** so that a skipped run says why it
// skipped and where it looked, which a bare `skipIf` does not.
describe.skipIf(!corpusPresent)(`the corpus suite — ${corpusStatus()}`, () => {
  it("imports, loads and plans every dance of the hand set", () => {
    const ids = suiteIds();
    expect(ids.length, "the suite set is empty").toBeGreaterThan(0);

    const rows: SuiteRow[] = [];
    for (const id of ids) {
      if (!hasDerivedDance(id)) {
        rows.push({ id, title: "", calls: 0, customs: 0, refused: "no derived record" });
        continue;
      }
      rows.push(run(readDerivedDance(id)));
    }

    report(rows);

    const failed = rows.filter((row) => row.fault !== undefined);
    expect(failed.map((row) => `${row.id} ${row.title}: ${row.fault ?? ""}`)).toEqual([]);
  });
});

/** One record: imported, loaded, planned, and every phrase's arithmetic checked. */
function run(record: DerivedDance): SuiteRow {
  const result = importCallersBox(record);
  if (!result.ok) {
    return { id: record.id, title: record.title, calls: 0, customs: 0, refused: result.reason };
  }
  const file = result.dance;
  const calls = file.phrases.flatMap((phrase) => phrase.figures);
  const customs = calls.filter((call) => call.figure === "custom").length;
  const row: SuiteRow = {
    id: record.id,
    title: file.title,
    calls: calls.length,
    customs,
  };

  // **Every phrase sums to its declared length**, read off `phraseStructure`
  // rather than off the record we just wrote — the same question asked of the
  // source, so the importer cannot pass by agreeing with itself.
  const declared = phraseLengths(record.phraseStructure, record.phrases.length);
  for (const [at, phrase] of file.phrases.entries()) {
    const beats = phrase.figures.reduce((sum, call) => sum + call.beats, 0);
    const want = declared[at];
    if (want !== undefined && beats !== want) {
      row.fault = `${phrase.name} is ${String(beats)} beats, ${String(want)} declared`;
      return row;
    }
  }

  try {
    const dance = danceFromFile(file);
    const couples = linesFor(dance).includes(SUITE_COUPLES) ? SUITE_COUPLES : linesFor(dance)[0]!;
    const timeline = danceAlone(dance, couples, danceBeats(dance), {}, LAB_RUN).timeline();
    // **It really planned**: a decider that emitted nothing would pass a
    // `not.toThrow` and mean nothing at all.
    row.events = timeline.figures().filter((event) => event.figure === "custom").length;
    if (row.events === 0) row.fault = "planned no custom figure at all";
  } catch (error) {
    row.fault = error instanceof Error ? error.message : String(error);
  }
  return row;
}

/** One line per dance, then one line of totals. */
function report(rows: readonly SuiteRow[]): void {
  const lines = rows.map((row) => {
    const what =
      row.fault !== undefined
        ? `FAILED ${row.fault}`
        : row.refused !== undefined
          ? `skipped (${row.refused})`
          : "planned";
    return (
      `  ${row.id.padStart(6)}  ${row.title.slice(0, 42).padEnd(42)} ` +
      `${String(row.calls).padStart(3)} calls  ${String(row.customs).padStart(3)} custom  ` +
      `${String(row.events ?? 0).padStart(4)} planned  ${what}`
    );
  });
  const planned = rows.filter((row) => row.fault === undefined && row.refused === undefined);
  const totals =
    `  ${String(rows.length)} dances: ${String(planned.length)} planned, ` +
    `${String(rows.filter((row) => row.refused !== undefined).length)} skipped, ` +
    `${String(rows.filter((row) => row.fault !== undefined).length)} failed; ` +
    `${String(planned.reduce((sum, row) => sum + row.calls, 0))} calls, ` +
    `${String(planned.reduce((sum, row) => sum + row.customs, 0))} of them custom, ` +
    `${String(planned.reduce((sum, row) => sum + (row.events ?? 0), 0))} figure events planned`;
  console.info(`corpus suite — ${corpusStatus()}\n${lines.join("\n")}\n${totals}`);
}

/**
 * The set the suite runs: `hand.json`, or the stand-in described in the header.
 *
 * The stand-in is deterministic — the encoded dances in the order the package
 * bundles them, then the most-watched records, ties broken by id — so two runs
 * over one data root print the same table.
 */
function suiteIds(): string[] {
  try {
    return readCorpusSet("hand").dances.map((dance) => dance.id);
  } catch {
    return standInIds();
  }
}

/** The encoded dances' own Caller's Box ids, then the most-watched records. */
function standInIds(): string[] {
  const out = new Set<string>();
  for (const file of Object.values(DANCE_FILES)) out.add(String(file.source.callersBoxId));
  const popular = derivedDanceIds()
    .map((id) => {
      const record = readDerivedDance(id);
      return { id, videos: record.videos ?? 0 };
    })
    .sort((a, b) => b.videos - a.videos || a.id.localeCompare(b.id))
    .slice(0, STAND_IN_POPULAR);
  for (const { id } of popular) out.add(id);
  return [...out];
}
