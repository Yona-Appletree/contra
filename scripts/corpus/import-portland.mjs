#!/usr/bin/env node
// Reads the Portland Contra Programs community spreadsheet (CSV, never
// committed — see AGENTS.md and data/README.md) and writes the derived,
// committable aggregate data/corpus/portland-programs.json: dance titles,
// choreographers, programmed counts, distinct-caller counts and the modal
// Features shorthand per dance. No figure text, no per-program detail, no
// source spreadsheet content beyond those facts.
//
// Usage: node scripts/corpus/import-portland.mjs <path-to-csv>
//
// Deterministic: run it twice against the same CSV on the same day and the
// output bytes are identical (the `generated` field is a date, not a
// timestamp — see data/README.md for why).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normaliseTitle, titleKey } from "../../packages/contra/src/corpus/normaliseTitle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUTPUT_PATH = resolve(REPO_ROOT, "data/corpus/portland-programs.json");

const EXPECTED_HEADER = [
  "Date",
  "Caller",
  "Band",
  "Hall",
  "Dance titles",
  "Choreographer",
  "Features",
  "Source",
  "Video",
];

const COL = {
  date: 0,
  caller: 1,
  danceTitle: 4,
  choreographer: 5,
  features: 6,
  source: 7,
};

const MONTHS = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

// "Sat, Jun 19, 2027" style. A dated row starts (or continues, if the date
// repeats) a program. Anything else in the Date column — blank, or note
// text like "Sunday morning session" — is a continuation of whatever
// program is already open (see corpus-analysis.md section "Parsing
// approach and caveats").
const DATE_RE = /^[A-Za-z]{3},\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/;

const CALLERS_BOX_ID_RE = /thecallersbox\/dance\.php\?id=(\d+)/;

