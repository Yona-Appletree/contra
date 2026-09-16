// Unit tests for the normaliser in derive-dances.mjs. Every input here is a
// hand-written raw record in the Caller's Box's own shape — the cache is
// never read, and nothing touches the filesystem: `runDerive` takes its
// reader and its writer as arguments.

import { describe, expect, it } from "vitest";
import {
  ACTOR_PHRASES,
  countFlags,
  deriveHead,
  deriveRecord,
  derivePhrase,
  extractFractions,
  extractPasses,
  extractRelations,
  formatRecord,
  formationId,
  parseArgs,
  parseLine,
  runDerive,
  splitBranches,
} from "./derive-dances.mjs";

/** A raw Caller's Box record, with only the fields a test cares about set. */
function rawRecord(overrides = {}) {
  return {
    download_date: "2026-09-15T02:56:16+00:00",
    ID: "1",
    Name: "Test Dance",
    Authors: ["A Caller"],
    Permission: "full",
    Status: "",
    FormationBase: "Duple Minor - Improper",
    FormationDetail: "",
    Progression: "Single",
    Direction: "",
    "Mixer?": "",
    PhraseStructure: "",
    CallingNotes: [],
    Appearances: [],
    OtherNames: [],
    Videos: [],
    phrases: [{ name: "A1", figures: ["(8) Neighbor swing"] }],
    ...overrides,
  };
}

/** One phrase's derived lines, straight from a list of raw figure strings. */
function lines(figures) {
  return derivePhrase({ name: "A1", figures }).lines;
}

describe("parseLine", () => {
  it("reads a plain counted line", () => {
    const line = parseLine("(8) Neighbor swing");
    expect(line).toEqual({
      raw: "(8) Neighbor swing",
      beats: 8,
      text: "Neighbor swing",
      head: "swing",
      relations: ["N"],
      fractions: [],
    });
  });

  it("leaves an uncounted line's beats null and its text whole", () => {
    // The Caller's Box also writes beat *ranges* like `(1-8)`, which are not
    // counts: the range stays in the text rather than being thrown away.
    const line = parseLine("(1-8) Ones figure eight 1/2 down");
    expect(line.beats).toBeNull();
    expect(line.text).toBe("(1-8) Ones figure eight 1/2 down");
    expect(line.head).toBe("figure eight");
  });

  it("keeps a (0) line's beats as 0, not null", () => {
    const line = parseLine("(0) Face partner");
    expect(line.beats).toBe(0);
    expect(line.text).toBe("Face partner");
  });

  it("trims a child's leading spaces from text but keeps them in raw", () => {
    const line = parseLine("     (3) Neighbor allemande right 1/2");
    expect(line.raw).toBe("     (3) Neighbor allemande right 1/2");
    expect(line.beats).toBe(3);
    expect(line.text).toBe("Neighbor allemande right 1/2");
  });
});

describe("splitBranches", () => {
  it("splits on ||", () => {
    const line = parseLine("(4) Men petronella turn || Women orbit clockwise 1/4");
    expect(line.text).toBe("Men petronella turn || Women orbit clockwise 1/4");
    expect(line.branches).toEqual([
      {
        text: "Men petronella turn",
        head: "petronella turn",
        relations: [],
        fractions: [],
      },
      {
        text: "Women orbit clockwise 1/4",
        head: "orbit clockwise",
        relations: [],
        fractions: ["1/4"],
      },
    ]);
    // The parent keeps the whole text and the beats; a branch has neither a
    // raw nor a beats of its own.
    expect(line.beats).toBe(4);
    expect(line.branches[0].raw).toBeUndefined();
    expect(line.branches[0].beats).toBeUndefined();
  });

  it("splits on ' while ', case-insensitively", () => {
    const line = parseLine("(8) In long lines, go forward and back While shadow roll away");
    expect(line.branches.map((branch) => branch.text)).toEqual([
      "In long lines, go forward and back",
      "shadow roll away",
    ]);
    expect(line.branches[1].relations).toEqual(["S"]);
  });

  it("does not split on a comma, which is ordinary punctuation", () => {
    const line = parseLine("(4) Bend the line: As couples, face across");
    expect(line.branches).toBeUndefined();
    expect(splitBranches("Men run, women sidestep right")).toBeNull();
  });

  it("prefers || when a line carries both marks", () => {
    const branches = splitBranches("Men petronella || Women trade by left while spinning right");
    expect(branches).toEqual(["Men petronella", "Women trade by left while spinning right"]);
  });
});

