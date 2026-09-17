import { describe, expect, it } from "vitest";
import type { Formation, Group, Station } from "@caller/choreo";
import { createGroup, withDefaults } from "@caller/choreo";
import { dist } from "@caller/core";
import type { ContraFigure, ContraParams } from "../../figures/ContraFigure.js";
import { planContext } from "../../figures/ContraFigure.js";
import { BECKET } from "../../formation/becket.js";
import { DUPLE_IMPROPER } from "../../formation/dupleImproper.js";
import { PROBE_FRAME, figureProblems, probeFigure, probeGroup } from "../../figures/testing.js";
import { interpretDefinition } from "../interpret.js";
import { californiaTwirlDefinition } from "./california-twirl.js";
import { jerseyTwirlDefinition } from "./jersey-twirl.js";

/**
 * **The Jersey twirl is the California twirl from the mirror start.**
 *
 * The user's description (`figure-review.md`, 2026-09-16) names the difference
 * and nothing else: a California twirl joins the lark's right to the robin's
 * left, because the lark is the one standing on the left; a Jersey twirl is
 * *"for the opposite case, when the robin is on the left and the lark on the
 * right — the convenient hands are reversed. robin right lark left."*
 *
 * So the tests below are about two things and no third: **which hands** the two
 * figures take, and **what the mirror start does to the picture**. The second
 * is what stops this being the M9 figure it replaces, which was a California
 * twirl run backwards from the *same* start and therefore had the raiser
 * walking backwards round the outside.
 */

const CALIFORNIA = interpretDefinition(californiaTwirlDefinition) as unknown as ContraFigure<
  ContraParams & Record<string, unknown>
>;
const JERSEY = interpretDefinition(jerseyTwirlDefinition) as unknown as ContraFigure<
  ContraParams & Record<string, unknown>
>;

/**
 * The same minor set with each couple's two dancers standing on each other's
 * places: the robin steps to the lark's left, which is where a roll away or a
 * half promenade leaves her and is the only way this start ever arises.
 *
 * Facings are untouched, so the pair is still side by side facing the same way
 * — the mirror of the stock hands-four and not a different formation.
 */
function mirrorGroup(formation: Formation): Group {
  const stations = formation.group(4);
  const mateOf = (id: string): string => `${id[0]}${id.endsWith("L") ? "R" : "L"}`;
  const swapped: Station[] = stations.map((s) => {
    const other = stations.find((o) => o.id === mateOf(s.id));
    if (!other) throw new Error(`no mate for "${s.id}"`);
    return { ...s, p: other.p };
  });
  const members: Record<string, string> = {};
  for (const s of swapped) members[s.id] = `d/${s.id}`;
  return createGroup(
    { id: "mirror", kind: "set", frame: PROBE_FRAME, stations: swapped, members, couples: [] },
    formation.roleSet,
  );
}

/** Which of a dancer's hands the figure has in somebody else's, at the middle of it. */
function heldHands(fig: ContraFigure<ContraParams & Record<string, unknown>>, group: Group) {
  const params = withDefaults(fig, {}, fig.beats);
  const out: Record<string, string> = {};
  for (const station of group.stations) {
    const pose = fig.sample(group, station.id, 2, params);
    out[station.id] = (["L", "R"] as const).filter((h) => pose.hands[h] !== "down").join("");
  }
  return out;
}

/**
 * How far the raiser travels **forward** over the first quarter beat, along the
 * facing he started with: positive is forward round the outside, which is what
 * a twirl's raiser does, and negative is backing round it, which is what the
 * figure this replaces had him doing.
 */
function setsOffForward(
  fig: ContraFigure<ContraParams & Record<string, unknown>>,
  group: Group,
  station: string,
): number {
  const params = withDefaults(fig, {}, fig.beats);
  const a = fig.sample(group, station, 0, params);
  const b = fig.sample(group, station, 0.25, params);
  const rad = (a.facing * Math.PI) / 180;
  return Math.cos(rad) * (b.p[0] - a.p[0]) + Math.sin(rad) * (b.p[1] - a.p[1]);
}

/** Which side of the lark the robin of the same couple stands on, at the start. */
function robinIsOnTheLarks(group: Group, couple: "1" | "2"): "left" | "right" {
  const ctx = planContext(group.stations, group.roleSet, group.frame.spacing, {});
  const lark = ctx.spot(`${couple}L`);
  const robin = ctx.spot(`${couple}R`);
  const rad = ((lark.facing - 90) * Math.PI) / 180;
  const dot = Math.cos(rad) * (robin.p[0] - lark.p[0]) + Math.sin(rad) * (robin.p[1] - lark.p[1]);
  return dot > 0 ? "left" : "right";
}

