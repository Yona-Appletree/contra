#!/usr/bin/env node
// Chooses the two named sets of dances the engine is tested against and writes
// `derived/sets/hand.json` and `derived/sets/suite.json`, in the shape
// docs/corpus-derived.md defines under "derived/sets/".
//
//   hand   the three most-danced records carrying each tag value, one per
//          cluster, permission full — a set small enough to read, and the set
//          whose records may be published as fixtures
//   suite  the same at twenty-five per value, plus every tier 1 and tier 2
//          record — what CI runs
//
// The point of "per tag value" rather than "the most popular N" is coverage: a
// list of the top fifty dances is fifty becket-or-improper single-progression
// swing-and-chain dances, and would never once exercise a poussette, a
// Sicilian circle or an odd beat count. Selecting per value guarantees each
// corner of the vocabulary is represented by the most-danced example of it.
//
// ## pins.json
//
// `derived/sets/pins.json` is the one hand-edited file in the derived tree,
// and this script NEVER overwrites one that exists. When there is none it
// writes a seed: an `include` for every dance already encoded in the public
// repository's `data/dances/`, so that the set the app dances is also the set
// the tests cover from the first run. Everything after that is a human's edit.
//
// ## Rewriting the index
//
// `publishable` in `derived/index.jsonl` depends on the hand set, which this
// script is what writes — so this script also rewrites that one field in
// every index line, using derive-index's own rule. That is what lets the
// chain run index → sets and stop, with no second index pass. derive-index
// reads `hand.json` and `pins.json` when they exist, so re-running it
// afterwards is a no-op; that is the property to check if this ever looks
// wrong.
//
// Usage:
//   node scripts/corpus/derive-sets.mjs
//   node scripts/corpus/derive-sets.mjs --data ../contra-data
//   node scripts/corpus/derive-sets.mjs --report    # counts, writes nothing
//
// There is no --only: like derive-clusters, the output is global — a set built
// from a handful of records is not a smaller set, it is a wrong one.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Both set files are copied verbatim into the public repository by
// derive-fixtures, where `pnpm format:check` will see them — so they are
// formatted with THIS repository's prettier config (print width 100), not with
// the private data root's (which has none, and would give prettier's default
// 80). derive-dances' formatter already resolves the config that way for
// exactly this reason, so it is borrowed rather than restated.
import { formatRecord as formatForPublicRepo } from "./derive-dances.mjs";
import {
  ALL_TAG_VALUES,
  encodedIndex,
  formatIndex,
  loadEncodedDances,
  parseIndex,
  publishableFor,
  resolveDataRoot,
} from "./derive-index.mjs";

export { resolveDataRoot };

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");

/** docs/corpus-derived.md's two sets, and the `rule` line each one records. */
export const HAND = {
  name: "hand",
  perValue: 2,
  greedy: true,
  allTiers: false,
  rule:
    "pins, then greedily the permission-full record covering the most tag " +
    "values still short of 2 per value, by clusterVideos, one per cluster",
};

export const SUITE = {
  name: "suite",
  perValue: 25,
  greedy: false,
  allTiers: true,
  rule:
    "25 per tag value by clusterVideos, permission full, " +
    "plus every tier 1 and tier 2 record, plus pins",
};

// The tiers the suite takes whole.
const SUITE_TIERS = [1, 2];

// ---------------------------------------------------------------------------
// pins.json
// ---------------------------------------------------------------------------

/**
 * The seed pins file: one `include` for every dance encoded in
 * `data/dances/`, keyed by the Caller's Box id it names. Written once, when
 * there is no pins.json at all, and hand-edited from then on.
 */
export function seedPins(encodedById) {
  const include = [...encodedById.keys()]
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => ({ id, reason: "encoded in data/dances" }));
  return { include, exclude: [], cleared: [] };
}

/** A pins file with its three lists guaranteed to be arrays. */
export function normalisePins(pins) {
  return {
    include: pins?.include ?? [],
    exclude: pins?.exclude ?? [],
    cleared: pins?.cleared ?? [],
  };
}

// ---------------------------------------------------------------------------
// Choosing a set
// ---------------------------------------------------------------------------

/** Most danced first, then the lower id, so the choice never depends on file order. */
function byPopularity(a, b) {
  return (b.clusterVideos ?? 0) - (a.clusterVideos ?? 0) || Number(a.id) - Number(b.id);
}

