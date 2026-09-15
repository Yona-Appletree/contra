import type { Beat, Vec2 } from "@caller/core";
import { angleDiff, dist } from "@caller/core";
import type { Formation, Group, StationId } from "@caller/choreo";
import { frame, withDefaults } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../../formation/becket.js";
import { DUPLE_IMPROPER } from "../../formation/dupleImproper.js";
import type { ContraFigure, ContraParams, PlanContext } from "../../figures/ContraFigure.js";
import { planContext } from "../../figures/ContraFigure.js";
import { figureMoves, figureProblems, probeFigure, probeGroup } from "../../figures/testing.js";
import type { ScheduleShape } from "../FigureDefinition.js";
import { anchorOf, interpretDefinition } from "../interpret.js";
import type { ShapeInput } from "../interpret.js";
import type { PlannedSchedule } from "../kinds/schedule.js";
import { passesOfSchedule, scheduleOf } from "../kinds/schedule.js";
import { parsePassList, printPassList } from "../passList.js";
import { heyDefinition } from "./hey.js";
import { HEY_WEAVE_GOLDEN } from "./heyWeaveGolden.js";

/**
 * **The hey**, as a schedule: held to today's weave, to its own pass list, and
 * to the things only a schedule can say.
 *
 * The gate the milestone names is `compareFigures` against the coded weave, and
 * it ran: **0.0000 px and 0.0000° over 9 312 pose comparisons**, in 24 cases
 * across both formations, from the stations and from a deterministic wobble off
 * them — the full hey, the half hey, the mirrored hey, and each of them once
 * more with its pass list written out instead of its parameters. Not "inside the
 * tolerance": exactly zero, because the schedule's own curve *is* the coded
 * weave's, promoted from a figure to a shape kind.
 *
 * `figures/hey.ts` is deleted, so that comparison cannot be re-run from this
 * tree. What replaces it is {@link HEY_WEAVE_GOLDEN}, which the coded figure
 * wrote out before it went: every dancer at every half beat, three heys, both
 * formations. The first test below is the migration's gate, permanently.
 */

/** The tolerance this milestone states, and DD21's own: 0.01 px, 0.1°. */
const TOLERANCE_PX = 0.01;
const TOLERANCE_DEG = 0.1;

/** A call's own parameters, whatever they are: the probes take a partial. */
interface HeyParams extends ContraParams {
  [key: string]: unknown;
}

/** The hey, as the engine samples it. */
const HEY = interpretDefinition(heyDefinition) as unknown as ContraFigure<HeyParams>;

/** The parameters each frozen case was written with, in the new vocabulary. */
const GOLDEN_CASES: Readonly<Record<string, { params: Record<string, unknown>; beats: Beat }>> = {
  full: { params: {}, beats: 16 },
  half: { params: { amount: 0.5 }, beats: 8 },
  larks: { params: { start: "lark", by: "left" }, beats: 16 },
};

