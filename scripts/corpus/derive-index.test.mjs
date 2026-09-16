// Unit tests for derive-index.mjs.
//
// Every input is hand-written in the shape derive-dances.mjs writes — nothing
// here reads the private cache, so these run anywhere. The largest block is
// the figure vocabulary: docs/corpus-derived.md requires each value's word
// list to be pinned by a test, so every one of its thirty-three values has a
// line taken from (or shaped exactly like) a real Caller's Box figure that
// must raise it, and a line that must not.

import { describe, expect, it } from "vitest";
import {
  ALL_TAG_VALUES,
  FIGURE_TAGS,
  FIGURE_VALUES,
  buildIndex,
  encodedIndex,
  encodedStatus,
  formationTag,
  formatIndex,
  loadClearedIds,
  loadHandIds,
  mergeIndex,
  parseArgs,
  parseIndex,
  phraseTag,
  progressionTag,
  publishableFor,
  resolveDataRoot,
  tagsForRecord,
  tierFor,
} from "./derive-index.mjs";

// --------------------------------------------------------------- fixtures

/** A derived line, the way derive-dances writes one. */
function line(text, { beats = 8, head = null, relations = [], branches = null } = {}) {
  const out = {
    raw: `(${beats}) ${text}`,
    beats,
    text,
    // `head` is derive-dances' two-word guess; the tests give it explicitly
    // where it matters and otherwise let the text carry the match.
    head: head ?? text.toLowerCase().split(" ").slice(0, 2).join(" "),
    relations,
    fractions: [],
  };
  if (branches) out.branches = branches;
  return out;
}

const NO_FLAGS = {
  uncounted: 0,
  zeroBeat: 0,
  concurrent: 0,
  composite: 0,
  oddCounts: 0,
  either: 0,
  undefined: 0,
};

/** A derived record with one phrase of the given lines and nothing unusual. */
function record({
  id = "1",
  title = "A Dance",
  authors = ["A Caller"],
  permission = "full",
  base = "Duple Minor - Improper",
  formationIdValue = "duple-improper",
  progression = "Single",
  phraseStructure = "4*8*2",
  phraseNames = ["A1", "A2", "B1", "B2"],
  lines = [line("Neighbor swing")],
  flags = {},
  videos = 0,
} = {}) {
  return {
    source: "callers-box",
    id,
    url: `https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=${id}`,
    fetchedAt: "2026-09-14T20:22:50+00:00",
    permission,
    status: "",
    title,
    authors,
    otherNames: [],
    formation: { base, detail: "", id: formationIdValue },
    progression,
    direction: "",
    mixer: false,
    phraseStructure,
    videos,
    appearances: 0,
    callingNotes: [],
    phrases: phraseNames.map((name, at) => ({
      name,
      beats: 16,
      lines: at === 0 ? lines : [],
    })),
    flags: { ...NO_FLAGS, ...flags },
  };
}

/** The tags of a record holding exactly one line. */
function tagsOfLine(text, options = {}) {
  return tagsForRecord(record({ lines: [line(text, options)] }));
}

function figureTagsOfLine(text, options = {}) {
  return tagsOfLine(text, options).filter((tag) => tag.startsWith("figure:"));
}

// ------------------------------------------------------------------ tiers

describe("tierFor", () => {
  it("cuts tier 1 at fifty cluster videos or eight Portland callings", () => {
    expect(tierFor({ clusterVideos: 50 })).toBe(1);
    expect(tierFor({ clusterVideos: 280, portlandCount: 17 })).toBe(1);
    expect(tierFor({ clusterVideos: 0, portlandCount: 8 })).toBe(1);
    expect(tierFor({ clusterVideos: 49, portlandCount: 7 })).toBe(2);
  });

  it("cuts tier 2 at ten videos or three callings", () => {
    expect(tierFor({ clusterVideos: 10 })).toBe(2);
    expect(tierFor({ portlandCount: 3 })).toBe(2);
    expect(tierFor({ clusterVideos: 9, portlandCount: 2 })).toBe(3);
  });

  it("takes tier 3 from the top-cluster list or a single Portland calling", () => {
    expect(tierFor({ clusterVideos: 2, inTopClusters: true })).toBe(3);
    expect(tierFor({ clusterVideos: 0, portlandCount: 1 })).toBe(3);
  });

  it("leaves everything else in tier 4", () => {
    expect(tierFor({})).toBe(4);
    expect(tierFor({ clusterVideos: 9, portlandCount: 0, inTopClusters: false })).toBe(4);
  });
});

