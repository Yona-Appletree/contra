import type { AngleExpr, FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * **Long lines forward and back**, as data: both lines take hands along the
 * line, walk into the set and walk back out.
 *
 * The figure that the **three-pass rule** exists for. A dancer's hand toward
 * the next minor set is placed half the line's own pitch beyond them, and the
 * dancer of *that* set places theirs by the same rule from the other side, so
 * the two land on one floor point without either group knowing the other
 * exists — which is the only way a figure whose frame is one minor set can join
 * hands down a whole line. It is a `solo` hold with a `beyond` point, read at
 * the live beat, so it travels in and out with the line rather than being
 * pinned to a place.
 *
 * Nothing travels to anywhere: the walk is an `oscillate`, out and back along
 * the way the line faces, still at both ends.
 */

/** Straight across the set from where this dancer stands. */
const ACROSS: AngleExpr = {
  angle: "bearing",
  from: { point: "start", role: { role: "self" } },
  // The set's own midline, abeam of me: the anchor's across-the-set coordinate
  // at my own along-the-set one.
  to: {
    point: "compose",
    x: { point: "anchor" },
    y: { point: "start", role: { role: "self" } },
  },
};

/** How long the line takes to turn square across the set, beats. */
const SETTLE_BEATS = 1;

/** Long lines forward and back, as a figure definition. */
export const longLinesDefinition: FigureDefinition = {
  id: "long-lines",
  call: "LONG LINES FORWARD AND BACK",
  describe:
    "Take hands all the way along your own line with the dancers beside you, walk four steps into the set, and walk four steps back out. The arms do not move in this figure: everyone is just holding hands, and only the bodies travel. You end where you started, still facing across.",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: { kind: "canonical", defaults: { forwardPx: 9, holdDrop: 8, stackPx: 1 } },
  shape: {
    kind: "path",
    // The other dancer on your own side of the set.
    pairing: { kind: "lineMate" },
    track: {
      // Where you started, turned square across the set.
      ends: { p: { point: "start", role: { role: "self" } }, facing: ACROSS },
      curve: { kind: "oscillate", along: ACROSS, distance: { param: "forwardPx" } },
      facing: { kind: "settle", beats: SETTLE_BEATS },
      idleHands: { kind: "down" },
    },
  },
  holds: [
    {
      // The hand toward the line mate: one point, the midpoint of the two
      // shoulders, computed the same way by both of them.
      kind: "mate",
      side: { nearest: { role: "mate" }, facing: "end" },
      point: { kind: "joinPoint" },
      drop: { param: "holdDrop" },
      stackPx: { param: "stackPx" },
      window: { kind: "holdWindow", take: 1, release: 1 },
    },
    {
      // The hand toward the next minor set: half the line's pitch beyond,
      // which is where that set's dancer puts theirs by the same rule.
      kind: "solo",
      role: "each",
      side: { furthest: { role: "mate" }, facing: "end" },
      point: { kind: "beyond", of: { role: "mate" } },
      drop: { param: "holdDrop" },
      window: { kind: "holdWindow", take: 1, release: 1 },
    },
  ],
  ends: "relative",
  timing: { stretch: "pace", profile: "cruise" },
  // Nothing in a long lines is handed at all: both lines walk straight in and
  // straight out, and which hand goes where is read off which way they face.
  symmetry: { mirror: { kind: "parameters" } },
};
