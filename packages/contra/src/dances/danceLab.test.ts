import { danceSchedule, validateDance } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import type { DanceLabReport } from "./danceLab.js";
import { danceLabReport, danceResolution, labCouples } from "./danceLab.js";
import { ALL_DANCES, DEMO_DANCES, danceBySlug } from "./index.js";
import { MOTION_ALLOWLIST, motionAllowance } from "./motionAllowlist.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";

/**
 * `pnpm dance <slug>`'s pure half: does the dance resolve, does it dance, and
 * does anything move faster than the library allows.
 *
 * The ten demo dances are the fixture, which is also the gate: every one of
 * them must come out green, because the lab is what every later milestone runs
 * before it commits a dance.
 */

const BUTTER = danceBySlug("butter")!;
const AIRPANTS = danceBySlug("airpants")!;

/** The minor set a group id belongs to: `set0/p0` out of `set0/p0/swing/1L-2R#3`. */
const minorSetOf = (group: string): string => group.split("#")[0]!.split("/").slice(0, 2).join("/");

/** Whether two resolution rows cast exactly the same dancers. */
const sameDancers = (a: { cast: Record<string, string> }, b: { cast: Record<string, string> }) => {
  const one = Object.values(a.cast).sort().join(",");
  return one === Object.values(b.cast).sort().join(",");
};

/** Every loaded dance's report, run once: the lab is the slowest thing here. */
const REPORTS: Map<string, DanceLabReport> = new Map(
  ALL_DANCES.map((dance) => [dance.slug, danceLabReport(dance.slug, labCouples(dance))]),
);

