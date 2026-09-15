import type { Vec2 } from "@caller/core";
import type { CoupleState, Dance, DancerId, Formation, RoleName, SetState } from "@caller/choreo";
import { localPoint } from "@caller/choreo";
import type { Relation } from "./relations.js";
import { relate } from "./relations.js";
import type { DancerState, SetModel, Slot } from "./SetModel.js";
import { homeOf, latticePartner } from "./SetModel.js";
import { setRulesOf } from "./SetRules.js";

/**
 * **The lattice, as the thing that moves**: where a slot is, which slots are
 * occupied, what one time through does to every dancer's slot, and how a
 * `SetState` is read back off the answer (Q14).
 *
 * M1 built the lattice as a *reading* — `slotOf` turns the hall's seating into
 * slots and `homeAt` turns a slot into a point. M6 makes it the truth the other
 * way round: a progression is a **per-role integer shift of each dancer's slot
 * position along the set**, the set's own seating is derived from where that
 * leaves everybody, and the formation's `Progression.next` becomes a second
 * opinion the tests hold this one against rather than the thing that decides.
 *
 * ## Why a shift per role, and not per couple
 *
 * Almost every contra progresses both roles the same way and a couple stays a
 * couple, which is why `CoupleState.place` has been enough until now. Cary
 * Ravitz's Contrablend does not: its two roll-aways progress the larks one
 * place and the robins three, so a lark ends the time through beside a robin
 * who is not the one they started with — the transcript's own "(new partner)".
 * A couple cannot hold two places, so the shift is per **dancer**, keyed by
 * role, and the couples are re-formed afterwards from who ends up across the
 * set from whom.
 *
 * ## A7, answered: `CoupleState` is unchanged and the lattice carries the truth
 *
 * The alternative the plan left open was to widen `CoupleState` with a place
 * per role. It is not taken, for three reasons: `CoupleState` is
 * `@caller/choreo`'s, and a form-neutral type gaining a contra shape is exactly
 * what AC7 forbids; everything that reads a couple (`groupsFor`, `wait-out`,
 * `lineUpShiftOf`, the hall's seating) wants one place and would have to choose
 * one anyway; and a role-asymmetric progression is not a couple in two places,
 * it is a **new couple**, which is what {@link setFromModel} builds. So a
 * couple's place is the place both its dancers stand at once — after the
 * re-pairing, always true — and `lineUpShiftOf` keeps reading
 * `Formation.progression`, which is untouched.
 */

/** How far each role progresses in one time through, in dancing places. */
export type RoleShift = Readonly<Record<RoleName, number>>;

/**
 * The progression a dance declares, or the single one.
 *
 * `Dance` is `@caller/choreo`'s and knows nothing about roles or progressions;
 * a contra dance carries its own on the object (`figures/chain.ts`'s
 * `ContraDance`), and this is the one place that reads it.
 */
export const progressionOf = (dance: Dance): RoleShift =>
  (dance as { progression?: Readonly<Record<string, number>> }).progression ?? SINGLE_PROGRESSION;

/** The ordinary contra progression: everybody one position the way they travel. */
export const SINGLE_PROGRESSION: RoleShift = { lark: 1, robin: 1 };

/** How far this role shifts, defaulting to a single progression. */
export const shiftFor = (shift: RoleShift, role: RoleName): number => shift[role] ?? 1;

/** The lowest and highest position anybody stands on, per line. */
export interface LatticeSpan {
  /** By `Slot.line`; `undefined` for a line nobody stands on. */
  line: Readonly<Record<number, { lowest: number; highest: number }>>;
  lowest: number;
  highest: number;
}

/**
 * How far the occupied lattice reaches.
 *
 * Read from the dancers rather than from `SetModel.positions`, which is the
 * *span* (highest minus lowest plus one) and says nothing about where the span
 * sits — settled here rather than redefined, because `positions` is what M1
 * built, nothing reads it for arithmetic, and a count is a poor thing to do
 * arithmetic with. `plan.md`'s parenthetical "2 × couples for improper" matches
 * neither formation and is not what either lattice does.
 */
