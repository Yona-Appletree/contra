// Unit tests for derive-sets.mjs.
//
// The inputs are hand-written index lines of the shape derive-index.mjs
// writes — nothing here reads the private cache or the real index. The cases
// that matter are the ones the corpus forced: a cluster holding three ids of
// one dance (Circassian Circle) must put one record in the set and not three,
// a record the site does not mark `full` must never be chosen by the tag rule,
// and pins.json must survive a run untouched.

import { describe, expect, it } from "vitest";
import {
  HAND,
  SUITE,
  chooseSet,
  normalisePins,
  parseArgs,
  rewritePublishable,
  seedPins,
  setFile,
  todayISO,
} from "./derive-sets.mjs";

/** An index line, with the fields the set rules actually read. */
function indexLine({
  id,
  cluster = `c-${id}`,
  title = `Dance ${id}`,
  permission = "full",
  clusterVideos = 0,
  tier = 4,
  tags = [],
  status = "not-started",
  publishable = "gated",
}) {
  return {
    id: String(id),
    cluster,
    title,
    authors: ["A Caller"],
    permission,
    formation: null,
    videos: clusterVideos,
    clusterVideos,
    portlandCount: 0,
    tier,
    tags,
    tagsProvisional: true,
    status,
    slug: null,
    publishable,
  };
}

const SWING = "figure:swing";
const CHAIN = "figure:chain";

describe("seedPins", () => {
  it("includes every encoded dance, by numeric id, with the one reason", () => {
    const pins = seedPins(
      new Map([
        ["10320", { slug: "butter", status: "shipped" }],
        ["1", { slug: "the-nice-combination", status: "shipped" }],
      ]),
    );
    expect(pins).toEqual({
      include: [
        { id: "1", reason: "encoded in data/dances" },
        { id: "10320", reason: "encoded in data/dances" },
      ],
      exclude: [],
      cleared: [],
    });
  });
});

describe("normalisePins", () => {
  it("fills in the three lists so a half-written file still runs", () => {
    expect(normalisePins(undefined)).toEqual({ include: [], exclude: [], cleared: [] });
    expect(normalisePins({ include: [{ id: "1" }] }).exclude).toEqual([]);
  });
});

describe("chooseSet", () => {
  it("takes the three most-danced records carrying a value", () => {
    const lines = [
      indexLine({ id: "1", clusterVideos: 10, tags: [SWING] }),
      indexLine({ id: "2", clusterVideos: 30, tags: [SWING] }),
      indexLine({ id: "3", clusterVideos: 20, tags: [SWING] }),
      indexLine({ id: "4", clusterVideos: 5, tags: [SWING] }),
    ];
    const { dances } = chooseSet(lines, HAND);
    expect(dances.map((dance) => dance.id)).toEqual(["2", "3", "1"]);
    expect(dances[0].reasons).toEqual([`tag:${SWING}`]);
  });

  it("never takes two records of one cluster, even for different values", () => {
    // The Circassian Circle case: 426 videos under three Caller's Box ids.
    const lines = [
      indexLine({ id: "10", cluster: "circle--", clusterVideos: 426, tags: [SWING] }),
      indexLine({ id: "11", cluster: "circle--", clusterVideos: 426, tags: [SWING, CHAIN] }),
      indexLine({ id: "12", cluster: "circle--", clusterVideos: 426, tags: [CHAIN] }),
    ];
    const { dances } = chooseSet(lines, HAND);
    expect(dances).toHaveLength(1);
    expect(dances[0].id).toBe("10");
    // And the cluster's one record can only answer for the values it carries.
    expect(dances[0].reasons).toEqual([`tag:${SWING}`]);
  });

  it("ignores a record the site does not mark full", () => {
    const lines = [
      indexLine({ id: "1", clusterVideos: 100, permission: "brief", tags: [SWING] }),
      indexLine({ id: "2", clusterVideos: 1, tags: [SWING] }),
    ];
    const { dances } = chooseSet(lines, HAND);
    expect(dances.map((dance) => dance.id)).toEqual(["2"]);
  });

  it("records every reason a dance was selected, pins first then tags", () => {
    const lines = [indexLine({ id: "1", clusterVideos: 10, tags: [SWING, CHAIN] })];
    const { dances } = chooseSet(lines, HAND, {
      include: [{ id: "1", reason: "shipped demo dance" }],
    });
    // Tags come in the doc's table order, so swing (first in the figure list)
    // precedes chain, whatever order the record carries them in.
    expect(dances[0].reasons).toEqual(["pin:shipped demo dance", `tag:${SWING}`, `tag:${CHAIN}`]);
  });

  it("adds an include pin the tag rule would never have chosen", () => {
    const lines = [
      indexLine({ id: "1", clusterVideos: 100, tags: [SWING] }),
      indexLine({ id: "2", clusterVideos: 100, tags: [SWING] }),
      indexLine({ id: "3", clusterVideos: 100, tags: [SWING] }),
      indexLine({ id: "9", clusterVideos: 0, permission: "brief", tags: [] }),
    ];
    const { dances } = chooseSet(lines, HAND, { include: [{ id: "9", reason: "encoded" }] });
    expect(dances.map((dance) => dance.id)).toContain("9");
    expect(dances.find((dance) => dance.id === "9").reasons).toEqual(["pin:encoded"]);
  });

  it("lets an exclude pin win over both the tag rule and an include pin", () => {
    const lines = [indexLine({ id: "1", clusterVideos: 100, tags: [SWING] })];
    const { dances } = chooseSet(lines, HAND, {
      include: [{ id: "1", reason: "wanted" }],
      exclude: [{ id: "1", reason: "duplicate of 2" }],
    });
    expect(dances).toEqual([]);
  });

  it("reports an include pin that is not in the index rather than inventing a line", () => {
    const { dances, missingPins } = chooseSet([], HAND, { include: [{ id: "404", reason: "?" }] });
    expect(dances).toEqual([]);
    expect(missingPins).toEqual(["404"]);
  });

  it("adds every tier 1 and 2 record to the suite, whatever its permission", () => {
    const lines = [
      indexLine({ id: "1", tier: 1, permission: "brief", clusterVideos: 90 }),
      indexLine({ id: "2", tier: 2, permission: "search", clusterVideos: 20 }),
      indexLine({ id: "3", tier: 3, permission: "full", clusterVideos: 5 }),
    ];
    expect(chooseSet(lines, HAND).dances).toEqual([]);
    const suite = chooseSet(lines, SUITE);
    expect(suite.dances.map((dance) => dance.id)).toEqual(["1", "2"]);
    expect(suite.dances[0].reasons).toEqual(["tier:1"]);
  });

  it("sorts by tier, then clusterVideos descending, then id", () => {
    const lines = [
      indexLine({ id: "30", tier: 2, clusterVideos: 10, tags: [SWING] }),
      indexLine({ id: "10", tier: 1, clusterVideos: 60, tags: [SWING] }),
      indexLine({ id: "20", tier: 1, clusterVideos: 60, tags: [SWING] }),
    ];
    const { dances } = chooseSet(lines, HAND);
    expect(dances.map((dance) => dance.id)).toEqual(["10", "20", "30"]);
  });

  it("counts, per value, how many clusters could have filled it", () => {
    const lines = [
      indexLine({ id: "1", cluster: "a", clusterVideos: 9, tags: [SWING] }),
      indexLine({ id: "2", cluster: "a", clusterVideos: 9, tags: [SWING] }),
    ];
    const { fill } = chooseSet(lines, HAND);
    expect(fill.get(SWING)).toEqual({ candidates: 1, chosen: 1 });
    expect(fill.get(CHAIN)).toEqual({ candidates: 0, chosen: 0 });
  });

  it("carries the cleared pins through, since they set publishable, not membership", () => {
    const { clearedIds, dances } = chooseSet([indexLine({ id: "1" })], HAND, {
      cleared: [{ id: "1", reason: "author clearance, email of 2026-09-01" }],
    });
    expect([...clearedIds]).toEqual(["1"]);
    // A clearance is not a reason to be in the set.
    expect(dances).toEqual([]);
  });

  it("is deterministic: the same lines in any order give the same set", () => {
    const lines = [
      indexLine({ id: "3", clusterVideos: 7, tags: [SWING, CHAIN] }),
      indexLine({ id: "1", clusterVideos: 7, tags: [SWING] }),
      indexLine({ id: "2", clusterVideos: 9, tags: [CHAIN] }),
    ];
    const forwards = chooseSet(lines, HAND).dances;
    const backwards = chooseSet([...lines].reverse(), HAND).dances;
    expect(backwards).toEqual(forwards);
  });
});

