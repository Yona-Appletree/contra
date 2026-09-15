import { describe, expect, it } from "vitest";
import { ALL_DANCES, DEMO_DANCES } from "../dances/index.js";
import { formationById } from "../dances/formations.js";
import { danceBoundaries } from "../set/planCycle.js";
import { setRulesOf } from "../set/SetRules.js";
import { hintText, needOf, relationWordBetween, seamHint, toOf } from "./seam.js";
import { danceWalkthrough } from "./walkthrough.js";

/**
 * The seam hint is the one sentence in the app nobody wrote, so these are the
 * tests that keep it honest: the grammar it may use, how often it speaks, and
 * the facts about the hall the user named as the things it must get right.
 */

/** Every sentence a hint may be, and nothing else. */
const GRAMMAR =
  /^(Your (partner|neighbor|next neighbor|previous neighbor|shadow|opposite)|The other (robin|lark)|Number (two|three|four|five|six)) is (across from you|beside you|on your (left|right) diagonal|along your line|behind you|in your (left|right) hand)\.$/;

/** One dance's hints, in order, as the walkthrough card carries them. */
function hintsOf(slug: string): string[] {
  const dance = ALL_DANCES.find((d) => d.slug === slug)!;
  return danceWalkthrough(dance)
    .entries.map((entry) => (entry.hint === undefined ? undefined : hintText(entry.hint)))
    .filter((text): text is string => text !== undefined);
}

/** Every sentence of every hint of every programme dance, labelled. */
function everySentence(): Array<{ where: string; sentence: string }> {
  const out: Array<{ where: string; sentence: string }> = [];
  for (const dance of DEMO_DANCES) {
    for (const entry of danceWalkthrough(dance).entries) {
      if (entry.hint === undefined) continue;
      const parts =
        "text" in entry.hint
          ? [entry.hint.text]
          : [entry.hint.byRole.robins, entry.hint.byRole.larks].filter(
              (one): one is string => one !== undefined,
            );
      for (const part of parts) {
        for (const sentence of part.match(/[^.]+\./g) ?? []) {
          out.push({
            where: `${dance.slug} ${entry.phrase} ${entry.heading}`,
            sentence: sentence.trim(),
          });
        }
      }
    }
  }
  return out;
}