// ------------------------------------------------------- the simple axes

describe("formationTag", () => {
  it("maps the seven values docs/corpus-derived.md names", () => {
    expect(formationTag("Duple Minor - Improper")).toBe("improper");
    expect(formationTag("Duple Minor - Becket")).toBe("becket");
    expect(formationTag("Duple Minor - Proper")).toBe("proper");
    expect(formationTag("Triple Minor")).toBe("triple-minor");
    expect(formationTag("Circle Mixer")).toBe("circle-mixer");
    expect(formationTag("Four Facing Four")).toBe("facing-lines");
    expect(formationTag("Three Facing Three")).toBe("facing-lines");
    expect(formationTag("Sicilian Circle")).toBe("facing-lines");
  });

  it("puts every base the table does not name in `other`, rather than guessing", () => {
    expect(formationTag("Duple Minor - Indecent")).toBe("other");
    expect(formationTag("Duple Minor - Progressed improper")).toBe("other");
    expect(formationTag("Triplet")).toBe("other");
    expect(formationTag("")).toBe("other");
    expect(formationTag(undefined)).toBe("other");
  });
});

describe("progressionTag", () => {
  it("reads only the sentence before the qualifier", () => {
    expect(progressionTag("Single")).toBe("single");
    expect(progressionTag("Single. Swap sides")).toBe("single");
    expect(progressionTag("Double. Twos and threes swap sides")).toBe("double");
    expect(progressionTag("None")).toBe("none");
  });

  it("puts a numbered or blank progression in `other`", () => {
    expect(progressionTag("231")).toBe("other");
    expect(progressionTag("Ones to bottom")).toBe("other");
    expect(progressionTag("Triple")).toBe("other");
    // A blank field is the site not saying, which is not "no progression".
    expect(progressionTag("")).toBe("other");
  });
});

describe("phraseTag", () => {
  it("is standard for 4*8*2 with A1 A2 B1 B2", () => {
    expect(phraseTag({ phraseStructure: "4*8*2", phraseNames: ["A1", "A2", "B1", "B2"] })).toBe(
      "standard",
    );
  });

  it("is standard for the eight-phrase double-tune shape with the 2 prefix", () => {
    expect(
      phraseTag({
        phraseStructure: "4*8*2",
        phraseNames: ["A1", "A2", "B1", "B2", "2A1", "2A2", "2B1", "2B2"],
      }),
    ).toBe("standard");
  });

  it("is nonstandard when either the structure or the names differ", () => {
    expect(phraseTag({ phraseStructure: "6*8*2", phraseNames: ["A1", "A2", "B1", "B2"] })).toBe(
      "nonstandard",
    );
    expect(
      phraseTag({ phraseStructure: "4*8*2", phraseNames: ["A1", "A2", "B1", "B2", "C1", "C2"] }),
    ).toBe("nonstandard");
    expect(phraseTag({ phraseStructure: "4*8*2", phraseNames: ["A", "B", "C"] })).toBe(
      "nonstandard",
    );
  });
});

// -------------------------------------------------------- relation tags