describe("composites", () => {
  it("nests indented lines under the line above them", () => {
    const [parent] = lines([
      "(16) Spin chain through:",
      "     (3) Neighbor allemande right 1/2",
      "     (5) Men allemande left 3/4",
      "     (3) N2 men allemande right 1/2",
      "     (5) N3 men allemande left 3/4",
    ]);
    expect(parent.beats).toBe(16);
    expect(parent.children.map((child) => child.beats)).toEqual([3, 5, 3, 5]);
    expect(parent.children[0].text).toBe("Neighbor allemande right 1/2");
    expect(parent.childrenBeatsMismatch).toBe(false);
  });

  it("records a beats mismatch on the parent without correcting either side", () => {
    const [parent] = lines([
      "(8) Hole-in-the-wall trade with neighbor:",
      "     (3) Walk forward to center",
      "     (2) Neighbor left shoulder round 1/2",
      "     (3) Fall back from neighbor",
      "(8) Star left 3/4",
    ]);
    expect(parent.beats).toBe(8);
    expect(parent.children).toHaveLength(3);
    expect(parent.childrenBeatsMismatch).toBe(false);

    const [mismatched] = lines([
      "(8) Gay Gordons promenade:",
      "     (4) Walk forward",
      "     (2) Back up",
    ]);
    expect(mismatched.childrenBeatsMismatch).toBe(true);
  });

  it("counts only the top-level lines in a phrase's beats", () => {
    const phrase = derivePhrase({
      name: "A1",
      figures: ["(16) Spin chain through:", "     (8) Part one", "     (8) Part two"],
    });
    expect(phrase.beats).toBe(16);
  });

  it("nests a second level of indentation", () => {
    const [parent] = lines([
      "(16) Grand spin:",
      "     (8) Spin the top:",
      "          (3) Partner allemande right 1/2",
      "          (5) Men allemande left 3/4",
      "     (8) Neighbor star through",
    ]);
    expect(parent.children).toHaveLength(2);
    expect(parent.children[0].children.map((child) => child.beats)).toEqual([3, 5]);
  });

  it("leaves a phrase's beats null when any top-level line is uncounted", () => {
    expect(
      derivePhrase({ name: "A1", figures: ["(8) Swing", "(1-8) Something"] }).beats,
    ).toBeNull();
  });
});

describe("extractPasses", () => {
  it("reads a hey's pass list", () => {
    const line = parseLine("(16) Hey (WR;NL;MR;PL;WR;NL;MR)");
    expect(line.passes).toEqual(["WR", "NL", "MR", "PL", "WR", "NL", "MR"]);
    // A pass token names who the pass is with, so the hey's relations come
    // from the list: W and M are roles and drop out.
    expect(line.relations).toEqual(["N", "P"]);
  });

  it("reads a carried pass and an indexed relation", () => {
    expect(extractPasses("Hey 1/2 (WR;PL;MR;N2L~)")).toEqual(["WR", "PL", "MR", "N2L~"]);
    expect(extractRelations("Hey 1/2 (WR;PL;MR;N2L~)", ["WR", "PL", "MR", "N2L~"])).toEqual([
      "P",
      "N2",
    ]);
  });

  it("is not fooled by an ordinary parenthesis", () => {
    expect(
      extractPasses("In long lines, go forward and back (M roll L, W side-step R)"),
    ).toBeNull();
    expect(extractPasses("Pass through along (N2R)")).toBeNull();
  });
});

describe("extractRelations", () => {
  it("records each relation once, in order of first appearance", () => {
    expect(extractRelations("N2 neighbor allemande left 1 & 1/2")).toEqual(["N2", "N"]);
  });

  it("reads a previous-neighbor shorthand with its sign", () => {
    expect(extractRelations("N-1 neighbor allemande right")).toEqual(["N-1", "N"]);
    expect(extractRelations("Shadow S-1 balance")).toEqual(["S", "S-1"]);
  });

  it("reads the same-role shorthand and the words it sits beside", () => {
    expect(extractRelations("Circle left 3/4 [with SRN, shadow S2]")).toEqual(["SRN", "S", "S2"]);
    expect(extractRelations("Same-role neighbor pull by right")).toEqual(["SRN", "N"]);
  });

  it("maps the written-out words to their shorthand", () => {
    expect(extractRelations("Partner balance")).toEqual(["P"]);
    expect(extractRelations("Current corner courtesy turn")).toEqual(["C1"]);
    expect(extractRelations("Trail buddy do-si-do")).toEqual(["TB"]);
    expect(extractRelations("Ones swing")).toEqual(["1"]);
    expect(extractRelations("Twos balance")).toEqual(["2"]);
    expect(extractRelations("Opposite allemande")).toEqual(["O"]);
  });

  it("is case-sensitive for the shorthand", () => {
    // The roles are not relations, and a lower-case `s` is the end of a word.
    expect(extractRelations("Men allemande left 3/4")).toEqual([]);
    expect(extractRelations("Star left 1")).toEqual([]);
  });
});

