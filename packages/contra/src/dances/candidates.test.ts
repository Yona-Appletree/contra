import { describe, expect, it } from "vitest";
import { PROGRESSES_PARAM } from "../set/planCycle.js";
import { CANDIDATE_FILES } from "./candidateFiles.js";
import type { CandidateFile } from "./candidates.js";
import {
  CANDIDATE_BASES,
  CANDIDATE_DANCES,
  candidateBySlug,
  candidateFile,
  candidateSlug,
  candidatesOf,
  splitCandidateSlug,
} from "./candidates.js";
import { DANCE_FILES } from "./danceFiles.js";
import { ALL_DANCES, DEMO_DANCE_SLUGS, LAB_CORPUS } from "./index.js";

/**
 * **The candidate readings** (M9h): what a caller is being shown, and the two
 * promises the page rests on — that a candidate is the transcript's own record
 * plus its clauses and nothing else, and that no candidate is a dance the demo
 * can reach.
 */

const bySlug = (slug: string): CandidateFile => {
  const file = candidateBySlug(slug);
  if (file === undefined) throw new Error(`no candidate ${slug}`);
  return file;
};

describe("a candidate reading", () => {
  it("reads a dance the corpus holds, and every one of the five is read", () => {
    for (const candidate of CANDIDATE_FILES) {
      expect(DANCE_FILES[candidate.of], candidate.id).toBeDefined();
    }
    expect([...CANDIDATE_BASES].sort()).toEqual([
      "annas-reel",
      "contrablend",
      "fatal-attraction",
      "jeremy-corners",
      "the-set-monster",
    ]);
  });

  it("gives each dance two or more readings, each with its own one-line assumption", () => {
    for (const base of CANDIDATE_BASES) {
      const readings = candidatesOf(base);
      expect(readings.length, base).toBeGreaterThanOrEqual(2);
      expect(new Set(readings.map((r) => r.id)).size, base).toBe(readings.length);
      for (const reading of readings) {
        expect(reading.assumes.length, `${base}~${reading.id}`).toBeGreaterThan(20);
        expect(reading.title.length, `${base}~${reading.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("changes only the calls its own patch names, and leaves the record alone", () => {
    // The promise the whole page rests on: a candidate is the transcript's
    // record plus the clauses of one reading. Anything else that differed
    // between two columns would be a second, invisible variable.
    for (const candidate of CANDIDATE_FILES) {
      const base = DANCE_FILES[candidate.of]!;
      const made = candidateFile(candidate);
      const touched = new Set(candidate.patch.map((p) => p.at));
      expect(made.phrases.length, candidate.id).toBe(base.phrases.length);
      base.phrases.forEach((phrase, i) => {
        const mine = made.phrases[i]!;
        expect(mine.name).toBe(phrase.name);
        expect(mine.figures.length, phrase.name).toBe(phrase.figures.length);
        phrase.figures.forEach((call, j) => {
          if (touched.has(`${phrase.name}/${String(j)}`)) return;
          expect(mine.figures[j], `${candidate.id} ${phrase.name}/${String(j)}`).toEqual(call);
        });
      });
      // And the record on disk is untouched by having been read.
      expect(base.slug).toBe(candidate.of);
      expect(base.title).not.toContain("—");
    }
  });

  it("says where the progression is carried, which is the whole question", () => {
    for (const candidate of CANDIDATE_FILES) {
      const claims = candidate.patch.filter(
        (p) => p.params !== undefined && p.params[PROGRESSES_PARAM] !== undefined,
      );
      expect(claims.length, candidate.id).toBeGreaterThan(0);
    }
  });

  it("refuses a patch that names a phrase or a call the record does not have", () => {
    const base = bySlug("contrablend~rollaways");
    expect(() => candidateFile({ ...base, patch: [{ at: "C1/0", params: {} }] })).toThrow(
      /has no phrase "C1"/,
    );
    expect(() => candidateFile({ ...base, patch: [{ at: "A1/9", params: {} }] })).toThrow(
      /A1 has 1 calls/,
    );
  });

  it("removes a clause the record already has, when the reading moves it", () => {
    // Fatal Attraction's record carries `progresses: "start"` on A2's cast-back
    // (DD43); two of its three readings put the shift somewhere else, and a
    // reading with two shifts in one pass would progress twice.
    const made = candidateFile(bySlug("fatal-attraction~promenade"));
    const castBack = made.phrases.find((p) => p.name === "A2")!.figures[0]!;
    expect((castBack.params as Record<string, unknown>)[PROGRESSES_PARAM]).toBeUndefined();
    const promenade = made.phrases.find((p) => p.name === "A1")!.figures[1]!;
    expect((promenade.params as Record<string, unknown>)[PROGRESSES_PARAM]).toBe(true);
  });

  it("can replace the record's own progression, which one reading needs", () => {
    // The Set Monster's triple progression read as ContraDB's three pilcrows:
    // one place claimed three times rather than three places claimed once.
    const made = candidateFile(bySlug("the-set-monster~contradb"));
    expect(made.progression).toEqual({ lark: 1, robin: 1 });
    expect(DANCE_FILES["the-set-monster"]!.progression).toEqual({ lark: 3, robin: 3 });
  });
});

describe("where a candidate is, and is not", () => {
  it("loads as a dance of its own, named `<slug>~<id>`", () => {
    expect(CANDIDATE_DANCES.map((d) => d.slug)).toEqual(
      CANDIDATE_FILES.map((c) => candidateSlug(c.of, c.id)),
    );
    expect(splitCandidateSlug("the-set-monster~contradb")).toEqual({
      of: "the-set-monster",
      id: "contradb",
    });
    expect(splitCandidateSlug("butter")).toBeUndefined();
  });

  it("is in the lab corpus and in nothing else", () => {
    // The whole reason a candidate is not a dance file: everything that walks
    // the corpus — the programme, the Moves page's dance index, the trace
    // plates, the acceptance tests — must keep seeing exactly the files on disk.
    for (const dance of CANDIDATE_DANCES) {
      expect(ALL_DANCES.some((d) => d.slug === dance.slug), dance.slug).toBe(false);
      expect(DEMO_DANCE_SLUGS).not.toContain(dance.slug);
      expect(LAB_CORPUS.some((d) => d.slug === dance.slug), dance.slug).toBe(true);
    }
    expect(LAB_CORPUS.length).toBe(ALL_DANCES.length + CANDIDATE_DANCES.length);
  });

  it("keeps the record it reads in its own notes, so nothing measured is lost", () => {
    const made = candidateFile(bySlug("contrablend~rollaways"));
    expect(made.notes).toContain("Candidate reading");
    expect(made.notes).toContain("The record this reads:");
    expect(made.notes).toContain("The Caller's Box 219");
    expect(made.source).toEqual(DANCE_FILES["contrablend"]!.source);
  });
});
