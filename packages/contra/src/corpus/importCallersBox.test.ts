import { describe, expect, it } from "vitest";
import { danceFromFile } from "../dances/loadDances.js";
import { corpusPresent, corpusStatus, hasDerivedDance, readDerivedDance } from "./corpusData.js";
import type { DerivedDance, DerivedLine, DerivedPhrase } from "./importCallersBox.js";
import { DEFAULT_PHRASE_BEATS, importCallersBox, phraseLengths } from "./importCallersBox.js";

/**
 * The importer's five rules, one hand-written record each, and then the same
 * five against a real one read off the data root.
 *
 * Hand-written first and for most of the file, because the rules are what is
 * being checked and a record from the corpus is a record that happens to use
 * them; the real one is the check that the *contract* is what the records on
 * disk actually hold, which no fixture can make true.
 */

/** A plain counted line. */
const line = (beats: number | null, text: string): DerivedLine => ({
  raw: beats === null ? text : `(${String(beats)}) ${text}`,
  beats,
  text,
  head: text.toLowerCase().split(" ").slice(0, 2).join(" "),
  relations: [],
  fractions: [],
});

const phrase = (name: string, lines: DerivedLine[]): DerivedPhrase => ({
  name,
  beats: lines.every((l) => l.beats !== null)
    ? lines.reduce((sum, l) => sum + (l.beats ?? 0), 0)
    : null,
  lines,
});

/** A record with everything but its phrases filled in. */
const record = (phrases: DerivedPhrase[], over: Partial<DerivedDance> = {}): DerivedDance => ({
  source: "callers-box",
  id: "10320",
  url: "https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10320",
  fetchedAt: "2026-09-15T02:56:16+00:00",
  permission: "full",
  status: "",
  title: "Butter",
  authors: ["Gene Hubert"],
  otherNames: [],
  formation: { base: "Duple Minor - Becket", detail: "", id: "becket" },
  progression: "Single",
  direction: "CW",
  mixer: false,
  phraseStructure: "4*8*2",
  videos: 280,
  appearances: 8,
  callingNotes: [],
  phrases,
  ...over,
});

/** The four ordinary phrases of a sixteen-beat contra, all counted. */
const FOUR: DerivedPhrase[] = [
  phrase("A1", [line(2, "Shift left"), line(6, "Circle left 3/4"), line(8, "Neighbor swing")]),
  phrase("A2", [line(8, "In long lines, go forward and back"), line(8, "Ladies chain to partner")]),
  phrase("B1", [line(16, "Hey (WR;NL;MR;PL;WR;NL;MR)")]),
  phrase("B2", [line(4, "Partner balance"), line(12, "Partner swing")]),
];

/** The record's dance, or a failure the test can read. */
function imported(from: DerivedDance) {
  const result = importCallersBox(from);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.dance;
}

describe("rule 1: every line is a custom call", () => {
  const dance = imported(record(FOUR));

  it("keeps the record's own facts", () => {
    expect(dance.slug).toBe("butter");
    expect(dance.title).toBe("Butter");
    expect(dance.author).toBe("Gene Hubert");
    expect(dance.formation).toBe("becket");
    expect(dance.status).toBe("lab");
    expect(dance.source.callersBoxId).toBe(10320);
    expect(dance.source.permission).toBe("full");
    expect(dance.source.url).toContain("id=10320");
    expect(dance.notes).toContain("The Caller's Box 10320, permission: full");
  });

  it("writes one call per line, in order, with the line's own count and words", () => {
    expect(dance.phrases.map((p) => p.name)).toEqual(["A1", "A2", "B1", "B2"]);
    expect(dance.phrases[0]!.figures).toEqual([
      { figure: "custom", beats: 2, params: { text: "Shift left" } },
      { figure: "custom", beats: 6, params: { text: "Circle left 3/4" } },
      { figure: "custom", beats: 8, params: { text: "Neighbor swing" } },
    ]);
    for (const p of dance.phrases) {
      expect(
        p.figures.reduce((sum, f) => sum + f.beats, 0),
        p.name,
      ).toBe(16);
    }
  });

  it("rebuilds the transcript from the raw lines, phrase by phrase", () => {
    expect(dance.source.transcript).toBe(
      "A1  (2) Shift left  (6) Circle left 3/4  (8) Neighbor swing\n" +
        "A2  (8) In long lines, go forward and back  (8) Ladies chain to partner\n" +
        "B1  (16) Hey (WR;NL;MR;PL;WR;NL;MR)\n" +
        "B2  (4) Partner balance  (12) Partner swing",
    );
  });

  it("loads through the same door data/dances records come in by", () => {
    const loaded = danceFromFile(dance);
    expect(loaded.slug).toBe("butter");
    expect(loaded.phrases).toHaveLength(4);
  });

  it("is JSON and nothing else", () => {
    expect(JSON.parse(JSON.stringify(dance))).toEqual(dance);
  });
});

