import type { Beat } from "@caller/core";
import { renderAbc } from "abcjs";
import { useEffect, useRef } from "react";
import type { Tune } from "../tunes/Tune.js";

/**
 * The tune's notation, rendered by abcjs, with the current measure
 * highlighted. Every bundled tune is written as four source lines of 8
 * bars each (one line per phrase: A1, A2, B1, B2), so beat -> line/measure
 * is a plain arithmetic mapping — see `packages/music/README.md`.
 */
export function Notation({ tune, beat }: NotationProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Re-render the notation whenever the tune's ABC changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    renderAbc(container, tune.abc, { add_classes: true });
    // abcjs sizes its SVG in pixels and gives it no `viewBox`, so a narrower
    // column clips the tune instead of scaling it. Turning the width and
    // height it chose into a `viewBox` makes the notation scale with whatever
    // space the page has, which is what a card beside a hall needs.
    const svg = container.querySelector("svg");
    const w = svg?.getAttribute("width");
    const h = svg?.getAttribute("height");
    if (svg && w !== null && h !== null && svg.getAttribute("viewBox") === null) {
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
      svg.removeAttribute("width");
      svg.removeAttribute("height");
    }
  }, [tune.abc]);

  // Move the highlight without a full re-render.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const beatsPerPhrase = tune.meter.beatsPerBar * tune.meter.barsPerPhrase;
    const barsPerLine = tune.meter.barsPerPhrase;
    const t = ((beat % tune.beatsPerCycle) + tune.beatsPerCycle) % tune.beatsPerCycle;
    const line = Math.floor(t / beatsPerPhrase);
    const measure = Math.floor((t % beatsPerPhrase) / tune.meter.beatsPerBar) % barsPerLine;

    container
      .querySelectorAll(`.${CURRENT_MEASURE_CLASS}`)
      .forEach((el) => el.classList.remove(CURRENT_MEASURE_CLASS));
    container
      .querySelectorAll(`.abcjs-l${line}.abcjs-m${measure}`)
      .forEach((el) => el.classList.add(CURRENT_MEASURE_CLASS));
  }, [beat, tune]);

  return <div className="caller-music-notation" ref={containerRef} />;
}

export interface NotationProps {
  tune: Tune;
  beat: Beat;
}

const CURRENT_MEASURE_CLASS = "caller-music-current-measure";