describe("relation tags", () => {
  const relationsOf = (text, relations) =>
    tagsOfLine(text, { relations }).filter((tag) => tag.startsWith("relation:"));

  it("reads the Caller's Box shorthand", () => {
    expect(relationsOf("Neighbor swing", ["N"])).toContain("relation:neighbor");
    expect(relationsOf("Partner swing", ["P"])).toContain("relation:partner");
    expect(relationsOf("N2 neighbor allemande left", ["N2"])).toContain("relation:next-neighbor");
    expect(relationsOf("N0 neighbor do-si-do", ["N0"])).toContain("relation:prev-neighbor");
    expect(relationsOf("S1 shadow balance", ["S1"])).toContain("relation:shadow");
    expect(relationsOf("Same-role neighbor allemande", ["SRN"])).toContain("relation:same-role");
    expect(relationsOf("Trail buddy swing", ["TB"])).toContain("relation:trail-buddy");
    expect(relationsOf("Allemande left corner", ["C1"])).toContain("relation:corner");
    expect(relationsOf("Opposite swing", ["O"])).toContain("relation:opposite");
    expect(relationsOf("Ones cross over", ["1"])).toContain("relation:ones-twos");
  });

  it("does not call N1 a next neighbor, nor N2 the current one", () => {
    expect(relationsOf("N1 neighbor swing", ["N1"])).toContain("relation:neighbor");
    expect(relationsOf("N1 neighbor swing", ["N1"])).not.toContain("relation:next-neighbor");
    expect(relationsOf("N2 neighbor swing", ["N2"])).not.toContain("relation:neighbor");
  });

  it("reads diagonal, corner and six from the text, which have no shorthand", () => {
    expect(relationsOf("On left diagonal, right and left through with partner", [])).toContain(
      "relation:diagonal",
    );
    expect(relationsOf("In groups of six, circle left", [])).toContain("relation:six");
    expect(relationsOf("Hey for six", [])).toContain("relation:six");
  });

  it("files contra corners under six, not under corner", () => {
    const tags = relationsOf("Ones balance and swing contra corners", []);
    expect(tags).toContain("relation:six");
    expect(tags).not.toContain("relation:corner");
  });
});

// ------------------------------------------- concurrency and timing tags

describe("concurrency and timing tags", () => {
  it("is concurrency:none by default and concurrency:split on a branched line", () => {
    expect(tagsForRecord(record())).toContain("concurrency:none");
    expect(tagsForRecord(record({ flags: { concurrent: 1 } }))).toContain("concurrency:split");
  });

  it("turns each non-zero flag into its timing value", () => {
    const tags = tagsForRecord(
      record({ flags: { composite: 2, oddCounts: 1, zeroBeat: 1, uncounted: 3, either: 1 } }),
    );
    expect(tags).toEqual(
      expect.arrayContaining([
        "timing:composite",
        "timing:odd-counts",
        "timing:zero-beat",
        "timing:uncounted",
        "timing:either",
      ]),
    );
  });

  it("raises swing-off-grid only for a counted swing off the eight-beat grid", () => {
    expect(tagsOfLine("Neighbor swing", { beats: 8 })).not.toContain("timing:swing-off-grid");
    expect(tagsOfLine("Neighbor swing", { beats: 16 })).not.toContain("timing:swing-off-grid");
    expect(tagsOfLine("Neighbor swing", { beats: 10 })).not.toContain("timing:swing-off-grid");
    expect(tagsOfLine("Neighbor swing", { beats: 6 })).toContain("timing:swing-off-grid");
    expect(tagsOfLine("Neighbor swing", { beats: 14 })).toContain("timing:swing-off-grid");
    // An uncounted swing is timing:uncounted's business, not this tag's.
    expect(tagsOfLine("Neighbor swing", { beats: null })).not.toContain("timing:swing-off-grid");
    // And a non-swing of six beats is not a swing off the grid.
    expect(tagsOfLine("Circle left 3/4", { beats: 6 })).not.toContain("timing:swing-off-grid");
  });
});

// --------------------------------------------------------- figure tags

