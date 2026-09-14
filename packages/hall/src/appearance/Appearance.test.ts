import { describe, expect, it } from "vitest";
import {
  HAIR_STYLES,
  HAIR_STYLE_BAG,
  SHIRT_COLOURS,
  SKIN_TONES,
  SKIRT_COLOURS,
  createAppearance,
} from "./Appearance.js";
import { mulberry32 } from "./mulberry32.js";
import { hexToHsl, hexToRgb, hslToHex, shade } from "./shade.js";

describe("createAppearance", () => {
  it("is a pure function of the seed", () => {
    expect(createAppearance(1234)).toEqual(createAppearance(1234));
    expect(createAppearance(1234)).not.toEqual(createAppearance(1235));
  });

  it("draws from the spikes' palettes: six skin tones, sixteen shirts, seven hair styles", () => {
    expect(SKIN_TONES).toHaveLength(6);
    expect(SHIRT_COLOURS).toHaveLength(16);
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
    expect(seen.skin.size).toBe(6);
    expect(seen.shirt.size).toBe(16);
    expect(seen.style.size).toBe(7);
  });

  it("dresses every dancer in both a skirt and trousers, and says which they wear", () => {
    const wearing = new Set<boolean>();
    for (let seed = 0; seed < 200; seed++) {
      const a = createAppearance(seed);
      expect(SKIRT_COLOURS).toContain(a.skirt);
      expect(a.skirtDark).not.toBe(a.skirt);
      expect(a.pants).toBeDefined();
      wearing.add(a.wearsSkirt);
    }
    // Roughly half and half, from the seed alone.
    expect(wearing).toEqual(new Set([true, false]));
  });

  it("honours a forced skirt and a restricted shirt palette", () => {
    expect(createAppearance(5, { skirt: true }).wearsSkirt).toBe(true);
    expect(createAppearance(5, { skirt: false }).wearsSkirt).toBe(false);
    const half = SHIRT_COLOURS.slice(0, 8);
    for (let seed = 0; seed < 50; seed++) {
      expect(half).toContain(createAppearance(seed, { shirts: half }).shirt);
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

describe("hexToHsl and hslToHex", () => {
  it("round-trip every palette colour to within one channel step", () => {
    for (const hex of [...SHIRT_COLOURS, ...SKIRT_COLOURS, "#000000", "#ffffff", "#808080"]) {
      const [h, s, l] = hexToHsl(hex);
      const back = hslToHex(h, s, l);
      const [r0, g0, b0] = hexToRgb(hex);
      const [r1, g1, b1] = hexToRgb(back);
      expect(Math.max(Math.abs(r1 - r0), Math.abs(g1 - g0), Math.abs(b1 - b0))).toBeLessThanOrEqual(
        1,
      );
    }
  });

  it("puts the grey axis at zero saturation and the primaries on their hues", () => {
    expect(hexToHsl("#808080")[1]).toBe(0);
    expect(hexToHsl("#ff0000")[0]).toBe(0);
    expect(hexToHsl("#00ff00")[0]).toBe(120);
    expect(hexToHsl("#0000ff")[0]).toBe(240);
  });
});

const sum = (hex: string) => hexToRgb(hex).reduce((a, b) => a + b, 0);
