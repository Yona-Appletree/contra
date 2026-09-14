import { describe, expect, it } from "vitest";
import { createAppearance } from "./Appearance.js";
import { mulberry32 } from "./mulberry32.js";
import {
  FORBIDDEN_ROLE_HUE_BANDS,
  ROLE_COLOURS,
  SHIRT_HUE_SPREAD_DEG,
  SHIRT_LIGHTNESS_SPREAD,
  SHIRT_SATURATION_SPREAD,
  forbiddenRoleHue,
  rankShade,
  roleColour,
  roleShirtColour,
} from "./roleColours.js";
import { hexToHsl } from "./shade.js";
import { TRAIL_COLOURS, createPerson, roleTrailColour } from "../person/Person.js";
import { penColour } from "../traces/TraceView.js";

/**
 * The user's ruling of 2026-09-14, written as a test so that it cannot regress:
 * **larks gold, robins red**, and nothing that distinguishes the roles may be
 * blue-ish for a lark or pink-ish for a robin, in any renderer, view, trace,
 * chart, card or document.
 *
 * The bands are stated in HSL hue degrees: blue is 190°–270° (cyan through
 * violet-blue) and pink is 290°–350° (magenta through rose). A colour with less
 * than 8% saturation has no hue worth judging — black, white and the greys are
 * neither.
 */
const ROLES = ["lark", "robin"] as const;

/** Every colour any renderer puts on a dancer *because of their role*. */
function roleColoursInUse(): { what: string; hex: string }[] {
  const out: { what: string; hex: string }[] = [];
  for (const role of ROLES) {
    out.push({ what: `${role} base`, hex: ROLE_COLOURS[role] });
    for (const rank of [0, 1, 2]) {
      out.push({ what: `${role} pen rank ${String(rank)}`, hex: penColour(role, rank) });
    }
    out.push({ what: `${role} trail ones`, hex: roleTrailColour(role, true) });
    out.push({ what: `${role} trail twos`, hex: roleTrailColour(role, false) });
    out.push({ what: `${role} TRAIL_COLOURS ones`, hex: TRAIL_COLOURS[role].ones });
    out.push({ what: `${role} TRAIL_COLOURS twos`, hex: TRAIL_COLOURS[role].twos });
    // Three hundred dancers' worth of shirts, and the shading the body draws
    // each of them with.
    for (let seed = 0; seed < 300; seed++) {
      const a = createAppearance(seed, { roleShirt: role });
      out.push({ what: `${role} shirt seed ${String(seed)}`, hex: a.shirt });
      out.push({ what: `${role} shirtDark seed ${String(seed)}`, hex: a.shirtDark });
      out.push({ what: `${role} shirtLite seed ${String(seed)}`, hex: a.shirtLite });
    }
  }
  return out;
}

