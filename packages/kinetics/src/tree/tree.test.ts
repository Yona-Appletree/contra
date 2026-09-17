import { describe, expect, it } from "vitest";
import { loadFormation } from "../dances/load.js";
import { apply, applyAll, compose } from "./Frame.js";
import { buildFormation, collect } from "./evaluate.js";
import { findFunction, providedNames, resolve, runFunction } from "./relations.js";
import type { Dancers } from "./state.js";
import { commit, instantiate } from "./state.js";
import type { Group } from "./Tree.js";
import { groupsOf, placeAt, placesOf } from "./Tree.js";
import { num } from "./values.js";

type Mods = ReturnType<typeof collect>;

const build = (
  name: string,
  args: Record<string, number> = {},
): { root: Group; mods: Mods; d0: Dancers } => {
  const mods = collect(loadFormation(name));
  const { root, seated } = buildFormation(
    mods,
    name,
    Object.fromEntries(Object.entries(args).map(([k, v]) => [k, num(v)])),
  );
  return { root, mods, d0: instantiate(seated) };
};

/** Everybody says `progress()` at once: the assignments commit together. */
const progress = (root: Group, mods: Mods, d: Dancers, beat = 0): Dancers => {
  const queue = d.list.flatMap((dancer) => {
    const found = findFunction("progress", dancer, root);
    return found === undefined ? [] : runFunction(found, dancer, root, mods, d, beat);
  });
  const { after, violations } = commit(root, d, queue, beat);
  expect(violations.map((v) => v.message)).toEqual([]);
  return after;
};

/** `$name` for a dancer, as the dancer it lands on, or nobody. */
const who = (name: string, id: string, root: Group, mods: Mods, d: Dancers): string | undefined => {
  const dancer = d.byId(id);
  if (dancer === undefined) throw new Error(`${id} is nowhere`);
  const r = resolve(name, dancer, root, mods, d);
  if (r.value.kind === "place")
    return d.at(r.value.place.path)?.id ?? `empty ${r.value.place.path}`;
  if (r.value.kind === "group") return `group ${r.value.group.kind}`;
  if (r.value.kind === "member") return r.value.member;
  return r.provided ? "nobody" : "unprovided";
};

const at = (id: string, root: Group, d: Dancers): string => {
  const place = placeAt(root, d.byId(id)?.place ?? "");
  if (!place) return "nowhere";
  return `${place.path.replace(/^[a-z-]+\/(major-set#0\/)?/, "")} (${String(place.frame.x)}, ${String(place.frame.y)}) ${String(place.frame.facing)}°`;
};

describe("frames", () => {
  it("composes and applies OpenSCAD-order transforms", () => {
    expect(compose({ x: 1, y: 0, facing: 90 }, { x: 1, y: 0, facing: 0 })).toEqual({
      x: 1,
      y: 1,
      facing: 90,
    });
    const f = applyAll(
      [
        { op: "translate", x: 1, y: 0 },
        { op: "rotate", deg: 90 },
      ],
      { x: 0, y: -0.4, facing: 0 },
    );
    expect(f.x).toBeCloseTo(1.4);
    expect(f.y).toBeCloseTo(0);
    expect(f.facing).toBe(90);
    expect(apply({ op: "mirror", axis: "x" }, { x: 1, y: 2, facing: 270 })).toEqual({
      x: -1,
      y: 2,
      facing: 270,
    });
    expect(apply({ op: "mirror", axis: "y" }, { x: 1, y: 2, facing: 90 })).toEqual({
      x: 1,
      y: -2,
      facing: 270,
    });
  });
});