describe("the Jersey twirl", () => {
  it("is data: it survives a round trip through JSON", () => {
    expect(JSON.parse(JSON.stringify(jerseyTwirlDefinition))).toEqual(jerseyTwirlDefinition);
  });

  it("is the California twirl's own shape, with two defaults changed and no geometry of its own", () => {
    expect(jerseyTwirlDefinition.shape).toBe(californiaTwirlDefinition.shape);
    expect(jerseyTwirlDefinition.holds).toBe(californiaTwirlDefinition.holds);
    expect(jerseyTwirlDefinition.ends).toBe(californiaTwirlDefinition.ends);
    const california = californiaTwirlDefinition.params;
    const jersey = jerseyTwirlDefinition.params;
    if (california.kind !== "canonical" || jersey.kind !== "canonical") {
      throw new Error("both twirls take canonical parameters");
    }
    const differs = Object.keys(jersey.defaults).filter(
      (name) => jersey.defaults[name] !== california.defaults[name],
    );
    expect(differs.sort()).toEqual(["direction", "hand"]);
    expect(jersey.defaults["hand"]).toBe("left-in-right");
    expect(jersey.defaults["direction"]).toBe(-1);
    // Who raises and who goes under is the California twirl's, unchanged: the
    // user's description names the hands and says nothing about the roles.
    expect(jersey.defaults["raises"]).toBe("lark");
  });

  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`takes the robin's right in the lark's left, in ${formation.id}`, () => {
      for (const group of [probeGroup(formation, 4), mirrorGroup(formation)]) {
        expect(heldHands(JERSEY, group)).toEqual({ "1L": "L", "1R": "R", "2L": "L", "2R": "R" });
        // The California twirl's are the other pair, which is the whole of the
        // difference the user's description names.
        expect(heldHands(CALIFORNIA, group)).toEqual({
          "1L": "R",
          "1R": "L",
          "2L": "R",
          "2R": "L",
        });
      }
    });
  }

  it("trades the pair's two places and turns both of them to face back", () => {
    const group = mirrorGroup(DUPLE_IMPROPER);
    const params = withDefaults(JERSEY, {}, JERSEY.beats);
    const ends = JERSEY.moves(params, group.stations);
    for (const station of group.stations) {
      const mate = `${station.id[0]}${station.id.endsWith("L") ? "R" : "L"}`;
      const theirs = group.stations.find((s) => s.id === mate);
      if (!theirs) throw new Error(`no mate for "${station.id}"`);
      expect(dist(ends[station.id]!.p, theirs.p), station.id).toBeLessThan(1e-9);
      const turned = Math.abs(((ends[station.id]!.facing - station.facing) % 360) + 360) % 360;
      expect(turned, station.id).toBeCloseTo(180, 9);
    }
  });

  /**
   * The mirror start is what the figure is *for*, and the picture proves it: the
   * lark raises and walks **forward** round the outside of the robin, exactly as
   * he does in a California twirl from the California start. The same figure
   * from the stock hands-four — the arrangement a Jersey twirl is not called
   * from — has him backing round it instead, which is the M9 figure's fault the
   * user saw and is now confined to the case that fault belongs to.
   */
  it("sets the raiser off forward from the mirror start, and backwards from the other one", () => {
    for (const formation of [DUPLE_IMPROPER, BECKET]) {
      const mirror = mirrorGroup(formation);
      const stock = probeGroup(formation, 4);
      expect(setsOffForward(JERSEY, mirror, "1L"), formation.id).toBeGreaterThan(0);
      expect(setsOffForward(JERSEY, stock, "1L"), formation.id).toBeLessThan(0);
      // And the California twirl is the same sentence the other way round.
      expect(setsOffForward(CALIFORNIA, stock, "1L"), formation.id).toBeGreaterThan(0);
      expect(setsOffForward(CALIFORNIA, mirror, "1L"), formation.id).toBeLessThan(0);
    }
  });

  it("reaches, ends and keeps its distance from the start it is called from", () => {
    for (const formation of [DUPLE_IMPROPER, BECKET]) {
      expect(
        figureProblems(probeFigure(JERSEY, {}, { group: mirrorGroup(formation) })),
        formation.id,
        // In duple improper both couples of a hands-four twirl at once about
        // centres a place pitch apart, so the two outermost dancers pass at
        // exactly AC6's floor — `california-twirl.ts` measures and states it,
        // and from the mirror start it is this figure's turn to meet it.
      ).toEqual(
        formation === DUPLE_IMPROPER
          ? ['two dancers come 8.000 px apart at {"a":"1L","b":"2L","t":2}']
          : [],
      );
    }
  });

  /**
   * **The precondition, measured rather than asserted by hand.**
   *
   * A Jersey twirl wants the robin on the lark's left. No place in this library
   * puts her there: both stock formations stand her on his right, in both
   * couples, which is the California twirl's own start. That is what makes the
   * figure rare — the user has danced one this year — and it is why the Moves
   * tile, which runs a figure from the formation's own stations, draws this one
   * from the arrangement it is not called from.
   */
  it("wants the robin on the lark's left, which no formation's own places give it", () => {
    for (const formation of [DUPLE_IMPROPER, BECKET]) {
      const stock = probeGroup(formation, 4);
      expect(robinIsOnTheLarks(stock, "1"), formation.id).toBe("right");
      expect(robinIsOnTheLarks(stock, "2"), formation.id).toBe("right");
      const mirror = mirrorGroup(formation);
      expect(robinIsOnTheLarks(mirror, "1"), formation.id).toBe("left");
      expect(robinIsOnTheLarks(mirror, "2"), formation.id).toBe("left");
    }
  });
});
