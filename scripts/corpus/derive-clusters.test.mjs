// Unit tests for the cross-source join in derive-clusters.mjs.
//
// Every input is a hand-written record of the shape the derive scripts write
// — nothing here reads the private cache, so these run anywhere. The named
// cases are the real ones the corpus forced: Heartbeat Contra's two Caller's
// Box ids under one title, the several different dances called "Butter", and
// the Portland rows that name a dance without naming its author.

import { describe, expect, it } from "vitest";
import {
  authorKey,
  buildClusters,
  clusterTitleKey,
  formatJson,
  isAuthorless,
  memberFromContraDb,
  memberFromDerivedDance,
  memberFromRawDance,
  parseArgs,
  resolveDataRoot,
} from "./derive-clusters.mjs";

function dance(id, title, author, videos = 0) {
  return { id, title, authors: author === null ? [] : [author], videos };
}

function contradbRecord(id, title, choreographer) {
  return { id, title, choreographer };
}

function portlandRow(title, choreographer, count, extra = {}) {
  return { title, choreographer, count, callers: count, ...extra };
}

function clusterNamed(result, id) {
  return result.clusters.find((cluster) => cluster.cluster === id);
}

describe("clusterTitleKey", () => {
  it("reuses normaliseTitle's key: trimmed, collapsed, lower-cased, number stripped", () => {
    expect(clusterTitleKey("  Butter ")).toBe("butter");
    expect(clusterTitleKey("The  Nice   Combination")).toBe("the nice combination");
    expect(clusterTitleKey("2. Sorry, Erik")).toBe("sorry, erik");
    expect(clusterTitleKey("BUTTER")).toBe("butter");
  });

  it("removes a {…} span, which is how the Caller's Box marks whose version it is", () => {
    expect(clusterTitleKey("Heartbeat Contra {folk processed version}")).toBe("heartbeat contra");
    expect(clusterTitleKey("Butter {a} tart {b}")).toBe("butter tart");
  });

  it("removes a trailing (var) and nothing else", () => {
    expect(clusterTitleKey("Butter (var)")).toBe("butter");
    expect(clusterTitleKey("Butter (var.)")).toBe("butter");
    // Not parenthesised, so not a (var) tag: normaliseTitle is deliberately
    // narrow and this script only adds the two cases the doc names.
    expect(clusterTitleKey("Cows Are Watching var")).toBe("cows are watching var");
    expect(clusterTitleKey("Cows are Watching (Emma Hardin)")).toBe(
      "cows are watching (emma hardin)",
    );
  });

  it("leaves a leading The alone, so 'The X' and 'X' stay different dances", () => {
    expect(clusterTitleKey("The Cows Are Watching")).not.toBe(clusterTitleKey("Cows are Watching"));
  });
});

describe("authorKey", () => {
  it("kebabs the first author and ignores the rest", () => {
    expect(authorKey(["Gene Hubert"])).toBe("gene-hubert");
    expect(authorKey(["Chris Page", "Someone Else"])).toBe("chris-page");
    expect(authorKey("Bob  O'Shea-Smith")).toBe("bob-o-shea-smith");
    expect(authorKey([])).toBe("");
    expect(authorKey(undefined)).toBe("");
  });

  it("keys a co-authored dance the same from either source", () => {
    // The real case: Caller's Box 7173 splits the two names into an array,
    // ContraDB 625 writes them as one string. Same dance, so same key.
    expect(authorKey(["Bill Pope", "Judy Goldsmith"])).toBe("bill-pope");
    expect(authorKey("Bill Pope and Judy Goldsmith")).toBe("bill-pope");
    expect(authorKey(["Bill Pope and Judy Goldsmith"])).toBe("bill-pope");
  });

  it("splits on every joiner people actually type", () => {
    for (const written of [
      "Bill Pope & Judy Goldsmith",
      "Bill Pope, Judy Goldsmith",
      "Bill Pope; Judy Goldsmith",
      "Bill Pope and Judy Goldsmith and Someone Else",
    ]) {
      expect(authorKey(written)).toBe("bill-pope");
    }
    // "and" needs the spaces around it, so a name containing those letters
    // is left whole.
    expect(authorKey("Sandy Anderson")).toBe("sandy-anderson");
  });

  it("falls through an empty first entry to the next name", () => {
    expect(authorKey(["", "Gene Hubert"])).toBe("gene-hubert");
    expect(authorKey([" , ", "Gene Hubert"])).toBe("gene-hubert");
  });

  it("treats the names that mean nobody as authorless", () => {
    for (const name of ["", "Traditional", "Unknown", "Unknown person", "Anon", "Anonymous"]) {
      expect(isAuthorless(authorKey([name]))).toBe(true);
    }
    expect(isAuthorless(authorKey(["Gene Hubert"]))).toBe(false);
  });
});