describe("extractFractions", () => {
  it("reads both written spellings, as written", () => {
    expect(extractFractions("Circle left 3/4")).toEqual(["3/4"]);
    expect(extractFractions("Men allemande left 1 & 1/2")).toEqual(["1 & 1/2"]);
    expect(extractFractions("Hey 1/2 then allemande 1 & 1/4")).toEqual(["1/2", "1 & 1/4"]);
  });

  it("reads the unicode fractions", () => {
    expect(extractFractions("Circle left ¾ then star ½ and ¼")).toEqual(["¾", "½", "¼"]);
  });
});

describe("deriveHead", () => {
  it("strips a leading actor phrase and takes the first two words", () => {
    expect(deriveHead("Neighbor swing")).toBe("swing");
    expect(deriveHead("Ladies chain to partner")).toBe("chain to");
    expect(deriveHead("In long lines, go forward and back")).toBe("go forward");
  });

  it("strips relation shorthand along with the actor it introduces", () => {
    expect(deriveHead("N2 neighbor balance and swing")).toBe("balance and");
    expect(deriveHead("N3 men allemande left 3/4")).toBe("allemande left");
    // ...but never on its own: `ON` is shorthand and also an English word.
    expect(deriveHead("On left diagonal, ladies chain")).toBe("on left");
  });

  it("removes parenthesised spans, nested ones included", () => {
    expect(deriveHead("Hey (WR;NL;MR;PL)")).toBe("hey");
    expect(deriveHead("Pass the ocean (to wave of four (PR,WL))")).toBe("pass the");
    expect(deriveHead("(5-16) [Middles] Partner swing")).toBe("swing");
  });

  it("strips only one actor phrase, and is provisional either way", () => {
    expect(deriveHead("As couples, N2 neighbor do-si-do")).toBe("n2 neighbor");
  });

  it("keeps every listed actor phrase strippable", () => {
    for (const phrase of ACTOR_PHRASES) {
      expect(deriveHead(`${phrase} circle left three quarters`)).toBe("circle left");
    }
  });
});

describe("formationId", () => {
  it("maps the three formations in the doc's table", () => {
    expect(formationId("Duple Minor - Improper")).toBe("duple-improper");
    expect(formationId("Duple Minor - Becket")).toBe("becket");
    expect(formationId("Duple Minor - Proper")).toBe("proper");
  });

  it("is null for anything else, rather than a guess", () => {
    expect(formationId("Other Longways")).toBeNull();
    expect(formationId("Circle Mixer")).toBeNull();
    expect(formationId("")).toBeNull();
  });
});

describe("deriveRecord", () => {
  it("defaults an empty phrase structure to the ordinary contra shape", () => {
    expect(deriveRecord(rawRecord({ PhraseStructure: "" })).phraseStructure).toBe("4*8*2");
    expect(deriveRecord(rawRecord({ PhraseStructure: "8*8*2" })).phraseStructure).toBe("8*8*2");
  });

  it("copies the metadata the doc names, normalising only the four it says", () => {
    const record = deriveRecord(
      rawRecord({
        ID: "10320",
        Name: "Butter",
        Authors: ["Gene Hubert"],
        Status: "Deprecated",
        FormationBase: "Duple Minor - Becket",
        Direction: "CW",
        "Mixer?": "yes",
        Videos: ["a", "b"],
        Appearances: [{ source: "x" }],
      }),
    );
    expect(record.source).toBe("callers-box");
    expect(record.id).toBe("10320");
    expect(record.url).toBe("https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10320");
    expect(record.fetchedAt).toBe("2026-09-15T02:56:16+00:00");
    expect(record.status).toBe("deprecated");
    expect(record.formation).toEqual({ base: "Duple Minor - Becket", detail: "", id: "becket" });
    expect(record.mixer).toBe(true);
    expect(record.videos).toBe(2);
    expect(record.appearances).toBe(1);
  });

  it("counts the flags over every line, children included", () => {
    const record = deriveRecord(
      rawRecord({
        phrases: [
          {
            name: "A1",
            figures: [
              "(0) Face partner",
              "(1-8) Ones figure eight down",
              "(3) Circle left 3/4",
              "(8) Neighbor swing // Neighbor two-hand turn",
              "(4) Men petronella || Women orbit",
              "(4) P? partner balance",
              "(8) Spin chain:",
              "     (5) Part one",
            ],
          },
        ],
      }),
    );
    expect(record.flags).toEqual({
      uncounted: 1,
      zeroBeat: 1,
      concurrent: 1,
      composite: 1,
      oddCounts: 2,
      either: 1,
      undefined: 1,
    });
  });

  it("starts every flag at zero for a record with no lines", () => {
    expect(countFlags([])).toEqual({
      uncounted: 0,
      zeroBeat: 0,
      concurrent: 0,
      composite: 0,
      oddCounts: 0,
      either: 0,
      undefined: 0,
    });
  });
});