describe("the hey reproduces today's weave", () => {
  it("is the coded figure's own numbers, at every half beat, in both formations", () => {
    let worstPx = 0;
    let worstDeg = 0;
    let samples = 0;
    for (const row of HEY_WEAVE_GOLDEN) {
      const formation = row.formation === BECKET.id ? BECKET : DUPLE_IMPROPER;
      const group = probeGroup(formation, 4, frame([0, 0], 90));
      const test = GOLDEN_CASES[row.hey]!;
      const params = withDefaults(HEY, test.params, test.beats);
      row.poses.forEach((want, i) => {
        const got = HEY.sample(group, row.role, i * 0.5, params);
        worstPx = Math.max(worstPx, dist([want[0]!, want[1]!], got.p));
        worstDeg = Math.max(worstDeg, Math.abs(angleDiff(want[2]!, got.facing)));
        samples++;
      });
    }
    // The size of the claim, so a reader does not have to count the table.
    expect(samples).toBe(664);
    expect(worstPx).toBeLessThan(TOLERANCE_PX);
    expect(worstDeg).toBeLessThan(TOLERANCE_DEG);
    // And what it actually came out at: the frozen table is written to four
    // decimals, so this is the rounding and nothing else.
    expect(worstPx).toBeLessThan(1e-4);
    expect(worstDeg).toBeLessThan(1e-4);
  });

  it("comes home after a whole hey, and changes sides after half of one", () => {
    const home = figureMoves(HEY, {});
    for (const id of ["1L", "1R", "2L", "2R"]) {
      const station = DUPLE_IMPROPER.group(4).find((s) => s.id === id)!;
      expect(dist(home[id]!.p, station.p), id).toBeLessThan(1e-9);
    }
    // Half a hey: each dancer takes the place of the one who started opposite
    // them on the weave, which in a duple improper minor set is their own role's
    // other dancer.
    const half = figureMoves(HEY, { amount: 0.5, beats: 8 });
    const place = (id: string): Vec2 => DUPLE_IMPROPER.group(4).find((s) => s.id === id)!.p;
    expect(dist(half["1R"]!.p, place("2R"))).toBeLessThan(1e-9);
    expect(dist(half["2R"]!.p, place("1R"))).toBeLessThan(1e-9);
    expect(dist(half["1L"]!.p, place("2L"))).toBeLessThan(1e-9);
    expect(dist(half["2L"]!.p, place("1L"))).toBeLessThan(1e-9);
  });

  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      expect(figureProblems(probeFigure(HEY, {}, { group }))).toEqual([]);
      expect(figureProblems(probeFigure(HEY, { amount: 0.5, beats: 8 }, { group }))).toEqual([]);
      expect(figureProblems(probeFigure(HEY, { start: "lark", by: "left" }, { group }))).toEqual(
        [],
      );
      expect(
        figureProblems(probeFigure(HEY, { passes: "RR NL LR PL RR NL L! NL~" }, { group })),
      ).toEqual([]);
    });
  }
});

/** One planned schedule, off a real instance of the figure. */
function plannedFor(
  formation: Formation,
  params: Record<string, unknown> = {},
  beats: Beat = 16,
  /** Where the four are standing, for a case that is not the stations (M8). */
  from: Record<string, { p: [number, number]; facing: number }> = {},
): { ctx: PlanContext; group: Group; plan: PlannedSchedule } {
  const group = probeGroup(formation, 4, frame([0, 0], 90));
  const ctx = planContext(group.stations, group.roleSet, group.frame.spacing, from);
  const all = {
    ...(heyDefinition.params.kind === "canonical" ? heyDefinition.params.defaults : {}),
    ...params,
    beats,
    homes: [],
    nearby: [],
    from,
  };
  const input: ShapeInput = {
    ctx,
    params: all as ShapeInput["params"],
    beats,
    roles: ctx.ids,
    anchor: anchorOf("hands-four", ctx, ctx.ids),
    anchorOf: (inner) => anchorOf("hands-four", inner, ctx.ids),
    nearby: [],
    gathers: false,
    joinedIn: new Set(),
    joinedOut: new Set(),
  };
  return { ctx, group, plan: scheduleOf(heyDefinition.shape as ScheduleShape, input) };
}