/** A record's cluster, or the record itself when nothing joined it to one. */
function clusterKeyOf(line) {
  return line.cluster ?? `id:${line.id}`;
}

/**
 * The set itself, pure: index lines and pins in, the file's `dances` array and
 * the counts --report prints out.
 *
 * Two strategies, because the two sets want different things.
 *
 * `hand` is GREEDY, and small on purpose. It starts with the pins, then
 * repeatedly takes the record covering the most tag values still short of the
 * quota — ties going to the most-danced, then the lower id — and stops when
 * nothing left can fill a gap. Taking the top `perValue` records of every
 * value independently gave 117 dances against a two-hundred-slot quota,
 * because each rare value dragged in a record nothing else needed; choosing
 * for coverage instead lets one well-stocked dance answer for a dozen values
 * at once, which is what a set a person is meant to read through requires.
 *
 * `suite` is PER-VALUE: the `perValue` most-danced records carrying each
 * value, plus every tier 1 and tier 2 record. CI runs it and nobody reads it,
 * so breadth beats brevity there and the simple rule is the right one.
 *
 * Both keep one record per cluster — a cluster is one dance under several ids,
 * and three copies of Heartbeat Contra would be a set of one — and in both,
 * every exclude pin is removed last, so an exclusion cannot be out-voted.
 */
