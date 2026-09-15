import { HOLD_SPACING_PX, angleDiff } from "@caller/core";
import { withDefaults } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER } from "../../formation/dupleImproper.js";
import { handDown } from "../../pair/PairFrame.js";
import type { PlanContext, Spots } from "../ContraFigure.js";
import { planContext } from "../ContraFigure.js";
import { createContraRegistry } from "../registry.js";
import { ringFor, ringShift } from "../ring.js";
import type { FigureSpec, NumberExpr, PointExpr, Segment, SpecParams } from "./index.js";
import { compileFigureSpec, trackFor } from "./index.js";

const ctx: PlanContext = planContext(
  DUPLE_IMPROPER.group(4),
  DUPLE_IMPROPER.roleSet,
  HOLD_SPACING_PX,
  {},
);

/** Where a ring walk of `places` leaves a dancer, as the language writes it. */
const endPoint = (places: NumberExpr): PointExpr => ({
  point: "start",
  station: { station: "ringShift", places },
});

/** A ring walk of `places` places, facing the middle. */
const ringWalkOf = (places: NumberExpr): Segment => ({
  kind: "ringWalk",
  places,
  faceOffset: 180,
  inBeats: 1.5,
  outBeats: 1.5,
  end: {
    p: endPoint(places),
    facing: { angle: "bearing", from: endPoint(places), to: { point: "ringCentre" } },
  },
});

/** A figure that stands on the ring and holds nothing: the smallest thing that compiles. */
const standStill = (over: Partial<FigureSpec> = {}): FigureSpec => ({
  id: "test-figure",
  call: "TEST",
  lead: 4,
  beats: 8,
  defaults: { places: 0 },
  tracks: { all: [ringWalkOf({ param: "places" })] },
  hands: { all: { L: { hand: "down" }, R: { hand: "down" } } },
  ...over,
});

const planOf = (spec: FigureSpec, params: object = {}) => {
  const def = compileFigureSpec(spec);
  const resolved: SpecParams = withDefaults(def, params, spec.beats);
  return { def, resolved, plan: def.plan(ctx, resolved) };
};

describe("compileFigureSpec", () => {
  it("gives the engine's contract back, with the figure's own call and timing", () => {
    const def = compileFigureSpec(standStill());
    expect(def.id).toBe("test-figure");
    expect(def.call).toBe("TEST");
    expect(def.lead).toBe(4);
    expect(def.beats).toBe(8);
  });

  it("fills in the empty `from` and `carried` every contra figure's defaults carry", () => {
    expect(compileFigureSpec(standStill()).defaults).toEqual({
      places: 0,
      from: {},
      carried: { in: {}, out: {} },
    });
  });

  it("slots into `createContraRegistry`'s extra array with no adapter", () => {
    const def = compileFigureSpec(standStill());
    const registry = createContraRegistry([def]);
    expect(registry.has("test-figure")).toBe(true);
    expect(registry.get("test-figure")).toBe(def);
    // And the coded library is untouched.
    expect(registry.has("circle")).toBe(true);
  });
});

describe("the ringWalk segment", () => {
  it("leaves a dancer where they started when it turns no places", () => {
    const { plan } = planOf(standStill());
    for (const id of ctx.ids) expect(plan.ends[id]!.p).toEqual(ctx.spot(id).p);
  });

  it("leaves a dancer in the place of whoever stood `places` round the ring", () => {
    const ring = ringFor(ctx);
    const { plan } = planOf(standStill(), { places: 1 });
    for (const id of ctx.ids) {
      expect(plan.ends[id]!.p, id).toEqual(ctx.spot(ringShift(ring, id, 1)).p);
    }
  });

  it("starts where it was told to and ends where it says, to the seam's own precision", () => {
    // `ringWalk` goes round the ring in polar coordinates, so both ends come
    // back through a `polar` call: the seam closes to a part in 1e15, which is
    // the coded figures' own answer and well inside AC5's 0.01 px.
    const { plan } = planOf(standStill(), { places: 3 });
    for (const id of ctx.ids) {
      for (const axis of [0, 1]) {
        expect(plan.at(id, 0).p[axis], `${id} start`).toBeCloseTo(ctx.spot(id).p[axis]!, 9);
        expect(plan.at(id, 8).p[axis], `${id} end`).toBeCloseTo(plan.ends[id]!.p[axis]!, 9);
      }
      // A facing is an angle: equal means equal on the floor, not equal modulo nothing.
      expect(angleDiff(plan.ends[id]!.facing, plan.at(id, 8).facing), id).toBeCloseTo(0, 9);
    }
  });

  it("puts everybody on a regular ring in the middle of the figure", () => {
    const ring = ringFor(ctx);
    const { plan } = planOf(standStill(), { places: 2 });
    for (const id of ctx.ids) {
      const mid = plan.at(id, 4);
      const r = Math.hypot(mid.p[0] - ring.centre[0], mid.p[1] - ring.centre[1]);
      expect(r, id).toBeCloseTo(ring.radius, 9);
    }
  });
});