// One realistic line per figure value that MUST raise it, and one that must
// not. Every value in the doc's table is here; the test below proves that.
const FIGURE_CASES = [
  ["swing", "Neighbor balance and swing", "Circle left 3/4"],
  ["balance", "Partner balance and swing", "Neighbor do-si-do"],
  ["circle", "Circle left 3/4", "Star right 1x"],
  ["star", "Hands-across star right 1x", "Circle left 3/4"],
  ["allemande", "Neighbor allemande right 1 & 1/2", "Neighbor do-si-do 1 & 1/2"],
  ["do-si-do", "N2 neighbor do-si-do 1x", "Neighbor allemande left"],
  ["chain", "Ladies chain to partner", "Ladies lead out"],
  ["right-left-through", "Right and left through with partner", "Pass through to an ocean wave"],
  ["hey", "Hey (WR;NL;MR;PL;WR;NL;MR)", "They circle left 3/4"],
  ["hey-partial", "Ricochet hey 1/2 (WR;NL;MR)", "Hey (WR;NL;MR;PL;WR;NL;MR)"],
  ["wave", "Balance the wave", "Balance the ring"],
  ["long-lines", "In long lines, go forward and back", "Lines of four go down the hall"],
  ["down-the-hall", "In a line of four, go down the hall", "In long lines, go forward and back"],
  ["petronella", "Balance the ring and petronella turn", "Balance the ring and roll away"],
  ["pass-through", "Pass through to a new neighbor", "Square through 4 hands"],
  ["square-through", "Square through 4 hands", "Pass through to a new neighbor"],
  ["pull-by", "Partner pull by the right", "Partner allemande right"],
  ["roll-away", "Partner roll away with a half sashay", "Partner California twirl"],
  ["twirl", "Partner California twirl", "Partner promenade across"],
  ["mad-robin", "Mad robin, neighbor in front", "Neighbor do-si-do"],
  ["shoulder-round", "Partner right shoulder round 1x", "Partner do-si-do 1x"],
  ["promenade", "Star promenade, butterfly whirl", "Star left 1x"],
  ["slide", "Shift left along the set", "Circle left 3/4"],
  ["slice", "Slice left and back", "Shift left along the set"],
  ["poussette", "Poussette clockwise 1/2", "Circle left 1/2"],
  ["give-and-take", "Give-and-take partner to the ladies' side", "Partner swing"],
  ["circulate", "Circulate: men forward, women across", "Pass through"],
  ["orbit", "Orbit clockwise 1/2 while centers allemande", "Circle left 1/2"],
  ["contra-corners", "Ones balance and swing contra corners", "Allemande left corner"],
  ["cast", "Ones cast off around the twos", "Ones lead down the hall"],
  ["actives", "Actives down the outside", "Ones down the outside"],
  ["figure-eight", "Ones figure eight 1/2 up through the twos", "Ones cross over and go below"],
  ["arch", "Twos arch, ones dive through", "Twos lead up the hall"],
];

