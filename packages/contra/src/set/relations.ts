// Types only, both ways: `SetModel.ts` calls {@link relate} to fill in each
// dancer's partner binding, so this module has to stay a leaf or the formation
// files — which import {@link unsupportedRelation} — would close a cycle
// through `SetRules.ts` and evaluate before their own formations exist.
import type { DancerId } from "@caller/choreo";
import type { DancerState, SetModel, Slot } from "./SetModel.js";

/**
 * Relations: who "partner", "neighbor" and the rest name, from where you stand.
 *
 * A relation is a **signed offset on the set's lattice**, derived live, never
 * stored (`vision.md` §"Set state"). Which offset it is depends on the
 * formation — becket and duple improper disagree about what is "across" from
 * the same slot, which is Q1's trap — so the offsets live in a
 * {@link RelationTable} each formation supplies and this module only reads.
 *
 * **M1 builds `partner` and `neighbor` (N1) and nothing else.** Every other
 * relation the corpus uses *parses* here, so a dance record or a transcript can
 * name it and the failure is a clear, milestone-named one rather than a typo;
 * {@link relate} throws `unsupported: <word> (M6)` until M6 fills the table in.
 */

/** One relation, parsed. */
export type Relation =
  | { kind: "partner" }
  | { kind: "neighbor"; k: number }
  | { kind: "shadow"; k: number }
  | { kind: "opposite" }
  | { kind: "self" };

/**
 * The offsets one formation's relations are: given a relation and the dancer
 * asking, which slot does it point at?
 *
 * A table throws `unsupported: <word> (M6)` for a relation it has not built,
 * and returns a slot — occupied or not — for one it has. Whether anybody is
 * *standing* on that slot is {@link relate}'s question, not the table's: at the
 * end of a line the answer is legitimately nobody.
 */
export interface RelationTable {
  /** The formation this table belongs to. */
  id: string;
  slotFor(rel: Relation, from: DancerState): Slot;
}

/**
 * The relation a dance record's word names.
 *
 * The words are the corpus's own: `partner`, `neighbor` (or `neighbour`), `N0`
 * … `N9` with N1 the current neighbour and N0 the previous one, `shadow`, `S0`
 * … `S9`, `opposite`, and `self` for a figure that names nobody. Plural forms
 * are accepted because `Selector` already uses them (`who: "partners"`).
 */
export function parseRelation(word: string): Relation {
  const w = word.trim().toLowerCase();
  if (w === "partner" || w === "partners") return { kind: "partner" };
  if (w === "neighbor" || w === "neighbour" || w === "neighbors" || w === "neighbours") {
    return { kind: "neighbor", k: 1 };
  }
  if (w === "shadow" || w === "shadows") return { kind: "shadow", k: 1 };
  if (w === "opposite" || w === "opposites") return { kind: "opposite" };
  if (w === "self") return { kind: "self" };
  const indexed = /^([ns])(\d+)$/.exec(w);
  if (indexed) {
    const k = Number(indexed[2]);
    return indexed[1] === "n" ? { kind: "neighbor", k } : { kind: "shadow", k };
  }
  throw new Error(`not a relation: "${word}"`);
}

/** Whether this word is a relation at all — for a `who` that may be a tag instead. */
export function isRelationWord(word: string): boolean {
  try {
    parseRelation(word);
    return true;
  } catch {
    return false;
  }
}

/** How a relation is written in a dance record: {@link parseRelation}'s inverse. */
export function relationWord(rel: Relation): string {
  switch (rel.kind) {
    case "partner":
      return "partner";
    case "neighbor":
      return rel.k === 1 ? "neighbor" : `N${String(rel.k)}`;
    case "shadow":
      return rel.k === 1 ? "shadow" : `S${String(rel.k)}`;
    case "opposite":
      return "opposite";
    case "self":
      return "self";
  }
}

/**
 * Who this relation names, or `undefined` when nobody stands there.
 *
 * `undefined` is an ordinary answer, not a failure: at the end of a line the
 * slot a neighbour offset points at is off the end of the set, and the
 * end-effects policy (M6) is what decides what to do about it. A relation the
 * formation's table has not built throws instead, naming the milestone that
 * owns it.
 */
export function relate(
  model: SetModel,
  table: RelationTable,
  me: DancerId,
  rel: Relation,
): DancerId | undefined {
  const from = model.dancers[me];
  if (!from) throw new Error(`set "${model.id}" has no dancer "${me}"`);
  if (rel.kind === "self") return me;
  const slot = table.slotFor(rel, from);
  for (const dancer of Object.values(model.dancers)) {
    if (dancer.slot.line === slot.line && dancer.slot.position === slot.position) return dancer.id;
  }
  return undefined;
}

/**
 * The error a {@link RelationTable} throws for a relation it has not built.
 *
 * One phrasing, in one place, so the list of what is still owed reads the same
 * everywhere and `acceptance.test.ts` can assert on it.
 */
export const unsupportedRelation = (rel: Relation, milestone: string): Error =>
  new Error(`unsupported: ${relationWord(rel)} (${milestone})`);
