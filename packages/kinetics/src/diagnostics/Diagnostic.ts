import type { DancerId } from "../dialect/Dialect.js";
import type { Span } from "../lang/syntax.js";

/**
 * One thing the engine has to say about a dance (round 2, P3), in one
 * shape for every layer — rustc's shape, because it works for agents as
 * well as people: a code, a message, the place in the text, the beat and
 * the dancers, a **trace** down the layers that led there, and a suggestion
 * where one is known.
 *
 * The user's ruling (2026-09-17): *"the compiler should complain … it
 * should trace. we should get rust-like errors. make it human/agent
 * friendly."* A diagnostic is data; `render.ts` prints it three ways.
 */
export interface Diagnostic {
  /** `K012` — see `codes.ts` for what each means. */
  code: string;
  severity: "error" | "warning";
  /** The layer that minded. */
  stage: Stage;
  message: string;
  /** Where in the dance's text, when a statement is to blame. */
  span?: Span;
  beat?: number;
  dancers: readonly DancerId[];
  /** The facts on the way down: the call, the window, the seam, the step, the point. Outermost first. */
  trace: readonly Fact[];
  suggestion?: string;
}

export type Stage =
  "parse" | "check" | "compile" | "schedule" | "assembly" | "execute" | "solve" | "proof" | "floor";

/** One fact of a trace: which layer, what it decided, and why when it said. */
export interface Fact {
  layer: Stage;
  what: string;
  why?: string;
  span?: Span;
  beat?: number;
}

/** A source the renderer can print a caret into: the dance's text, by a name. */
export interface Source {
  name: string;
  text: string;
}