describe("the dance lab", () => {
  it("says so, and fails, when the slug names no dance", () => {
    const report = danceLabReport("not-a-dance");
    expect(report.ok).toBe(false);
    expect(report.text).toContain("no such dance");
    expect(report.text).toContain("butter");
  });

  it("resolves every call of a dance, once per minor set", () => {
    const rows = danceResolution(BUTTER, 6);
    // Butter has seven calls; six couples in becket make two minor sets.
    expect(rows.filter((r) => r.figure === "hey")).toHaveLength(2);
    expect(new Set(rows.map((r) => r.figure))).toEqual(
      new Set([
        "slide-left",
        "circle",
        "swing",
        "long-lines",
        "robins-chain",
        "hey",
        "balance-and-swing",
      ]),
    );
    for (const row of rows) {
      // A bridged coded figure still takes the whole minor set, in the
      // formation's own frame, and leaves people wherever its shape put them.
      // A migrated one takes a **pair**, anchored where the pair meets, and
      // settles them on to the formation's places: its cast is the figure's own
      // roles rather than four station ids, which is the whole point of the
      // rebuild. Butter leaves nobody standing in any call either way.
      if (row.figure === "swing" || row.figure === "balance-and-swing") {
        expect(Object.keys(row.cast).sort(), row.figure).toEqual(["lark", "robin"]);
        expect(row.anchor, row.figure).toBe('"meet"');
        expect(row.ends, row.figure).toBe('"home"');
      } else {
        expect(Object.keys(row.cast).sort(), row.figure).toEqual(["1L", "1R", "2L", "2R"]);
        expect(row.anchor, row.figure).toBe('"hands-four"');
        expect(row.ends, row.figure).toBe('"relative"');
      }
      expect(row.holdPlace, row.figure).toEqual([]);
    }
  });

  it("names the dancers a call leaves out, beside the instance that left them out", () => {
    // "Robins allemande right": the two larks are not in the figure at all and
    // dance an explicit hold-place figure (M2), which is a **different group**
    // from the pair's own instance — `set0/p0#4` beside
    // `set0/p0/allemande/1R-2R#3`. Matching the two by whole group id found
    // nothing, and the table silently dropped every hold-place row from the
    // moment M2 migrated a figure; the minor set is the first two segments.
    const rows = danceResolution(AIRPANTS, 2);
    const allemande = rows.find((r) => r.figure === "allemande");
    expect(allemande?.group).toMatch(/^set0\/p0\/allemande\//);
    expect(allemande?.holdPlace).toEqual(["set0/c0/lark", "set0/c1/lark"]);
    // And a call that leaves nobody out still says nobody.
    expect(rows.find((r) => r.figure === "long-lines")?.holdPlace).toEqual([]);
  });

  it("reports the hands that cross a figure boundary, and they agree on both sides", () => {
    let carried = 0;
    for (const dance of DEMO_DANCES) {
      const rows = danceResolution(dance, labCouples(dance));
      // A bridged figure's group id is `<set>/<place>#<instance>`; a data
      // figure's is `<set>/<place>/<figure>/<stations>#<instance>`, because one
      // call becomes an instance per pair. Either way the **minor set** is the
      // first two segments, and its rows in schedule order are its own run of
      // calls — with an extra row for each call that resolved into two pairs.
      const places = new Set(rows.map((r) => minorSetOf(r.group)));
      for (const place of places) {
        const run = rows.filter((r) => minorSetOf(r.group) === place);
        expect(run.length, `${dance.slug} ${place}`).toBeGreaterThanOrEqual(
          danceSchedule(dance).length,
        );
        for (let i = 1; i < run.length; i++) {
          // What one call hands on is exactly what the next one takes over —
          // for the instances that share a pair of dancers, which for a
          // migrated figure is the pair and for a bridged one is all four.
          const before = run[i - 1]!;
          const now = run[i]!;
          if (!sameDancers(before, now)) continue;
          expect(now.carriedIn, `${dance.slug} ${now.figure}`).toEqual(before.carriedOut);
          carried += now.carriedIn.length;
        }
      }
    }
    // **No demo dance carries a hand across a call boundary today** — the only
    // carrying the programme does is *inside* `balance-and-swing`, which is one
    // call. `chainCalls`' `carryHolds` produces the same empty answer for all
    // ten (checked against the loaded dances), so the equality above is real
    // but weak, and the synthetic pair below is what exercises the machinery.
    expect(carried).toBe(0);

    // `balance` into `swing` with the same pairs is the case `carryHolds` was
    // written for: the balance ends holding both hands and the swing still has
    // them through its middle.
    const pair = validateDance({
      slug: "carry-fixture",
      title: "Carry Fixture",
      author: "M1",
      formation: DUPLE_IMPROPER.id,
      phrases: (["A1", "A2", "B1", "B2"] as const).map((name) => ({
        name,
        figures: [
          { figure: "balance", beats: 8, params: { pairs: "partners" } },
          { figure: "swing", beats: 8, params: { pairs: "partners" } },
        ],
      })),
    });
    const rows = danceResolution(pair, 4);
    const swing = rows.find((r) => r.figure === "swing")!;
    const balance = rows.find((r) => r.figure === "balance")!;
    expect(swing.carriedIn.length).toBeGreaterThan(0);
    expect(swing.carriedIn).toEqual(balance.carriedOut);
    expect(swing.carriedIn).toContain("c0/lark.L↔c0/robin.R");
  });

  it("prints the four sections `pnpm dance` promises", () => {
    const report = REPORTS.get("butter")!;
    expect(report.text).toContain("## 1. Resolution");
    expect(report.text).toContain("## 2. Oracles");
    expect(report.text).toContain("## 3. Motion");
    expect(report.text).toContain("resolution, oracles and motion: green");
  });

  for (const dance of DEMO_DANCES) {
    it(`${dance.slug} is green in the lab`, () => {
      const report = REPORTS.get(dance.slug)!;
      expect(report.text).not.toContain("**FAIL");
      expect(report.ok, report.text).toBe(true);
    });
  }
});

describe("the motion allowlist", () => {
  it("gives every allowance a reason that names the milestone that would remove it", () => {
    for (const allowance of MOTION_ALLOWLIST) {
      expect(allowance.reason.length, `${allowance.key} ${allowance.metric}`).toBeGreaterThan(40);
      expect(allowance.reason, `${allowance.key} ${allowance.metric}`).toMatch(/M\d+/);
    }
  });

  it("holds nothing that no loaded dance actually needs", () => {
    // A stale allowance is a silently tolerated regression waiting to happen:
    // if a figure stops tripping a bound its entry has to go, or the next
    // figure that trips it goes unnoticed.
    const used = new Set<string>();
    for (const report of REPORTS.values()) {
      for (const allowance of MOTION_ALLOWLIST) {
        if (report.text.includes(allowance.reason))
          used.add(`${allowance.key} ${allowance.metric}`);
      }
    }
    for (const allowance of MOTION_ALLOWLIST) {
      expect(used.has(`${allowance.key} ${allowance.metric}`), allowance.reason).toBe(true);
    }
  });

  it("matches a figure's own row and every seam it is half of", () => {
    expect(motionAllowance("butter", "swing", "elbowPerHand")).toBeDefined();
    expect(motionAllowance("butter", "circle → swing", "elbowPerHand")).toBeDefined();
    expect(motionAllowance("butter", "circle", "elbowPerHand")).toBeUndefined();
  });
});
