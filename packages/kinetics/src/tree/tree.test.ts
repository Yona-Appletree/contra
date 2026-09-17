import { describe, expect, it } from "vitest";
import { loadFormation } from "../dances/load.js";
import { apply, applyAll, compose } from "./Frame.js";
import type { Group } from "./Tree.js";
import { groupsOf, placeAt, placesOf } from "./Tree.js";
import { buildFormation, collect } from "./evaluate.js";
import { progress, seatAll } from "./membership.js";
import type { Membership } from "./membership.js";
import { providedNames, resolve } from "./relations.js";
import { num } from "./values.js";

const build = (
  name: string,
  args: Record<string, number> = {},
): { root: Group; mods: ReturnType<typeof collect> } => {
  const mods = collect(loadFormation(name));
  const root = buildFormation(
    mods,
    name,
    Object.fromEntries(Object.entries(args).map(([k, v]) => [k, num(v)])),
  );
  return { root, mods };
};

/** `$name` for a dancer, as the dancer it lands on, or nobody. */
const who = (
  name: string,
  dancer: string,
  root: Group,
  mods: ReturnType<typeof collect>,
  m: Membership,
): string | undefined => {
  const path = m.placeOf.get(dancer);
  if (path === undefined) throw new Error(`${dancer} is nowhere`);
  const r = resolve(name, path, root, mods, m);
  if (r.value.kind === "place")
    return m.dancerOf.get(r.value.place.path) ?? `empty ${r.value.place.path}`;
  if (r.value.kind === "group") return `group ${r.value.group.kind}`;
  if (r.value.kind === "member") return r.value.member;
  return r.provided ? "nobody" : "unprovided";
};