describe("the grammar of a hint", () => {
  it("says one of five things about one of eight places, and nothing else", () => {
    const sentences = everySentence();
    expect(sentences.length).toBeGreaterThan(0);
    for (const { where, sentence } of sentences) {
      expect(sentence, where).toMatch(GRAMMAR);
    }
  });

  it("says one or two sentences per role, never three", () => {
    for (const dance of DEMO_DANCES) {
      for (const entry of danceWalkthrough(dance).entries) {
        if (entry.hint === undefined) continue;
        const parts =
          "text" in entry.hint
            ? [entry.hint.text]
            : [entry.hint.byRole.robins, entry.hint.byRole.larks].filter(
                (one): one is string => one !== undefined,
              );
        for (const part of parts) {
          const count = (part.match(/\./g) ?? []).length;
          expect(count, `${dance.slug} ${entry.heading}: "${part}"`).toBeLessThanOrEqual(2);
          expect(count, `${dance.slug} ${entry.heading}: "${part}"`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});

describe("when a hint is said at all", () => {
  /**
   * **The count, pinned** — what the gate reads (question 2: "said too often,
   * or not often enough?").
   *
   * 47 of the programme's 105 seams. The plan's own estimate was 20 to 35 over
   * the **ten** demo dances the vision was written against; the programme is
   * fifteen dances now, and 47 over fifteen is the same rate. A rule change here
   * moves this number, which is the point of pinning it.
   */
  it("speaks at 47 of the programme's 105 seams", () => {
    let seams = 0;
    let hinted = 0;
    for (const dance of DEMO_DANCES) {
      const entries = danceWalkthrough(dance).entries;
      // The last call of a time through has no seam: the wrap stands in.
      seams += entries.length - 1;
      hinted += entries.filter((entry) => entry.hint !== undefined).length;
    }
    expect(seams).toBe(105);
    expect(hinted).toBe(47);
  });

  it("says nothing where the next call is with the dancer this one was", () => {
    // Every balance into a swing, every do-si-do into an "AND SWING": the call
    // is one figure of the card and the pair never changes.
    for (const dance of DEMO_DANCES) {
      const { reference, boundaries } = danceBoundaries(dance, formationById(dance.formation));
      for (const at of boundaries) {
        if (at.starting.length === 0 || at.ending.length === 0) continue;
        const stuck = reference.every((dancer) => {
          const need = needOf(at.starting, dancer, at.model);
          const had = needOf(at.ending, dancer, at.model);
          return need.kind === "with" && had.kind === "with" && need.dancer === had.dancer;
        });
        if (stuck)
          expect(seamHint(at, reference), `${dance.slug} beat ${String(at.beat)}`).toBeUndefined();
      }
    }
  });

  it("says nothing at the wrap, where the progression sentence stands in", () => {
    for (const dance of DEMO_DANCES) {
      const entries = danceWalkthrough(dance).entries;
      expect(entries[entries.length - 1]!.hint, dance.slug).toBeUndefined();
    }
  });
});

describe("the facts the user named", () => {
  it("says your partner is beside you before a partner figure that follows a role figure", () => {
    for (const slug of [
      "airpants",
      "contra-cockaigne",
      "jubilation",
      "kitchen-stomp",
      "thanks-to-the-gene",
    ]) {
      expect(hintsOf(slug).join(" "), slug).toContain("Your partner is beside you.");
    }
  });

  it("sends the larks to the right diagonal before a larks allemande left", () => {
    // The geometry of the hall: after a swing on your own place, the other lark
    // of your minor set is diagonally across from you, on your right.
    for (const slug of ["neighbor-neighbor-on-the-wall", "jubilation", "kitchen-stomp"]) {
      expect(hintsOf(slug), slug).toContain("Larks: The other lark is on your right diagonal.");
    }
  });

  it("names the next neighbour in Whoosh, where the call reaches past the four", () => {
    expect(hintsOf("whoosh").join(" ")).toContain("Your next neighbor is");
  });

  it("derives the chain's target from where the robins are standing", () => {
    // The three programme dances whose transcript writes "to partner", and the
    // one that chains to a neighbour: the record says which role chains and the
    // geometry says whom they land with (A18).
    for (const [slug, want] of [
      ["butter", "partner"],
      ["neighbor-neighbor-on-the-wall", "partner"],
      ["thanks-to-the-gene", "partner"],
      ["the-nice-combination", "neighbor"],
    ] as const) {
      const dance = ALL_DANCES.find((d) => d.slug === slug)!;
      const { reference, boundaries } = danceBoundaries(dance, formationById(dance.formation));
      const said = boundaries
        .map((at) => toOf(at, reference))
        .filter((who): who is NonNullable<typeof who> => who !== undefined)
        .map((who) => (typeof who === "string" ? who : who.kind));
      expect(said, slug).toContain(want);
    }
  });

  it("says a held hand where the model is holding one", () => {
    // Anna's Reel's wave of four into an allemande: the hand is joined at the
    // boundary and a caller says so rather than saying how far away they are.
    expect(hintsOf("annas-reel").join(" ")).toContain("Your neighbor is in your left hand.");
  });

  it("gives a concurrent call one hint at the parent's own end", () => {
    // Are You 'Most Done? dances "larks allemande right while robins loop", and
    // the seam after it is one seam.
    const dance = ALL_DANCES.find((d) => d.slug === "are-you-most-done")!;
    const card = danceWalkthrough(dance);
    const branched = card.entries.filter((entry) => entry.lines.length > 1);
    expect(branched.length).toBe(1);
    expect(branched[0]!.lines.map((one) => one.figure)).toEqual(["allemande", "loop"]);
    // One entry, one seam, one hint — read at the **parent's** end, where both
    // branches have finished, rather than one per branch.
    expect(branched[0]!.hint).toEqual({
      text: "Your partner is beside you. Your neighbor is across from you.",
    });
  });
});

describe("who a relation names, read backwards", () => {
  it("reads a dancer back into the word a caller would use for them", () => {
    const dance = DEMO_DANCES.find((d) => d.slug === "airpants")!;
    const { reference, boundaries } = danceBoundaries(dance, formationById(dance.formation));
    const at = boundaries[0]!;
    const table = setRulesOf(at.model.formation).relations;
    const me = reference[0]!;
    const partner = at.model.dancers[me]!.partner;
    expect(relationWordBetween(at.model, table, me, partner)).toEqual({ kind: "partner" });
  });
});