describe("becket", () => {
  const { root, mods, d0 } = build("becket", { "minor-sets": 3 });

  it("lays the places bite A's lattice had, in metres, and seats every other set", () => {
    expect(placesOf(root).length).toBe(5 * 4 + 2 * 2);
    expect(at("1L", root, d0)).toBe("minor-set#0/ones/lark (-0.64, -0.4) 0°");
    expect(at("1R", root, d0)).toBe("minor-set#0/ones/robin (-0.64, 0.4) 0°");
    expect(at("2L", root, d0)).toBe("minor-set#0/twos/lark (0.64, 0.4) 180°");
    expect(at("2R", root, d0)).toBe("minor-set#0/twos/robin (0.64, -0.4) 180°");
    expect(at("3L", root, d0)).toBe("minor-set#2/ones/lark (-0.64, 1.2) 0°");
    expect(d0.list.map((d) => d.id)).toEqual([
      "1L",
      "1R",
      "2L",
      "2R",
      "3L",
      "3R",
      "4L",
      "4R",
      "5L",
      "5R",
      "6L",
      "6R",
    ]);
    expect(d0.byId("1R")?.role).toBe("Robin");
  });

  it("provides partner, neighbor, across, role, travel and the groups by kind", () => {
    expect(who("partner", "1L", root, mods, d0)).toBe("1R");
    expect(who("partner", "2R", root, mods, d0)).toBe("2L");
    expect(who("neighbor", "1L", root, mods, d0)).toBe("2R");
    expect(who("neighbor", "1R", root, mods, d0)).toBe("2L");
    expect(who("across", "1L", root, mods, d0)).toBe("2R");
    expect(who("role", "1L", root, mods, d0)).toBe("Lark");
    expect(who("travel", "1L", root, mods, d0)).toBe("Up");
    expect(who("travel", "2L", root, mods, d0)).toBe("Down");
    expect(who("minor-set", "1L", root, mods, d0)).toBe("group minor-set");
    expect(who("couple", "1L", root, mods, d0)).toBe("group couple");
    expect(who("shadow", "1L", root, mods, d0)).toBe("unprovided");
    expect(providedNames(root).has("progress")).toBe(true);
    expect(providedNames(root).has("shadow")).toBe(false);
  });

  it("progresses by its own text: ones up the hall, twos down, the ends out and back in across", () => {
    const d1 = progress(root, mods, d0);
    expect(at("1L", root, d1)).toBe("out-top/lark (0.64, -0.4) 180°");
    expect(at("3L", root, d1)).toBe("minor-set#1/ones/lark (-0.64, 0.4) 0°");
    expect(at("2L", root, d1)).toBe("minor-set#1/twos/lark (0.64, 1.2) 180°");
    expect(who("neighbor", "3L", root, mods, d1)).toBe("2R");
    expect(who("partner", "1L", root, mods, d1)).toBe("1R");
    expect(who("neighbor", "1L", root, mods, d1)).toBe("unprovided");
    const d2 = progress(root, mods, d1);
    expect(at("1L", root, d2)).toBe("minor-set#0/twos/lark (0.64, 0.4) 180°");
    expect(at("3L", root, d2)).toBe("minor-set#0/ones/lark (-0.64, -0.4) 0°");
    expect(who("neighbor", "3L", root, mods, d2)).toBe("1R");
    expect(at("6L", root, d2)).toBe("minor-set#4/ones/lark (-0.64, 2.8) 0°");
    expect(new Set(d2.list.map((d) => d.place)).size).toBe(12);
  });

  it("a role swap is an event too, and every relation sees it", () => {
    const lark = d0.byId("1L")!;
    const { after, violations } = commit(
      root,
      d0,
      [
        {
          dancer: "1L",
          beat: 0,
          property: "role",
          value: "Robin",
          span: { start: 0, end: 0, line: 0 },
        },
      ],
      0,
    );
    expect(violations).toEqual([]);
    expect(after.byId("1L")?.role).toBe("Robin");
    expect(who("role", "1L", root, mods, after)).toBe("Robin");
    // Both ones are robins now: 2R has no opposite role across, and 2L's nearest is 1R.
    expect(who("neighbor", "2R", root, mods, after)).toBe("nobody");
    expect(who("neighbor", "2L", root, mods, after)).toBe("1R");
    void lark;
  });

  it("refuses two dancers on one place at a commit", () => {
    const target = d0.byId("2L")!.place;
    const { violations } = commit(
      root,
      d0,
      [
        {
          dancer: "1L",
          beat: 3,
          property: "place",
          value: target,
          span: { start: 0, end: 0, line: 0 },
        },
      ],
      3,
    );
    expect(violations.map((v) => v.message)).toEqual([
      "1L and 2L are both on becket/major-set#0/minor-set#0/twos/lark at beat 3",
    ]);
  });
});