describe("figure tags", () => {
  it("covers every value in the doc's table, once, in the table's order", () => {
    expect(FIGURE_CASES.map(([value]) => value)).toEqual(FIGURE_VALUES);
  });

  for (const [value, hit, miss] of FIGURE_CASES) {
    it(`figure:${value} — "${hit}" raises it, "${miss}" does not`, () => {
      expect(figureTagsOfLine(hit)).toContain(`figure:${value}`);
      expect(figureTagsOfLine(miss)).not.toContain(`figure:${value}`);
    });
  }

  it("matches whole words only", () => {
    // "they" is not a hey, "balanced" is not a balance, "starting" is no star.
    expect(figureTagsOfLine("They walk forward")).not.toContain("figure:hey");
    expect(figureTagsOfLine("A balanced line of four")).not.toContain("figure:balance");
    expect(figureTagsOfLine("Starting position: proper")).not.toContain("figure:star");
  });

  it("finds a word across a hyphen, which is how the site writes several of them", () => {
    expect(figureTagsOfLine("Hands-across star right")).toContain("figure:star");
    expect(figureTagsOfLine("Hey-for-four, ladies start")).toContain("figure:hey");
  });

  it("calls a hey partial only when the hey itself is marked partial", () => {
    expect(figureTagsOfLine("Hey 3/4 (WR;NL;MR)")).toContain("figure:hey-partial");
    expect(figureTagsOfLine("Broken hey (NR;PL)")).toContain("figure:hey-partial");
    // The `~` marks a pass that carries into the next phrase; it is written
    // hard against the hand, so a word boundary would miss it.
    expect(figureTagsOfLine("Hey (WR;NL~;MR)")).toContain("figure:hey-partial");
    // A plain half hey is not one of the doc's partial markers.
    expect(figureTagsOfLine("Hey 1/2 (WR;NL;MR)")).not.toContain("figure:hey-partial");
    // And 3/4 without a hey is just a three-quarter circle.
    expect(figureTagsOfLine("Circle left 3/4")).not.toContain("figure:hey-partial");
  });

  it("keeps hey-partial directly after hey, so the order is the doc's", () => {
    const tags = figureTagsOfLine("Ricochet hey 3/4 (WR;NL;MR)");
    expect(tags.indexOf("figure:hey-partial")).toBe(tags.indexOf("figure:hey") + 1);
  });

  it("tags the branches of a concurrent line, not only the line itself", () => {
    const concurrent = record({
      lines: [
        line("Ones swing || twos petronella turn", {
          branches: [
            { text: "Ones swing", head: "swing", relations: ["1"], fractions: [] },
            {
              text: "twos petronella turn",
              head: "petronella turn",
              relations: ["2"],
              fractions: [],
            },
          ],
        }),
      ],
      flags: { concurrent: 1 },
    });
    const tags = tagsForRecord(concurrent);
    expect(tags).toContain("figure:swing");
    expect(tags).toContain("figure:petronella");
    expect(tags).toContain("concurrency:split");
  });

  it("tags the children of a composite line", () => {
    const parent = line("Ones do this:", { beats: 16 });
    parent.children = [line("Figure eight up through the twos", { beats: 8 })];
    const tags = tagsForRecord(record({ lines: [parent], flags: { composite: 1 } }));
    expect(tags).toContain("figure:figure-eight");
  });
});

describe("the tag vocabulary as a whole", () => {
  it("lists every axis value the doc's table names, prefixed by its axis", () => {
    expect(ALL_TAG_VALUES).toContain("formation:becket");
    expect(ALL_TAG_VALUES).toContain("progression:single");
    expect(ALL_TAG_VALUES).toContain("phrase:standard");
    expect(ALL_TAG_VALUES).toContain("relation:trail-buddy");
    expect(ALL_TAG_VALUES).toContain("concurrency:split");
    expect(ALL_TAG_VALUES).toContain("timing:swing-off-grid");
    expect(ALL_TAG_VALUES).toContain("figure:mad-robin");
    expect(new Set(ALL_TAG_VALUES).size).toBe(ALL_TAG_VALUES.length);
    expect(ALL_TAG_VALUES).toHaveLength(7 + 4 + 2 + 12 + 2 + 6 + FIGURE_TAGS.length);
  });

  it("gives every record exactly one formation, progression, phrase and concurrency value", () => {
    const tags = tagsForRecord(record());
    for (const axis of ["formation", "progression", "phrase", "concurrency"]) {
      expect(tags.filter((tag) => tag.startsWith(`${axis}:`))).toHaveLength(1);
    }
  });

  it("emits tags in the doc's axis order", () => {
    const tags = tagsForRecord(record());
    const axes = tags.map((tag) => tag.split(":")[0]);
    const order = [
      "formation",
      "progression",
      "phrase",
      "relation",
      "concurrency",
      "timing",
      "figure",
    ];
    let at = -1;
    for (const axis of axes) {
      const here = order.indexOf(axis);
      expect(here).toBeGreaterThanOrEqual(at);
      at = here;
    }
  });
});

// ------------------------------------------------------ status and slug

describe("encodedStatus", () => {
  it("is shipped for an ordinary encoded dance", () => {
    expect(
      encodedStatus({ phrases: [{ figures: [{ figure: "swing" }, { figure: "circle" }] }] }),
    ).toBe("shipped");
  });

  it("is lab when the dance says so, even if its figures are all custom", () => {
    expect(encodedStatus({ status: "lab", phrases: [{ figures: [{ figure: "custom" }] }] })).toBe(
      "lab",
    );
  });

  it("is custom-only when every call is the custom figure", () => {
    // No such dance exists yet — there is no `custom` figure — and the rule is
    // here so the first one is not silently counted as shipped.
    expect(
      encodedStatus({
        phrases: [{ figures: [{ figure: "custom" }] }, { figures: [{ figure: "custom" }] }],
      }),
    ).toBe("custom-only");
    expect(
      encodedStatus({ phrases: [{ figures: [{ figure: "custom" }, { figure: "swing" }] }] }),
    ).toBe("shipped");
  });
});