describe("rule 2: branches become the first branch and a while", () => {
  const concurrent: DerivedLine = {
    raw: "(4) Men walk forward; form long wave in center || Women fall back",
    beats: 4,
    text: "Men walk forward; form long wave in center || Women fall back",
    head: "walk forward",
    relations: [],
    fractions: [],
    branches: [
      { beats: null, text: "Men walk forward; form long wave in center" },
      { beats: null, text: "Women fall back" },
    ],
  };

  const dance = imported(
    record([
      phrase("A1", [concurrent, line(12, "Neighbor swing")]),
      phrase("A2", [line(16, "Partner swing")]),
    ]),
  );
  const call = dance.phrases[0]!.figures[0]!;

  it("puts the first branch in the call and the rest beside it", () => {
    expect(call.figure).toBe("custom");
    expect(call.beats).toBe(4);
    expect(call.params).toEqual({ text: "Men walk forward; form long wave in center" });
    expect(call.while).toHaveLength(1);
    expect(call.while![0]!.params).toEqual({ text: "Women fall back" });
    // A branch's beats are the parent's, so it writes none of its own.
    expect(call.while![0]!.beats).toBeUndefined();
  });

  it("reads each branch's own role, so the two are over disjoint dancers", () => {
    expect(call.who).toBe("larks");
    expect(call.while![0]!.who).toBe("robins");
  });

  it("falls back to larks and robins when neither branch names a role", () => {
    const anonymous: DerivedLine = {
      ...concurrent,
      branches: [
        { beats: null, text: "Centers turn as couples" },
        { beats: null, text: "Ends turn alone" },
      ],
    };
    const other = imported(
      record([
        phrase("A1", [anonymous, line(12, "Neighbor swing")]),
        phrase("A2", [line(16, "P")]),
      ]),
    );
    const first = other.phrases[0]!.figures[0]!;
    expect(first.who).toBe("larks");
    expect(first.while![0]!.who).toBe("robins");
    expect(other.notes).toContain("a placeholder");
  });

  it("folds a third branch on to the second, because there is no third role", () => {
    const three: DerivedLine = {
      ...concurrent,
      branches: [
        { beats: null, text: "Ones swing" },
        { beats: null, text: "Twos allemande" },
        { beats: null, text: "Threes California twirl" },
      ],
    };
    const other = imported(
      record([phrase("A1", [three, line(12, "Neighbor swing")]), phrase("A2", [line(16, "P")])]),
    );
    const first = other.phrases[0]!.figures[0]!;
    expect(first.params).toEqual({ text: "Ones swing" });
    expect(first.while![0]!.params).toEqual({
      text: "Twos allemande || Threes California twirl",
    });
  });

  it("still sums the phrase to its declared length: a while takes no extra beats", () => {
    const loaded = danceFromFile(dance);
    for (const p of loaded.phrases) {
      expect(
        p.figures.reduce((sum, f) => sum + f.beats, 0),
        p.name,
      ).toBe(16);
    }
  });
});