describe("the schedule: meetings, laid along the lane", () => {
  it("puts a full hey's seven meetings on counts 2 to 14, exactly", () => {
    const { ctx, plan } = plannedFor(BECKET);
    expect(plan.items[ctx.ids[0]!]!.map((item) => item.at)).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(plan.legs).toBe(8);
    expect(plan.amount).toBe(1);
  });

  it("puts a half hey's three on counts 2, 4 and 6 of eight", () => {
    const { ctx, plan } = plannedFor(DUPLE_IMPROPER, { amount: 0.5 }, 8);
    expect(plan.items[ctx.ids[0]!]!.map((item) => item.at)).toEqual([2, 4, 6]);
    expect(plan.legs).toBe(4);
  });

  it("lays the centre passes on the set's axis and the side passes at the lanes' edges", () => {
    const { ctx, plan } = plannedFor(BECKET);
    const passPx = 6.5;
    for (const role of ctx.ids) {
      plan.items[role]!.forEach((item, i) => {
        const here = plan.meetingPoint(role, i);
        // The lane runs along the frame's `x` in both contra formations: the
        // axis between the two lines. `y` is the dancer's own side-step.
        const along = Math.abs(here[0]! - plan.lane.centre[0]);
        if (item.mode === "loop") {
          // Beyond the end of the lane, which is where a dancer loops.
          expect(along, `${role} loop ${String(item.at)}`).toBeGreaterThan(plan.lane.half);
          expect(along).toBeCloseTo(plan.lane.reach, 6);
          return;
        }
        const other = plan.meets[role]![i]!;
        const gap = dist(here, plan.meetingPoint(other, i));
        if (item.meet === "robins" || item.meet === "larks") {
          // In the middle of the set, two side-steps apart.
          expect(along, `${role} centre ${String(item.at)}`).toBeLessThan(1e-9);
          expect(gap).toBeCloseTo(2 * passPx, 6);
        } else {
          // At the lane's edge, where the line stands.
          expect(along, `${role} side ${String(item.at)}`).toBeCloseTo(plan.lane.half, 6);
          expect(gap).toBeCloseTo(Math.SQRT2 * passPx, 6);
        }
      });
    }
  });

  it("finds its meetings unambiguously: nobody else is anywhere near", () => {
    // What `MET_WITHIN` rests on, measured rather than assumed. The dancers in a
    // meeting are at most 13 px apart and the nearest dancer who is *not* in it
    // is more than 22 px away, in either formation.
    for (const formation of [DUPLE_IMPROPER, BECKET]) {
      const { ctx, plan } = plannedFor(formation);
      for (const role of ctx.ids) {
        plan.items[role]!.forEach((item, i) => {
          const here = plan.meetingPoint(role, i);
          const met = plan.meets[role]![i];
          for (const other of ctx.ids) {
            if (other === role) continue;
            const gap = dist(here, plan.meetingPoint(other, i));
            if (other === met) expect(gap, `${role}/${other}`).toBeLessThan(14);
            else expect(gap, `${role}/${other} at ${String(item.at)}`).toBeGreaterThan(22);
          }
        });
      }
    }
  });
});

describe("the pass list, against the dancers themselves", () => {
  it("writes Butter's own hey out of a becket set, verbatim", () => {
    // `#10320 B1: (16) Hey (WR;NL;MR;PL;WR;NL;MR)`, in this repository's
    // spelling — derived from where the four dancers stand and which way they
    // go, with nothing about it written into the figure.
    const { plan } = plannedFor(BECKET);
    expect(printPassList(plan.derived)).toBe("RR NL LR PL RR NL LR");
  });

  it("writes a duple improper hey's side passes as partners, which is what they are", () => {
    // The **same figure**, in the other formation, comes out differently and is
    // not a special case anywhere: in becket a couple stands side by side on one
    // line, so the dancer you meet at the lane's edge is your neighbour; in
    // duple improper a couple stands across the set, so it is your partner.
    const { plan } = plannedFor(DUPLE_IMPROPER);
    expect(printPassList(plan.derived)).toBe("RR PL LR NL RR PL LR");
  });

  it("round-trips every line of the fixture: parse, expand, print it back", () => {
    for (const line of ROUND_TRIP) {
      const { ctx, plan } = plannedFor(BECKET, { passes: line }, 16);
      expect(printPassList(passesOfSchedule(plan.items, ctx, ctx.ids)), line).toBe(line);
    }
    expect(ROUND_TRIP).toHaveLength(20);
  });

  it("takes the Caller's Box's own spelling and normalises it", () => {
    const { ctx, plan } = plannedFor(DUPLE_IMPROPER, { passes: "WR;NL;MR;PL;WR;NL;MR" }, 16);
    expect(printPassList(passesOfSchedule(plan.items, ctx, ctx.ids))).toBe("RR NL LR PL RR NL LR");
  });

  it("reads who steps off and by which shoulder out of the list's first token", () => {
    // The parameters say the robins by the right; the list says the larks by the
    // left, and the list wins, which is what makes writing one enough.
    const { plan } = plannedFor(BECKET, { passes: "LL PR RL NR LL PR RL" });
    expect(printPassList(plan.derived)).toBe("LL NR RL PR LL NR RL");
  });
});