describe("encodedIndex", () => {
  it("keys by the Caller's Box id as a string, since data/dances writes a number", () => {
    const byId = encodedIndex([
      { slug: "butter", dance: { slug: "butter", source: { callersBoxId: 10320 } } },
      { slug: "programme", dance: { slugs: ["butter"] } },
    ]);
    expect(byId.get("10320")).toEqual({ slug: "butter", status: "shipped" });
    expect(byId.size).toBe(1);
  });
});

describe("publishableFor", () => {
  it("is shipped for an encoded dance, lab included", () => {
    expect(publishableFor({ status: "shipped", permission: "brief" })).toBe("shipped");
    expect(publishableFor({ status: "lab", permission: "brief" })).toBe("shipped");
  });

  it("is cleared when a pin says a human cleared it, which beats the fixture rule", () => {
    expect(
      publishableFor({ status: "not-started", permission: "full", inHandSet: true, cleared: true }),
    ).toBe("cleared");
  });

  it("is fixture for a hand-set record whose permission is full", () => {
    expect(publishableFor({ status: "not-started", permission: "full", inHandSet: true })).toBe(
      "fixture",
    );
  });

  it("is gated for anything else, and for a set member the site does not mark full", () => {
    expect(publishableFor({ status: "not-started", permission: "full" })).toBe("gated");
    expect(publishableFor({ status: "not-started", permission: "brief", inHandSet: true })).toBe(
      "gated",
    );
  });
});

// ------------------------------------------------------------- the index

describe("buildIndex", () => {
  const clusters = [
    {
      cluster: "butter--gene-hubert",
      callersBox: ["10320"],
      contradb: [],
      portland: { count: 17, callers: 12, rows: [] },
      videos: 280,
    },
    {
      cluster: "quiet--a-caller",
      callersBox: ["9", "40"],
      contradb: [],
      portland: null,
      videos: 4,
    },
  ];
  const records = [
    record({ id: "40", title: "Quiet", videos: 1 }),
    record({ id: "10320", title: "Butter", base: "Duple Minor - Becket", videos: 280 }),
    record({ id: "9", title: "Quiet Variant", permission: "brief", videos: 3 }),
  ];

  it("writes one line per record, sorted by id numerically", () => {
    const { lines } = buildIndex({ records, clusters });
    expect(lines.map((entry) => entry.id)).toEqual(["9", "40", "10320"]);
  });

  it("carries the doc's fields, and nothing else", () => {
    const { lines } = buildIndex({ records, clusters });
    const butter = lines.find((entry) => entry.id === "10320");
    expect(Object.keys(butter)).toEqual([
      "id",
      "cluster",
      "title",
      "authors",
      "permission",
      "formation",
      "videos",
      "clusterVideos",
      "portlandCount",
      "tier",
      "tags",
      "tagsProvisional",
      "status",
      "slug",
      "publishable",
    ]);
    expect(butter.cluster).toBe("butter--gene-hubert");
    expect(butter.clusterVideos).toBe(280);
    expect(butter.portlandCount).toBe(17);
    expect(butter.tier).toBe(1);
    expect(butter.tagsProvisional).toBe(true);
    expect(butter.status).toBe("not-started");
    expect(butter.slug).toBe(null);
    expect(butter.publishable).toBe("gated");
  });

  it("takes popularity from the cluster, not from the record", () => {
    const { lines } = buildIndex({ records, clusters });
    const variant = lines.find((entry) => entry.id === "9");
    expect(variant.videos).toBe(3);
    expect(variant.clusterVideos).toBe(4);
  });

  it("marks an encoded dance shipped, with its slug", () => {
    const encodedById = new Map([["10320", { slug: "butter", status: "shipped" }]]);
    const { lines } = buildIndex({ records, clusters, encodedById });
    const butter = lines.find((entry) => entry.id === "10320");
    expect(butter.status).toBe("shipped");
    expect(butter.slug).toBe("butter");
    expect(butter.publishable).toBe("shipped");
  });

  it("marks a hand-set record with permission full as a fixture, and a gated one not", () => {
    const { lines } = buildIndex({
      records,
      clusters,
      handIds: new Set(["10320", "9"]),
    });
    expect(lines.find((entry) => entry.id === "10320").publishable).toBe("fixture");
    // Permission "brief": in the set, still gated.
    expect(lines.find((entry) => entry.id === "9").publishable).toBe("gated");
  });

  it("counts records, tiers, statuses, publishables and every tag value", () => {
    const { stats } = buildIndex({ records, clusters });
    expect(stats.records).toBe(3);
    expect(stats.tiers[1]).toBe(1);
    expect(stats.status["not-started"]).toBe(3);
    expect(stats.publishable.gated).toBe(3);
    expect(stats.tagCounts.get("figure:swing")).toBe(3);
    expect(stats.tagCounts.get("formation:becket")).toBe(1);
    // A value nothing carries is still in the table, at zero.
    expect(stats.tagCounts.get("figure:poussette")).toBe(0);
    expect(stats.topTierTagCounts.get("formation:becket")).toBe(1);
    expect(stats.topTierTagCounts.get("formation:improper")).toBe(0);
  });
});