export function latticeSpan(model: SetModel): LatticeSpan {
  const line: Record<number, { lowest: number; highest: number }> = {};
  let lowest = Infinity;
  let highest = -Infinity;
  for (const dancer of Object.values(model.dancers)) {
    const { line: l, position } = dancer.slot;
    const seen = line[l];
    line[l] =
      seen === undefined
        ? { lowest: position, highest: position }
        : { lowest: Math.min(seen.lowest, position), highest: Math.max(seen.highest, position) };
    lowest = Math.min(lowest, position);
    highest = Math.max(highest, position);
  }
  return { line, lowest, highest };
}

/**
 * **One time through, on the slots**: every dancer's position moves by their
 * own role's shift, and anybody that would take off the end of their line
 * crosses the set instead.
 *
 * The crossing is the end effect every contra has and nobody writes down. A
 * duple improper couple that runs out of line below the bottom turns around and
 * comes back up the other line, which on the lattice is exactly "keep your
 * position, change the line you are on" — because a dancer's line is their role
 * *and* their direction of travel together, so flipping the travel flips the
 * line. A becket line's end does the same thing one couple place further over.
 * Written once here, it is the same rule for both formations and for a shift of
 * any size.
 *
 * Returns a **new model**; nothing is mutated. Holds are dropped (a progression
 * happens between figures, hands down) and each dancer's `partner` binding is
 * re-read from the lattice, which is what makes Contrablend's rebinding stick:
 * the shadow the roll-away bound you to is the dancer the shift leaves across
 * the set from you.
 */
export function progressModel(model: SetModel, shift: RoleShift = SINGLE_PROGRESSION): SetModel {
  const span = latticeSpan(model);
  const { relations, lattice } = setRulesOf(model.formation);
  const dancers: Record<DancerId, DancerState> = {};
  for (const dancer of Object.values(model.dancers)) {
    const steps = shiftFor(shift, dancer.role) * lattice.progressionStep * dancer.travel;
    const target = dancer.slot.position + steps;
    const reach = span.line[dancer.slot.line];
    const offTheEnd = reach === undefined || target < reach.lowest || target > reach.highest;
    dancers[dancer.id] = offTheEnd
      ? { ...dancer, ...crossOver(lattice, dancer), holds: {} }
      : { ...dancer, slot: { ...dancer.slot, position: target }, holds: {} };
  }
  const next: SetModel = { ...model, dancers };
  for (const dancer of Object.values(dancers)) {
    dancer.partner = latticePartner(next, relations, dancer.id) ?? dancer.id;
  }
  return next;
}

/**
 * A dancer who has run out of line: they turn round and come back on the other
 * line, keeping their dancing place.
 *
 * Written through the lattice's own two halves rather than by flipping the line
 * by hand — `placeOf` says which place and direction this slot is, the
 * direction is turned round, and `slotOf` says which slot that is — so a
 * formation whose two lines number a couple's dancers differently (becket does:
 * the lark leads on one line and the robin on the other) crosses correctly with
 * nothing written here about it.
 */
function crossOver(
  lattice: { slotOf: (couple: CoupleState, role: RoleName) => Slot; placeOf: SetLatticePlaceOf },
  dancer: DancerState,
): { slot: Slot; travel: 1 | -1 } {
  const { place, direction } = lattice.placeOf(dancer.slot, dancer.role, dancer.travel);
  const travel: 1 | -1 = direction === 1 ? -1 : 1;
  const couple: CoupleState = { id: "", dancers: {}, place, direction: travel };
  return { slot: lattice.slotOf(couple, dancer.role), travel };
}

/** `SetLattice.placeOf`, named so {@link crossOver} can ask for just the two halves it uses. */
type SetLatticePlaceOf = (
  slot: Slot,
  role: RoleName,
  travel: 1 | -1,
) => { place: number; direction: 1 | -1 };

