import type { FacingStyle } from "@caller/hall";
import type { JSX } from "react";
import { useMemo } from "react";
import type { GalleryTile } from "../galleryTiles.js";
import { TraceSvg } from "./TraceSvg.js";
import { figureTrace } from "./figureTrace.js";
import { rowPenPlot, rowStrip } from "./traceDrawings.js";

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
 */
export function FigureTraces({ tile, side, reach, facing }: FigureTracesProps): JSX.Element {
  const drawings = useMemo(() => {
    const trace = figureTrace(tile);
    return { pen: rowPenPlot(trace, side, reach, facing), strip: rowStrip(trace, side) };
  }, [tile, side, reach, facing]);

  return (
    <div className="moves-row-traces" data-testid="moves-row-traces" data-key={tile.key}>
      <TraceSvg
        svg={drawings.pen}
        kind="pen"
        label={`${tile.title}: the path each dancer walks, larks gold and robins red, ones darker, with a tick a beat for facing`}
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
}
