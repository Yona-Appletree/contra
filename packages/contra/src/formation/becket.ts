import type { Angle, Vec2 } from "@caller/choreo";
import type {
  CoupleState,
  DancerId,
  Formation,
  Frame,
  GroupPlan,
  SetSpec,
  SetState,
  Station,
  StationId,
} from "@caller/choreo";
import { HOLD_SPACING_PX, frame, framePoint, reverseFrame } from "@caller/choreo";
import { CONTRA_ROLES } from "../roles.js";
import { ACROSS_PX, PLACE_PITCH_PX } from "./dupleImproper.js";

/**
 * Becket: partners stand side by side in a line, facing the couple across the
 * set, and progress by sliding to their own left to a new couple.
 *
 * Two lines the same width apart as duple improper, with the couples along each
 * line {@link COUPLE_PITCH_PX} apart, so adjacent dancers are the same
 * {@link PLACE_PITCH_PX} apart as in a duple line.
 *
 * The ends are the interesting part. A couple that has slid to the end of its
 * line has nowhere left to slide, so it spends one time through on a waiting
 * place beyond the end, crosses the set, and comes back in on the other line
 * one place along. That crossing is `wait-out`'s `'mirror'`: every dancer walks
 * to the point opposite their own through the frame's centre, which is placed
 * between the waiting place and the place they are coming back to — so the same
 * built-in figure does becket's end effect and duple improper's.
 *
 * A becket set therefore has two waiting places, `-1` and `places`, and
 * `2 × places + 2` couples, exactly as a hall of contra dancers really stands.
 */
export const COUPLE_PITCH_PX = PLACE_PITCH_PX * 2;

const HALF_ACROSS = ACROSS_PX / 2;
const HALF_COUPLE = PLACE_PITCH_PX / 2;

/**
 * How far down the hall a becket set's frame sits from the point a hall hands
 * it, px: one waiting place plus half a couple, which is where place `-1`'s
 * first dancer stands.
 */
export const BECKET_TOP_OFFSET_PX = COUPLE_PITCH_PX + HALF_COUPLE;

/** Facing across the set, in frame-local degrees; the `+1` line faces this way. */
const ACROSS = 0;
/** The other way across, for the `-1` line. */
const BACK = 180;

/**
 * The four stations of a becket minor set: the `+1` couple on the `−x` line,
 * the `-1` couple on the `+x` line, each with its robin on its lark's right.
 */
export const BECKET_STATIONS: readonly Station[] = [
  { id: "1L", role: "lark", facing: ACROSS, p: [-HALF_ACROSS, -HALF_COUPLE] },
  { id: "1R", role: "robin", facing: ACROSS, p: [-HALF_ACROSS, HALF_COUPLE] },
  { id: "2L", role: "lark", facing: BACK, p: [HALF_ACROSS, HALF_COUPLE] },
  { id: "2R", role: "robin", facing: BACK, p: [HALF_ACROSS, -HALF_COUPLE] },
];

/**
 * The two stations of a couple on a waiting place, in a frame centred halfway
 * between that place and the place it comes back in on. `wait-out`'s `'mirror'`
 * sends each dancer to the opposite point, which is their station on the other
 * line, one place along.
 */
export const BECKET_WAIT_STATIONS: readonly Station[] = [
  { id: "WL", role: "lark", facing: ACROSS, p: [-HALF_ACROSS, -COUPLE_PITCH_PX / 2 - HALF_COUPLE] },
  {
    id: "WR",
    role: "robin",
    facing: ACROSS,
    p: [-HALF_ACROSS, -COUPLE_PITCH_PX / 2 + HALF_COUPLE],
  },
];

/**
 * Where everybody stands at beat 0 of a becket dance that **shifts left in its
 * own first figure**, in each group's own frame-local px.
 *
 * A becket dance that progresses early — Butter, Tika Tika Timing, A-1 Reel —
 * dances the body of the time through with the couple it shifted *to*, so the
 * minor set the decider plans is the one the shift makes and every dancer
 * begins one couple place back along their own line. That is `-1` place for the
 * line that slides toward `-y` (stations `1L`/`1R`, so their start is one pitch
 * further along `+y`) and `+1` for the line that slides the other way.
 *
 * The waiting couple is in it too, and with the same sign at both ends of the
 * set: the bottom end's group frame is turned end for end, so "one place back
 * along my own line" is `+y` in both wait frames. It slides off the end of the
 * line with everybody else, which is exactly what a real end couple does.
 *
 * This is `Dance.startPlaces` for such a dance, and `contraDance` threads the
 * four dancing places into the first figure's `from`.
 */
export const BECKET_BEFORE_SLIDE: Record<StationId, { p: Vec2; facing: Angle }> =
  Object.fromEntries(
    [...BECKET_STATIONS, ...BECKET_WAIT_STATIONS].map((s) => [
      s.id,
      {
        p: [s.p[0], s.p[1] + (s.id === "2L" || s.id === "2R" ? -1 : 1) * COUPLE_PITCH_PX] as Vec2,
        facing: s.facing,
      },
    ]),
  );

/** One part of a becket set for one time through. */
interface Part {
  kind: "set" | "wait";
  couples: CoupleState[];
}

