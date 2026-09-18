import type { Hand, HoldId } from "./Hold.js";

/**
 * A figure, written as **timed constraints** rather than as motion (D2, D12).
 *
 * A figure says what must be true when it starts (`pre`), what it does with
 * the beats it is given (`windows`), where the dancers look (`look`), and what
 * it leaves behind (`post`, soft by definition). It never says where a foot
 * goes: the scheduler plans the entry and the exit from the state on either
 * side (P4), and the executor turns the result into continuous motion (P5).
 *
 * Nothing here names a lark, a robin, a contra or a set (D16). A figure knows
 * two **figure-roles** — `self` and `partner` — and a dialect casts dancers
 * into them. Every clause is written from `self`'s point of view, because
 * every dancer compiles and dances their own copy.
 */
export interface FigureIR {
  /** The name a call uses: `do-si-do`, `allemande`. */
  id: string;
  /**
   * The call's parameters, positional. The first is the figure's counterpart
   * (`kind: "dancer"`), bound by a `select` in the program; the rest are the
   * words and numbers a caller says (`right`, `1½ times`).
   */
  params: readonly ParamSpec[];
  beats: FigureBeats;
  pre: Contract;
  /** Soft by definition (D12): the next figure's `pre` may renegotiate it. */
  post: Contract;
  /**
   * The body. Tonight every figure has exactly one window covering the whole
   * body; the array is here because a figure with phases (a balance and swing)
   * needs several, and the scheduler gives them spans then.
   */
  windows: readonly Window[];
  /**
   * Where each role looks, and when (DA12: the look is instructed, the head is
   * solved). Beats are relative to the body's start; a rule with no span holds
   * for the whole figure.
   */
  look: readonly LookRule[];
  /** Where this figure's beats go when it is elided: stretched or waited (D8). */
  elide: "stretch" | "wait";
  /**
   * What `self` does when a role is absent, keyed by the role that is missing
   * — `casts.partner` is what a dancer whose `select` returned nobody does
   * (DA14). `"stand"` is the user's ruling: *"if the select returns no-one,
   * then you just stay put for those moves"*. `"elide"` gives the beats to a
   * neighbouring call per `elide` (Butter's first-time shift); `"walk-on"` is
   * for a figure that travels through an empty place. The record is partial
   * because a figure whose `self` is absent is never scheduled at all.
   */
  casts: Readonly<Partial<Record<Role, CastRule>>>;
}

/**
 * The roles a figure knows. Dialects cast dancers into them (D16). `partner`
 * is the counterpart a call names; for a figure danced by a group, `left`,
 * `right` and `opposite` are the ring neighbours in the group's order (left =
 * toward your left when facing the group's centre).
 */
export type Role = "self" | "partner" | "left" | "right" | "opposite";

/** What `self` does when the keyed role is nobody. */
export type CastRule = "elide" | "stand" | "walk-on";

/**
 * `nominal` is what a caller means by the figure; `min` is the fewest beats
 * its body can be squeezed into before the scheduler must report a timing
 * violation rather than make a fast dancer.
 */
export interface FigureBeats {
  nominal: number;
  min: number;
}

/** One positional parameter of a call. */
export interface ParamSpec {
  name: string;
  /**
   * `dancer`: a bound counterpart; `group`: a bound group (a ring of four);
   * `role`: one of the dialect's role names, validated at compile time so the
   * figure file itself never spells a role (D16); `enum`; `number`.
   */
  kind: "dancer" | "group" | "role" | "enum" | "number" | "string";
  /** The words an `enum` accepts, in the order an error message lists them. */
  choices?: readonly string[];
  /** Filled in when the call omits the argument. A `dancer` never has one. */
  default?: string | number;
}

/** What must be true of the two bodies, and what their hands are doing. */
export interface Contract {
  arrangement: readonly Arrangement[];
  /** Empty means both hands free — the hand availability `post` states (D13). */
  holds: readonly HoldRef[];
}

/** One clause of an arrangement, from `who`'s point of view. */
export type Arrangement =
  /** `home` is the facing the dialect's seating gives this dancer's place (across, in a contra line). */
  | { kind: "facing"; who: Role; toward: Role | "home" }
  | { kind: "apart"; who: Role; from: Role; minPx: number; maxPx: number }
  | {
      kind: "beside";
      who: Role;
      of: Role;
      /** `as-couple`: the side the dialect says this dancer takes when the two stand as a couple. */
      side: Hand | "as-couple";
      spacingPx: number;
      facing: "same";
      /**
       * Where the pair's centre sits: where they are (`here`, the default), or
       * moved along the home facing onto the seat of whichever of the two
       * stands on the left (`left-seat`) — a swing ends in the line, not
       * wherever the hands happened to be taken.
       */
      centre?: "here" | "left-seat";
    };

