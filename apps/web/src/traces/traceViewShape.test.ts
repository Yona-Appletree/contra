import type { Trace } from "@caller/choreo";
import { DEMO_DANCES } from "@caller/contra";
import type { TraceView } from "@caller/hall";
import { describe, expect, it } from "vitest";
import { danceTrace } from "./danceTrace.js";

/**
 * The seam between the sampler and the renderers.
 *
 * `@caller/choreo` measures a trace and `@caller/hall` draws one, and hall may
 * not import choreo (AGENTS.md's table: `core ← hall`, and nothing else), so the
 * two describe the same shape twice and this file is what keeps them the same
 * shape. The two constants below are typechecks, not runtime checks: add a
 * field to one side and not the other and `pnpm typecheck` fails here, not in
 * some page three packages away.
 */
type Extends<A, B> = [A] extends [B] ? true : false;

const TRACE_IS_A_VIEW: Extends<Trace, TraceView> = true;
const A_VIEW_IS_A_TRACE: Extends<TraceView, Trace> = true;

describe("a choreo Trace and a hall TraceView", () => {
  it("are the same shape in both directions", () => {
    expect(TRACE_IS_A_VIEW).toBe(true);
    expect(A_VIEW_IS_A_TRACE).toBe(true);
  });

  it("hand a real trace to a renderer with no adapter", () => {
    const trace = danceTrace(DEMO_DANCES[0]!);
    const view: TraceView = trace;
    expect(view.pens).toHaveLength(4);
  });
});
