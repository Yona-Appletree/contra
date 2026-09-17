import type { HoldId } from "../ir/Hold.js";
import { allemandeL, allemandeR } from "./allemande.js";
import { free } from "./free.js";
import type { HoldPosture } from "./HoldPosture.js";

/**
 * Every hold the engine knows, by the name the IR calls it. One posture per
 * `HoldId`: a hold is approved once, by the user's eye, and is then right
 * everywhere it is named.
 *
 * Tonight's gallery is two postures and the free hang. Butter's — `pull-by`,
 * `two-hand`, `ballroom`, `courtesy`, `promenade`, `ring`, `line`, `wave`,
 * `arch`, `wrist-star` — is bite B.
 */
export const HOLDS: Readonly<Record<HoldId, HoldPosture>> = {
  free,
  "allemande-R": allemandeR,
  "allemande-L": allemandeL,
};

/** The posture `id` names. */
export const holdPosture = (id: HoldId): HoldPosture => HOLDS[id];