describe("buildClusters: the joining rules", () => {
  it("joins two Caller's Box ids with the same title and author, most videos first", () => {
    const result = buildClusters({
      callersBox: [
        dance("10405", "Heartbeat Contra {folk processed version}", "Don Flaherty", 69),
        dance("2711", "Heartbeat Contra", "Don Flaherty", 155),
      ],
    });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toMatchObject({
      cluster: "heartbeat contra--don-flaherty",
      callersBox: ["2711", "10405"],
      videos: 224,
      canonical: "2711",
      note: "",
    });
  });

  it("does not join one title held by two different named authors", () => {
    const result = buildClusters({
      callersBox: [
        dance("1", "Butter", "Gene Hubert", 280),
        dance("2", "Butter", "Someone Else", 3),
      ],
    });
    expect(result.clusters).toHaveLength(2);
    expect(clusterNamed(result, "butter--gene-hubert").callersBox).toEqual(["1"]);
    expect(clusterNamed(result, "butter--someone-else").callersBox).toEqual(["2"]);
    expect(result.stats.titleOnlyClusters).toBe(0);
  });

  it("joins an authorless record to the one named author under that title, as title-only", () => {
    const result = buildClusters({
      callersBox: [
        dance("1", "Butter", "Gene Hubert", 280),
        dance("2", "Butter", "Traditional", 4),
      ],
    });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toMatchObject({
      cluster: "butter--gene-hubert",
      callersBox: ["1", "2"],
      videos: 284,
      note: "title-only",
    });
  });

  it("leaves an authorless record alone when two named authors share the title", () => {
    const result = buildClusters({
      callersBox: [
        dance("1", "Butter", "Gene Hubert", 280),
        dance("2", "Butter", "Someone Else", 3),
        dance("3", "Butter", "Unknown person", 1),
      ],
    });
    expect(result.clusters).toHaveLength(3);
    expect(clusterNamed(result, "butter--").callersBox).toEqual(["3"]);
    expect(clusterNamed(result, "butter--").note).toBe("");
  });

  it("joins a co-authored dance across the sources' two ways of writing it", () => {
    // Caller's Box 7173 and ContraDB 625, exactly as each source has them.
    const result = buildClusters({
      callersBox: [
        {
          id: "7173",
          title: "Cows Are Watching",
          authors: ["Bill Pope", "Judy Goldsmith"],
          videos: 60,
        },
      ],
      contradb: [
        { id: "625", title: "Cows are Watching", choreographer: "Bill Pope and Judy Goldsmith" },
      ],
    });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toMatchObject({
      cluster: "cows are watching--bill-pope",
      callersBox: ["7173"],
      contradb: ["625"],
      videos: 60,
      canonical: "7173",
      note: "",
    });
  });

  it("joins a ContraDB record to its Caller's Box twin by title and author", () => {
    const result = buildClusters({
      callersBox: [dance("10320", "Butter", "Gene Hubert", 280)],
      contradb: [contradbRecord("94", "Butter", "Gene Hubert")],
    });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toMatchObject({
      callersBox: ["10320"],
      contradb: ["94"],
      videos: 280,
      canonical: "10320",
    });
  });

  it("puts every record in exactly one cluster", () => {
    const callersBox = [
      dance("1", "Butter", "Gene Hubert", 280),
      dance("2", "Butter", "Someone Else", 3),
      dance("3", "Butter", "Traditional", 1),
      dance("4", "Heartbeat Contra", "Don Flaherty", 155),
    ];
    const contradb = [contradbRecord("94", "Butter", "Gene Hubert")];
    const result = buildClusters({ callersBox, contradb });
    const cbIds = result.clusters.flatMap((cluster) => cluster.callersBox);
    const cdbIds = result.clusters.flatMap((cluster) => cluster.contradb);
    expect([...cbIds].sort()).toEqual(["1", "2", "3", "4"]);
    expect(cdbIds).toEqual(["94"]);
    expect(new Set(cbIds).size).toBe(cbIds.length);
  });
});

