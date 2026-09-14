import type { Angle, Beat, PoseSample, Vec2 } from "@caller/core";
import type { StationId } from "../formation/Formation.js";
import type { Group } from "../group/Group.js";

/** Where a station's dancer stands when a figure is over. */
export interface EndPose {
  p: Vec2;
  facing: Angle;
}

/**
 * What every figure's parameters carry. `beats` is how long *this instance*
 * lasts: a `FigureCall` may stretch or squeeze a figure, and `sample` is only
 * given `t`, so the decider injects the call's duration here. Everything else
 * is the figure's own tuning, which is data so a flourish can be a parameter
 * rather than a variant figure.
 */
export interface FigureParams {
  beats: Beat;
}

/**
 * A figure: a pure function from a group frame, a station, a beat and its
 * parameters to one dancer's pose, plus the call text the caller says and how
 * many beats early the caller says it.
 *
 * `sample` must be pure — same inputs, same pose, no hidden state — because the
 * decider samples it out of order and the renderer samples it per frame. All
 * the geometry a figure needs comes from `group`; a figure that needs to know
 * where the dancers came from takes it as a parameter (see `walk-to-station`'s
 * `origins`).
 */
export interface FigureDef<P extends FigureParams = FigureParams> {
  id: string;
  /** What the caller says, e.g. `"NEIGHBORS BALANCE AND SWING"`. */
  call: string;
  /**
   * What the dancers actually do, in two to four sentences of a caller's own
   * words — not what the code does, what the people do.
   *
   * This is the figure's specification in prose, and it is what the trajectory
   * assertions are written against: "robins pull by in the centre, then the
   * larks scoop them and walk backwards" is a sentence, four assertions and a
   * reason for each. Anything the author is not sure of is marked `(unsure)`
   * in the text, so a caller reading the report knows which lines to correct.
   */
  describe?: string;
  /** How many beats before the figure the caller starts saying it. */
  lead: Beat;
  /** The figure's natural duration, used when a call does not give one. */
  beats: Beat;
  /** Tuning defaults; `beats` is filled in from the call. */
  defaults: Omit<P, "beats">;
  /** One dancer's pose, `t` beats into the figure. Pure. */
  sample(group: Group, station: StationId, t: Beat, params: P): PoseSample;
  /** Where every station stands when the figure is over, in world px. */
  ends(group: Group, params: P): Record<StationId, EndPose>;
}

/** A figure definition with its parameter type erased, as a registry holds it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFigureDef = FigureDef<any>;

/** The figures a decider may call, by id. */
export interface FigureRegistry {
  get(id: string): AnyFigureDef;
  has(id: string): boolean;
  ids(): string[];
  register(def: AnyFigureDef): void;
}

/** A registry over `defs`; later definitions of the same id replace earlier ones. */
export function createFigureRegistry(defs: readonly AnyFigureDef[] = []): FigureRegistry {
  const byId = new Map<string, AnyFigureDef>();
  for (const def of defs) byId.set(def.id, def);
  return {
    get(id) {
      const def = byId.get(id);
      if (!def) throw new Error(`no figure "${id}" (have: ${[...byId.keys()].join(", ")})`);
      return def;
    },
    has: (id) => byId.has(id),
    ids: () => [...byId.keys()].sort(),
    register(def) {
      byId.set(def.id, def);
    },
  };
}

/**
 * A figure's parameters, with its defaults filled in and `beats` set to the
 * duration this instance actually runs for.
 */
export const withDefaults = <P extends FigureParams>(
  def: FigureDef<P>,
  params: object | undefined,
  beats: Beat = def.beats,
): P => ({ ...def.defaults, ...(params as Partial<P> | undefined), beats }) as P;
