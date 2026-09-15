import type { Beat, Side } from "@caller/choreo";

/**
 * A figure, as **data**: actors, figure-roles, a frame with an anchor rule, a
 * shape drawn in that frame, holds, honest ends, a timing profile and a nominal
 * beat count (`vision.md` §"Five layers", layer 4).
 *
 * M1 defines the type and fills it in for the seventeen coded figures through
 * the legacy bridge (`legacy.ts`), whose `shape` is `{ kind: "legacy" }` and
 * whose geometry is still the TypeScript figure's. M2 writes the first real
 * shapes and the interpreter that runs them; M4 and M5 finish the library and
 * the bridge goes empty.
 *
 * Every definition is plain data and survives
 * `JSON.parse(JSON.stringify(def))`. A legacy definition therefore names its
 * coded figure by **id** rather than holding it: what the bridge needs from the
 * coded figure (its `ends`, its `joinsAt`) is fetched from the registry at
 * planning time, which is also what lets `?chain=`-style default overrides
 * reach the new path with no extra plumbing.
 */

/**
 * One of the parts a figure has: `["lark", "robin"]` for a swing, `["a", "b"]`
 * for a symmetric pair, `["1L", "1R", "2L", "2R"]` for a bridged coded figure.
 *
 * A figure-role is a part in *this figure*, not a place in the formation — the
 * whole point of the rebuild. The one exception is the legacy bridge, whose
 * roles are the hands-four station ids on purpose, because that is exactly what
 * the coded figures are written against.
 */
export type FigureRole = string;

/**
 * How a call's `who` becomes instances.
 *
 * `"all"` is one instance over everybody the call selected — the only rule M1
 * needs, because a bridged coded figure takes the whole minor set and does its
 * own pairing through `params.pairs`. The rest are named here because the
 * design names them and M2–M7 fill them in.
 */
export type ActorRule = "pairs" | "ring" | "each" | "all" | "line";

/**
 * Where an instance's frame sits.
 *
 * `"hands-four"` is the legacy bridge's: the frame is the formation's own
 * minor-set group frame, which is what every coded figure assumes. The others
 * are the design's (`vision.md` §"Resolution") and land with the shapes that
 * need them.
 */
export type AnchorRule =
  | "hands-four"
  | "meet"
  | "centroid"
  | "home"
  | "lane"
  | { pivot: FigureRole }
  | { other: FigureRole };

/**
 * How a call's shorthand parameters expand to the canonical ones the shape
 * runs on.
 *
 * `{ kind: "passthrough" }` is M1's only rule and the legacy bridge's: a coded
 * figure's parameters already *are* its canonical ones, and a dance record
 * writes them directly. M2 gives this shorthand names, per-role scoping
 * (`robins@2`) and an expansion.
 */
export type ParamSpec = { kind: "passthrough" };

/**
 * What the figure actually draws.
 *
 * `{ kind: "legacy", figure }` runs the coded `ContraFigure` of that id, from
 * the registry, exactly as the decider runs it today. Every other kind is M2's
 * interpreter over the data-layer's expression calculus, re-targeted onto
 * figure-role leaves.
 */
export type FigureShape = { kind: "legacy"; figure: string };

/** One hand two figure-roles hold, and over which of the figure's beats. */
export interface HoldSpec {
  a: FigureRole;
  aSide: Side;
  b: FigureRole;
  bSide: Side;
  /** When the hold starts; the figure's beat 0 when left out. */
  from?: Beat;
  /** When it ends; the figure's last beat when left out. */
  to?: Beat;
}

/**
 * Where the figure leaves people.
 *
 * `"relative"` is "wherever the shape put them", which is what a bridged coded
 * figure reports (its own `plan.ends`). `"home"` is a gatherer settling on to
 * formation places, `"return"` is back to the spot you left, and
 * `{ target }` is a target shape solved backwards (Q6, M7).
 */
export type EndsRule = "home" | "relative" | "return" | { target: string };

/** How a figure stretches to the count the card gives it (D3). */
export interface TimingProfile {
  /** Whether extra beats buy distance (a walk) or pace (a fixed-angle turn). */
  stretch: "distance" | "pace";
  /** The motion profile the shape is sampled with; M10 adds `cruise` and `gait`. */
  profile: "smooth" | "cruise" | "gait";
}

/** A figure in the library. */
export interface FigureDefinition {
  id: string;
  /** The figure's own natural count; a call's own count overrides it (D3). */
  nominalBeats: Beat;
  roles: readonly FigureRole[];
  actors: ActorRule;
  anchor: AnchorRule;
  params: ParamSpec;
  shape: FigureShape;
  holds: readonly HoldSpec[];
  ends: EndsRule;
  timing: TimingProfile;
}