describe("the other formations", () => {
  it("improper: partner across, neighbor along the line, and progress", () => {
    const { root, mods, d0 } = build("improper", { "minor-sets": 2 });
    expect(at("1L", root, d0)).toBe("minor-set#0/ones/lark (0.64, -0.4) 90°");
    expect(at("1R", root, d0)).toBe("minor-set#0/ones/robin (-0.64, -0.4) 90°");
    expect(at("2L", root, d0)).toBe("minor-set#0/twos/lark (-0.64, 0.4) 270°");
    expect(who("partner", "1L", root, mods, d0)).toBe("1R");
    expect(who("across", "1L", root, mods, d0)).toBe("1R");
    expect(who("neighbor", "1L", root, mods, d0)).toBe("2R");
    const d1 = progress(root, mods, d0);
    expect(at("1L", root, d1)).toBe("minor-set#1/ones/lark (0.64, 0.4) 90°");
    expect(at("2L", root, d1)).toBe("out-top/lark (0.64, -0.8) 90°");
    const d2 = progress(root, mods, d1);
    expect(at("2L", root, d2)).toBe("minor-set#0/ones/lark (0.64, -0.4) 90°");
  });

  it("proper: every lark on the right line", () => {
    const { root, mods, d0 } = build("proper", { "minor-sets": 2 });
    expect(at("2L", root, d0)).toBe("minor-set#0/twos/lark (0.64, 0.4) 270°");
    expect(who("neighbor", "1L", root, mods, d0)).toBe("2L");
  });

  it("reverse becket: the ones progress down the hall", () => {
    const { root, mods, d0 } = build("reverse-becket", { "minor-sets": 2 });
    const d1 = progress(root, mods, d0);
    expect(at("1L", root, d1)).toBe("minor-set#1/ones/lark (-0.64, 0.4) 0°");
  });

  it("square: opposite and corner, nobody progresses", () => {
    const { root, mods, d0 } = build("square");
    expect(placesOf(root).length).toBe(8);
    expect(at("1L", root, d0)).toBe("couple#0/lark (0.4, -1.6) 90°");
    expect(who("opposite", "1L", root, mods, d0)).toBe("3L");
    expect(who("corner", "1L", root, mods, d0)).toBe("2R");
    expect(who("corner", "1R", root, mods, d0)).toBe("4L");
    expect(progress(root, mods, d0).list).toEqual(d0.list);
  });

  it("four face four: lines of four progress as one, and come back in as one", () => {
    const { root, mods, d0 } = build("four-face-four", { "minor-sets": 2 });
    expect(d0.list.length).toBe(16);
    expect(who("neighbor", "1L", root, mods, d0)).toBe("4R");
    const d1 = progress(root, mods, d0);
    expect(at("1L", root, d1)).toBe("out-top/a/lark (0.64, -0.4) 180°");
    expect(at("2L", root, d1)).toBe(
      "out-top/b/lark (0.64, -2, 180°".slice(0, 0) + "out-top/b/lark (0.64, -2) 180°",
    );
    expect(at("5L", root, d1)).toBe("minor-set#1/ones/a/lark (-0.64, 0.4) 0°");
    const d2 = progress(root, mods, d1);
    expect(at("1L", root, d2)).toBe("minor-set#0/twos/a/lark (0.64, 1.2) 180°");
    expect(at("2L", root, d2)).toBe("minor-set#0/twos/b/lark (0.64, -0.4) 180°");
  });

  it("big circle: the ones go round and never out", () => {
    const { root, mods, d0 } = build("big-circle", { "minor-sets": 3 });
    expect(groupsOf(root).filter((g) => g.kind === "minor-set").length).toBe(6);
    expect(d0.list.length).toBe(12);
    let dt = d0;
    for (let i = 0; i < 6; i += 1) dt = progress(root, mods, dt);
    expect(dt.list).toEqual(d0.list);
    const d1 = progress(root, mods, d0);
    expect(d1.byId("1L")?.place).toMatch(/minor-set#1\/ones\/lark/);
    expect(d1.byId("2L")?.place).toMatch(/minor-set#5\/twos\/lark/);
  });

  it("triple minor: the ones have two neighbours below, and the sets re-form as the ones pass", () => {
    const { root, mods, d0 } = build("triple-minor", { "minor-sets": 2 });
    expect(d0.list.length).toBe(12);
    expect(who("n1", "1L", root, mods, d0)).toBe("2R");
    expect(who("n2", "1L", root, mods, d0)).toBe("3R");
    expect(who("neighbor", "2L", root, mods, d0)).toBe("1R");
    const d1 = progress(root, mods, d0);
    expect(at("1L", root, d1)).toMatch(/minor-set#1\/ones\/lark/);
    expect(at("3L", root, d1)).toMatch(/minor-set#1\/twos\/lark/);
  });
});
