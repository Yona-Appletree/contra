import type { HoldId } from "../ir/Hold.js";
import { allemandeL, allemandeR } from "./allemande.js";
import { free } from "./free.js";
import {
  ballroom,
  couple,
  courtesy,
  line,
  pullByL,
  pullByR,
  ring,
  twoHand,
} from "./placeholders.js";
import type { HoldPosture } from "./HoldPosture.js";

/**
 * Every hold the engine knows, by the name the IR calls it. One posture per
 * `HoldId`: a hold is approved once, by the user's eye, and is then right
 * everywhere it is named.
 *
 * Tonight's approved-in-principle postures are the two allemandes and the
 * free hang; Butter's others are placeholders (`placeholders.ts`) until the
 * holds gallery of bite B. `promenade`, `wave`, `arch` and `wrist-star` wait
 * for the second dance.
 */
export const HOLDS: Readonly<Record<HoldId, HoldPosture>> = {
  free,
  "allemande-R": allemandeR,
  "allemande-L": allemandeL,
  // Placeholders until the holds gallery (bite B); see placeholders.ts.
  couple,
  ring,
  ballroom,
  line,
  "pull-by-R": pullByR,
  "pull-by-L": pullByL,
  courtesy,
  "two-hand": twoHand,
};

/** The posture `id` names. */
export const holdPosture = (id: HoldId): HoldPosture => HOLDS[id];