/** Group the couples at each place: two facing each other, or one waiting. */
export function partitionBecket(set: SetState): Part[] {
  const byPlace = new Map<number, CoupleState[]>();
  for (const couple of set.couples) {
    const list = byPlace.get(couple.place) ?? [];
    list.push(couple);
    byPlace.set(couple.place, list);
  }
  const parts: Part[] = [];
  for (const place of [...byPlace.keys()].sort((a, b) => a - b)) {
    const here = byPlace.get(place)!;
    if (here.length === 1) {
      parts.push({ kind: "wait", couples: here });
      continue;
    }
    if (here.length !== 2) {
      throw new Error(`becket place ${place} holds ${here.length} couples, not one or two`);
    }
    const ordered = [...here].sort((a, b) => b.direction - a.direction);
    if (ordered[0]!.direction !== 1 || ordered[1]!.direction !== -1) {
      throw new Error(`becket place ${place} has two couples in the same line`);
    }
    parts.push({ kind: "set", couples: ordered });
  }
  return parts;
}

const dancerOn = (couple: CoupleState, role: string): DancerId => {
  const dancer = couple.dancers[role];
  if (dancer === undefined) throw new Error(`couple "${couple.id}" has no ${role}`);
  return dancer;
};

const at = (set: SetState, place: number): Frame =>
  frame(framePoint(set.frame, [0, place * set.pitch]), set.frame.axis, set.frame.spacing);

/** Becket, and the second formation the demo's dances may be written in. */
export const BECKET: Formation = {
  id: "becket",
  roleSet: CONTRA_ROLES,

  group(n: number): Station[] {
    if (n === 4) return BECKET_STATIONS.map((s) => ({ ...s }));
    if (n === 2) return BECKET_WAIT_STATIONS.map((s) => ({ ...s }));
    throw new Error(`becket dances in fours, or waits in twos, not ${n}`);
  },

  groups(set: SetState): GroupPlan[] {
    return partitionBecket(set).map((part): GroupPlan => {
      if (part.kind === "set") {
        const [a, b] = part.couples as [CoupleState, CoupleState];
        return {
          id: `${set.id}/p${a.place}`,
          kind: "set",
          frame: at(set, a.place),
          stations: BECKET_STATIONS.map((s) => ({ ...s })),
          members: {
            "1L": dancerOn(a, "lark"),
            "1R": dancerOn(a, "robin"),
            "2L": dancerOn(b, "lark"),
            "2R": dancerOn(b, "robin"),
          },
          couples: [a.id, b.id],
        };
      }
      const couple = part.couples[0]!;
      // Halfway between the waiting place and the place it comes back in on.
      const base = at(set, couple.place + couple.direction / 2);
      return {
        id: `${set.id}/w${couple.place}`,
        kind: "wait",
        frame: couple.direction === 1 ? base : reverseFrame(base),
        stations: BECKET_WAIT_STATIONS.map((s) => ({ ...s })),
        members: { WL: dancerOn(couple, "lark"), WR: dancerOn(couple, "robin") },
        couples: [couple.id],
      };
    });
  },

  progression: {
    next(set: SetState): SetState {
      const couples: CoupleState[] = [];
      for (const part of partitionBecket(set)) {
        if (part.kind === "set") {
          // Slide to your own left: the `+1` line toward `-y`, the other back.
          for (const couple of part.couples) {
            couples.push({ ...couple, place: couple.place - couple.direction });
          }
        } else {
          const couple = part.couples[0]!;
          couples.push({
            ...couple,
            place: couple.place + couple.direction,
            direction: couple.direction === 1 ? -1 : 1,
          });
        }
      }
      return { ...set, couples: couples.sort((a, b) => a.place - b.place) };
    },
  },

  start(spec: SetSpec): SetState {
    if (spec.couples < 4) {
      throw new Error(`a becket set needs at least four couples, not ${spec.couples}`);
    }
    const places = Math.floor((spec.couples - 2) / 2);
    const couples: CoupleState[] = [];
    let i = 0;
    const add = (place: number, direction: 1 | -1): void => {
      couples.push({
        id: `${spec.id}/c${i}`,
        dancers: { lark: `${spec.id}/c${i}/lark`, robin: `${spec.id}/c${i}/robin` },
        place,
        direction,
      });
      i += 1;
    };
    add(-1, 1);
    for (let place = 0; place < places; place++) {
      add(place, 1);
      add(place, -1);
    }
    add(places, -1);
    // An odd number of couples cannot fill a becket set — two couples stand at
    // every dancing place, one from each line — so the odd one out takes a
    // second waiting place beyond the bottom end. The set then alternates
    // between `places` dancing places and `places − 1`, which is what a real
    // line of five couples does: somebody is always out, and it is never the
    // same couple twice running.
    if (spec.couples % 2 !== 0) add(places + 1, -1);
    return {
      id: spec.id,
      // `spec.centre` is where the *first* dancer of a line stands — that is what
      // it means for a duple improper set, and a hall hands the same point to
      // both formations. A becket set's first dancer is at place `-1`, so the
      // frame sits one waiting place plus half a couple down the hall from it,
      // and the two formations lay their lines out from the same place.
      frame: frame(
        framePoint(frame(spec.centre, spec.axis, HOLD_SPACING_PX), [0, BECKET_TOP_OFFSET_PX]),
        spec.axis,
        HOLD_SPACING_PX,
      ),
      pitch: COUPLE_PITCH_PX,
      couples,
    };
  },

  tags(n: number): Record<string, StationId[]> {
    if (n === 4) {
      const all = BECKET_STATIONS.map((s) => s.id);
      return {
        all,
        larks: ["1L", "2L"],
        robins: ["1R", "2R"],
        ones: ["1L", "1R"],
        twos: ["2L", "2R"],
        neighbors: all,
        partners: all,
      };
    }
    if (n === 2) {
      const all = BECKET_WAIT_STATIONS.map((s) => s.id);
      return { all, larks: ["WL"], robins: ["WR"], partners: all, neighbors: all };
    }
    throw new Error(`becket dances in fours, or waits in twos, not ${n}`);
  },
};
