import { describe, expect, it } from "vitest";
import { HOLD_IDS } from "../ir/Hold.js";
import type { FigureIR, ParamSpec } from "../ir/Figure.js";
import { FIGURES, figureNamed } from "./registry.js";

const figures = Object.values(FIGURES);

/** Every `{ param }` reference anywhere in a figure's data. */
const paramRefs = (value: unknown): { param: string; cases?: Record<string, string> }[] => {
  if (Array.isArray(value)) return value.flatMap(paramRefs);
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record["param"] === "string") {
    return [record as { param: string; cases?: Record<string, string> }];
  }
  return Object.values(record).flatMap(paramRefs);
};

const specNamed = (figure: FigureIR, name: string): ParamSpec | undefined =>
  figure.params.find((spec) => spec.name === name);

describe("FIGURES", () => {
  it("keys every figure by its own id", () => {
    for (const [key, figure] of Object.entries(FIGURES)) expect(figure.id).toBe(key);
  });

  it("finds a figure by name, and nothing by a name it has not got", () => {
    expect(figureNamed(FIGURES, "do-si-do")).toBe(FIGURES["do-si-do"]);
    expect(figureNamed(FIGURES, "wiggle")).toBeUndefined();
    expect(figureNamed(FIGURES, "toString")).toBeUndefined();
  });

  it("starts every figure's parameters with its counterpart, or its group", () => {
    for (const figure of figures) {
      expect(["dancer", "group"], figure.id).toContain(figure.params[0]?.kind);
      expect(
        figure.params.filter((spec) => spec.kind === "dancer" || spec.kind === "group"),
        figure.id,
      ).toHaveLength(1);
    }
  });

  it("gives every enum its choices, and every default one of them", () => {
    for (const figure of figures) {
      for (const spec of figure.params) {
        if (spec.kind === "enum") {
          expect(spec.choices?.length, `${figure.id}.${spec.name}`).toBeGreaterThan(0);
          if (spec.default !== undefined) expect(spec.choices).toContain(spec.default);
        }
        if (spec.kind === "dancer")
          expect(spec.default, `${figure.id}.${spec.name}`).toBeUndefined();
      }
    }
  });

  it("can always squeeze a body into fewer beats than the nominal, but not none", () => {
    for (const figure of figures) {
      expect(figure.beats.min, figure.id).toBeGreaterThan(0);
      expect(figure.beats.min, figure.id).toBeLessThanOrEqual(figure.beats.nominal);
    }
  });

  it("resolves every parameter reference against a parameter the figure has", () => {
    for (const figure of figures) {
      const refs = paramRefs(figure.pre)
        .concat(paramRefs(figure.post))
        .concat(paramRefs(figure.windows));
      expect(refs.length, figure.id).toBeGreaterThanOrEqual(0);
      for (const ref of refs) {
        const spec = specNamed(figure, ref.param);
        expect(spec, `${figure.id} refers to ${ref.param}`).toBeDefined();
        if (ref.cases === undefined || spec === undefined) continue;
        expect(Object.keys(ref.cases).sort()).toEqual([...(spec.choices ?? [])].sort());
      }
    }
  });

  it("names only holds the IR has got", () => {
    for (const figure of figures) {
      for (const contract of [figure.pre, figure.post]) {
        for (const ref of contract.holds) {
          const named =
            typeof ref.hold === "string" ? [ref.hold] : Object.values(ref.hold.cases ?? {});
          for (const hold of named) expect(HOLD_IDS, figure.id).toContain(hold);
        }
      }
    }
  });

  it("stands the three of them when the select finds nobody", () => {
    // The user's ruling: "if the select returns no-one, then you just stay put
    // for those moves." `elide: "stretch"` is the field D8 needs; no figure
    // tonight gives its beats away.
    for (const figure of figures) {
      // A figure that is the progression (a becket's shift) gives its beats
      // away instead: with nobody to shift toward, the circle takes them (D8).
      expect(figure.casts.partner, figure.id).toBe(figure.id === "shift" ? "elide" : "stand");
      expect(figure.elide, figure.id).toBe("stretch");
    }
  });

  it("looks somewhere in every figure", () => {
    for (const figure of figures) {
      expect(figure.look.length, figure.id).toBeGreaterThan(0);
      for (const rule of figure.look) {
        if (rule.from !== undefined && rule.to !== undefined) {
          expect(rule.to, figure.id).toBeGreaterThan(rule.from);
        }
      }
    }
  });
});
