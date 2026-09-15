// Types only, both ways: `SetModel.ts` calls {@link relate} to fill in each
// dancer's partner binding, so this module has to stay a leaf or the formation
// files — which import {@link unsupportedRelation} — would close a cycle
// through `SetRules.ts` and evaluate before their own formations exist.
import type { DancerId } from "@caller/choreo";
import type { DancerState, SetModel, Slot } from "./SetModel.js";
import type { LatticeSpan } from "./span.js";
import { latticeSpan } from "./span.js";

/**
 * Relations: who "partner", "neighbor" and the rest name, from where you stand.
 *
 * A relation is a **signed offset on the set's lattice**, derived live, never
 * stored (`vision.md` §"Set state"). Which offset it is depends on the
 * formation — becket and duple improper disagree about what is "across" from
 * the same slot, which is Q1's trap — so the offsets live in a
 * {@link RelationTable} each formation supplies and this module only reads.
 *
 * **M1 built `partner` and `neighbor` (N1); M6 fills the table in.** Every
 * relation the corpus uses now resolves in both contra formations — N0…Nk,
 * shadow k, opposite — with trail buddy and the corners written as rows nothing
 * calls yet (see each formation's own table for how far each row is evidenced).
 *
 * A relation is still allowed to answer **nobody**: at the end of a line the
 * slot an offset points at is off the end of the set, and M6's end-of-set rule
 * is the simplest one there is — the dancer that happens to leaves that call on
 * hold-place, and `pnpm dance` prints an end-effects table saying so.
 */

/** One relation, parsed. */
export type Relation =
  | { kind: "partner" }
  | { kind: "neighbor"; k: number }
  | { kind: "shadow"; k: number }
  | { kind: "opposite" }
  | { kind: "trail-buddy"; k: number }
  | { kind: "corner"; k: number }
  | { kind: "self" };

/**
 * The offsets one formation's relations are: given a relation and the dancer
 * asking, which slot does it point at?
 *
 * A table throws `unsupported: <word> (M6)` for a relation it has not built,
 * and returns a slot — occupied or not — for one it has. Whether anybody is
 * *standing* on that slot is {@link relate}'s question, not the table's: at the
 * end of a line the answer is legitimately nobody.
 *
 * **`span` is the third argument M8b had to add, and becket is why.** An offset
 * alone cannot say who your `N2` is, because a set has *ends*: the couple you
 * will face next time through may be one that is standing out at the far end of
 * the line right now, having run off one end of its own line and come back on
 * the other. Where those ends are is a fact about the occupied lattice, not
 * about the asking dancer, so the table is handed it. Duple improper's rows
 * ignore it (see that table's own note, and this milestone's report, for what
 * that costs); becket's are written in terms of its own loop.
 *
 * **A table may answer `undefined`**, which means "this relation names nobody
 * for this dancer", and is not the same as "the slot it names is empty". A
 * becket couple standing out at an end really has no neighbour, and the slot
 * arithmetic would otherwise point back at their own partner.
 */
export interface RelationTable {
  /** The formation this table belongs to. */
  id: string;
  slotFor(rel: Relation, from: DancerState, span: LatticeSpan): Slot | undefined;
}

/**
 * The relation a dance record's word names.
 *
 * The words are the corpus's own: `partner`, `neighbor` (or `neighbour`), `N0`
 * … `N9` with N1 the current neighbour and N0 the previous one, `shadow`, `S0`
 * … `S9`, `opposite`, `trail-buddy` (`T1`…`T9`), `corner` (`C1`…`C9`), and
 * `self` for a figure that names nobody. Plural forms are accepted because
 * `Selector` already uses them (`who: "partners"`).
 */
export function parseRelation(word: string): Relation {
  const w = word.trim().toLowerCase();
  if (w === "partner" || w === "partners") return { kind: "partner" };
  if (w === "neighbor" || w === "neighbour" || w === "neighbors" || w === "neighbours") {
    return { kind: "neighbor", k: 1 };
  }
  if (w === "shadow" || w === "shadows") return { kind: "shadow", k: 1 };
  if (w === "opposite" || w === "opposites") return { kind: "opposite" };
  if (w === "trail-buddy" || w === "trail buddy" || w === "trail-buddies") {
    return { kind: "trail-buddy", k: 1 };
  }
  if (w === "corner" || w === "corners") return { kind: "corner", k: 1 };
  if (w === "self") return { kind: "self" };
  const indexed = /^([nstc])(\d+)$/.exec(w);
  if (indexed) {
    const k = Number(indexed[2]);
    if (indexed[1] === "n") return { kind: "neighbor", k };
    if (indexed[1] === "s") return { kind: "shadow", k };
    if (indexed[1] === "t") return { kind: "trail-buddy", k };
    return { kind: "corner", k };
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
    case "trail-buddy":
      return rel.k === 1 ? "trail-buddy" : `T${String(rel.k)}`;
    case "corner":
      return rel.k === 1 ? "corner" : `C${String(rel.k)}`;
    case "self":
      return "self";
  }
}

/**
 * Whether this relation is **its own inverse**: if it names you somebody, it
 * names them you.
 *
 * Only a symmetric relation can pair a set up (`actors: "pairs"`), because a
 * pairing has to agree from both ends. `partner`, `neighbor k`, `shadow k` and
 * `opposite` are symmetric in both contra formations — the tables are written
 * so that they are, and `relations.test.ts` checks it dancer by dancer over a
 * six-couple set at every round.
 *
 * `trail-buddy` is **directional** — the buddy you follow is not the buddy who
 * follows you — so it selects actors and never pairs them.
 *
 * **`corner` was directional until M7 and is not.** M6 wrote the row as a
 * placeholder and kept it out of every pairing on that assumption; M7 gave both
 * formations the real rule — your first corner is the dancer of the other couple
 * diagonally across the set, your second the one straight along your own line —
 * and both are offsets in the asking dancer's own `travel`, which is what makes
 * them their own inverse. `relations.test.ts` and `proper.test.ts` check it
 * dancer by dancer, and Chorus Jig's cast off is a pairing on `C2`.
 */
export const isSymmetricRelation = (rel: Relation): boolean => rel.kind !== "trail-buddy";

/**
 * Who this relation names, or `undefined` when nobody stands there.
 *
 * `undefined` is an ordinary answer, not a failure: at the end of a line the
 * slot a neighbour offset points at is off the end of the set, and M6's
 * end-of-set rule is simply that the dancer it leaves out dances hold-place for
 * that call. A relation the formation's table has not built throws instead,
 * naming the milestone that owns it.
 *
 * **`partner` is the one relation that is not an offset.** It is a *binding* on
 * the dancer (`DancerState.partner`), which a figure's ends may rebind —
 * Contrablend's shadow roll-away leaves you with a new partner half way through
 * the dance, and every "partner" call after it has to mean the new one. The
 * binding is seeded from the lattice offset when a model is built and re-seeded
 * from it at every progression, so the two agree everywhere nothing has rebound
 * anything, which is every dance but Contrablend.
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
  if (rel.kind === "partner") return from.partner === me ? undefined : from.partner;
  const slot = table.slotFor(rel, from, latticeSpan(model));
  if (slot === undefined) return undefined;
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
