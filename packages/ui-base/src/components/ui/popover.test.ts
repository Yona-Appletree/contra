import { describe, expect, it } from "vitest";
import { popoverPosition } from "./popover.js";

// The placement arithmetic only. The behaviour that needs a browser —
// dismiss on outside click and Escape, and focus returning to the trigger —
// is a Playwright case (`apps/web/e2e/badge.spec.ts`), since this workspace
// has no DOM test environment and the popover's whole point is measured
// geometry a jsdom stub would have to fake.

const trigger = { x: 300, y: 8, width: 28, height: 28 };
const panel = { width: 320, height: 240 };
const viewport = { width: 1280, height: 800 };

describe("popoverPosition", () => {
  it("hangs a bottom-end panel off the trigger's right edge, seam overlapping", () => {
    const at = popoverPosition(trigger, panel, "bottom-end", viewport);
    expect(at.side).toBe("below");
    // The panel's right edge lines up with the trigger's VISIBLE right edge
    // (the outline swells by 3px while open), and its top overlaps the
    // trigger's bottom by the border width so the two rects always union.
    expect(at.left + panel.width).toBe(trigger.x + trigger.width + 3);
    expect(at.top).toBe(trigger.y + trigger.height - 1);
  });

  it("centres a middle placement on the trigger", () => {
    const at = popoverPosition(trigger, panel, "bottom-middle", viewport);
    expect(at.left + panel.width / 2).toBe(trigger.x + trigger.width / 2);
  });

  it("flips below when there is no room above", () => {
    const at = popoverPosition(trigger, panel, "top-end", viewport);
    expect(at.side).toBe("below");
  });

  it("flips above when there is no room below", () => {
    const low = { ...trigger, y: 700 };
    const at = popoverPosition(low, panel, "bottom-end", viewport);
    expect(at.side).toBe("above");
    expect(at.top + panel.height).toBe(low.y + 1);
  });

  it("keeps a phone-width panel inside the viewport margin", () => {
    // 390px phone, a trigger hard against the right edge: the panel cannot
    // hang off the screen, so it clamps to the 12px margin.
    const phone = { width: 390, height: 844 };
    const at = popoverPosition(
      { x: 352, y: 8, width: 28, height: 28 },
      { width: 366, height: 300 },
      "bottom-end",
      phone,
    );
    expect(at.left).toBeGreaterThanOrEqual(0);
    expect(at.left + 366).toBeLessThanOrEqual(phone.width);
  });

  it("welds a near-miss edge instead of leaving a sub-radius shelf", () => {
    // The viewport-margin clamp would leave the panel's right edge 5px short
    // of the trigger's visible right edge — a shelf narrower than the corner
    // radius, which reads as a rendering mistake. It welds instead, spending
    // 5px of the 12px margin to do it.
    const phone = { width: 390, height: 844 };
    const at = popoverPosition(
      { x: 352, y: 8, width: 28, height: 28 },
      { width: 340, height: 300 },
      "bottom-end",
      phone,
    );
    expect(at.left + 340).toBe(352 + 28 + 3);
  });
});
