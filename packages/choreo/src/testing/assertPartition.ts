import type { DancerId, GroupPlan, SetState } from "../formation/Formation.js";

/**
 * The property every {@link import('../formation/Formation.js').Formation.groupsFor}
 * answer has to have: **it is a partition of the set**.
 *
 * Every dancer standing in `set` appears in the `members` of exactly one plan,
 * and no plan names anybody who is not in the set. This is what makes
 * double-claiming structurally impossible once selectors get wider than one
 * minor set — a seam group, a line with the couple standing out swept into it —
 * where the partition is far less obvious than "one group per four".
 *
 * `Timeline.add()` already throws when a dancer is bound into two figures over
 * overlapping beats, so a partition that is not one fails loudly the first time
 * a dance exercises it. This checks the same property one step earlier, against
 * the formation rather than against a whole danced timeline, so a new selector
 * can be proved right before any dance is written on it.
 *
 * Reports rather than judges, in the same shape as
 * {@link import('./oracles.js').coverageProblems}: {@link assertPartition} is
 * the throwing wrapper.
 */
export function partitionProblems(plans: readonly GroupPlan[], set: SetState): string[] {
  const problems: string[] = [];

  /** Which plans put each dancer somewhere, and on which station. */
  const seen = new Map<DancerId, string[]>();
  for (const plan of plans) {
    for (const [station, dancer] of Object.entries(plan.members)) {
      const where = seen.get(dancer) ?? [];
      where.push(`${plan.id}/${station}`);
      seen.set(dancer, where);
    }
  }

  const standing = new Set<DancerId>();
  for (const couple of set.couples) {
    for (const dancer of Object.values(couple.dancers)) {
      standing.add(dancer);
      const where = seen.get(dancer);
      if (where === undefined) {
        problems.push(`${dancer}: in no group`);
      } else if (where.length > 1) {
        problems.push(`${dancer}: in ${where.length} groups (${where.join(", ")})`);
      }
    }
  }

  for (const [dancer, where] of seen) {
    if (!standing.has(dancer)) {
      problems.push(`${dancer}: in ${where.join(", ")} but not in set "${set.id}"`);
    }
  }

  return problems;
}

/** {@link partitionProblems}, as an assertion: throws with every problem it found. */
export function assertPartition(plans: readonly GroupPlan[], set: SetState): void {
  const problems = partitionProblems(plans, set);
  if (problems.length === 0) return;
  throw new Error(
    `groups of set "${set.id}" are not a partition:\n  ${problems.join("\n  ")}\n` +
      `(groups: ${plans.map((p) => `${p.id} ${p.kind}`).join(", ")})`,
  );
}
