import type { Dance } from "@caller/choreo";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { TraceSvg } from "./TraceSvg.js";
import { ViewSwitch } from "./ViewSwitch.js";
import { danceTrace } from "./danceTrace.js";
import type { RowTraceView } from "./traceDrawings.js";
import {
  cardMarch,
  cardPenPlot,
  cardSeismograph,
  cardStrip,
  viewFromQuery,
  wrapFromQuery,
} from "./traceDrawings.js";

/**
 * The shape one time through a dance makes: the glance the U3 dance page
 * gives it, with the strip cell underneath.
 *
 * T4 gave the Moves rows a plot &middot; march &middot; seismo switch; this is the
 * same switch over the dance's own trace, `?view=` wired the same way — a deep
 * link to `#/dances/<slug>?view=march` opens on that view. The figure-strip
 * cell is not part of the switch and is always drawn, exactly as it is beside
 * a Moves row.
 *
 * `?wrap=0`/`?wrap=1` is T6's along-hall fold, read the same way as `?view=`
 * — `wrapFromQuery` returns `undefined` when the query says nothing, and
 * `danceTrace` itself defaults an `undefined` option to wrapped. Unlike
 * `view` this is not a switch a reader clicks: it is a URL-only comparison,
 * exactly as it is on `#/dances/<slug>/traces`, so it is read fresh from
 * `params` on every render rather than captured into state at mount.
 *
 * Small on purpose: this used to sit on the Stage's own card and on every
 * Dances-tab card, where the user found it "odd and random" under a live
 * simulation. U3 moved it here, the one place left that is quiet enough to
 * read a shape in.
 */
export function DanceTraces({
  dance,
  params,
}: {
  dance: Dance;
  params?: URLSearchParams;
}): JSX.Element {
  const [view, setView] = useState<RowTraceView>(() => viewFromQuery(params?.get("view") ?? null));
  const wrap = wrapFromQuery(params?.get("wrap") ?? null);
  // **A lab dance may not dance at all** (M8). The trace runs the real decider
  // over the real dance, and a record whose figures are still being worked out
  // throws somewhere inside it — which used to take the whole dance page down
  // with it, so a lab dance had no page at all and neither did its card or its
  // walkthrough. The drawings are the part that cannot be made; everything else
  // on the page can, so the failure is caught here and said in words, exactly as
  // the resolution table's already is.
  const drawings = useMemo(() => {
    try {
      const trace = danceTrace(dance, { wrap });
      return {
        plot: cardPenPlot(trace),
        march: cardMarch(trace),
        seismograph: cardSeismograph(trace),
        strip: cardStrip(trace),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [dance, wrap]);

  if ("error" in drawings) {
    return (
      <p className="text-xs" data-testid="dance-traces-error">
        This dance does not dance yet, so there is no shape to draw: {drawings.error}
      </p>
    );
  }

  return (
    <div
      className="dance-traces"
      data-testid="dance-traces"
      data-slug={dance.slug}
      data-view={view}
    >
      <ViewSwitch view={view} onChange={setView} testIdPrefix="dance-view" />
      <TraceSvg
        svg={drawings[view]}
        kind={view === "plot" ? "pen" : view}
        label={`${dance.title}: ${VIEW_LABEL[view]}`}
      />
      <TraceSvg
        svg={drawings.strip}
        kind="strip"
        label={`${dance.title}: one cell per figure, each as wide as the figure is long`}
      />
    </div>
  );
}

/** What each view's picture says, for the drawing's `aria-label`. */
const VIEW_LABEL: Record<RowTraceView, string> = {
  plot: "the whole time through drawn on the set, larks gold and robins red",
  march: "the same path marching across the beats, the set sliding right as they pass",
  seismograph: "each dancer's place across the set, then along it, against time",
};
