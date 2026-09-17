import type { Angle, Vec2 } from "@caller/core";
import type { Frame } from "./Frame.js";
import { frameAngle, framePoint } from "./Frame.js";
// Type-only, and erased: `lineUpShift.ts` reads this module for `Formation`.
import type { LineUpShift } from "./lineUpShift.js";

/** A dancer, stable for the life of a hall. */
export type DancerId = string;
/** A place in a formation's group layout, e.g. contra's `"1L"`. */
export type StationId = string;
/** One instance of a group on the floor, minted fresh every time through. */
export type GroupId = string;
/** One couple in a set, stable for the life of a hall. */
export type CoupleId = string;
/** One longways set, square, or other independent unit of dancers. */
export type SetId = string;
/** A role in a role set, e.g. contra's `"lark"`. */
export type RoleName = string;

/**
 * The roles a formation's dancers take. `top` names the role whose hand stacks
 * on top of a joined pair; `@caller/core`'s `stackJoined` reads only that, so
 * neither `core` nor `choreo` ever mentions larks or robins.
 */
export interface RoleSet {
  roles: readonly RoleName[];
  top: RoleName;
}

/**
 * One place in a group's layout. `p` and `facing` are in the group frame's
 * local axes (see {@link Frame}); `role` is the role of the dancer bound here
 * **at the start of a time through**, not a claim about who stands here later —
 * a duple-improper lark ends the dance standing on the two-robin's station.
 */
export interface Station {
  id: StationId;
  p: Vec2;
  facing: Angle;
  role: RoleName;
  /**
   * True when the dancer on this station got here by **crossing** at the last
   * progression rather than travelling along the set — see
   * {@link CoupleState.crossedOver}, which is what a formation reads to set it.
   *
   * A figure that effects a progression (the becket shift is the only one
   * today) uses it to bring that dancer across from the station opposite
   * instead of along from a place behind; every other figure ignores it. It
   * says nothing about where the station *is*: the pose here is the dancer's
   * home for the whole time through either way.
   */
  crossedOver?: boolean;
}

/** Where a station sits in the world, given the frame its group runs in. */
export const stationPose = (f: Frame, s: Station): { p: Vec2; facing: Angle } => ({
  p: framePoint(f, s.p),
  facing: frameAngle(f, s.facing),
});

/** One couple, wherever it currently stands in its set. */
export interface CoupleState {
  id: CoupleId;
  /** Which dancer takes each role. */
  dancers: Readonly<Record<RoleName, DancerId>>;
  /** Index along the set: 0 is the top of a contra line. */
  place: number;
  /** Which way the couple travels. Contra: `1` for the ones, `-1` for the twos. */
  direction: 1 | -1;
  /**
   * True when the **last** progression brought this couple here by crossing the
   * set in place — it changed `direction` without changing `place` — rather
   * than by travelling along the set or by waiting out at an end.
   *
   * A progression sets it, and clears it on every couple that did anything
   * else, so it is never stale; a freshly seated set has it on nobody. Only an
   * odd becket line produces it today (see `@caller/contra`'s `becket.ts`: an
   * odd line has one waiting place, so the couple that runs out of line at the
   * *other* end crosses straight over with no time out). It reaches a figure as
   * {@link Station.crossedOver}.
   */
  crossedOver?: boolean;
}

/**
 * One independent set of dancers — a longways set, a square — and where it
 * stands. `frame.axis` points down the set; `pitch` is the distance between
 * adjacent places along it, in px.
 */
export interface SetState {
  id: SetId;
  frame: Frame;
  pitch: number;
  couples: readonly CoupleState[];
  /**
   * The spec {@link createHall} seated this set from, when one did.
   *
   * A formation is free to put its frame somewhere other than `spec.centre` —
   * becket does, because `centre` is where a line's *first* dancer stands and
   * a becket line starts at a waiting place beyond the end — so reading the
   * spec back off the frame is not an inverse for every formation. Anything
   * that re-seats the same sets in another formation (the script decider, at
   * every dance that changes formation) needs the spec the hall was laid out
   * from, not a guess at it, or the sets drift by whatever offset the
   * formation applied.
   */
  spec?: SetSpec;
}

/** Every set on the floor. */
export interface HallState {
  sets: readonly SetState[];
}

/** How many couples a set starts with and where it stands. */
export interface SetSpec {
  id: SetId;
  couples: number;
  centre: Vec2;
  axis: Angle;
}