describe("parseArgs", () => {
  it("defaults to the whole cache, writing", () => {
    expect(parseArgs([])).toEqual({ data: null, only: null, report: false });
  });

  it("parses --only as a comma-separated id list", () => {
    expect(parseArgs(["--only", "10320"]).only).toEqual(["10320"]);
    expect(parseArgs(["--only", "10320,1, 6500"]).only).toEqual(["10320", "1", "6500"]);
  });

  it("parses --report and --data", () => {
    const args = parseArgs(["--report", "--data", "../contra-data"]);
    expect(args.report).toBe(true);
    expect(args.data).toBe("../contra-data");
  });
});

describe("runDerive", () => {
  const cache = new Map([
    ["1", rawRecord({ ID: "1" })],
    ["2", rawRecord({ ID: "2", Permission: "search", phrases: [] })],
    ["3", rawRecord({ ID: "3", Permission: "full", phrases: [] })],
    [
      "4",
      rawRecord({
        ID: "4",
        phrases: [{ name: "A1", figures: ["(1-8) Ones figure eight down"] }],
      }),
    ],
  ]);
  const ids = [...cache.keys()];
  const readRaw = (id) => cache.get(String(id));

  it("writes one file per record with phrases, and counts the rest", async () => {
    const written = [];
    const { counts } = await runDerive({
      ids,
      readRaw,
      writeRecord: (id, text) => written.push({ id, text }),
    });
    expect(counts).toEqual({
      seen: 4,
      withPhrases: 2,
      written: 2,
      skippedSearchOnly: 1,
      skippedOtherNoPhrases: 1,
    });
    expect(written.map((file) => file.id)).toEqual(["1", "4"]);
  });

  it("--only narrows the run to the ids named", async () => {
    const written = [];
    await runDerive({
      ids,
      readRaw,
      only: ["4"],
      writeRecord: (id, text) => written.push({ id, text }),
    });
    expect(written.map((file) => file.id)).toEqual(["4"]);
  });

  it("--report writes nothing and prints the counts and every flag", async () => {
    const printed = [];
    const { counts, flags } = await runDerive({
      ids,
      readRaw,
      report: true,
      writeRecord: () => {
        throw new Error("--report must not write");
      },
      log: (message) => printed.push(message),
    });
    expect(counts.written).toBe(0);
    expect(flags.uncounted).toBe(1);
    expect(printed.join("\n")).toContain("records seen: 4");
    expect(printed.join("\n")).toContain("skipped, search-only (no figures): 1");
    for (const flag of Object.keys(flags)) {
      expect(printed.join("\n")).toContain(`  ${flag}: `);
    }
  });

  it("is deterministic: a second run writes the same bytes", async () => {
    const run = async () => {
      const written = [];
      await runDerive({ ids, readRaw, writeRecord: (id, text) => written.push({ id, text }) });
      return written;
    };
    expect(await run()).toEqual(await run());
  });
});

describe("formatRecord", () => {
  it("writes prettier's JSON with a trailing newline", async () => {
    const text = await formatRecord(deriveRecord(rawRecord()));
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('  "source": "callers-box",\n');
    // Prettier keeps a short array on one line; the bytes have to match what
    // `pnpm format` would produce, since a record may be copied into the
    // public repository as a fixture.
    expect(text).toContain('"authors": ["A Caller"]');
    expect(JSON.parse(text).id).toBe("1");
  });
});
