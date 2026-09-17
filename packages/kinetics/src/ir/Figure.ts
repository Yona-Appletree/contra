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

/** The two roles a figure knows. Dialects cast dancers into them (D16). */
export type Role = "self" | "partner";

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
  kind: "dancer" | "enum" | "number";
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
  | { kind: "facing"; who: Role; toward: Role }
  | { kind: "apart"; who: Role; from: Role; minPx: number; maxPx: number }
  | {
      kind: "beside";
      who: Role;
      of: Role;
      side: Hand;
      spacingPx: number;
      facing: "same";
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

/** The body of a figure over the beats the scheduler leaves it. */
export type Window =
  | {
      kind: "orbit";
      /** The point both dancers travel around. */
      axis: "midpoint" | "hands";
      turns: NumberValue;
      /** Which shoulder leads: the side the counterpart is on. */
      sense: Choice<OrbitSense>;
      /** `fixed` keeps the facing it started with; `tangent` follows the arc. */
      facing: "fixed" | "tangent";
      /** Distance from the axis, in world px. */
      radiusPx: number;
      /** Above this the scheduler reports a rate violation, not a fast dancer. */
      rateMaxTurnsPerBeat: number;
    }
  | { kind: "stand" }
  | {
      kind: "intrinsic";
      /**
       * Authored assembly (D14): a balance or a bow *is* its assembly, written
       * once at the bottom level rather than generated from constraints.
       */
      lines: readonly IntrinsicLine[];
    };

export type OrbitSense = "partner-on-right" | "partner-on-left";

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
  { kind: "stand" } | { kind: "lean"; deg: number } | { kind: "look"; at: LookTarget };

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

/** A number that may be taken from one of the call's parameters. */
export type NumberValue = number | { param: string };

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
  return number;
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
