import type { TeachEdit } from "@caller/choreo";
import { describe, expect, it, vi } from "vitest";
import { DANCE_FILES } from "../dances/danceFiles.js";
import { DEMO_DANCES } from "../dances/index.js";
import { danceFromFile } from "../dances/loadDances.js";
import { checkDanceTeach } from "./teach.js";
import { danceWalkthrough } from "./walkthrough.js";

/**
 * A caller's own edits to one dance's walkthrough.
 *
 * Nothing in the programme writes a `teach` block — "store only what a human
 * wrote", and the user has written none yet — so the whole of this is fixtures
 * over a copy of Butter, plus the one thing that must be true of the shipped
 * dances: that they load without a word of warning.
 */

/** Butter, with a `teach` block written over it. */
const butterWith = (teach: Record<string, TeachEdit>) =>
  danceFromFile({ ...DANCE_FILES["butter"]!, teach });

describe("the keys a caller may write", () => {
  it("takes a phrase and a figure, a repeat, a branch, and the two dance-level ones", () => {
    const fine = {
      "A1/slide-left": { before: "Look left first." },
      "A2/robins-chain": { replace: "Chain across to your partner." },
      "B1/hey/1": { after: "It is a weave, not a chase." },
      opening: { replace: "Hands four, then circle one place left." },
      wrap: { after: "Say it again next time." },
    };
    expect(checkDanceTeach({ ...DANCE_FILES["butter"]!, teach: fine })).toEqual([]);
  });

  it("reads a dance-local figure's own slashed id as one figure", () => {
    // `fatal-attraction/go-forward` is a figure id with a slash in it (D10), so
    // the key that names it has four segments and still names one figure.
    expect(
      checkDanceTeach({
        ...DANCE_FILES["fatal-attraction"]!,
        teach: { "A2/fatal-attraction/go-forward": { replace: "Walk on one place." } },
      }),
    ).toEqual([]);
  });

  it("names the fault, and the key, for a key that names nothing", () => {
    const faults = checkDanceTeach({
      ...DANCE_FILES["butter"]!,
      teach: {
        "A9/hey": { after: "…" },
        "B1/hey/2": { after: "…" },
        "B2/circle": { after: "…" },
        "A1/slide-left": {},
      },
    });
    expect(faults).toHaveLength(4);
    expect(faults.join("\n")).toContain('teach "A9/hey" names no phrase "A9"');
    expect(faults.join("\n")).toContain('teach "B1/hey/2" names B1\'s 2 "hey", and there is one');
    expect(faults.join("\n")).toContain('teach "B2/circle" names no "circle" in B2');
    expect(faults.join("\n")).toContain('teach "A1/slide-left" says nothing');
  });

  it("counts a repeat of one figure inside one phrase", () => {
    // Kitchen Stomp balances the ring twice, once in each of B1 and B2, so
    // neither phrase has a second one.
    const kitchen = DANCE_FILES["kitchen-stomp"]!;
    expect(checkDanceTeach({ ...kitchen, teach: { "B1/balance-ring": { after: "…" } } })).toEqual(
      [],
    );
    expect(
      checkDanceTeach({ ...kitchen, teach: { "B1/balance-ring/2": { after: "…" } } }).join("\n"),
    ).toContain("and there is one");
  });

  it("warns at load, once per fault, and loads the dance anyway", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const dance = butterWith({ "A9/hey": { after: "…" } });
      expect(dance.slug).toBe("butter");
      expect(dance.phrases).toHaveLength(4);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('butter: teach "A9/hey"');
    } finally {
      warn.mockRestore();
    }
  });

  it("loads the whole programme without one word of warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      for (const dance of DEMO_DANCES) {
        expect(checkDanceTeach(dance), dance.slug).toEqual([]);
      }
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("what an edit does to the card", () => {
  it("puts a paragraph before an entry and one after it", () => {
    const card = danceWalkthrough(
      butterWith({ "A1/slide-left": { before: "Look left first.", after: "Everybody together." } }),
    );
    expect(card.entries[0]!.before).toBe("Look left first.");
    expect(card.entries[0]!.after).toBe("Everybody together.");
    // And nothing else moved.
    expect(card.entries[1]!.before).toBeUndefined();
  });

  it("replaces one entry's mechanics line and keeps its hint", () => {
    const card = danceWalkthrough(
      butterWith({ "B1/hey": { replace: "Weave the figure of eight." } }),
    );
    const entry = card.entries.find((each) => each.lines[0]!.figure === "hey")!;
    expect(entry.lines[0]!.line).toBe("Weave the figure of eight.");
    expect(entry.hint).toBeDefined();
  });

  it("replaces the two dance-level sentences", () => {
    const card = danceWalkthrough(
      butterWith({
        opening: { replace: "Hands four, then circle one place left." },
        wrap: { replace: "Slide left and do it again." },
      }),
    );
    expect(card.opening.line).toBe("Hands four, then circle one place left.");
    expect(card.wrap.text).toBe("Slide left and do it again.");
  });

  it("replaces one branch of a concurrent call and leaves the other alone", () => {
    const file = DANCE_FILES["fatal-attraction"]!;
    const dance = danceFromFile({
      ...file,
      teach: { "A2/fatal-attraction/go-forward": { replace: "Walk on one place." } },
    });
    const card = danceWalkthrough(dance);
    const branched = card.entries.find((entry) => entry.lines.length > 1)!;
    expect(branched.lines[1]!.line).toBe("Walk on one place.");
    expect(branched.lines[0]!.line).not.toBe("Walk on one place.");
  });

  it("changes nothing at all where a dance writes none", () => {
    const plain = danceWalkthrough(DEMO_DANCES.find((d) => d.slug === "butter")!);
    const empty = danceWalkthrough(butterWith({}));
    expect(empty).toEqual(plain);
  });

  it("survives the round trip a dance file has to survive", () => {
    const dance = butterWith({ "A1/slide-left": { before: "Look left first." } });
    expect(JSON.parse(JSON.stringify(dance))).toEqual(dance);
  });
});
