import type {
  CoupleState,
  DancerId,
  Formation,
  Frame,
  GroupPlan,
  GroupSelector,
  RoleName,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "@caller/choreo";
import { HANDS_FOUR_GROUP, HOLD_SPACING_PX, frame, framePoint } from "@caller/choreo";
import { CONTRA_ROLES } from "../roles.js";
import type { RelationTable } from "../set/relations.js";
import type { SetLattice } from "../set/SetModel.js";
import { ACROSS_PX, PLACE_PITCH_PX, partitionDupleImproper, partnerSide } from "./dupleImproper.js";

/**
 * **Proper**: two long lines, every lark in one line and every robin in the
 * other, all the way down the hall and all the way through the dance.
 *
 * The third contra formation, and the one Chorus Jig is in. It is duple
 * improper's seating with one thing taken away — the alternation — and that one
 * thing changes three of the four contra facts a formation contributes:
 *
 * - **Which line you are on is your role**, not your role and your direction of
 *   travel together. So `slotOf` is two-to-one on (slot, role) and `placeOf`
 *   needs the `travel` argument M7 added to {@link SetLattice} (see its doc).
 * - **Your neighbour is diagonal.** In duple improper the couple you are
 *   dancing with is along your own line; here it is across the set *and* along
 *   it, because the other-role dancer of the other couple stands on the other
 *   line. That is the same trap `vision.md` Q1 names for becket, in a third
 *   formation, and the reason the relation table is the formation's.
 * - **A waiting couple does not cross.** Improper's end effect is "turn round
 *   and come back on the other line"; proper's is "turn round", full stop,
 *   because coming back on the other line would put a lark in the robins'.
 *   A proper dance writes `"waitOut": { "cross": false }` and the wait group's
 *   frame is never reversed.
 *
 * Everything else — hands four from the top, the ones travelling down and the
 * twos up, one couple place per position, the progression trading places inside
 * a minor set — is duple improper's, and is reused from it rather than retyped.
 */

/** Down the hall in frame-local degrees; the ones face this way. */
const DOWN = 90;
/** Up the hall in frame-local degrees; the twos face this way. */
const UP = 270;

const HALF_ACROSS = ACROSS_PX / 2;
const HALF_ALONG = PLACE_PITCH_PX / 2;

/**
 * The larks' line is `line: 0`, at `−x`.
 *
 * Because that is what "larks on the left" means here. A dancer facing up the
 * hall (270°) has their left hand toward `−x` — `dirOf(270 − 90)` is `[−1, 0]` —
 * and a proper set is lined up facing up the hall toward the band, so the larks'
 * side is the `−x` one. Improper's `+x` line is not a counterexample: there a
 * line is a role *and* a direction, and its `line: 1` holds the one-lark and the
 * two-robin together.
 */
const LARK_LINE = 0;

/** The four stations of a minor set: ones at the top, twos below, larks at `−x`. */
export const PROPER_STATIONS: readonly Station[] = [
  { id: "1L", role: "lark", facing: DOWN, p: [-HALF_ACROSS, -HALF_ALONG] },
  { id: "1R", role: "robin", facing: DOWN, p: [HALF_ACROSS, -HALF_ALONG] },
  { id: "2L", role: "lark", facing: UP, p: [-HALF_ACROSS, HALF_ALONG] },
  { id: "2R", role: "robin", facing: UP, p: [HALF_ACROSS, HALF_ALONG] },
];

/**
 * A waiting couple's two stations: facing each other across the set, the lark
 * still on the larks' line.
 *
 * Improper's pair of wait stations is the same two points, and improper's
 * `groupsFor` turns the *frame* end for end for the couple waiting at the
 * bottom so that the crossing comes out right. Proper does not turn it, because
 * proper has no crossing: the couple waits, turns round where it stands, and
 * comes back in on its own side.
 */
export const PROPER_WAIT_STATIONS: readonly Station[] = [
  { id: "WL", role: "lark", facing: 0, p: [-HALF_ACROSS, 0] },
  { id: "WR", role: "robin", facing: 180, p: [HALF_ACROSS, 0] },
];

/**
 * What the caller says to line a hall up proper.
 *
 * Improper's second bubble — "robins on the right, larks on the left" — is a
 * *within the couple* instruction and is true here as well; what proper adds is
 * the sentence that keeps it true for the whole dance.
 */
export const PROPER_LINE_UP_CALLS: readonly string[] = [
  "TAKE HANDS FOUR FROM THE TOP",
  "LARKS IN ONE LINE, ROBINS IN THE OTHER",
  "NOBODY CROSSES OVER: STAY ON YOUR OWN SIDE",
];

/**
 * How a proper dance's walkthrough opens — a draft for the gate (A27).
 *
 * The same shape as the other two: the hold, then where each role stands, then
 * which way each of them looks. "Stay on your own side" is what a caller
 * actually says and is the one thing a proper dance has to establish, so it is
 * said as a thing to do — you keep your own side — rather than as a thing to
 * avoid.
 */
export const properWalkthroughOpening = (): { line: string; hint?: string } => ({
  line:
    "Take hands four from the top. Larks in one line, robins in the other, " +
    "facing your partner across the set. Keep your own side all the way through.",
  hint: "Your partner is across from you. Your neighbor is beside you.",
});

const dancerOn = (couple: CoupleState, role: string): DancerId => {
  const dancer = couple.dancers[role];
  if (dancer === undefined) throw new Error(`couple "${couple.id}" has no ${role}`);
  return dancer;
};

const at = (set: SetState, place: number): Frame =>
  frame(framePoint(set.frame, [0, place * set.pitch]), set.frame.axis, set.frame.spacing);

/**
 * A selector proper does not know is an error, not an empty group: proper
 * defines only the hands four, because no proper dance in the acceptance set
 * calls anything else and a selector nobody has built should say so.
 */
function onlyHandsFour(selector: GroupSelector): void {
  if (selector === HANDS_FOUR_GROUP) return;
  throw new Error(`proper has no group selector "${selector}" (has: "${HANDS_FOUR_GROUP}")`);
}

/** Proper: larks in one line, robins in the other, for the whole dance. */
export const PROPER: Formation = {
  id: "proper",
  roleSet: CONTRA_ROLES,
  lineUpCalls: PROPER_LINE_UP_CALLS,
  walkthroughOpening: properWalkthroughOpening,
  hallPitch: PLACE_PITCH_PX * 2,

  group(n: number): Station[] {
    if (n === 4) return PROPER_STATIONS.map((s) => ({ ...s }));
    if (n === 2) return PROPER_WAIT_STATIONS.map((s) => ({ ...s }));
    throw new Error(`proper dances in fours, or waits in twos, not ${String(n)}`);
  },

  groupFor(selector: GroupSelector): Station[] {
    onlyHandsFour(selector);
    return PROPER_STATIONS.map((s) => ({ ...s }));
  },

  groupsFor(selector: GroupSelector, set: SetState): GroupPlan[] {
    onlyHandsFour(selector);
    return partitionDupleImproper(set).map((part): GroupPlan => {
      if (part.kind === "set") {
        const [ones, twos] = part.couples as [CoupleState, CoupleState];
        return {
          id: `${set.id}/p${String(ones.place)}`,
          kind: "set",
          frame: at(set, (ones.place + twos.place) / 2),
          stations: PROPER_STATIONS.map((s) => ({ ...s })),
          members: {
            "1L": dancerOn(ones, "lark"),
            "1R": dancerOn(ones, "robin"),
            "2L": dancerOn(twos, "lark"),
            "2R": dancerOn(twos, "robin"),
          },
          couples: [ones.id, twos.id],
        };
      }
      const couple = part.couples[0]!;
      return {
        id: `${set.id}/w${String(couple.place)}`,
        kind: part.kind,
        // Never reversed: see {@link PROPER_WAIT_STATIONS}.
        frame: at(set, couple.place),
        stations: PROPER_WAIT_STATIONS.map((s) => ({ ...s })),
        members: { WL: dancerOn(couple, "lark"), WR: dancerOn(couple, "robin") },
        couples: [couple.id],
      };
    });
  },

  progression: {
    // Duple improper's, exactly: a minor set's two couples trade places and a
    // couple standing out turns round. What differs between the formations is
    // where a *dancer* stands at a place, which is the lattice's business.
    next(set: SetState): SetState {
      const couples: CoupleState[] = [];
      for (const part of partitionDupleImproper(set)) {
        if (part.kind === "set") {
          const [ones, twos] = part.couples as [CoupleState, CoupleState];
          couples.push({ ...ones, place: twos.place });
          couples.push({ ...twos, place: ones.place });
        } else {
          const couple = part.couples[0]!;
          couples.push({ ...couple, direction: couple.direction === 1 ? -1 : 1 });
        }
      }
      return { ...set, couples: couples.sort((a, b) => a.place - b.place) };
    },
  },

  start(spec: SetSpec): SetState {
    if (spec.couples < 2) {
      throw new Error(`a line needs at least two couples, not ${String(spec.couples)}`);
    }
    const couples: CoupleState[] = [];
    for (let i = 0; i < spec.couples; i++) {
      couples.push({
        id: `${spec.id}/c${String(i)}`,
        dancers: { lark: `${spec.id}/c${String(i)}/lark`, robin: `${spec.id}/c${String(i)}/robin` },
        place: i,
        direction: i % 2 === 0 ? 1 : -1,
      });
    }
    return {
      id: spec.id,
      frame: frame(spec.centre, spec.axis, HOLD_SPACING_PX),
      pitch: PLACE_PITCH_PX,
      couples,
    };
  },

  tags(selector: GroupSelector): Record<string, StationId[]> {
    onlyHandsFour(selector);
    const all = PROPER_STATIONS.map((s) => s.id);
    return {
      all,
      larks: ["1L", "2L"],
      robins: ["1R", "2R"],
      ones: ["1L", "1R"],
      twos: ["2L", "2R"],
      neighbors: all,
      partners: all,
    };
  },
};

/**
 * Proper on the set's own lattice.
 *
 * One `position` per couple place, one `line` per role: `line: 0` is the larks'
 * and `line: 1` the robins'. A dancer's line is therefore simply their role,
 * which is what proper means and what makes this lattice different from the
 * other two in exactly one way — see {@link SetLattice.placeOf}'s `travel`.
 */
export const PROPER_LATTICE: SetLattice = {
  id: "proper",
  pitch: PLACE_PITCH_PX,
  // A proper couple trades places with the couple it is dancing with, which is
  // one place the way it travels: one position per unit of travel, as improper.
  progressionStep: 1,
  slotOf(couple: CoupleState, role: RoleName) {
    return { line: role === "lark" ? LARK_LINE : 1, position: couple.place };
  },
  placeOf(slot, _role: RoleName, travel: 1 | -1) {
    return { place: slot.position, direction: travel };
  },
  homeAt(slot, travel) {
    return {
      p: [slot.line === LARK_LINE ? -HALF_ACROSS : HALF_ACROSS, slot.position * PLACE_PITCH_PX],
      facing: travel === 1 ? DOWN : UP,
    };
  },
};

/**
 * Proper's relations, as offsets on the lattice (Q1).
 *
 * Read against duple improper's, whose rows these are all derived from by
 * moving the alternation out of the lines and into the roles:
 *
 * - **Partner** and **opposite** are the other line at the same position, as in
 *   improper: you stand across the set from your partner either way.
 * - **Neighbour k** is the other line at `position + (2k − 1) × travel` — the
 *   one row that really differs. In improper the couple you are dancing with is
 *   along your own line, because the lines alternate; in proper the other-role
 *   dancer of that couple is across the set **and** along it, so a neighbour is
 *   the diagonal. Still its own inverse, because the dancer it names travels the
 *   other way.
 * - **Shadow k** is the opposite-role dancer who progresses the way you do,
 *   `2k` places along on the other line, on the opposite side of you from your
 *   partner — the same offset improper uses, with {@link partnerSide} making it
 *   its own inverse. Nothing in the acceptance set calls a shadow in a proper
 *   set; the row is here so the table is complete. **(unsure)**
 * - **Trail buddy k** is the same-role dancer `k` couple places ahead of you,
 *   which in proper is your own line. **(unsure)**
 * - **Corner k** is the geometric rule, and it is the *same sentence* in both
 *   contra formations: your **first** corner is the dancer of the other couple
 *   diagonally across the set, and your **second** is the one straight along
 *   your own line. In proper that makes your first corner your neighbour and
 *   your second the same-role dancer of the other couple, which is what Chorus
 *   Jig's contra corners dances (M7).
 */
export const PROPER_RELATIONS: RelationTable = {
  id: "proper",
  slotFor(rel, from) {
    const { line, position } = from.slot;
    const other = line === 1 ? 0 : 1;
    const t = from.travel;
    switch (rel.kind) {
      case "partner":
      case "opposite":
        return { line: other, position };
      case "neighbor":
        return { line: other, position: position + (2 * rel.k - 1) * t };
      case "shadow":
        return { line: other, position: position - partnerSide(from.role) * 2 * rel.k * t };
      case "trail-buddy":
        return { line, position: position + 2 * rel.k * t };
      case "corner":
        return rel.k === 1
          ? { line: other, position: position + t }
          : { line, position: position + t };
      case "self":
        return from.slot;
    }
  },
};