describe("the role colours", () => {
  it("are gold for larks and red for robins", () => {
    expect(ROLE_COLOURS.lark).toBe("#e0a32e");
    expect(ROLE_COLOURS.robin).toBe("#c8362f");
    expect(roleColour("lark")).toBe(ROLE_COLOURS.lark);
    expect(roleColour("robin")).toBe(ROLE_COLOURS.robin);
    expect(roleColour("head")).toBe(ROLE_COLOURS.other);
    // Gold sits in the yellow-orange arc, red on the red one.
    expect(hexToHsl(ROLE_COLOURS.lark)[0]).toBeGreaterThan(30);
    expect(hexToHsl(ROLE_COLOURS.lark)[0]).toBeLessThan(50);
    const robinHue = hexToHsl(ROLE_COLOURS.robin)[0];
    expect(robinHue < 20 || robinHue > 350).toBe(true);
  });

  it("never falls in a blue or a pink hue band, anywhere a role is drawn", () => {
    const offenders = roleColoursInUse()
      .map((c) => ({ ...c, band: forbiddenRoleHue(c.hex) }))
      .filter((c) => c.band !== undefined);
    expect(offenders.slice(0, 5).map((c) => `${c.what} ${c.hex} is ${String(c.band)}-ish`)).toEqual(
      [],
    );
  });

  it("states the two forbidden bands in HSL degrees", () => {
    expect(FORBIDDEN_ROLE_HUE_BANDS).toEqual([
      { name: "blue", from: 190, to: 270 },
      { name: "pink", from: 290, to: 350 },
    ]);
    expect(forbiddenRoleHue("#4c7fc9")).toBe("blue");
    expect(forbiddenRoleHue("#c95c9e")).toBe("pink");
    // The old trail palette, which this ruling replaced, would have failed.
    expect(forbiddenRoleHue("#3f6fb8")).toBe("blue");
    expect(forbiddenRoleHue("#f4a8bc")).toBe("pink");
    // Greys have no hue to judge.
    expect(forbiddenRoleHue("#8c8c8c")).toBeUndefined();
  });

  it("keeps every shirt inside its role's own hue window, with room to spare", () => {
    for (const role of ROLES) {
      const base = hexToHsl(ROLE_COLOURS[role])[0];
      for (let seed = 0; seed < 300; seed++) {
        const hue = hexToHsl(createAppearance(seed, { roleShirt: role }).shirt)[0];
        const off = ((hue - base + 540) % 360) - 180;
        expect(Math.abs(off)).toBeLessThanOrEqual(SHIRT_HUE_SPREAD_DEG + 0.5);
      }
    }
  });

  it("spreads three hundred dancers' shirts wide enough not to read as a uniform", () => {
    for (const role of ROLES) {
      const shirts = new Set<string>();
      let lightest = 0;
      let darkest = 1;
      for (let seed = 0; seed < 300; seed++) {
        const shirt = createAppearance(seed, { roleShirt: role }).shirt;
        shirts.add(shirt);
        const l = hexToHsl(shirt)[2];
        lightest = Math.max(lightest, l);
        darkest = Math.min(darkest, l);
      }
      // Thirty dancers is the hall; three hundred distinct shirts says no two
      // of them share one by accident.
      expect(shirts.size).toBeGreaterThan(290);
      // …and the value range the eye actually reads at 1× is a real spread.
      expect(lightest - darkest).toBeGreaterThan(0.15);
    }
  });

  it("holds the spread inside its stated bounds", () => {
    const [, baseS, baseL] = hexToHsl(ROLE_COLOURS.lark);
    const rng = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const [, s, l] = hexToHsl(roleShirtColour("lark", rng));
      expect(s).toBeGreaterThanOrEqual(baseS * SHIRT_SATURATION_SPREAD.min - 0.02);
      expect(s).toBeLessThanOrEqual(baseS * SHIRT_SATURATION_SPREAD.max + 0.02);
      expect(l).toBeGreaterThanOrEqual(baseL * SHIRT_LIGHTNESS_SPREAD.min - 0.02);
      expect(l).toBeLessThanOrEqual(baseL * SHIRT_LIGHTNESS_SPREAD.max + 0.02);
    }
  });
});

describe("what reads the role colours", () => {
  it("draws a dancer's trail in their role's colour, the ones darker", () => {
    expect(roleTrailColour("lark", true)).toBe(rankShade(ROLE_COLOURS.lark, 1));
    expect(roleTrailColour("robin")).toBe(rankShade(ROLE_COLOURS.robin, 2));
    expect(roleTrailColour("lark", true)).not.toBe(roleTrailColour("lark"));
  });

  it("gives a pen and the dancer who drew it the same two hues", () => {
    expect(penColour("lark", 1)).toBe(roleTrailColour("lark", true));
    expect(penColour("robin", 2)).toBe(roleTrailColour("robin", false));
  });

  it("dresses a dancer by role and leaves a non-dancer on the palette", () => {
    const lark = createPerson({ id: "a", role: "lark", seed: 5, roleShirts: true });
    const robin = createPerson({ id: "b", role: "robin", seed: 5, roleShirts: true });
    expect(forbiddenRoleHue(lark.appearance.shirt)).toBeUndefined();
    expect(forbiddenRoleHue(robin.appearance.shirt)).toBeUndefined();
    // Same seed, different role: the shirt says which role, not which seed.
    expect(lark.appearance.shirt).not.toBe(robin.appearance.shirt);
    expect(hexToHsl(lark.appearance.shirt)[0]).toBeGreaterThan(20);

    const fiddler = createPerson({ id: "c", role: "band", seed: 5 });
    expect(fiddler.appearance.shirt).not.toBe(lark.appearance.shirt);
  });

  it("decides the skirt from the seed and never from the role", () => {
    for (let seed = 0; seed < 200; seed++) {
      const lark = createPerson({ id: "a", role: "lark", seed, roleShirts: true });
      const robin = createPerson({ id: "b", role: "robin", seed, roleShirts: true });
      expect(lark.appearance.wearsSkirt).toBe(robin.appearance.wearsSkirt);
      expect(lark.appearance.skirt).toBe(robin.appearance.skirt);
    }
  });
});
