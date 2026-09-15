import type { FacingStyle } from "@caller/hall";
import type { JSX } from "react";
import { useMemo } from "react";
import type { GalleryTile } from "../galleryTiles.js";
import { TraceSvg } from "./TraceSvg.js";
import { figureTrace } from "./figureTrace.js";
import type { RowTraceView } from "./traceDrawings.js";
import { rowMarch, rowPenPlot, rowSeismograph, rowStrip } from "./traceDrawings.js";

/**
 * The shape a Moves row's move makes, under its tile.
 *
 * It sits inside the tile column rather than beside it, so the row's grid is
 * the two columns U2 laid out and nothing new can push the writing off a
 * phone. It is drawn once per tile and cached (`figureTrace`), because the row
 * around it re-renders on every beat.
 *
 * `reach` is the whole page's widest move, so the plots down the column are at
 * one scale: a balance draws small beside a hey instead of being blown up to
 * match it.
 *
 * `facing` is T3's `?facing=` query parameter, threaded down from the Moves
 * page; `undefined` draws the shipped default (ticks).
 *
 * `view` is T4's switch — plot, march or seismograph — one of the three shown
 * at a time in the same square footprint the pen plot always drew at; the
 * figure-strip cell underneath is not part of the switch and is always drawn.
 */
export function FigureTraces({
  tile,
  side,
  reach,
  facing,
  view,
  onView,
}: FigureTracesProps): JSX.Element {
  const drawings = useMemo(() => {
    const trace = figureTrace(tile);
    return {
      plot: rowPenPlot(trace, side, reach, facing),
      march: rowMarch(trace, side, facing),
      seismograph: rowSeismograph(trace, side),
      strip: rowStrip(trace, side),
    };
  }, [tile, side, reach, facing]);

  return (
    <div
      className="moves-row-traces"
      data-testid="moves-row-traces"
      data-key={tile.key}
      data-view={view}
    >
      <ViewSwitch view={view} onChange={onView} />
      <TraceSvg
        svg={drawings[view]}
        kind={view === "plot" ? "pen" : view}
        label={`${tile.title}: ${VIEW_LABEL[view]}`}
      />
      <TraceSvg svg={drawings.strip} kind="strip" label={`${tile.title}: its strip cell`} />
    </div>
  );
}

/** What the panel needs: the tile, the column it sits in, and the page scale. */
export interface FigureTracesProps {
  tile: GalleryTile;
  /** The tile column's width in px, which the plot is drawn square to. */
  side: number;
  /** The widest floor half-extent on the page, in set-local px. */
  reach: number;
  /** T3's `?facing=` override. `undefined` draws the default (ticks). */
  facing?: FacingStyle;
  /** T4's `?view=` switch: which of the three beat-based views is shown. */
  view: RowTraceView;
  /** Called when the reader taps a different view in the switch. */
  onView: (view: RowTraceView) => void;
}

/** What each view's picture says, for the drawing's `aria-label`. */
const VIEW_LABEL: Record<RowTraceView, string> = {
  plot: "the path each dancer walks, larks gold and robins red, ones darker, with a tick a beat for facing",
  march: "the same path marching across the beats, the set sliding right as they pass",
  seismograph: "each dancer's place across the set, then along it, against time",
};

/** The three options the switch offers, and the short label each button shows. */
const VIEW_OPTIONS: ReadonlyArray<{ key: RowTraceView; label: string; name: string }> = [
  { key: "plot", label: "plot", name: "pen plot" },
  { key: "march", label: "march", name: "march" },
  { key: "seismograph", label: "seismo", name: "seismograph" },
];

/**
 * The small plot · march · seismo switch (T4).
 *
 * Three short labels, not the full word "seismograph" — a 136 px column at
 * 390 px has no room for it — but every button's `aria-label` and `title`
 * still say the whole name.
 */
function ViewSwitch({
  view,
  onChange,
}: {
  view: RowTraceView;
  onChange: (view: RowTraceView) => void;
}): JSX.Element {
  return (
    <div
      className="moves-view-switch"
      role="group"
      aria-label="Trace view"
      data-testid="moves-view-switch"
    >
      {VIEW_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          aria-pressed={view === opt.key}
          aria-label={`${opt.name} view`}
          title={opt.name}
          data-testid={`moves-view-${opt.key}`}
          className={view === opt.key ? "moves-view-active" : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