// Session filler, not named dances (corpus-analysis.md section 1): titles
// made up entirely of these words are excluded from the dances array, or
// they would swamp the top of the "count" ranking (e.g. "waltz" alone
// appears ~49 times, more than any actual dance in this corpus).
const FILLER_WORDS = new Set(["waltz", "break", "hambo"]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  while (i < len) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseDate(raw) {
  const trimmed = raw.trim();
  const match = DATE_RE.exec(trimmed);
  if (!match) return null;
  const month = MONTHS[match[1]];
  if (!month) return null;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function isFiller(title) {
  const tokens = title
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (tokens.length === 0) return true; // blank title: never a named dance
  return tokens.every((token) => FILLER_WORDS.has(token));
}

function extractCallersBoxId(sourceUrl) {
  const match = CALLERS_BOX_ID_RE.exec(sourceUrl ?? "");
  return match ? match[1] : null;
}

/** Picks the entry with the highest count; ties break alphabetically for determinism. */
function pickMostCommon(counts) {
  let best = null;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && best !== null && value.localeCompare(best) < 0)
    ) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The most-common Features text(s): entries tied for the highest count,
 * sorted alphabetically for determinism. When every recorded phrasing for a
 * dance is distinct (max count 1 — common, since callers word their own
 * Features shorthand differently row to row per corpus-analysis.md), this
 * is NOT "all phrasings tied at 1": that would mean committing most of the
 * dance's raw figure notation across every instance ever logged, which is
 * exactly the figure text the milestone brief says never to store. In that
 * degenerate case only the single alphabetically-first text is kept, same
 * as a dance with one instance total.
 */
function pickTopFeatures(counts) {
  let maxCount = 0;
  for (const count of counts.values()) {
    if (count > maxCount) maxCount = count;
  }
  if (maxCount === 0) return [];
  const tied = [...counts.entries()]
    .filter(([, count]) => count === maxCount)
    .map(([text]) => text)
    .sort((a, b) => a.localeCompare(b));
  if (maxCount === 1 && tied.length > 1) return [tied[0]];
  return tied;
}

function bump(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node scripts/corpus/import-portland.mjs <path-to-csv>");
    process.exit(1);
  }

  const text = readFileSync(csvPath, "utf-8");
  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new Error("CSV is empty");
  }

  const header = rows[0].map((cell) => cell.trim());
  for (let i = 0; i < EXPECTED_HEADER.length; i += 1) {
    if (header[i] !== EXPECTED_HEADER[i]) {
      throw new Error(
        `Unexpected CSV header at column ${i}: got ${JSON.stringify(header[i])}, expected ${JSON.stringify(
          EXPECTED_HEADER[i],
        )}. The importer's column positions (scripts/corpus/import-portland.mjs COL) assume this exact header.`,
      );
    }
  }

  /** @type {{ date: string, hasDance: boolean }[]} */
  const programs = [];
  let currentProgram = null; // { date, hasDance }
  let currentCaller = "";

  // Per titleKey aggregation.
  const titleCount = new Map(); // key -> count
  const titleSpellings = new Map(); // key -> Map(exactSpelling -> count)
  const titleChoreographers = new Map(); // key -> Map(choreographer -> count)
  const titleCallers = new Map(); // key -> Set(caller)
  const titleFeatures = new Map(); // key -> Map(featuresText -> count)
  const titleCallersBoxIds = new Map(); // key -> Map(id -> count)

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.every((cell) => cell.trim() === "")) continue; // fully blank row

    const rawDate = row[COL.date] ?? "";
    const parsedDate = parseDate(rawDate);

    if (parsedDate) {
      if (!currentProgram || currentProgram.date !== parsedDate) {
        currentProgram = { date: parsedDate, hasDance: false };
        programs.push(currentProgram);
        currentCaller = "";
      }
    } else if (!currentProgram) {
      // Note rows before the first dated row (spreadsheet header notes).
      continue;
    }

    const rawCaller = (row[COL.caller] ?? "").trim();
    if (rawCaller) currentCaller = rawCaller;

    const rawTitle = (row[COL.danceTitle] ?? "").trim();
    if (!rawTitle) continue;

    currentProgram.hasDance = true;

    if (isFiller(rawTitle)) continue;

    const display = normaliseTitle(rawTitle);
    const key = titleKey(rawTitle);

    titleCount.set(key, (titleCount.get(key) ?? 0) + 1);

    if (!titleSpellings.has(key)) titleSpellings.set(key, new Map());
    bump(titleSpellings.get(key), display);

    if (!titleChoreographers.has(key)) titleChoreographers.set(key, new Map());
    bump(titleChoreographers.get(key), (row[COL.choreographer] ?? "").trim());

    if (!titleCallers.has(key)) titleCallers.set(key, new Set());
    if (currentCaller) titleCallers.get(key).add(currentCaller);

    if (!titleFeatures.has(key)) titleFeatures.set(key, new Map());
    bump(titleFeatures.get(key), (row[COL.features] ?? "").trim());

    if (!titleCallersBoxIds.has(key)) titleCallersBoxIds.set(key, new Map());
    const cbId = extractCallersBoxId(row[COL.source]);
    bump(titleCallersBoxIds.get(key), cbId);
  }

  const programsWithDances = programs.filter((p) => p.hasDance);
  const dates = programsWithDances.map((p) => p.date).sort();
  const dateRange = dates.length > 0 ? [dates[0], dates[dates.length - 1]] : [null, null];

  const dances = [...titleCount.entries()].map(([key, count]) => {
    const title = pickMostCommon(titleSpellings.get(key));
    const choreographer = pickMostCommon(titleChoreographers.get(key)) ?? "";
    const callers = titleCallers.get(key)?.size ?? 0;
    const featureTop = pickTopFeatures(titleFeatures.get(key));
    const cbIdCounts = titleCallersBoxIds.get(key);
    const callersBoxId = pickMostCommon(cbIdCounts);

    const entry = {
      title,
      choreographer,
      count,
      callers,
      features: featureTop,
    };
    if (callersBoxId) {
      entry.callersBoxId = callersBoxId;
    }
    return entry;
  });

  dances.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));

  const output = {
    generated: new Date().toISOString().slice(0, 10),
    source: "Portland Contra Programs (community spreadsheet)",
    programs: programsWithDances.length,
    dateRange,
    dances,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(
    `Wrote ${OUTPUT_PATH}: ${output.programs} programs, ${output.dances.length} distinct dances.`,
  );
}

main();