/**
 * A hold this contract needs, named from `self`'s side. Either field may be
 * taken from a parameter, so one `allemande` covers both hands.
 */
export interface HoldRef {
  hold: Choice<HoldId>;
  hand: Choice<Hand>;
  with: Role;
}

/**
 * The body of a figure over the beats the scheduler leaves it. A figure with
 * several windows runs them in order, each taking its `beats` share of the
 * body (equal shares when none says). A window with `who` is danced by those
 * dancers only; the others get the window that names them, or stand. Two
 * roles doing different things at once is a `parallel` window.
 */
export type Window =
  | ({
      kind: "orbit";
      /** The point everyone travels around: the two dancers' midpoint, the joined hands, or the group's centroid. */
      axis: "midpoint" | "hands" | "centroid";
      /** How far round; `free` lets the scheduler choose so the exit lands on the `post`. */
      turns: NumberValue | "free";
      /**
       * Which way round: the side the counterpart is on, or the ring's own
       * left/right. For a `couple` facing, the side from the point of view of
       * the dancer on the couple's right — the one who walks forward.
       */
      sense: Choice<OrbitSense>;
      /**
       * `fixed` keeps the facing it started with; `tangent` follows the arc;
       * `inward` faces the axis; `partner` faces the counterpart; `couple`
       * faces the pair one way as a couple — the dancer on the couple's right
       * (the dialect's side) along the arc, the one on the left backing
       * round with them (a courtesy turn).
       */
      facing: "fixed" | "tangent" | "inward" | "partner" | "couple";
      /** Distance from the axis, in world px. */
      radiusPx: number;
      /** Above this the scheduler reports a rate violation, not a fast dancer. */
      rateMaxTurnsPerBeat: number;
      /** Below this a `free` orbit will not go. */
      rateMinTurnsPerBeat?: number;
      /** Two steps a beat (a swing). */
      buzz?: boolean;
      /**
       * A spacing the pair opens out to over the orbit's last two beats, still
       * turning, in world px: a courtesy turn danced close and let out onto
       * the two places as it comes round. Omitted, the radius holds.
       */
      openPx?: number;
    } & WindowCommon)
  /**
   * Walk a path of waypoints, each at a beat, in the figure's **lane frame**:
   * the origin is the centroid of the dancers the window names at its start;
   * `x` runs across the lane toward the far side, in half-widths (−1 is
   * `self`'s own side, +1 the far side, half the distance to the dancer
   * across from `self`); `y` runs along it to `self`'s right, in half-places
   * (`PLACE_PX / 2`, so the two rows of a hands four are `y = ±1`). Every
   * dancer walks their own copy in their own frame, which is how one closed
   * track through four places comes out of one list of points.
   */
  | ({
      kind: "path";
      /** Waypoints at beats from the window's start; the last one's beat is the window's nominal length. */
      points: readonly Waypoint[];
      /**
       * The points are one lap of a **closed** track: a role may start part
       * way round it (`phase`, in beats round the lap), and `amount` — a
       * parameter, so half a hey is a number — is how much of a lap is
       * walked in the window's beats.
       */
      lap?: {
        phase: readonly { who: Who; beats: number }[];
        amount?: NumberValue;
      };
      /** Reflect the track across the lane (`y → −y`) when the parameter holds this word: a hey by the left. */
      mirror?: { param: string; when: string };
    } & WindowCommon)
  /** Several windows over one span, each for the dancers its `who` names. */
  | ({ kind: "parallel"; parts: readonly Window[] } & WindowCommon)
  /** Walk a distance in a direction relative to the facing, facing unchanged. */
  | ({
      kind: "walk";
      direction: "forward" | "back" | "left" | "right";
      distancePx: number;
    } & WindowCommon)
  /** Cross paths with the counterpart, passing by the named shoulder, to where they stood. */
  | ({ kind: "pass"; shoulder: "right" | "left" } & WindowCommon)
  /** Turn in place by so many degrees (+ = right). */
  | ({ kind: "pivot"; deg: number } & WindowCommon)
  /**
   * Walk to your own seat as the dialect has it after this call (`seatAfter`),
   * facing home: the shift's slide along the line, and a crossing couple's
   * walk to the other line's end. The seating is the truth the floor follows.
   */
  | ({ kind: "walk-to-seat" } & WindowCommon)
  | ({ kind: "stand" } & WindowCommon)
  | ({
      kind: "intrinsic";
      /**
       * Authored assembly (D14): a balance or a bow *is* its assembly, written
       * once at the bottom level rather than generated from constraints.
       */
      lines: readonly IntrinsicLine[];
    } & WindowCommon);