/**
 * How wide a figure call draws its dancers from: the name of one partition of a
 * whole set, resolved by the formation ({@link Formation.groupsFor}).
 *
 * Open, exactly like {@link import('../dance/Dance.js').Selector}: `choreo`
 * supplies the mechanism and one built-in meaning, and each formation supplies
 * the rest. The one meaning this package knows is
 * {@link HANDS_FOUR_GROUP} — "the ordinary minor-set partition", what a
 * formation's groups have always been. A formation is free to define wider ones
 * (a seam between two minor sets, a whole line, the whole set); asked for one it
 * does not define, it throws rather than quietly returning nothing.
 */
export type GroupSelector = "hands-four" | (string & Record<never, never>);

/**
 * The ordinary minor-set partition, and what a call that says nothing gets.
 *
 * Named `…_GROUP` because `HANDS_FOUR` is already taken by what the *caller
 * says* between two dances (`decider/Decider.ts`); this one is never spoken.
 */
export const HANDS_FOUR_GROUP: GroupSelector = "hands-four";

/**
 * What a group in a partition is for.
 *
 * `"set"` groups dance the call. The other two are **the two outs**: a couple
 * with nobody to dance with, waiting at the top of the set or at the bottom.
 * They are distinguished here rather than collapsed into one `"wait"` because
 * the two behave differently and every consumer needs to know which — the top
 * out is the couple "hands four from the top" is reckoned from and the one long
 * lines addresses; the bottom out is the one a `down-the-hall` call sweeps
 * along, and the one a becket line's shift pushes off the end.
 *
 * Each formation already carries the signal that tells them apart — it is what
 * decides which way a waiting couple's frame is turned — so this surfaces that
 * distinction rather than computing it twice.
 */
export type GroupKind = "set" | "wait-top" | "wait-bottom";

/** How a set state is partitioned into the groups that dance one figure call. */
export interface GroupPlan {
  id: GroupId;
  /** `"set"` groups dance the call; the two outs wait it out. */
  kind: GroupKind;
  frame: Frame;
  stations: readonly Station[];
  members: Readonly<Record<StationId, DancerId>>;
  couples: readonly CoupleId[];
}

/** A formation-specific rule for what one time through does to a set. */
export interface Progression {
  /** The set as it stands after one time through. */
  next(set: SetState): SetState;
}

/**
 * A formation: the stations a group of `n` stands on, the roles they take, how
 * a set breaks into groups, and what a time through does to the set.
 *
 * Everything here is form-neutral. `@caller/contra` supplies duple improper and
 * becket; `src/testing/square.ts` supplies a square, which is what proves it.
 */
