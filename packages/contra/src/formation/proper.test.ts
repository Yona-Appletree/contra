import { dist } from "@caller/core";
import type { CoupleState, SetState } from "@caller/choreo";
import { HANDS_FOUR_GROUP, createHall, framePoint, stationPose } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { progressModel, setFromModel } from "../set/lattice.js";
import { parseRelation, relate } from "../set/relations.js";
import { modelFromSet } from "../set/SetModel.js";
import { setRulesFor } from "../set/SetRules.js";
import { PROPER, PROPER_LATTICE, PROPER_STATIONS } from "./proper.js";

/**
 * **Proper**, the third contra formation: larks in one line, robins in the
 * other, all the way through.
 *
 * Three claims are worth a test and the rest is duple improper's, which has its
 * own: that the **lattice** puts a lark on the larks' line whichever way they
 * travel (and can still answer `placeOf`, which is why that gained a `travel`
 * argument); that a **neighbour is diagonal** here and its own inverse anyway;
 * and that a **waiting couple does not cross**, which is the end effect proper
 * does differently from every other formation in the repository.
 */

const hall = (couples: number): SetState =>
  createHall(PROPER, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]).sets[0]!;

/** A set's seating as one comparable string: who is a couple, where, facing which way. */
const seatingOf = (set: SetState): string =>
  [...set.couples]
    .sort((a, b) => a.place - b.place)
    .map(
      (c) =>
        `${String(c.place)}/${String(c.direction)}:` +
        Object.entries(c.dancers)
          .sort()
          .map(([role, id]) => `${role}=${id}`)
          .join(","),
    )
    .join(" ");

describe("the lattice: a dancer's line is their role", () => {
  it("puts every lark on line 0 and every robin on line 1, both directions", () => {
    for (const direction of [1, -1] as const) {
      for (const place of [0, 1, 2, 7]) {
        const couple: CoupleState = { id: "c", dancers: {}, place, direction };
        expect(PROPER_LATTICE.slotOf(couple, "lark")).toEqual({ line: 0, position: place });
        expect(PROPER_LATTICE.slotOf(couple, "robin")).toEqual({ line: 1, position: place });
      }
    }
  });

  it("round-trips through `placeOf`, which needs the travel it threw away", () => {
    for (const direction of [1, -1] as const) {
      for (const place of [0, 3, 5]) {
        for (const role of ["lark", "robin"] as const) {
          const couple: CoupleState = { id: "c", dancers: {}, place, direction };
          const slot = PROPER_LATTICE.slotOf(couple, role);
          expect(PROPER_LATTICE.placeOf(slot, role, direction)).toEqual({ place, direction });
        }
      }
    }
  });

  it("`homeAt` reproduces the formation's own stations exactly", () => {
    const set = hall(4);
    for (const plan of PROPER.groupsFor(HANDS_FOUR_GROUP, set)) {
      if (plan.kind !== "set") continue;
      for (const station of plan.stations) {
        const dancer = plan.members[station.id]!;
        const couple = set.couples.find((c) => Object.values(c.dancers).includes(dancer))!;
        const slot = PROPER_LATTICE.slotOf(couple, station.role);
        const home = PROPER_LATTICE.homeAt(slot, couple.direction);
        // The lattice speaks the *set's* frame; a station speaks its group's.
        expect(
          dist(framePoint(set.frame, home.p), stationPose(plan.frame, station).p),
        ).toBeLessThan(1e-9);
        expect(home.facing).toBe(stationPose(plan.frame, station).facing);
      }
    }
  });

  it("stands the larks on the −x line, which is a dancer's left facing up the hall", () => {
    for (const station of PROPER_STATIONS) {
      expect(station.p[0] < 0, station.id).toBe(station.role === "lark");
    }
  });
});

describe("the progression, on the slots and on the hall", () => {
  it("the slot shift is the formation's own progression, at every line length", () => {
    for (const couples of [2, 3, 4, 5, 6]) {
      let set = hall(couples);
      for (let round = 0; round < 8; round++) {
        const model = modelFromSet(PROPER, set, new Map());
        const bySlots = setFromModel(progressModel(model), set);
        const byFormation = PROPER.progression.next(set);
        expect(seatingOf(bySlots), `${String(couples)} couples, round ${String(round)}`).toBe(
          seatingOf(byFormation),
        );
        set = byFormation;
      }
    }
  });

  it("keeps every lark a lark on the larks' line for ever", () => {
    let set = hall(5);
    for (let round = 0; round < 10; round++) {
      const model = modelFromSet(PROPER, set, new Map());
      for (const dancer of Object.values(model.dancers)) {
        expect(dancer.slot.line, `${dancer.id} at round ${String(round)}`).toBe(
          dancer.role === "lark" ? 0 : 1,
        );
      }
      set = PROPER.progression.next(set);
    }
  });
});

