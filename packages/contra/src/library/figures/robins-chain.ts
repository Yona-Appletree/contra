import { CHAIN_JOIN_BEAT, CHAIN_PASS_PX } from "../../figures/robins-chain.js";
import type { FigureDefinition } from "../FigureDefinition.js";
import { MINOR_SET_ROLES } from "./carriers.js";

/**
 * How long the couple takes to open out on to its two places, beats.
 *
 * The rotation happens at the hold and the places are a set's width apart, so
 * the last beat and a half of the figure is the couple opening out and letting
 * go at the same time.
 */
const OPEN_BEATS = 1.5;

/**
 * **Robins chain**, as data: the two robins pull by the right in the middle,
 * and each joins the backward orbit of the lark whose couple she is arriving
 * at.
 *
 * The user, watching a video walkthrough (F10): "the larks orbit backwards 1
 * full turn around the point between where they and the robin started. the
 * robins pull by to join the larks 1/4 of the way through. (2 beats) they both
 * finish the orbit."
 *
 * **A6: the orbit is the only regime the chain ships.** F13 made it the
 * default and kept F9's four earlier candidates reachable behind `?chain=` for
 * comparison; M4 takes them away, with `CHAIN_CANDIDATES`, `?chain=` and
 * `pnpm figure --chain`. So `stepInPx`, `pivotFromLark` and `pullBeats` are
 * gone from this figure's parameters: an orbit has one circle and no pivot to
 * choose, and its pull by **is** its join.
 */
export const robinsChainDefinition: FigureDefinition = {
  id: "robins-chain",
  call: "ROBINS CHAIN",
  describe:
    "The two robins take right hands in the middle and pull by, passing right shoulders, and carry on across the set. The lark of the couple each robin is arriving at is already moving: from the first beat he backs round a small circle centred halfway between his own place and the place beside him, one hold across. She reaches him a quarter of the way round it, at the far side of his circle, and takes it up with him — her left hand in his left, her own right hand behind her own back and his right hand on it — walking forward as he keeps walking backward, both of them turning about that same centre. They face directly out of the set together at the halfway point and back in at the end, with the robin now on the lark's right, and the couple opens out on to the two places. He ends where he started, facing the way he already faced: the whole effect of a chain is that the robins have traded and each couple has a new robin. (unsure: a lark can twirl her under his hand instead, and this only scoops.)",
  lead: 4,
  nominalBeats: 8,
  roles: MINOR_SET_ROLES,
  actors: "all",
  anchor: "hands-four",
  params: {
    kind: "canonical",
    defaults: {
      chains: "robin",
      holdDrop: 6,
      stackPx: 1,
      joinBeat: CHAIN_JOIN_BEAT,
      passPx: CHAIN_PASS_PX,
    },
  },
  shape: {
    kind: "courtesyTurn",
    regime: "orbit",
    // One role chains across; whose lark is whose is decided by the facing her
    // landing place carries, not by who is nearest.
    pairing: { kind: "chain", param: "chains" },
    ends: { kind: "trade" },
    // An orbit chain's pull by *is* its join: she walks on to the lark's circle
    // and the figure turns from there.
    approachBeats: { param: "joinBeat" },
    // The orbit shapes her whole approach itself, as a curve through the pull
    // by, so there is no bow to add to it.
    bow: 0,
    // An orbit has one circle and no pivot to choose.
    pivotFromLark: 0,
    passPx: { param: "passPx" },
    openBeats: OPEN_BEATS,
    closeBeats: 0,
    larkLead: 0,
    backHands: true,
    hands: {
      drop: { param: "holdDrop" },
      stackPx: { param: "stackPx" },
      pullDrop: { param: "holdDrop" },
    },
  },
  holds: [],
  ends: "relative",
  timing: { stretch: "distance", profile: "smooth" },
  symmetry: {
    mirror: {
      kind: "handed",
      why:
        "the lark orbits **backwards** and the robins pull by the **right**: both are one sign " +
        "in `orbitTurn`, and a chain that turned the other way with a left-shoulder pull by is " +
        "a figure nobody dances.",
    },
    // "Larks chain" is this same figure with one word changed.
    roles: ["chains"],
  },
};