describe("rule 3: a composite becomes its children when they add up", () => {
  const parent = (mismatch: boolean): DerivedLine => ({
    raw: "(7) Modified right and left through with neighbor:",
    beats: 7,
    text: "Modified right and left through with neighbor:",
    head: "modified right",
    relations: ["N"],
    fractions: [],
    children: [line(3, "Pass through across (PR)"), line(4, "Neighbor California twirl")],
    childrenBeatsMismatch: mismatch,
  });

  it("writes the children as calls and the parent into the notes", () => {
    const dance = imported(
      record([
        phrase("B1", [parent(false), line(2, "Half sashay"), line(7, "Star right 7/8")]),
        phrase("B2", [line(16, "Partner swing")]),
      ]),
    );
    expect(
      dance.phrases[0]!.figures.map((f) => [f.beats, (f.params as { text: string }).text]),
    ).toEqual([
      [3, "Pass through across (PR)"],
      [4, "Neighbor California twirl"],
      [2, "Half sashay"],
      [7, "Star right 7/8"],
    ]);
    expect(dance.notes).toContain("Modified right and left through with neighbor:");
    expect(dance.notes).toContain("is the heading for the 2 calls under it");
  });

  it("keeps the parent as one call when the children do not add up", () => {
    const dance = imported(
      record([
        phrase("B1", [parent(true), line(2, "Half sashay"), line(7, "Star right 7/8")]),
        phrase("B2", [line(16, "Partner swing")]),
      ]),
    );
    const calls = dance.phrases[0]!.figures;
    expect(calls).toHaveLength(3);
    expect(calls[0]!.beats).toBe(7);
    expect((calls[0]!.params as { text: string }).text).toBe(
      "Modified right and left through with neighbor:",
    );
    expect(dance.notes).toContain("do not sum to its own");
    expect(dance.notes).toContain("Pass through across (PR)");
  });

  it("keeps the children's own indentation in the transcript", () => {
    const indented: DerivedLine = {
      ...parent(false),
      children: [
        { ...line(3, "Pass through across (PR)"), raw: "     (3) Pass through across (PR)" },
        { ...line(4, "Neighbor California twirl"), raw: "     (4) Neighbor California twirl" },
      ],
    };
    const dance = imported(
      record([phrase("B1", [indented, line(9, "Star right")]), phrase("B2", [line(16, "P")])]),
    );
    expect(dance.source.transcript.split("\n")[0]).toBe(
      "B1  (7) Modified right and left through with neighbor:  " +
        "     (3) Pass through across (PR)       (4) Neighbor California twirl  (9) Star right",
    );
  });
});