export interface Formation {
  id: string;
  roleSet: RoleSet;
  /**
   * The along-hall length of one minor set, in px: how far down the hall a
   * group's own repeat runs before the next minor set's shape repeats it.
   *
   * `undefined` for a formation with no hall at all (the square fixture is a
   * ring, not a line). Where it exists, it is not simply {@link SetState.pitch}
   * — a duple improper minor set spans *two* places (ones and twos, so twice
   * `pitch`) while a becket minor set's two couples share *one* place (so
   * `pitch` itself) — which is exactly why this is the formation's own number
   * rather than something derived generically from a set.
   *
   * T6's trace sampler reads this to fold a dance's along-hall progression
   * into one period, so a becket slide draws as a bounded shape instead of
   * stretching the trace the length of the whole time through.
   */
  hallPitch?: number;
  /**
   * What the caller says between two dances to get the hall standing in this
   * formation, one speech bubble at a time.
   *
   * A hall does not walk into a becket line off the same words that make a
   * duple improper one — "hands four from the top" leaves a becket hall facing
   * the wrong way — so the words belong to the formation rather than to the
   * decider, which knows nothing about either. Left out, the decider says its
   * own default (`ScriptDeciderOptions.lineUpCalls`).
   *
   * Each entry is one bubble; the decider shares the announcement's beats out
   * between them, so three short lines read better than one long one.
   */
  lineUpCalls?: readonly string[];
  /**
   * What the caller says while the hall walks to its places and takes hands
   * four, given the shift the formation's own progression asks for.
   *
   * Empty for a formation that lines up where it dances. Becket's is the user's
   * own three sentences — "move one place to the left. this is a becket dance.
   * your partner should be on the side of the set with you." — and it is a
   * function of the shift rather than a fixed list because the *direction* is
   * the formation's progression's business, not a word anybody types: a
   * right-progressing becket says right.
   *
   * Said over the walk and the hands-four stretches rather than over the
   * announcement, which is when a caller actually says it: the hall is already
   * moving, and the sentence is about what to do next rather than about which
   * dance this is.
   */
  handsFourCalls?: (shift: LineUpShift) => readonly string[];
  /**
   * **How a walkthrough of a dance in this formation opens**, given the shift
   * the formation's own progression asks for.
   *
   * The words the hall *reads* at the top of a walkthrough card, beside the
   * words it *hears* in {@link handsFourCalls} — and they belong to the
   * formation for the same reason those do: "hands four from the top" leaves a
   * becket hall facing the wrong way, and no layer above the formation knows
   * that. The two are drawn from one vocabulary on purpose (D25), so what a
   * dancer reads on the page and what the caller says over the band are the
   * same sentences.
   *
   * `line` is said to the dancers; `hint` is the app's own note under it, in
   * the same "who is where" shape the seam hints use. Left out, a walkthrough
   * opens straight on its first figure.
   */
  walkthroughOpening?: (shift: LineUpShift) => { line: string; hint?: string };
  /** The layout of a group of `n` dancers, in frame-local px. */
  group(n: number): Station[];
  /**
   * The **authoring-time** template for one group selector: the abstract station
   * layout a dance's calls are written against, before any hall exists.
   *
   * The counterpart of {@link groupsFor}, which needs a real set to resolve
   * against. `@caller/contra`'s `chainCalls` threads a dance's places through
   * this layout; the runtime groups it replays into may bind only a subset of
   * these ids, which every figure already copes with because it reads only the
   * stations its own group has.
   *
   * Additive: {@link group} stays, because a waiting couple's two-station layout
   * is not a selector and nothing else names it.
   */
  groupFor(selector: GroupSelector): Station[];
  progression: Progression;
  /**
   * How the whole set divides up for one figure call: **a partition**.
   *
   * Every dancer in `set` appears in the `members` of exactly one returned plan,
   * dancing and waiting alike. That is what makes double-claiming structurally
   * impossible — `Timeline.add()` throws if a dancer is bound into two events
   * over overlapping beats, so a partition that is not one fails loudly the
   * first time a dance exercises it. `src/testing/assertPartition.ts` checks the
   * property directly.
   *
   * Called once per figure call, not once per time through: two calls of the
   * same dance may draw their dancers from different widths.
   */
  groupsFor(selector: GroupSelector, set: SetState): GroupPlan[];
  /** A fresh set, with couples and dancers named from `spec.id`. */
  start(spec: SetSpec): SetState;
  /**
   * Station subsets a {@link Selector} tag names, in the layout `selector` is
   * resolved against.
   *
   * Keyed by the group selector rather than by station count: two different
   * partitions can produce groups of the same size, so `n` does not say what a
   * tag means. `resolveSelector` filters the answer down to the ids the call's
   * own group actually has, so one abstract definition serves every runtime
   * instance of that selector, however wide it happened to come out.
   */
  tags(selector: GroupSelector): Record<string, StationId[]>;
}

/** Every dancer in a hall, in set then place then role order. */
export function hallDancers(hall: HallState): DancerId[] {
  const out: DancerId[] = [];
  for (const set of hall.sets) {
    for (const couple of [...set.couples].sort((a, b) => a.place - b.place)) {
      for (const role of Object.keys(couple.dancers).sort()) {
        const id = couple.dancers[role];
        if (id !== undefined) out.push(id);
      }
    }
  }
  return out;
}

/** Look a station up by id, or throw with the ids that do exist. */
export function stationById(stations: readonly Station[], id: StationId): Station {
  const found = stations.find((s) => s.id === id);
  if (!found) {
    throw new Error(`no station "${id}" in [${stations.map((s) => s.id).join(", ")}]`);
  }
  return found;
}

/**
 * A hall of one set per spec, all in the same formation.
 *
 * Each set remembers the spec it was seated from ({@link SetState.spec}), so
 * the same hall can be re-seated in another formation — which is what happens
 * every time the programme reaches a dance in a different one.
 */
export const createHall = (formation: Formation, specs: readonly SetSpec[]): HallState => ({
  sets: specs.map((spec) => ({ ...formation.start(spec), spec })),
});
