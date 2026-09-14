import {
  closureReport,
  collisionReport,
  createHall,
  createLibrary,
  createScriptDecider,
  reachReport,
} from "@caller/choreo";
import { describe, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { createContraRegistry } from "./registry.js";
import { BECKET_SEQUENCE, DUPLE_SEQUENCE } from "./sequences.js";

describe("numbers", () => {
  it("reports", () => {
    for (const [name, dance, formation, lines] of [
      ["duple improper", DUPLE_SEQUENCE, DUPLE_IMPROPER, [2, 3, 4, 5, 6]],
      ["becket", BECKET_SEQUENCE, BECKET, [4, 6, 8, 10, 12]],
    ] as const) {
      for (const couples of lines) {
        const registry = createContraRegistry();
        const hall = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]);
        const decider = createScriptDecider(
          { slug: "p", items: [{ dance: dance.slug, medley: "none", timesThrough: 8 }] },
          registry,
          hall,
          createLibrary([dance], [formation]),
        );
        decider.advance(128);
        const timeline = decider.timeline();
        const closure = closureReport(timeline);
        const reach = reachReport(timeline, 0, 128);
        const collision = collisionReport(timeline, 0, 128);
        console.log(
          `${name} ${couples} couples | closure ${closure.maxPositionError.toExponential(3)} px over ${closure.seams} seams | facing ${closure.maxFacingError.toFixed(1)}° | short ${reach.maxShort} over ${reach.hands} hands | min torso ${collision.minDistance.toFixed(3)} px over ${collision.pairs} pairs`,
        );
      }
    }
  });
});