/**
 * Twenty hey lines, in this repository's own notation.
 *
 * The same fixture `passList.test.ts` round-trips through the *notation*; here
 * it goes through the whole expansion — parsed, laid on the weave, expanded into
 * four per-role schedules, and written back out of them. Five are quoted from
 * the Caller's Box (Butter, On the Prowl, Are You 'Most Done?, and Anna's Reel
 * twice) and fifteen are written for the variants `notes.md`'s Family 4 counts
 * enumerate; `passList.test.ts` says which is which.
 */
const ROUND_TRIP: readonly string[] = [
  "RR NL LR PL RR NL LR",
  "RR NL LR PL RR NL L! NL~",
  "LR N2L RR PL LR N2L RR PL",
  "RL PR LL N2R",
  "LR PL RR N3L",
  "LR PL RR NL LR PL RR",
  "RL PR LL NR RL PR LL",
  "RR NL LR",
  "LR PL RR",
  "RR NL LR PL RR",
  "RR",
  "RR NL LR~",
  "RR NL LR PL RR NL LR PL~",
  "R! NL LR PL RR NL LR",
  "RR NL LR PL RR NL L!",
  "RR SL LR SL RR SL LR",
  "RR OL LR OL RR OL LR",
  "LR N2L RR PL LR N2L RR",
  "RR N3L LR PL RR N3L LR",
  "RR NL LR PL RR NL LR PL",
];

describe("the ricochet", () => {
  const PROWL = "RR NL LR PL RR NL L! NL~";

  it("bounces the larks out of the middle on count 14 and nobody collides", () => {
    for (const formation of [DUPLE_IMPROPER, BECKET]) {
      const { ctx, plan } = plannedFor(formation, { passes: PROWL });
      const larks = ctx.ids.filter((id) => ctx.role(id) === "lark");
      for (const lark of larks) {
        expect(plan.items[lark]![6]!.mode, lark).toBe("bounce");
        expect(plan.items[lark]![6]!.at).toBe(14);
      }
      // The robins are round the ends when it happens and are not in it.
      for (const robin of ctx.ids.filter((id) => ctx.role(id) === "robin")) {
        expect(plan.items[robin]![6]!.mode, robin).toBe("loop");
      }
      // AC6, over the whole figure at every sixteenth of a beat: the bounce is
      // a sweep across the middle, not two dancers meeting at one point.
      let closest = Infinity;
      for (let t = 0; t <= 16; t += 1 / 16) {
        const spots = ctx.ids.map((role) => plan.spotAt(role, t));
        for (let i = 0; i < spots.length; i++) {
          for (let j = i + 1; j < spots.length; j++) {
            closest = Math.min(closest, dist(spots[i]!.p, spots[j]!.p));
          }
        }
      }
      expect(closest, formation.id).toBeGreaterThan(8);
    }
  });

  it("brings them back to the lane's edge on the other side, which is what makes it a pass", () => {
    const { ctx, plan } = plannedFor(DUPLE_IMPROPER, { passes: PROWL });
    for (const role of ctx.ids) {
      const at = plan.meetingPoint(role, 7);
      expect(Math.abs(at[0]! - plan.lane.centre[0]), role).toBeCloseTo(plan.lane.half, 6);
      const other = plan.meets[role]![7]!;
      expect(dist(at, plan.meetingPoint(other, 7))).toBeCloseTo(Math.SQRT2 * 6.5, 4);
    }
  });

  it("takes the caller's own shorthand too, and it changes what comes after", () => {
    // `robins@1` in a becket set: the robins bounce out of the *first* centre
    // pass and go back the way they came, so the dancer each of them meets at
    // the lane's edge on count 4 is no longer the one they would have met. The
    // plain hey's second pass is `NL`; here it is `PL`, because a robin who
    // bounced is back at her own line, where her partner is standing.
    const { plan } = plannedFor(BECKET, { ricochet: "robins@1" });
    expect(printPassList(plan.derived)).toBe("R! PL LR NL RR PL LR");
    expect(plan.items["1R"]![0]!.mode).toBe("bounce");
    expect(plan.items["1L"]![0]!.mode).toBe("loop");
    expect(() => plannedFor(BECKET, { ricochet: "everyone@1" })).toThrow(/written "robins@2"/);
  });
});

