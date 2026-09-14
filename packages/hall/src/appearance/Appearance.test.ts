import { describe, expect, it } from "vitest";
import {
  COOL_SHIRTS,
  HAIR_STYLES,
  HAIR_STYLE_BAG,
  SHIRT_COLOURS,
  SKIN_TONES,
  WARM_SHIRTS,
  createAppearance,
} from "./Appearance.js";
import { mulberry32 } from "./mulberry32.js";
import { hexToRgb, shade } from "./shade.js";

describe("createAppearance", () => {
  it("is a pure function of the seed", () => {
    expect(createAppearance(1234)).toEqual(createAppearance(1234));
    expect(createAppearance(1234)).not.toEqual(createAppearance(1235));
  });

  it("draws from the contract's palettes: three skin tones, eight shirts, seven hair styles", () => {
    expect(SKIN_TONES).toHaveLength(3);
    expect(SHIRT_COLOURS).toHaveLength(8);
    expect(HAIR_STYLES).toHaveLength(7);
    expect(new Set(HAIR_STYLE_BAG)).toEqual(new Set(HAIR_STYLES));

    const seen = { skin: new Set<string>(), shirt: new Set<string>(), style: new Set<string>() };
    for (let seed = 0; seed < 400; seed++) {
      const a = createAppearance(seed);
      seen.skin.add(a.skin);
      seen.shirt.add(a.shirt);
      seen.style.add(a.hairStyle);
      expect(SKIN_TONES).toContain(a.skin);
      expect(SHIRT_COLOURS).toContain(a.shirt);
    }
    expect(seen.skin.size).toBe(3);
    expect(seen.shirt.size).toBe(8);
    expect(seen.style.size).toBe(7);
  });

  it("puts every dancer in either a skirt or trousers, never both or neither", () => {
    for (let seed = 0; seed < 200; seed++) {
      const a = createAppearance(seed);
      expect((a.skirt === undefined) !== (a.pants === undefined)).toBe(true);
      if (a.skirt !== undefined) expect(a.skirtDark).toBeDefined();
    }
  });

  it("honours a forced skirt and a restricted shirt palette", () => {
    expect(createAppearance(5, { skirt: true }).skirt).toBeDefined();
    expect(createAppearance(5, { skirt: false }).skirt).toBeUndefined();
    for (let seed = 0; seed < 50; seed++) {
      expect(COOL_SHIRTS).toContain(createAppearance(seed, { shirts: COOL_SHIRTS }).shirt);
      expect(WARM_SHIRTS).toContain(createAppearance(seed, { shirts: WARM_SHIRTS }).shirt);
    }
  });

  it("shades the shirt darker and lighter than itself", () => {
    const a = createAppearance(42);
    expect(sum(a.shirtDark)).toBeLessThan(sum(a.shirt));
    expect(sum(a.shirtLite)).toBeGreaterThanOrEqual(sum(a.shirt));
  });
});

describe("mulberry32", () => {
  it("is deterministic and stays in [0, 1)", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("shade", () => {
  it("clamps at both ends and rejects a colour it cannot parse", () => {
    expect(shade("#ffffff", 2)).toBe("#ffffff");
    expect(shade("#804020", 0)).toBe("#000000");
    expect(() => shade("red", 1)).toThrow();
  });
});

const sum = (hex: string) => hexToRgb(hex).reduce((a, b) => a + b, 0);