describe("formatIndex / parseIndex / mergeIndex", () => {
  it("writes one compact JSON object per line, newline-terminated", () => {
    const text = formatIndex([{ id: "1" }, { id: "2" }]);
    expect(text).toBe('{"id":"1"}\n{"id":"2"}\n');
    expect(formatIndex([])).toBe("");
  });

  it("round-trips", () => {
    const lines = [{ id: "1", tags: ["figure:swing"] }];
    expect(parseIndex(formatIndex(lines))).toEqual(lines);
  });

  it("merges a --only rebuild over the file that is already there", () => {
    const existing = [
      { id: "1", title: "old one" },
      { id: "10", title: "old ten" },
    ];
    const merged = mergeIndex(existing, [
      { id: "10", title: "new ten" },
      { id: "2", title: "new two" },
    ]);
    expect(merged.map((entry) => `${entry.id}:${entry.title}`)).toEqual([
      "1:old one",
      "2:new two",
      "10:new ten",
    ]);
  });
});

describe("loadHandIds / loadClearedIds", () => {
  it("treat an absent file as empty, which is what makes index → sets → index unnecessary", () => {
    expect(loadHandIds("/nowhere/hand.json").size).toBe(0);
    expect(loadClearedIds("/nowhere/pins.json").size).toBe(0);
  });
});

// --------------------------------------------------------------- the CLI

describe("parseArgs", () => {
  it("defaults to the whole corpus, writing", () => {
    expect(parseArgs([])).toEqual({ data: null, only: null, report: false });
  });

  it("parses --data, --only and --report", () => {
    const args = parseArgs(["--data", "../contra-data", "--only", "10320, 1", "--report"]);
    expect(args).toEqual({ data: "../contra-data", only: ["10320", "1"], report: true });
  });

  it("rejects an unknown argument and a --data without a path", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--data"])).toThrow(/--data requires a path/);
  });
});

describe("resolveDataRoot", () => {
  it("prefers --data, then CONTRA_DATA, then CONTRA_DATA_DIR, then ../contra-data", () => {
    expect(resolveDataRoot({ dataArg: "/a", env: { CONTRA_DATA: "/b" } })).toBe("/a");
    expect(resolveDataRoot({ env: { CONTRA_DATA: "/b", CONTRA_DATA_DIR: "/c" } })).toBe("/b");
    expect(resolveDataRoot({ env: { CONTRA_DATA_DIR: "/c" } })).toBe("/c");
    expect(resolveDataRoot({ env: {}, repoRoot: "/repo" })).toBe("/contra-data");
  });
});