describe("honest ends", () => {
  it("ends short beside the dancer you met, facing them", () => {
    const { ctx, plan } = plannedFor(DUPLE_IMPROPER, { passes: "RR NL LR PL RR NL L! NL~" });
    for (const role of ctx.ids) {
      const end = plan.ends[role]!;
      const met = plan.meets[role]![7]!;
      const theirs = plan.ends[met]!.p;
      // Beside them: within one pass of each other, and further from anybody
      // else. Facing them: the end facing is the bearing between the two.
      expect(dist(end.p, theirs), role).toBeLessThan(14);
      const want = Math.atan2(theirs[1]! - end.p[1]!, theirs[0]! - end.p[0]!) * (180 / Math.PI);
      expect(Math.abs(angleDiff(want, end.facing)), role).toBeLessThan(1e-9);
    }
  });

  it("leaves a hey that finishes on somebody's place, by phase and not by distance", () => {
    // The weave's own quarter point is 5.4 px from the place *beside* the one it
    // belongs to and 14.6 px from that one, so nearest-place would land three
    // quarters of the set in the wrong seat. This is that trap, asserted.
    const { plan } = plannedFor(DUPLE_IMPROPER);
    const place = (id: StationId): Vec2 => DUPLE_IMPROPER.group(4).find((s) => s.id === id)!.p;
    for (const role of ["1L", "1R", "2L", "2R"] as const) {
      expect(dist(plan.ends[role]!.p, place(role)), role).toBeLessThan(1e-9);
    }
  });
});

describe("a hey for three", () => {
  it("idles the named role on the schedule, and everybody else keeps their meetings", () => {
    const { ctx, plan } = plannedFor(DUPLE_IMPROPER, { for: 3, idle: "2L" });
    expect([...plan.standing]).toEqual(["2L"]);
    for (const item of plan.items["2L"]!) expect(item.mode).toBe("stand");
    // The idle dancer does not move.
    for (let t = 0; t <= 16; t += 1) {
      expect(dist(plan.spotAt("2L", t).p, ctx.spot("2L").p)).toBeLessThan(1e-9);
    }
    // With nobody named, the last of the cast stands out, which is the only
    // answer a figure can give on its own.
    expect([...plannedFor(DUPLE_IMPROPER, { for: 3 }).plan.standing]).toEqual(["2R"]);
  });

  it("refuses to draw one, and says what it would take, with the number", () => {
    // **A hey for three is not the four's weave with a gap in it.** The weave
    // runs through the places, so a dancer standing on their own place is walked
    // past at 4.448 px in duple improper (`2L`/`2R` at beat 7.625) and 4.448 px
    // in becket (`1R`/`2L` at 4.375), against AC6's 8. It would take a track of
    // its own — three dancers a third of a turn apart on `v = V·sin 2φ` — and
    // where the three places sit on that track is not something any dance in the
    // acceptance set settles, so the figure refuses instead of guessing.
    expect(() => probeFigure(HEY, { for: 3, idle: "2L" })).toThrow(
      /a hey for three, whose three dancers need a weave of their own/,
    );
  });
});

