import type { CoupleState, SetState } from "@caller/choreo";

/**
 * The seam-scoped `"shadow-pair"` partition (M2, D7): a physical-adjacency
 * tiling of a whole set's couples, independent of the `"hands-four"`
 * partition running alongside it.
 *
 * Every genuinely cross-group figure the corpus names — Zag It Back's
 * "shadow allemande left 1", The Judge's "balance ring [with N2, shadow]" and
 * "ladies chain to shadow" — reaches a four-station group: the couple whose
 * own progression takes it toward one seam, paired with the couple on the
 * far side of that same seam whose own progression takes it the other way.
 * Concretely, ordering every couple in the set by `place`: a couple
 * travelling `direction: -1` (a duple-improper "two", a becket "`-1`" line)
 * is always the *near* half of the seam immediately below it, paired with
 * whichever couple sits at the very next place — always the couple
 * travelling `direction: 1`, since the two directions alternate strictly by
 * place within one minor set and a seam only ever sits between two different
 * minor sets. A couple with nobody to pair this way — nothing above the very
 * top of the whole line, nothing below the very bottom — is a true end: a
 * smaller, two-station partition element, not a merge failure to special-case
 * (M2's own brief).
 *
 * `groupsFor("shadow-pair", set)`'s own partition works on *every* couple
 * currently in the set, dancing or waiting under `"hands-four"` alike — a
 * couple standing out this time through can still have a shadow on the other
 * side of the seam it is sitting on top of, and the seam-scoped partition
 * makes no distinction (director addenda, Q1: membership is per call, from
 * the live set state).
 *
 * `"shadow-pair"` deliberately does not thread `"ahead"`/`"behind"`/distance
 * through this function: at distance 1, the two are the same tiling, read
 * from opposite ends (the `-1` couple's only seam is "ahead" in its own
 * direction of travel, the `1` couple's is "behind" in its own), and no
 * corpus dance in this milestone's scope needs a wider reach. See this
 * package's README and the M2 report for the parameterised offset the
 * director's addendum leaves room for but does not require built.
 */
export type ShadowPart =
  { kind: "pair"; near: CoupleState; far: CoupleState } | { kind: "end"; near: CoupleState };

export function partitionShadowSeams(set: SetState): ShadowPart[] {
  const ordered = [...set.couples].sort((a, b) => a.place - b.place);
  const parts: ShadowPart[] = [];
  let pendingNear: CoupleState | undefined;
  for (const couple of ordered) {
    if (pendingNear !== undefined) {
      parts.push({ kind: "pair", near: pendingNear, far: couple });
      pendingNear = undefined;
      continue;
    }
    if (couple.direction === -1) {
      pendingNear = couple;
    } else {
      parts.push({ kind: "end", near: couple });
    }
  }
  if (pendingNear !== undefined) parts.push({ kind: "end", near: pendingNear });
  return parts;
}

/** The four station ids a `"shadow-pair"` seam group binds: near couple, far couple. */
export const SHADOW_SEAM_IDS = { nearLark: "NL", nearRobin: "NR", farLark: "FL", farRobin: "FR" };