describe("buildClusters: the Portland rows", () => {
  const callersBox = [
    dance("10320", "Butter", "Gene Hubert", 280),
    dance("9686", "Cows are Watching", "Bill Pope", 40),
  ];

  it("joins a row by callersBoxId outright, whatever its title says", () => {
    const result = buildClusters({
      callersBox,
      portland: [portlandRow("Butter, as Erik calls it", "", 17, { callersBoxId: "10320" })],
    });
    const cluster = clusterNamed(result, "butter--gene-hubert");
    expect(cluster.portland).toEqual({
      count: 17,
      callers: 17,
      rows: [
        {
          title: "Butter, as Erik calls it",
          choreographer: "",
          count: 17,
          callers: 17,
          callersBoxId: "10320",
        },
      ],
    });
    expect(result.stats.portlandJoinedById).toBe(1);
    expect(cluster.note).toBe("");
  });

  it("joins a row by title and author when it has no callersBoxId", () => {
    const result = buildClusters({
      callersBox,
      portland: [portlandRow("Butter", "Gene Hubert", 17)],
    });
    expect(clusterNamed(result, "butter--gene-hubert").portland.count).toBe(17);
    expect(result.stats.portlandJoinedByAuthor).toBe(1);
  });

  it("joins an authorless row by title alone and marks the cluster title-only", () => {
    const result = buildClusters({ callersBox, portland: [portlandRow("Butter", "", 6)] });
    expect(clusterNamed(result, "butter--gene-hubert")).toMatchObject({
      note: "title-only",
      portland: { count: 6, callers: 6, rows: [{ title: "Butter", count: 6 }] },
    });
    expect(result.stats.portlandJoinedByTitleOnly).toBe(1);
  });

  it("does not join a row whose named author differs from the record's", () => {
    const result = buildClusters({
      callersBox,
      portland: [portlandRow("Butter", "Cary Ravitz", 2)],
    });
    expect(clusterNamed(result, "butter--gene-hubert").portland).toBe(null);
    expect(clusterNamed(result, "butter--cary-ravitz")).toMatchObject({
      callersBox: [],
      videos: 0,
      canonical: null,
      portland: { count: 2, callers: 2, rows: [{ title: "Butter", choreographer: "Cary Ravitz" }] },
    });
    expect(result.stats.portlandUnjoined).toBe(1);
    expect(result.unjoinedRows.map((row) => row.title)).toEqual(["Butter"]);
  });

  it("counts a callersBoxId the corpus does not have, then falls back to the title", () => {
    const result = buildClusters({
      callersBox,
      portland: [portlandRow("Butter", "Gene Hubert", 17, { callersBoxId: "99999" })],
    });
    expect(result.stats.portlandIdNotInCorpus).toBe(1);
    expect(result.stats.portlandJoinedByAuthor).toBe(1);
    expect(clusterNamed(result, "butter--gene-hubert").portland.count).toBe(17);
  });

  it("keeps every row when several land on one cluster, sums the counts, drops none", () => {
    const rows = [
      portlandRow("Butter", "Gene Hubert", 3),
      portlandRow("Butter (var)", "", 17, { callersBoxId: "10320" }),
    ];
    const first = buildClusters({ callersBox, portland: rows });
    const reversed = buildClusters({ callersBox, portland: [...rows].reverse() });
    // count is the sum of the rows; callers is the largest single row's,
    // because the same caller appears in more than one row.
    expect(clusterNamed(first, "butter--gene-hubert").portland).toMatchObject({
      count: 20,
      callers: 17,
      rows: [
        { title: "Butter (var)", count: 17 },
        { title: "Butter", count: 3 },
      ],
    });
    // Highest count first, whatever order the sheet listed them in.
    expect(first.clusters).toEqual(reversed.clusters);
    expect(first.stats.portlandExtraRowsOnACluster).toBe(1);
  });

  it("keeps a row the corpus does not know at all, as a cluster of its own", () => {
    const result = buildClusters({
      callersBox,
      portland: [portlandRow("A Dance Nobody Filed", "Jo Smith", 5)],
    });
    expect(clusterNamed(result, "a dance nobody filed--jo-smith")).toMatchObject({
      callersBox: [],
      contradb: [],
      videos: 0,
      canonical: null,
      portland: {
        count: 5,
        callers: 5,
        rows: [
          {
            title: "A Dance Nobody Filed",
            choreographer: "Jo Smith",
            count: 5,
            callers: 5,
          },
        ],
      },
    });
  });
});