export function chooseSet(lines, { perValue, allTiers = false, greedy = false }, pins = {}) {
  const { include, exclude, cleared } = normalisePins(pins);
  const excluded = new Set(exclude.map((pin) => String(pin.id)));
  const byId = new Map(lines.map((line) => [String(line.id), line]));

  // id → Set of reasons, built in the order the reasons are decided and
  // re-ordered at the end so the file does not depend on that order.
  const reasons = new Map();
  const addReason = (id, reason) => {
    if (!reasons.has(id)) reasons.set(id, new Set());
    reasons.get(id).add(reason);
  };

  const sorted = [...lines].sort(byPopularity);
  const byTag = new Map(ALL_TAG_VALUES.map((tag) => [tag, []]));
  for (const line of sorted) {
    if (excluded.has(String(line.id))) continue;
    if (line.permission !== "full") continue;
    for (const tag of line.tags ?? []) byTag.get(tag)?.push(line);
  }

  // `candidates` is how many DISTINCT CLUSTERS could ever fill this value —
  // the ceiling the quota is measured against, and what --report calls short.
  const fill = new Map(
    ALL_TAG_VALUES.map((tag) => [
      tag,
      { candidates: new Set((byTag.get(tag) ?? []).map(clusterKeyOf)).size, chosen: 0 },
    ]),
  );

  // clusterKey → the id standing for that cluster in this set. "One per
  // cluster" holds over the whole set, not merely within one tag value:
  // whichever step reaches a cluster first picks its record, and every later
  // step either reuses that record or passes the cluster over.
  const standsFor = new Map();
  const claim = (line) => {
    const key = clusterKeyOf(line);
    if (!standsFor.has(key)) standsFor.set(key, String(line.id));
  };

  const missingPins = [];
  const pinned = [];
  for (const pin of include) {
    const id = String(pin.id);
    if (!byId.has(id)) {
      missingPins.push(id);
      continue;
    }
    if (excluded.has(id)) continue;
    pinned.push({ line: byId.get(id), reason: `pin:${pin.reason ?? ""}` });
  }

  if (greedy) {
    // What a record would add: one per value it carries that is still short.
    // A record whose every value is already stocked is worth nothing, however
    // popular it is, and is never taken.
    const gainOf = (line) => {
      let gain = 0;
      for (const tag of line.tags ?? []) {
        const counts = fill.get(tag);
        if (counts && counts.chosen < perValue) gain += 1;
      }
      return gain;
    };
    const take = (line, pinReason) => {
      const id = String(line.id);
      claim(line);
      if (pinReason) addReason(id, pinReason);
      for (const tag of line.tags ?? []) {
        const counts = fill.get(tag);
        if (!counts || counts.chosen >= perValue) continue;
        counts.chosen += 1;
        addReason(id, `tag:${tag}`);
      }
    };

    // The pins are in the set whatever their permission, and they go first, so
    // that what they already cover is not bought a second time.
    for (const pin of pinned) take(pin.line, pin.reason);

    for (;;) {
      let best = null;
      let bestGain = 0;
      // `sorted` is most-danced-then-lowest-id and the comparison is strict,
      // so the tie-break falls out of the scan order rather than a second sort.
      for (const line of sorted) {
        const id = String(line.id);
        if (excluded.has(id) || reasons.has(id)) continue;
        if (line.permission !== "full") continue;
        if (standsFor.has(clusterKeyOf(line))) continue;
        const gain = gainOf(line);
        if (gain > bestGain) {
          best = line;
          bestGain = gain;
        }
      }
      // Every value is either at its quota or out of candidates.
      if (!best) break;
      take(best, null);
    }
  } else {
    for (const tag of ALL_TAG_VALUES) {
      const counts = fill.get(tag);
      const usedHere = new Set();
      for (const line of byTag.get(tag) ?? []) {
        if (counts.chosen >= perValue) break;
        const key = clusterKeyOf(line);
        if (usedHere.has(key)) continue;
        const already = standsFor.get(key);
        if (already !== undefined && already !== String(line.id)) continue;
        usedHere.add(key);
        claim(line);
        addReason(String(line.id), `tag:${tag}`);
        counts.chosen += 1;
      }
    }

    if (allTiers) {
      // Every tier 1 and tier 2 record, whatever its permission: the set is a
      // list of ids and reasons, and a gated record stays gated in the index.
      for (const line of sorted) {
        if (excluded.has(String(line.id))) continue;
        if (SUITE_TIERS.includes(line.tier)) addReason(String(line.id), `tier:${line.tier}`);
      }
    }

    for (const pin of pinned) addReason(String(pin.line.id), pin.reason);
  }

  for (const id of excluded) reasons.delete(id);

  const pinOrder = new Map(include.map((pin, at) => [`pin:${pin.reason ?? ""}`, at]));
  const tagOrder = new Map(ALL_TAG_VALUES.map((tag, at) => [`tag:${tag}`, at]));
  const reasonRank = (reason) => {
    if (reason.startsWith("pin:")) return [0, pinOrder.get(reason) ?? 0];
    if (reason.startsWith("tier:")) return [1, Number(reason.slice("tier:".length))];
    return [2, tagOrder.get(reason) ?? 0];
  };

  const dances = [...reasons.keys()]
    .map((id) => byId.get(id))
    // The doc's order: tier first, then the most-danced, then the lower id.
    .sort((a, b) => a.tier - b.tier || byPopularity(a, b))
    .map((line) => ({
      id: String(line.id),
      cluster: line.cluster ?? null,
      title: line.title ?? "",
      tier: line.tier,
      reasons: [...reasons.get(String(line.id))].sort((a, b) => {
        const [groupA, withinA] = reasonRank(a);
        const [groupB, withinB] = reasonRank(b);
        return groupA - groupB || withinA - withinB || a.localeCompare(b);
      }),
    }));

  return {
    dances,
    fill,
    missingPins,
    clearedIds: new Set(cleared.map((pin) => String(pin.id))),
  };
}

/** A set as the object written to disk. `generatedAt` is a date, stable within a day. */
export function setFile({ dances, rule, generatedAt }) {
  return { generatedAt, rule, dances };
}

/** Today, as the `generatedAt` date. */
export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Rewriting the index
// ---------------------------------------------------------------------------

/**
 * `publishable` brought up to date now that the hand set exists, by
 * derive-index's own rule so the two files can never disagree. Every other
 * field, and the key order, is left exactly as it was.
 */
export function rewritePublishable(lines, { handIds, clearedIds }) {
  let changed = 0;
  const out = lines.map((line) => {
    const publishable = publishableFor({
      status: line.status,
      permission: line.permission,
      inHandSet: handIds.has(String(line.id)),
      cleared: clearedIds.has(String(line.id)),
    });
    if (publishable !== line.publishable) changed += 1;
    return { ...line, publishable };
  });
  return { lines: out, changed };
}

// ------------------------------------------------------------------- the CLI

export function parseArgs(argv) {
  const args = { data: null, report: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--data") {
      args.data = argv[++i];
      if (!args.data) throw new Error("--data requires a path");
    } else if (arg === "--report") {
      args.report = true;
    } else if (arg === "--only") {
      throw new Error("derive-sets has no --only: a set built from a subset would be wrong");
    } else {
      throw new Error(`unknown argument "${arg}"`);
    }
  }
  return args;
}