describe("tracks and hands are keyed by station, then role, then everybody", () => {
  it("picks the most particular key there is", () => {
    const keyed = { "1L": 1, lark: 2, all: 3 };
    expect(trackFor(keyed, ctx, "1L")).toBe("1L");
    expect(trackFor(keyed, ctx, "2L")).toBe("lark");
    expect(trackFor(keyed, ctx, "1R")).toBe("all");
    expect(trackFor({ all: 3 }, ctx, "1L")).toBe("all");
  });

  it("gives the larks one track and everybody else another", () => {
    const ring = ringFor(ctx);
    const { plan } = planOf(
      standStill({ tracks: { lark: [ringWalkOf(1)], all: [ringWalkOf(0)] } }),
    );
    for (const id of ctx.ids) {
      const moved = ctx.role(id) === "lark" ? 1 : 0;
      expect(plan.ends[id]!.p, id).toEqual(ctx.spot(ringShift(ring, id, moved)).p);
    }
  });

  it("says which station it could not place", () => {
    expect(() => planOf(standStill({ tracks: { robin: [ringWalkOf(0)] } }))).toThrow(
      /no track for station "1L" \(role "lark"\)/,
    );
  });
});

describe("hands", () => {
  it("leaves a `down` hand hanging at the dancer's side, and joins nothing", () => {
    const { plan } = planOf(standStill());
    const t = 2.5;
    const self = plan.at("1L", t);
    expect(self.hands.L).toEqual(handDown(self.p, self.facing, "L", t, 0));
    expect(self.hands.R).toEqual(handDown(self.p, self.facing, "R", t, 0));
    expect(plan.joinsAt(t)).toEqual([]);
  });

  it("swings a `down` hand with the step when the spec asks it to", () => {
    const swung = standStill({
      hands: { all: { L: { hand: "down", swing: 1 }, R: { hand: "down" } } },
    });
    const { plan } = planOf(swung);
    // Not a half-integer beat: the swing term is `sin(2π·t)`, which is
    // genuinely (not just numerically) zero at t = 2.5, so "swung differs from
    // unswung" cannot be asserted there — F11 grew the ring's own radius
    // enough that the swing's ~1e-15 floating-point residue at t = 2.5 no
    // longer survives rounding into a detectably different `p`, which is what
    // exposed this. t = 2.25 sits at the swing's own peak instead.
    const self = plan.at("1L", 2.25);
    expect(self.hands.L).toEqual(handDown(self.p, self.facing, "L", 2.25, 1));
    expect(self.hands.L).not.toEqual(handDown(self.p, self.facing, "L", 2.25, 0));
  });

  it("refuses a `carried` hand until the hold is threaded between calls (M3)", () => {
    const carried = standStill({
      hands: { all: { L: { hand: "carried" }, R: { hand: "down" } } },
    });
    expect(() => planOf(carried).plan.at("1L", 1)).toThrow(/which is M3's/);
  });

  it("refuses a join that is not this dancer's hand", () => {
    const wrong = standStill({
      hands: {
        all: {
          L: {
            hand: "joined",
            a: { station: "2L", side: "L" },
            b: { station: "2R", side: "R" },
            point: { point: "ringCentre" },
            drop: 6,
            window: { take: 1, release: 1 },
          },
          R: { hand: "down" },
        },
      },
    });
    expect(() => planOf(wrong).plan.at("1L", 1)).toThrow(/which is not this hand/);
  });
});

describe("what M1 does not compile yet", () => {
  it("says plainly that a track of more than one segment is M2's", () => {
    const two = standStill({ tracks: { all: [ringWalkOf(0), ringWalkOf(0)] } });
    expect(() => planOf(two)).toThrow(/M1 compiles exactly one/);
  });
});

describe("a compiled figure's plan is a plain FigurePlan", () => {
  it("answers `at`, `ends` and `joinsAt` for every station", () => {
    const { plan } = planOf(standStill());
    const ends: Spots = plan.ends;
    expect(Object.keys(ends).sort()).toEqual([...ctx.ids].sort());
    expect(typeof plan.at).toBe("function");
    expect(plan.joinsAt(0)).toEqual([]);
  });
});
