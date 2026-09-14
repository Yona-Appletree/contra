import type { Dance } from "@caller/choreo";
import type { JSX } from "react";
import { useMemo } from "react";
import { TraceSvg } from "./TraceSvg.js";
import { danceTrace } from "./danceTrace.js";
import { cardPenPlot, cardStrip } from "./traceDrawings.js";

/**
 * What a dance card carries beside its phrases: the shape one time through
 * makes on the set, and the same time through as one cell per call.
 *
 * Small on purpose. The card is the thing a caller reads; these two are the
 * glance that says "this one is all circles" or "this one crosses the set four
 * times", and `#/dances/<slug>/traces` is where they are read properly.
 */
export function DanceTraces({ dance }: { dance: Dance }): JSX.Element {
  const drawings = useMemo(() => {
    const trace = danceTrace(dance);
    return { pen: cardPenPlot(trace), strip: cardStrip(trace) };
  }, [dance]);

  return (
    <div className="dance-traces" data-testid="dance-traces" data-slug={dance.slug}>
      <TraceSvg
        svg={drawings.strip}
        kind="strip"
        label={`${dance.title}: one cell per figure, each as wide as the figure is long`}
      />
      <TraceSvg
        svg={drawings.pen}
        kind="pen"
        label={`${dance.title}: the whole time through drawn on the set, larks gold and robins red`}
      />
    </div>
  );
}