describe("setFile", () => {
  it("writes the doc's three keys in the doc's order", () => {
    const file = setFile({ dances: [], rule: HAND.rule, generatedAt: "2026-09-16" });
    expect(Object.keys(file)).toEqual(["generatedAt", "rule", "dances"]);
    expect(file.rule).toBe("3 per tag value by clusterVideos, permission full, plus pins");
  });
});

describe("todayISO", () => {
  it("is a date, so the file is stable within a day", () => {
    expect(todayISO(new Date("2026-09-16T23:59:00Z"))).toBe("2026-09-16");
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("rewritePublishable", () => {
  const lines = [
    indexLine({ id: "1", status: "shipped", publishable: "gated" }),
    indexLine({ id: "2", permission: "full", publishable: "gated" }),
    indexLine({ id: "3", permission: "brief", publishable: "gated" }),
    indexLine({ id: "4", permission: "full", publishable: "gated" }),
  ];

  it("sets fixture on a hand-set record with permission full, and leaves the rest", () => {
    const { lines: out, changed } = rewritePublishable(lines, {
      handIds: new Set(["1", "2", "3"]),
      clearedIds: new Set(["4"]),
    });
    expect(out.map((line) => line.publishable)).toEqual([
      "shipped", // already public: the set does not matter
      "fixture", // in the hand set, permission full
      "gated", // in the hand set, but not full
      "cleared", // a human clearance, outside any set
    ]);
    // Line 3 was gated and stays gated: three lines actually move.
    expect(changed).toBe(3);
  });

  it("changes nothing else, and keeps the key order the index was written with", () => {
    const { lines: out } = rewritePublishable(lines, {
      handIds: new Set(),
      clearedIds: new Set(),
    });
    expect(Object.keys(out[1])).toEqual(Object.keys(lines[1]));
    expect(out[1]).toEqual(lines[1]);
  });

  it("is idempotent, which is what makes a second derive-index run a no-op", () => {
    const once = rewritePublishable(lines, {
      handIds: new Set(["2"]),
      clearedIds: new Set(),
    }).lines;
    const twice = rewritePublishable(once, {
      handIds: new Set(["2"]),
      clearedIds: new Set(),
    });
    expect(twice.lines).toEqual(once);
    expect(twice.changed).toBe(0);
  });
});

describe("parseArgs", () => {
  it("defaults to writing the whole set", () => {
    expect(parseArgs([])).toEqual({ data: null, report: false });
  });

  it("parses --data and --report", () => {
    expect(parseArgs(["--data", "../contra-data", "--report"])).toEqual({
      data: "../contra-data",
      report: true,
    });
  });

  it("refuses --only, and says why", () => {
    expect(() => parseArgs(["--only", "1"])).toThrow(/no --only/);
  });

  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
  });
});