function reportFill(name, fill, perValue, log) {
  const short = [...fill.entries()].filter(([, counts]) => counts.candidates < perValue);
  log(`${name}: tag values with fewer than ${perValue} candidate clusters: ${short.length}`);
  for (const [tag, counts] of short) {
    log(`  ${tag.padEnd(30)} ${counts.candidates} candidate cluster(s), ${counts.chosen} chosen`);
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`derive-sets: ${error.message}`);
    process.exit(1);
  }

  const dataRoot = resolveDataRoot({ dataArg: args.data });
  const indexPath = resolve(dataRoot, "derived/index.jsonl");
  if (!existsSync(indexPath)) {
    console.error(`derive-sets: no ${indexPath} (run derive-index first)`);
    process.exit(1);
  }
  const setsDir = resolve(dataRoot, "derived/sets");
  const pinsPath = resolve(setsDir, "pins.json");
  const handPath = resolve(setsDir, "hand.json");
  const suitePath = resolve(setsDir, "suite.json");

  const lines = parseIndex(readFileSync(indexPath, "utf-8"));

  let pins;
  let seeded = false;
  if (existsSync(pinsPath)) {
    pins = normalisePins(JSON.parse(readFileSync(pinsPath, "utf-8")));
  } else {
    // The only file in derived/ a human owns. Seed it once and never again.
    pins = seedPins(encodedIndex(loadEncodedDances(resolve(REPO_ROOT, "data/dances"))));
    seeded = true;
    if (!args.report) {
      mkdirSync(setsDir, { recursive: true });
      writeFileSync(pinsPath, await formatForPublicRepo(pins));
    }
  }

  const hand = chooseSet(lines, HAND, pins);
  const suite = chooseSet(lines, SUITE, pins);
  const generatedAt = todayISO();
  const handIds = new Set(hand.dances.map((dance) => String(dance.id)));
  const { lines: rewritten, changed } = rewritePublishable(lines, {
    handIds,
    clearedIds: hand.clearedIds,
  });

  console.log(`derive-sets: ${indexPath} → ${handPath}, ${suitePath}`);
  console.log(
    `pins.json: ${
      seeded
        ? `${args.report ? "would be seeded" : "seeded"} with ${pins.include.length} include(s) ` +
          "from data/dances — hand-edit it from here on"
        : `read (${pins.include.length} include, ${pins.exclude.length} exclude, ${pins.cleared.length} cleared)`
    }`,
  );
  console.log(`index lines: ${lines.length}`);
  console.log(`hand: ${hand.dances.length} dances`);
  console.log(`suite: ${suite.dances.length} dances`);
  if (hand.missingPins.length > 0) {
    console.warn(`derive-sets: include pin(s) not in the index: ${hand.missingPins.join(", ")}`);
  }
  reportFill("hand", hand.fill, HAND.perValue, console.log);
  reportFill("suite", suite.fill, SUITE.perValue, console.log);
  console.log("ten most popular dances in hand:");
  const byId = new Map(lines.map((line) => [String(line.id), line]));
  for (const dance of [...hand.dances]
    .sort((a, b) => byPopularity(byId.get(a.id), byId.get(b.id)))
    .slice(0, 10)) {
    const line = byId.get(dance.id);
    console.log(
      `  ${String(line.clusterVideos).padStart(5)} videos  tier ${dance.tier}  ` +
        `${dance.id.padStart(6)}  ${dance.title}  (${dance.reasons.length} reason(s))`,
    );
  }
  console.log(`index lines whose publishable changes: ${changed}`);

  if (args.report) {
    console.log("(report only, nothing written)");
    return;
  }

  mkdirSync(setsDir, { recursive: true });
  const handFile = setFile({ dances: hand.dances, rule: HAND.rule, generatedAt });
  const suiteFile = setFile({ dances: suite.dances, rule: SUITE.rule, generatedAt });
  writeFileSync(handPath, await formatForPublicRepo(handFile));
  writeFileSync(suitePath, await formatForPublicRepo(suiteFile));
  writeFileSync(indexPath, formatIndex(rewritten));
  console.log(`derive-sets: wrote both sets and rewrote publishable in ${indexPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