/**
 * The hall's seating, read back off the model: who is a couple now, where they
 * stand and which way they travel.
 *
 * This is the half of Q14 that lets the rest of the engine carry on unchanged.
 * Everything between dances — `groupsFor`, the two outs, `wait-out`'s crossing,
 * `lineUpShiftOf`, the caller's line-up — reads a `SetState`, and the model is
 * what knows where a role-asymmetric progression really left people.
 *
 * A couple is a lark and a robin whose slots the formation reads as the same
 * dancing place (`SetLattice.placeOf`, the inverse of `slotOf`). Its id is the
 * **lark's own** couple id from `previous` — unique, because each lark is in
 * exactly one couple, and unchanged for a set that keeps its partners, which is
 * every dance but Contrablend. `crossedOver` is not set here: a crossing is a
 * fact about the *move*, so {@link progressSet} sets it from the slots that
 * changed line.
 */
export function setFromModel(model: SetModel, previous: SetState): SetState {
  const { lattice } = setRulesOf(model.formation);
  const was = new Map<DancerId, CoupleState>();
  for (const couple of previous.couples) {
    for (const dancer of Object.values(couple.dancers)) was.set(dancer, couple);
  }

  /** By `<place>/<direction>`: the dancers the formation reads as one couple. */
  const byPlace = new Map<string, { place: number; direction: 1 | -1; who: DancerState[] }>();
  for (const dancer of Object.values(model.dancers)) {
    const { place, direction } = lattice.placeOf(dancer.slot, dancer.role, dancer.travel);
    const key = `${String(place)}/${String(direction)}`;
    const seen = byPlace.get(key);
    if (seen) seen.who.push(dancer);
    else byPlace.set(key, { place, direction, who: [dancer] });
  }

  const couples: CoupleState[] = [];
  for (const { place, direction, who } of byPlace.values()) {
    const dancersOf: Record<RoleName, DancerId> = {};
    for (const dancer of who) {
      const taken = dancersOf[dancer.role];
      if (taken !== undefined) {
        throw new Error(
          `set "${model.id}" has two ${dancer.role}s at place ${String(place)}: ` +
            `${taken} and ${dancer.id}`,
        );
      }
      dancersOf[dancer.role] = dancer.id;
    }
    const lark = dancersOf["lark"];
    const carried = lark === undefined ? undefined : was.get(lark)?.id;
    couples.push({
      id: carried ?? `${model.id}/p${String(place)}`,
      dancers: dancersOf,
      place,
      direction,
    });
  }
  return { ...previous, couples: couples.sort((a, b) => a.place - b.place) };
}

/**
 * **One time through, on the hall**: the seating a dance's own progression
 * leaves behind.
 *
 * Two paths, and which one is taken is a fact about the dance rather than a
 * preference:
 *
 * - **Every role shifts the same whole number of places** — every dance in the
 *   corpus but Contrablend, and every dance in the demo programme — and the
 *   answer is the formation's own `Progression.next`, applied once per
 *   progression. That is the answer every golden, strip and plate in the
 *   repository was measured against, and a shift of one is exactly today's.
 *   {@link progressModel} reproduces it on the slots for duple improper at
 *   every line length for eight times through (`lattice.test.ts`), which is
 *   what makes the slot rule *the* rule rather than a second opinion.
 * - **The roles shift differently** — Contrablend's larks one place and robins
 *   three — and no formation's `Progression.next` can answer, because a couple
 *   has one place and these two dancers do not end on one. The slots are
 *   shifted and the seating is read back off them ({@link setFromModel}), which
 *   re-pairs the set: the lark's new partner is whoever the shift leaves across
 *   the set from them, and that is the dancer their *shadow* row already named.
 *
 * **The asymmetric path is guarded rather than trusted.** Before using it, the
 * slot rule is checked against this very formation's own `Progression.next` for
 * a single progression on this very set; a formation where the two disagree
 * refuses by name. Becket disagrees, and for a reason worth recording: a becket
 * line has **two different end effects** — a couple at a waiting place re-enters
 * the line one dancing place along, and an odd line's top couple crosses
 * straight over in place — and they are not one rule on the slots. Nothing in
 * the acceptance set asks for a role-asymmetric becket progression; M9's triple
 * progression (The Set Monster) is uniform, so it takes the first path.
 *
 * `crossedOver` is deliberately **not** set by the slot path. It means "the
 * shift that carries this couple should bring them across rather than along",
 * which only becket's own slide reads and only becket's own progression sets; a
 * duple improper couple that crosses at an end is a couple standing out, and
 * `wait-out`'s own `cross` is what walks it over.
 */