describe("the parameters the brief names", () => {
  it("takes an amount from an eighth to the whole weave", () => {
    for (const [amount, legs] of [
      [1 / 8, 1],
      [0.25, 2],
      [0.5, 4],
      [0.75, 6],
      [1, 8],
    ] as const) {
      const { plan } = plannedFor(DUPLE_IMPROPER, { amount }, 16 * amount);
      expect(plan.legs, String(amount)).toBe(legs);
    }
  });

  it("takes the lane's axis outright, and reads a diagonal off the dancers", () => {
    expect(plannedFor(DUPLE_IMPROPER, { axis: "across" }).plan.lane.axis).toBe(0);
    expect(plannedFor(DUPLE_IMPROPER, { axis: "along" }).plan.lane.axis).toBe(90);
    // **The diagonal** (M8, Q12): the lane runs along the direction the four
    // dancers are really most strung out on, without the snap to one of the
    // frame's own two axes that `"spread"` makes. On a minor set standing square
    // it is still one of them, which is the check that the principal axis is the
    // same reading and not a different one: a becket minor set is 32 px across
    // and 20 along, so its own principal axis is "across".
    expect(plannedFor(BECKET, { axis: "diagonal" }).plan.lane.axis).toBeCloseTo(0, 9);
    expect(plannedFor(DUPLE_IMPROPER, { axis: "diagonal" }).plan.lane.axis).toBeCloseTo(0, 9);
    expect(() => plannedFor(BECKET, { axis: "sideways" })).toThrow(/not one of \[spread/);
  });

  it("puts a diagonal lane at the angle four dancers on a diagonal really make", () => {
    // Four dancers in two pairs on a diagonal — Are You 'Most Done?'s right
    // diagonal, which in becket is a couple and the couple across the seam from
    // it. The lane has to come out at the angle between the two pairs rather
    // than at either of the frame's axes, which is the whole of Q12's ruling.
    const { plan } = plannedFor(BECKET, { axis: "diagonal" }, 16, {
      "1L": { p: [-16, -10], facing: 0 },
      "1R": { p: [-16, 10], facing: 0 },
      "2L": { p: [16, 30], facing: 180 },
      "2R": { p: [16, 10], facing: 180 },
    });
    // The two pairs' centres are (−16, 0) and (16, 20), so the lane runs at
    // atan2(20, 32) ≈ 32.0°.
    expect(plan.lane.axis).toBeCloseTo((Math.atan2(20, 32) * 180) / Math.PI, 6);
    // **And it is as long as the two lines are apart** (M9e), not as long as
    // the furthest dancer: the lanes' edges are where the *lines* stand, and a
    // line's place is the middle of the two dancers on it. Here that is
    // √(32² + 20²) / 2 = 18.868 px; measured out to the furthest of the four it
    // came to 22.94, so both edges overshot the couple standing on them by four
    // pixels — which on Are You 'Most Done?'s own eight-couple geometry is nine.
    expect(plan.lane.half).toBeCloseTo(Math.hypot(32, 20) / 2, 9);
  });

  it("keeps the diagonal lane's half-width the plain one when the four stand square", () => {
    // The check that the M9e reading is the same reading and not a different
    // one: on a becket minor set the two dancers of a line share the coordinate
    // the lane is measured on, so "out to the furthest dancer" and "half way
    // between the two lines" are the same 16 px.
    expect(plannedFor(BECKET, { axis: "diagonal" }).plan.lane.half).toBeCloseTo(
      plannedFor(BECKET, { axis: "across" }).plan.lane.half,
      9,
    );
  });

  it("makes every meeting a pull by when the call asks for hands", () => {
    const group = probeGroup(DUPLE_IMPROPER);
    const params = withDefaults(HEY, { hands: true }, 16);
    const joined = HEY.joins(params, 2, DUPLE_IMPROPER.group(4));
    expect(joined).toHaveLength(1);
    expect(joined[0]!.aSide).toBe("R");
    // And the hands a 15 px arm cannot reach are the thing AC1 is about.
    expect(figureProblems(probeFigure(HEY, { hands: true }, { group }))).toEqual([]);
  });

  it("refuses a parameter that is not one of the words it knows", () => {
    expect(() => plannedFor(BECKET, { start: "dancers" })).toThrow(/not one of \[robin, lark\]/);
    expect(() => plannedFor(BECKET, { passes: "RR ZZ" })).toThrow(/starts with "Z"/);
  });
});

describe("the definition itself", () => {
  it("is plain data and survives a JSON round trip", () => {
    expect(JSON.parse(JSON.stringify(heyDefinition))).toEqual(heyDefinition);
  });

  it("declares no hold: a hey's hands are its passes", () => {
    expect(heyDefinition.holds).toEqual([]);
    expect(parsePassList("RR")).toHaveLength(1);
  });
});