describe("rule 4: an uncounted line takes a share of what is left", () => {
  it("shares the phrase's remainder equally, the remainder on the last", () => {
    const dance = imported(
      record([
        // 16 − 3 = 13 over two uncounted lines: 6 and 7.
        phrase("A1", [line(3, "Balance"), line(null, "Swing"), line(null, "Chain")]),
        phrase("A2", [line(16, "Partner swing")]),
      ]),
    );
    expect(dance.phrases[0]!.figures.map((f) => f.beats)).toEqual([3, 6, 7]);
    expect(dance.phrases[0]!.figures.reduce((sum, f) => sum + f.beats, 0)).toBe(16);
  });

  it("gives the whole phrase to a single uncounted line", () => {
    const dance = imported(
      record([phrase("A1", [line(null, "Hey (1-8)")]), phrase("A2", [line(16, "Partner swing")])]),
    );
    expect(dance.phrases[0]!.figures[0]!.beats).toBe(16);
  });

  it("never goes negative: a full phrase leaves an uncounted line at zero beats", () => {
    const dance = imported(
      record([
        phrase("A1", [line(16, "Neighbor balance and swing"), line(null, "Face your neighbor")]),
        phrase("A2", [line(16, "Partner swing")]),
      ]),
    );
    expect(dance.phrases[0]!.figures.map((f) => f.beats)).toEqual([16, 0]);
    // A zero-beat `custom` is legal, so the record still loads.
    expect(() => danceFromFile(dance)).not.toThrow();
  });

  it("reads the phrase's declared length off phraseStructure", () => {
    expect(phraseLengths("4*8*2", 4)).toEqual([16, 16, 16, 16]);
    expect(phraseLengths("2*8*2 + 2*10*2", 4)).toEqual([16, 16, 20, 20]);
    // Terms that do not count the record's own phrases, but all one length.
    expect(phraseLengths("4*8*2", 8)).toEqual(Array.from({ length: 8 }, () => 16));
    // Nothing countable at all.
    expect(phraseLengths("unphrased", 3)).toEqual([
      DEFAULT_PHRASE_BEATS,
      DEFAULT_PHRASE_BEATS,
      DEFAULT_PHRASE_BEATS,
    ]);
    expect(phraseLengths("4*8*3 (waltz)", 4)).toEqual([24, 24, 24, 24]);
  });

  it("uses the declared length of a crooked dance, phrase by phrase", () => {
    const dance = imported(
      record(
        [
          phrase("A1", [line(null, "Long lines")]),
          phrase("A2", [line(null, "Neighbor swing")]),
          phrase("B1", [line(null, "Hey")]),
          phrase("B2", [line(null, "Partner swing")]),
        ],
        { phraseStructure: "2*8*2 + 2*10*2" },
      ),
    );
    expect(dance.phrases.map((p) => p.figures[0]!.beats)).toEqual([16, 16, 20, 20]);
  });
});

describe("rule 5: a formation we cannot seat is refused", () => {
  it("returns the reason rather than a record", () => {
    const result = importCallersBox(
      record(FOUR, { formation: { base: "Triple Minor - Improper", detail: "", id: null } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("formation: Triple Minor - Improper");
  });

  it("is the only refusal: a record with nothing in it still imports", () => {
    const result = importCallersBox(record([]));
    expect(result.ok).toBe(true);
  });
});

describe("it never throws on a record the contract admits", () => {
  const odd: DerivedDance[] = [
    record([]),
    record([phrase("A1", [])]),
    record([phrase("A1", [line(null, "One")])], { phraseStructure: "" }),
    record([phrase("A1", [{ beats: null, text: "" }])]),
    record(FOUR, { title: "   ", authors: [] }),
    record([
      phrase("A1", [
        {
          ...line(8, "Parent:"),
          children: [{ ...line(4, "Child:"), children: [line(2, "Grandchild"), line(2, "Other")] }],
          childrenBeatsMismatch: true,
        },
      ]),
    ]),
  ];

  it.each(odd.map((each, at) => [at, each]))("record %i", (_at, each) => {
    expect(() => importCallersBox(each)).not.toThrow();
  });

  it("falls back to the id when the title kebabs to nothing", () => {
    expect(imported(record(FOUR, { title: "!!!" })).slug).toBe("callers-box-10320");
  });
});

describe.skipIf(!corpusPresent)("a real derived record", () => {
  it(`imports Butter off the data root (${corpusStatus()})`, () => {
    if (!hasDerivedDance("10320")) return;
    const real = readDerivedDance("10320");
    const result = importCallersBox(real);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    const dance = result.dance;
    expect(dance.title).toBe("Butter");
    expect(dance.formation).toBe("becket");
    expect(dance.source.callersBoxId).toBe(10320);
    // The record the repository already ships quotes the same transcript, line
    // for line, so the rebuilt one holds the same words.
    expect(dance.source.transcript).toContain("(2) Shift left");
    expect(dance.source.transcript).toContain("Hey (WR;NL;MR;PL;WR;NL;MR)");
    for (const p of dance.phrases) {
      expect(
        p.figures.reduce((sum, f) => sum + f.beats, 0),
        p.name,
      ).toBe(16);
      for (const call of p.figures) expect(call.figure).toBe("custom");
    }
    expect(() => danceFromFile(dance)).not.toThrow();
  });
});
