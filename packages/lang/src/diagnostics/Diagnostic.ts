import type { Span } from "../syntax/ast.js";

/**
 * One thing the language has to say about a dance, in one shape for every
 * layer — rustc's shape, because it works for agents as well as for people:
 * a code, a message, the place in the text, the beat and the dancers, a
 * **trace** down the layers that led there, and a suggestion where one is
 * known.
 *
 * The user's ruling (2026-09-17): *"the compiler should complain … it should
 * trace. we should get rust-like errors. make it human/agent friendly."* A
 * diagnostic is data; `render.ts` prints it two ways. The shape is
 * `packages/kinetics/src/diagnostics/Diagnostic.ts`'s, round 2's, with
 * `DancerId` widened to a plain string (this package imports nothing) and the
 * stages renamed for this pipeline.
 */
export interface Diagnostic {
  /** `L001` — see `codes.ts` for what each means. */
  code: string;
  severity: "error" | "warning";
  /** The layer that minded. */
  stage: Stage;
  message: string;
  /** Where in the text, when a piece of text is to blame. */
  span?: Span;
  beat?: number;
  /** The dancers it happened to, by their printed names (`2L`, `3R`). */
  dancers: readonly string[];
  /** The facts on the way down: the module, the declaration, the call, the commit. Outermost first. */
  trace: readonly Fact[];
  suggestion?: string;
}

/**
 * The layers, in the order a file passes through them: read from disk,
 * tokenised and parsed, checked, the tree built by `setup`, the per-dancer
 * script run, the beat's events committed.
 */
export type Stage = "load" | "parse" | "check" | "setup" | "script" | "commit";

/** One fact of a trace: which layer, what it decided, and why, and when. */
export interface Fact {
  layer: Stage;
  what: string;
  why?: string;
  span?: Span;
  beat?: number;
}

/** A source the renderer can print a caret into: a file's text, under its name. */
export interface Source {
  name: string;
  text: string;
}

/** A diagnostic with nothing but the required fields filled in. */
export function diagnostic(
  code: string,
  stage: Stage,
  message: string,
  rest: Partial<Omit<Diagnostic, "code" | "stage" | "message">> = {},
): Diagnostic {
  return {
    code,
    severity: "error",
    stage,
    message,
    dancers: [],
    trace: [],
    ...rest,
  };
}
