import { BECKET, DUPLE_IMPROPER, danceBySlug } from "@caller/contra";
import { describe, expect, it } from "vitest";
import { danceTrace } from "./danceTrace.js";

/**
 * T6's acceptance case: Butter, the demo programme's one becket dance, whose
 * `SHIFT LEFT` carries the whole minor set a couple-place down the hall. Every
 * other demo dance is duple improper, whose minor set does not travel at all —
 * the ones and twos merely swap places inside the same four-station square —
 * so that formation is the "nothing else moved" control.
 */

describe("danceTrace wraps a dance's along-hall progression (T6)", () => {
  it("folds Butter's slide into one minor set's own period by default", () => {
    const butter = danceBySlug("butter")!;
    expect(butter.formation).toBe(BECKET.id);
    const wrapped = danceTrace(butter);
    const unwrapped = danceTrace(butter, { wrap: false });
    // The unwrapped trace is the pre-T6 shape: the slide is real travel, and
    // the along-hall extent grows to about one couple-place, BECKET.hallPitch.
    expect(unwrapped.extent.y).toBeGreaterThan(BECKET.hallPitch! / 2);
    // The wrapped trace folds that into one period centred on the frame, so
    // the along-hall extent never exceeds half the period.
    expect(wrapped.extent.y).toBeLessThanOrEqual(BECKET.hallPitch! / 2 + 1e-6);
    // Which is a real reduction, not a rounding accident.
    expect(wrapped.extent.y).toBeLessThan(unwrapped.extent.y);
  });

  it("marks at least one sample wrapped where the slide crosses the fold", () => {
    const wrapped = danceTrace(danceBySlug("butter")!);
    const anyWrapped = wrapped.pens.some((pen) => pen.samples.some((s) => s.wrapped === true));
    expect(anyWrapped).toBe(true);
  });

  it("leaves a non-progressing (duple improper) dance's trace unchanged", () => {
    const airpants = danceBySlug("airpants")!;
    expect(airpants.formation).toBe(DUPLE_IMPROPER.id);
    const wrapped = danceTrace(airpants);
    const unwrapped = danceTrace(airpants, { wrap: false });
    // A duple improper minor set never carries the group frame down the hall
    // — the ones and twos merely swap places inside the same four-station
    // square — so every sample already sits well inside half a minor set's
    // own period and folding it is a no-op: same extent, same ink, no wraps.
    expect(wrapped.extent).toEqual(unwrapped.extent);
    for (let i = 0; i < wrapped.pens.length; i++) {
      const w = wrapped.pens[i]!;
      const u = unwrapped.pens[i]!;
      expect(w.samples.map((s) => s.p)).toEqual(u.samples.map((s) => s.p));
      expect(w.samples.some((s) => s.wrapped === true)).toBe(false);
    }
  });

  it("is cached separately by whether it wraps", () => {
    const butter = danceBySlug("butter")!;
    expect(danceTrace(butter, { wrap: true })).toBe(danceTrace(butter));
    expect(danceTrace(butter, { wrap: false })).toBe(danceTrace(butter, { wrap: false }));
    expect(danceTrace(butter, { wrap: false })).not.toBe(danceTrace(butter, { wrap: true }));
  });
});