const at = (dancer: string, root: Group, m: Membership): string => {
  const place = placeAt(root, m.placeOf.get(dancer) ?? "");
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
  const { root, mods } = build("becket", { "minor-sets": 3 });
  const m0 = seatAll(root, mods);

  it("lays the places bite A's lattice had, in metres", () => {
    expect(placesOf(root).length).toBe(5 * 4 + 2 * 2);
    expect(at("1L", root, m0)).toBe("minor-set#0/ones/lark (-0.64, -0.4) 0°");
    expect(at("1R", root, m0)).toBe("minor-set#0/ones/robin (-0.64, 0.4) 0°");
    expect(at("2L", root, m0)).toBe("minor-set#0/twos/lark (0.64, 0.4) 180°");
    expect(at("2R", root, m0)).toBe("minor-set#0/twos/robin (0.64, -0.4) 180°");
    expect(at("3L", root, m0)).toBe("minor-set#2/ones/lark (-0.64, 1.2) 0°");
    expect([...m0.placeOf.keys()]).toEqual([
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
  });

  it("provides partner, neighbor, across, role and the groups by kind", () => {
    expect(who("partner", "1L", root, mods, m0)).toBe("1R");
    expect(who("partner", "2R", root, mods, m0)).toBe("2L");
    expect(who("neighbor", "1L", root, mods, m0)).toBe("2R");
    expect(who("neighbor", "1R", root, mods, m0)).toBe("2L");
    expect(who("across", "1L", root, mods, m0)).toBe("2R");
    expect(who("role", "1L", root, mods, m0)).toBe("Lark");
    expect(who("minor-set", "1L", root, mods, m0)).toBe("group minor-set");
    expect(who("couple", "1L", root, mods, m0)).toBe("group couple");
    expect(who("shadow", "1L", root, mods, m0)).toBe("unprovided");
    expect(providedNames(root).has("neighbor")).toBe(true);
    expect(providedNames(root).has("shadow")).toBe(false);
  });

  it("progresses: ones up the hall, twos down, the ends out and back in across", () => {
    const m1 = progress(root, mods, m0);
    expect(at("1L", root, m1)).toBe("out-top/lark (0.64, -0.4) 180°");
    expect(at("3L", root, m1)).toBe("minor-set#1/ones/lark (-0.64, 0.4) 0°");
    expect(at("2L", root, m1)).toBe("minor-set#1/twos/lark (0.64, 1.2) 180°");
    expect(who("neighbor", "3L", root, mods, m1)).toBe("2R");
    expect(who("partner", "1L", root, mods, m1)).toBe("1R");
    expect(who("neighbor", "1L", root, mods, m1)).toBe("unprovided");
    expect(who("minor-set", "1L", root, mods, m1)).toBe("unprovided");
    const m2 = progress(root, mods, m1);
    expect(at("1L", root, m2)).toBe("minor-set#0/twos/lark (0.64, 0.4) 180°");
    expect(at("3L", root, m2)).toBe("minor-set#0/ones/lark (-0.64, -0.4) 0°");
    expect(who("neighbor", "3L", root, mods, m2)).toBe("1R");
    expect(at("6L", root, m2)).toBe("minor-set#4/ones/lark (-0.64, 2.8) 0°");
    // Everybody is somewhere, and nobody shares a place.
    expect(m2.placeOf.size).toBe(12);
    expect(new Set(m2.placeOf.values()).size).toBe(12);
  });
});

describe("the other formations", () => {
  it("improper: partner across, neighbor along the line", () => {
    const { root, mods } = build("improper", { "minor-sets": 2 });
    const m = seatAll(root, mods);
    expect(at("1L", root, m)).toBe("minor-set#0/ones/lark (0.64, -0.4) 90°");
    expect(at("1R", root, m)).toBe("minor-set#0/ones/robin (-0.64, -0.4) 90°");
    expect(at("2L", root, m)).toBe("minor-set#0/twos/lark (-0.64, 0.4) 270°");
    expect(who("partner", "1L", root, mods, m)).toBe("1R");
    expect(who("across", "1L", root, mods, m)).toBe("1R");
    expect(who("neighbor", "1L", root, mods, m)).toBe("2R");
    const m1 = progress(root, mods, m);
    expect(at("1L", root, m1)).toBe("minor-set#1/ones/lark (0.64, 0.4) 90°");
    expect(at("2L", root, m1)).toBe("out-top/lark (0.64, -0.8) 90°");
  });

  it("proper: every lark on the right line", () => {
    const { root, mods } = build("proper", { "minor-sets": 2 });
    const m = seatAll(root, mods);
    expect(at("2L", root, m)).toBe("minor-set#0/twos/lark (0.64, 0.4) 270°");
    expect(who("neighbor", "1L", root, mods, m)).toBe("2L");
  });

  it("reverse becket: the ones progress down the hall", () => {
    const { root, mods } = build("reverse-becket", { "minor-sets": 2 });
    const m1 = progress(root, mods, seatAll(root, mods));
    expect(at("1L", root, m1)).toBe("minor-set#1/ones/lark (-0.64, 0.4) 0°");
  });

  it("square: opposite and corner, nobody progresses", () => {
    const { root, mods } = build("square");
    const m = seatAll(root, mods);
    expect(placesOf(root).length).toBe(8);
    expect(at("1L", root, m)).toBe("couple#0/lark (0.4, -1.6) 90°");
    expect(who("opposite", "1L", root, mods, m)).toBe("3L");
    expect(who("corner", "1L", root, mods, m)).toBe("2R");
    expect(who("corner", "1R", root, mods, m)).toBe("4L");
    expect(progress(root, mods, m).placeOf).toEqual(m.placeOf);
  });

  it("four face four: lines of four progress as one", () => {
    const { root, mods } = build("four-face-four", { "minor-sets": 2 });
    const m = seatAll(root, mods);
    expect([...m.placeOf.keys()].length).toBe(16);
    expect(who("neighbor", "1L", root, mods, m)).toBe("4R");
    const m1 = progress(root, mods, m);
    expect(at("1L", root, m1)).toBe("out-top/a/lark (0.64, -0.4) 180°");
    expect(at("5L", root, m1)).toBe("minor-set#1/ones/a/lark (-0.64, 0.4) 0°");
  });

  it("big circle: the ones go round clockwise and never out", () => {
    const { root, mods } = build("big-circle", { "minor-sets": 3 });
    const m = seatAll(root, mods);
    expect(groupsOf(root).filter((g) => g.kind === "minor-set").length).toBe(6);
    expect([...m.placeOf.keys()].length).toBe(12);
    let mt = m;
    for (let i = 0; i < 6; i += 1) mt = progress(root, mods, mt);
    expect(mt.placeOf).toEqual(m.placeOf);
    const m1 = progress(root, mods, m);
    expect(m1.placeOf.get("1L")).toMatch(/minor-set#1\/ones\/lark/);
    expect(m1.placeOf.get("2L")).toMatch(/minor-set#5\/twos\/lark/);
  });

  it("triple minor: the ones have two neighbours below", () => {
    const { root, mods } = build("triple-minor", { "minor-sets": 2 });
    const m = seatAll(root, mods);
    expect([...m.placeOf.keys()].length).toBe(12);
    expect(who("n1", "1L", root, mods, m)).toBe("2R");
    expect(who("n2", "1L", root, mods, m)).toBe("3R");
    expect(who("neighbor", "2L", root, mods, m)).toBe("1R");
    const m1 = progress(root, mods, m);
    expect(at("1L", root, m1)).toMatch(/minor-set#1\/ones\/lark/);
    expect(at("3L", root, m1)).toMatch(/minor-set#1\/twos\/lark/);
  });
});
