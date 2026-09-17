import type { Run } from "../../pipeline.js";
import type { Diagnostic } from "../Diagnostic.js";
import { asymmetricSelections } from "./asymmetric.js";
import { desync } from "./desync.js";
import { drift } from "./drift.js";
import { handsWithoutHold } from "./hands.js";
import { overlaps } from "./overlap.js";

/**
 * The floor checks (round 2, P4): what no single layer sees but the whole
 * run shows — two bodies through each other, two hands meeting with no
 * hold, a figure ending off its place, dancers' threads drifting apart, a
 * figure whose members do not name each other. Each is a diagnostic with
 * a trace, in tool-building mode: the user's *"the compiler should complain
 * that people overlap. it should trace."*
 */
export function floorChecks(run: Run): Diagnostic[] {
  return [
    ...desync(run),
    ...asymmetricSelections(run),
    ...drift(run),
    ...overlaps(run),
    ...handsWithoutHold(run),
  ];
}