describe("a waiting couple stays on its own side", () => {
  it("never reverses the wait group's frame, so the lark waits in the larks' line", () => {
    // Five couples: one couple waits, at the bottom on the first time through
    // and at the top on the next.
    let set = hall(5);
    for (let round = 0; round < 4; round++) {
      const waits = PROPER.groupsFor(HANDS_FOUR_GROUP, set).filter((p) => p.kind !== "set");
      expect(waits.length, `round ${String(round)}`).toBe(1);
      const plan = waits[0]!;
      for (const station of plan.stations) {
        const world = stationPose(plan.frame, station);
        expect(world.p[0] < 0, `${station.id} at round ${String(round)}`).toBe(
          station.role === "lark",
        );
      }
      set = PROPER.progression.next(set);
    }
  });
});

describe("the relation table", () => {
  const set = hall(6);
  const model = modelFromSet(PROPER, set, new Map());
  const table = setRulesFor(PROPER).relations;
  const every = Object.values(model.dancers);

  it("a partner is straight across the set", () => {
    for (const me of every) {
      const partner = relate(model, table, me.id, { kind: "partner" })!;
      const them = model.dancers[partner]!;
      expect(them.slot.position).toBe(me.slot.position);
      expect(them.slot.line).not.toBe(me.slot.line);
      expect(them.role).not.toBe(me.role);
    }
  });

  it("a neighbour is diagonal — across the set *and* along it", () => {
    for (const me of every) {
      const other = relate(model, table, me.id, { kind: "neighbor", k: 1 });
      if (other === undefined) continue;
      const them = model.dancers[other]!;
      expect(them.slot.line).not.toBe(me.slot.line);
      expect(them.slot.position).toBe(me.slot.position + me.travel);
      expect(them.role).not.toBe(me.role);
      // …and travelling the other way, which is what makes it symmetric.
      expect(them.travel).toBe(me.travel === 1 ? -1 : 1);
    }
  });

  /**
   * **The corners are the two diagonals** (FR-B1, DD45): your first is across
   * the set to your right and your second across it to your left, both in a
   * couple outside your own minor set. `C2` and up keep M6's own row — the
   * dancer straight along your own line — because that is what a cast off pairs
   * on and it is not a corner of anything.
   */
  it("makes a first corner the right diagonal and a second corner the left", () => {
    for (const me of every) {
      const first = relate(model, table, me.id, { kind: "corner", k: 1 });
      const second = relate(model, table, me.id, { kind: "corner", k: 0 });
      for (const corner of [first, second]) {
        if (corner === undefined) continue;
        const them = model.dancers[corner]!;
        // Across the set, one dancing place along it.
        expect(them.slot.line).not.toBe(me.slot.line);
        expect(Math.abs(them.slot.position - me.slot.position)).toBe(1);
      }
      // …and the two of them are on opposite sides of you along the set.
      if (first !== undefined && second !== undefined) {
        const a = model.dancers[first]!.slot.position - me.slot.position;
        const b = model.dancers[second]!.slot.position - me.slot.position;
        expect(a * b).toBe(-1);
      }
      const along = relate(model, table, me.id, { kind: "corner", k: 2 });
      if (along !== undefined) {
        const them = model.dancers[along]!;
        expect(them.slot.line).toBe(me.slot.line);
        expect(them.role).toBe(me.role);
      }
    }
  });

  it("every symmetric relation is its own inverse, for everybody", () => {
    const words = ["partner", "opposite", "N1", "N2", "N3", "shadow", "S2"];
    for (const word of words) {
      const rel = parseRelation(word);
      for (const me of every) {
        const other = relate(model, table, me.id, rel);
        if (other === undefined) continue;
        expect(other, `${word} of ${me.id}`).not.toBe(me.id);
        expect(relate(model, table, other, rel), `${word} back from ${other}`).toBe(me.id);
      }
    }
  });

  it("`N(k+1)` today is `N(k)` after one progression, wherever both name somebody", () => {
    const next = progressModel(modelFromSet(PROPER, set, new Map()));
    let compared = 0;
    for (const me of every) {
      for (const k of [1, 2]) {
        const later = relate(model, table, me.id, { kind: "neighbor", k: k + 1 });
        const afterwards = relate(next, setRulesFor(PROPER).relations, me.id, {
          kind: "neighbor",
          k,
        });
        if (later === undefined || afterwards === undefined) continue;
        expect(afterwards, `N${String(k + 1)} of ${me.id}`).toBe(later);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(8);
  });
});

describe("the formation refuses what it has not built", () => {
  it("names the one group selector it has", () => {
    expect(() => PROPER.groupFor("line")).toThrow(/proper has no group selector "line"/);
  });

  it("dances in fours and waits in twos", () => {
    expect(() => PROPER.group(3)).toThrow(/not 3/);
  });
});