export interface WindowCommon {
  /** This window's share of the body, in nominal beats. */
  beats?: number;
  /** Who this window is for; everyone when omitted. */
  who?: Who;
  /**
   * Holds taken at this window's start — the take ramps in over the beats
   * before it — for a hold a figure needs part way through rather than at its
   * `pre`: the chain's courtesy hold, taken as the pull-by ends. Released like
   * any other at the figure's end unless `post` keeps them.
   */
  holds?: readonly HoldRef[];
}

/**
 * Which dancers a window or a phase is for: a figure-role, or everyone whose
 * dialect role is the word a `role` parameter holds (`{ role: "who" }`), or
 * everyone else (`not`). The figure never spells a role (D16): the word
 * comes from the call, and the dialect says who dances it.
 */
export type Who = Role | { role: string; not?: boolean };

/** One point of a `path` window, in the lane frame. */
export interface Waypoint {
  /** Beats from the path's start (nominal). */
  beat: number;
  /** Across the lane, in half-widths: −1 `self`'s own side, +1 the far side. */
  x: number;
  /** Along the lane, in half-places, positive to `self`'s right. */
  y: number;
  /**
   * A sideways offset in world px to the walker's own left of the straight
   * line between the neighbouring waypoints — a pass: two dancers who each
   * keep to their own left of the same point go by right shoulders.
   */
  left?: number;
  /**
   * The facing at this waypoint, degrees in the lane frame (0 = across toward
   * the far side, 90 = to `self`'s right); the heading of travel when omitted.
   */
  facing?: number;
}

export type OrbitSense = "partner-on-right" | "partner-on-left" | "left" | "right";

/** One authored assembly line of an intrinsic figure. */
export interface IntrinsicLine {
  /** Beats from the body's start. */
  beat: number;
  /** `0` on the beat, `1` on the half beat, where hands go. */
  half: 0 | 1;
  /** Which role performs it; each dancer gets their own copy of `self`'s. */
  who: Role;
  op: IntrinsicOp;
}

/**
 * The subset of the assembly vocabulary an intrinsic figure authors directly.
 * The scheduler owns the full vocabulary (steps, pivots, holds and drops are
 * planned, never authored); this union widens when a figure needs a line the
 * scheduler cannot plan for it.
 */
export type IntrinsicOp =
  | { kind: "stand" }
  | { kind: "lean"; deg: number }
  | { kind: "look"; at: LookTarget }
  /** A step of so many px along the facing (negative = back): a balance's rock. */
  | { kind: "step"; forwardPx: number };

/**
 * Where a head points. A target is resolved to a **point** — the counterpart's
 * head at that sample, approximating their eyes (the user, 00:14) — or to a
 * direction; the solver turns the neck toward it within its range.
 */
export type LookTarget = "partner" | "ahead" | "down";

export interface LookRule {
  /** Whose head this instructs. */
  role: Role;
  at: LookTarget;
  /** Where the eyes go when the neck cannot hold `at`. P6 enforces the range. */
  elseAt?: LookTarget;
  /** Beats from the body's start; the whole figure when both are omitted. */
  from?: number;
  to?: number;
}

/** A value that may be taken from one of the call's parameters. */
export type Choice<T extends string> =
  | T
  | {
      param: string;
      /** Maps the parameter's word onto this field's; omitted means identity. */
      cases?: Readonly<Record<string, T>>;
    };

/** A number that may be taken from one of the call's parameters, optionally scaled (`places / 4` turns). */
export type NumberValue = number | { param: string; scale?: number };

/** A call's resolved arguments, by parameter name. Dancers live in the cast. */
export type Params = Readonly<Record<string, string | number>>;

/** Resolve a {@link Choice} against a call's parameters. */
export const resolveChoice = <T extends string>(value: Choice<T>, params: Params): T => {
  if (typeof value === "string") return value;
  const word = params[value.param];
  if (typeof word !== "string") {
    throw new Error(`parameter "${value.param}" is not a word`);
  }
  const resolved = value.cases ? value.cases[word] : (word as T);
  if (resolved === undefined) {
    throw new Error(`"${word}" is not a case of parameter "${value.param}"`);
  }
  return resolved;
};

/** Resolve a {@link NumberValue} against a call's parameters. */
export const resolveNumber = (value: NumberValue, params: Params): number => {
  if (typeof value === "number") return value;
  const number = params[value.param];
  if (typeof number !== "number") {
    throw new Error(`parameter "${value.param}" is not a number`);
  }
  return number * (value.scale ?? 1);
};

/** The parameters a call gets when it says nothing: every declared default. */
export const defaultParams = (figure: FigureIR): Params => {
  const params: Record<string, string | number> = {};
  for (const spec of figure.params) {
    if (spec.default !== undefined) params[spec.name] = spec.default;
  }
  return params;
};

/** The beats a call takes: its `beats` parameter if it has one, else nominal. */
export const beatsOf = (figure: FigureIR, params: Params): number => {
  const given = params["beats"];
  return typeof given === "number" ? given : figure.beats.nominal;
};