describe("buildClusters: output order and determinism", () => {
  const input = {
    callersBox: [
      dance("1", "Aaa", "Zoe Zed", 5),
      dance("2", "Bbb", "Amy Ant", 50),
      dance("3", "Ccc", "Bob Bee", 5),
    ],
    contradb: [contradbRecord("7", "Bbb", "Amy Ant")],
    portland: [portlandRow("Ccc", "Bob Bee", 2)],
  };

  it("sorts by videos descending, then by cluster id", () => {
    const { clusters } = buildClusters(input);
    expect(clusters.map((cluster) => [cluster.cluster, cluster.videos])).toEqual([
      ["bbb--amy-ant", 50],
      ["aaa--zoe-zed", 5],
      ["ccc--bob-bee", 5],
    ]);
  });

  it("produces identical bytes for the same input, twice", async () => {
    const once = await formatJson(buildClusters(input).clusters);
    expect(await formatJson(buildClusters(input).clusters)).toBe(once);
    // And prettier over the result is a no-op, so the file is stable.
    expect(await formatJson(JSON.parse(once))).toBe(once);
  });

  it("does not depend on the order the records arrive in", () => {
    const shuffled = {
      callersBox: [...input.callersBox].reverse(),
      contradb: [...input.contradb],
      portland: [...input.portland],
    };
    expect(buildClusters(shuffled).clusters).toEqual(buildClusters(input).clusters);
  });

  it("counts singletons, multi-id clusters and title-only joins for --report", () => {
    const { stats } = buildClusters({
      callersBox: [
        dance("1", "Aaa", "Zoe Zed", 5),
        dance("2", "Aaa", "Traditional", 1),
        dance("3", "Ccc", "Bob Bee", 5),
      ],
    });
    expect(stats).toMatchObject({
      clusters: 2,
      singletons: 1,
      multiIdClusters: 1,
      titleOnlyClusters: 1,
    });
  });
});

describe("the source adapters", () => {
  it("reads a derived Caller's Box record and a raw one the same way", () => {
    const derived = memberFromDerivedDance({
      source: "callers-box",
      id: "10320",
      title: "Butter",
      authors: ["Gene Hubert"],
      videos: 280,
    });
    const raw = memberFromRawDance({
      ID: "10320",
      Name: "Butter",
      Authors: ["Gene Hubert"],
      Videos: new Array(280).fill("https://example.test/v"),
    });
    expect(raw).toEqual(derived);
    expect(raw).toEqual({ id: "10320", title: "Butter", authors: ["Gene Hubert"], videos: 280 });
  });

  it("copes with a raw record that has no videos and no authors", () => {
    expect(memberFromRawDance({ ID: 7 })).toEqual({ id: "7", title: "", authors: [], videos: 0 });
  });

  it("reads a ContraDB record from a derived file or from a manifest line alike", () => {
    expect(
      memberFromContraDb({ id: 1, title: "The Rendezvous", choreographer: "Dan Pearl" }),
    ).toEqual({ id: "1", title: "The Rendezvous", choreographer: "Dan Pearl" });
    expect(memberFromContraDb({ id: 2 })).toEqual({ id: "2", title: "", choreographer: "" });
  });
});

describe("parseArgs and resolveDataRoot", () => {
  it("reads --data and --report and refuses anything else", () => {
    expect(parseArgs(["--data", "/tmp/d", "--report"])).toEqual({ data: "/tmp/d", report: true });
    expect(parseArgs([])).toEqual({ data: null, report: false });
    expect(() => parseArgs(["--only", "1"])).toThrow(/unknown argument/);
  });

  it("prefers --data, then CONTRA_DATA, then CONTRA_DATA_DIR, then ../contra-data", () => {
    const env = { CONTRA_DATA: "/env/data", CONTRA_DATA_DIR: "/env/dir" };
    expect(resolveDataRoot({ dataArg: "/flag", env, repoRoot: "/repo" })).toBe("/flag");
    expect(resolveDataRoot({ env, repoRoot: "/repo" })).toBe("/env/data");
    expect(resolveDataRoot({ env: {}, repoRoot: "/repo" })).toBe("/contra-data");
  });
});