export function progressSet(
  formation: Formation,
  model: SetModel,
  set: SetState,
  shift: RoleShift = SINGLE_PROGRESSION,
): SetState {
  const roles = new Set(Object.values(model.dancers).map((d) => d.role));
  const each = [...roles].map((role) => shiftFor(shift, role));
  const uniform = each.every((n) => n === each[0]);
  if (uniform) {
    const times = each[0] ?? 1;
    if (!Number.isInteger(times) || times < 0) {
      throw new Error(`a progression is a whole number of places, not ${String(times)}`);
    }
    let out = set;
    for (let i = 0; i < times; i++) out = formation.progression.next(out);
    return out;
  }
  const bySlots = setFromModel(progressModel(model, SINGLE_PROGRESSION), set);
  const byFormation = formation.progression.next(set);
  if (seatingOf(bySlots) !== seatingOf(byFormation)) {
    throw new Error(
      `unsupported: a role-asymmetric progression in "${formation.id}", whose own end effects ` +
        `the lattice shift does not reproduce (M9)`,
    );
  }
  return setFromModel(progressModel(model, shift), set);
}

/** A set's seating as one comparable string: who is a couple, where, travelling which way. */
const seatingOf = (set: SetState): string =>
  [...set.couples]
    .sort((a, b) => a.place - b.place)
    .map(
      (c) =>
        `${String(c.place)}/${String(c.direction)}:` +
        Object.entries(c.dancers)
          .sort()
          .map(([role, id]) => `${role}=${id}`)
          .join(","),
    )
    .join(" ");

/**
 * Where every dancer of the set calls home, in the axes of `frame`.
 *
 * What a whole-set call hands a gatherer as `params.places`: the lane's own
 * points, so a figure that settles picks the ones that suit it whoever's they
 * are (`library/kinds/places.ts`).
 */
export function lanePlaces(model: SetModel, frame: SetModel["frame"]): Vec2[] {
  return Object.values(model.dancers).map((dancer) =>
    localPoint(frame, homeOf(model, dancer.id).p),
  );
}

/** Whether this relation ever names somebody outside the asking dancer's own minor set. */
export const relationLeavesTheFour = (rel: Relation): boolean =>
  !(
    rel.kind === "self" ||
    rel.kind === "partner" ||
    rel.kind === "opposite" ||
    (rel.kind === "neighbor" && rel.k === 1)
  );

/** Who this relation names for each dancer of the model, skipping the ones it leaves out. */
export function relatedPairs(
  model: SetModel,
  rel: Relation,
  among: ReadonlySet<DancerId>,
): Array<[DancerId, DancerId]> {
  const { relations } = setRulesOf(model.formation);
  const done = new Set<DancerId>();
  const out: Array<[DancerId, DancerId]> = [];
  for (const dancer of Object.values(model.dancers)) {
    if (!among.has(dancer.id) || done.has(dancer.id)) continue;
    const other = relate(model, relations, dancer.id, rel);
    if (other === undefined || !among.has(other) || done.has(other)) continue;
    done.add(dancer.id);
    done.add(other);
    out.push([dancer.id, other]);
  }
  return out;
}
