import type { Beat } from "@caller/core";
import { renderAbc } from "abcjs";
import { useEffect, useRef } from "react";
import type { Tune } from "../tunes/Tune.js";

/**
 * The tune's notation, rendered by abcjs, with the current measure
 * highlighted. Every bundled tune is written as four source lines of 8
 * bars each (one line per phrase: A1, A2, B1, B2), so beat -> line/measure
 * is a plain arithmetic mapping — see `packages/music/README.md`.
 *
 * On top of the notes it will draw, when the page asks for them, a **label**
 * at the left of each stave (the app writes "A1" … "B2" there), **captions**
 * under the bars they span (the calls), and an invisible **hit rect** per bar
 * so a click can seek. All three are positioned from the rendered SVG's own
 * `getBBox`, which only a browser has: in jsdom the component renders the
 * plain notation and appends nothing.
 */
export function Notation({
  tune,
  beat,
  showTitle = true,
  staveLabels,
  captions,
  onBarClick,
}: NotationProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Dropping the ABC's own `T:` header is how the title goes: abcjs draws it
  // inside the SVG and reserves the room for it there, so hiding it in CSS
  // would leave the gap behind. The rhythm marker ("jig", "reel") stays.
  const titled = showTitle ? tune.abc : tune.abc.replace(/^T:.*\r?\n/gm, "");

  const hasLabels = (staveLabels?.length ?? 0) > 0;
  const hasCaptions = (captions?.length ?? 0) > 0;
  const clickable = onBarClick !== undefined;
  // Captions need a band of empty paper under each stave, which is abcjs's
  // own `staffsep` — a directive in the ABC rather than a render option so it
  // travels with the text the layout is computed from.
  const abc = hasCaptions ? `%%staffsep ${String(CAPTION_STAFF_SEP)}\n${titled}` : titled;

  // What the decoration reads, without the decoration having to re-run every
  // time the page hands us a fresh array literal (the hall re-renders on every
  // beat). The keys below say when the *content* actually moved; this effect
  // is declared first, so the values are current by the time the decoration
  // effect runs in the same commit.
  const latest = useRef({ staveLabels, captions, onBarClick });
  useEffect(() => {
    latest.current = { staveLabels, captions, onBarClick };
  });

  // Re-render the notation whenever the tune's ABC changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    renderAbc(container, abc, {
      add_classes: true,
      // Room at the left for the stave labels; abcjs's own default is 15.
      ...(hasLabels ? { paddingleft: LABEL_GUTTER } : {}),
      // `staffsep` puts a band *between* staves; the last one needs its band
      // from the page's own bottom padding, or the caption under it is drawn
      // outside the viewBox and clipped.
      ...(hasCaptions ? { paddingbottom: CAPTION_PADDING_BOTTOM } : {}),
    });
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
    // abcjs also writes the height it laid the tune out at onto the container
    // as an inline style. Once the SVG scales to the column that height is the
    // wrong one — at a phone's width it left a third of a screen of blank
    // paper under the tune — so the container goes back to being as tall as
    // what is in it.
    container.style.height = "auto";
    container.style.overflow = "visible";
  }, [abc, hasLabels, hasCaptions]);

  // Draw (and redraw) the labels, captions and hit rects. Its dependencies are
  // a superset of the render effect's and it is declared after it, so a fresh
  // SVG is always decorated; a caption moving on its own (once a move) redraws
  // only this, leaving abcjs's layout — and the cursor's classes — alone.
  const labelsKey = (staveLabels ?? []).join("\u0000");
  const captionsKey = (captions ?? [])
    .map(
      (c) =>
        `${String(c.line)}:${String(c.fromBar)}:${String(c.bars)}:${c.current ? "1" : "0"}:${c.text}`,
    )
    .join("\u0000");
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    decorate(container, latest.current);
  }, [abc, hasLabels, hasCaptions, clickable, labelsKey, captionsKey]);

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

/** A span of bars with a word under it: one of the dance's calls. */
export interface NotationCaption {
  /** Which stave, 0-based (a stave is one line of the ABC: a phrase). */
  line: number;
  /** First bar of the span within the stave, 0-based. */
  fromBar: number;
  /** How many bars the span takes. */
  bars: number;
  text: string;
  /** Drawn in the cursor colour. */
  current?: boolean;
}

export interface NotationProps {
  tune: Tune;
  beat: Beat;
  /**
   * Whether abcjs draws the tune's own title over the first stave. Off for a
   * page that already captions the tune in its own type — the notation scales
   * to its column, and a title that scales with it stops being readable long
   * before the notes do.
   */
  showTitle?: boolean;
  /** One label per stave, at its left: the app writes "A1" … "B2" here. */
  staveLabels?: readonly string[];
  /** Words under the bars they span, trimmed with an ellipsis to fit. */
  captions?: readonly NotationCaption[];
  /** A click on a bar: which stave and which bar of it. Also gives every bar a pointer cursor. */
  onBarClick?: (line: number, measure: number) => void;
}

const CURRENT_MEASURE_CLASS = "caller-music-current-measure";
/** The group everything drawn here lives in, so a redraw is one `remove`. */
const DECORATION_CLASS = "caller-music-decoration";
const STAVE_LABEL_CLASS = "caller-music-stave-label";
const CAPTION_CLASS = "caller-music-caption";
const CAPTION_TICK_CLASS = "caller-music-caption-tick";
const BAR_HIT_CLASS = "caller-music-bar-hit";

/**
 * abcjs's `staffsep` while captions are shown, in its own layout units.
 *
 * Measured in a browser against a bundled tune: left alone, abcjs lays these
 * four staves 92 units apart, and at `staffsep 70` it lays them 124 apart — so
 * its default here is about 38, and 70 opens a band of roughly 31 units under
 * every stave, which is enough for one line of small type.
 */
const CAPTION_STAFF_SEP = 70;
/**
 * `paddingbottom` while captions are shown. abcjs's default of 15 leaves the
 * last stave's caption baseline exactly on the viewBox's bottom edge — the
 * descenders were being clipped — and 28 gives it the same band of paper the
 * staves above it get from `staffsep`. Measured in a browser against
 * Soldier's Joy at four staves; see this milestone's P2 report.
 */
const CAPTION_PADDING_BOTTOM = 28;
/** `paddingleft` while stave labels are shown; abcjs's default is 15. */
const LABEL_GUTTER = 26;
/** Where a stave label sits: hard left, a little below the stave's top. */
const LABEL_X = 2;
const LABEL_BASELINE = 11;
/** A caption's baseline, below the stave's bottom. */
const CAPTION_BASELINE = 14;
/** Room left at the right of a caption's span, so two captions never touch. */
const CAPTION_SIDE_PADDING = 4;
/** The hairline before a caption: from this far above its baseline to just below. */
const CAPTION_TICK_ABOVE = 6;
const CAPTION_TICK_BELOW = 1;
/** How far above the stave a bar's hit rect starts — over the chord symbols. */
const HIT_OVERHANG = 10;
const SVG_NS = "http://www.w3.org/2000/svg";

/** A rectangle in the SVG's own user units. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What {@link decorate} draws from: the props, read at the moment it runs. */
interface Decoration {
  staveLabels?: readonly string[] | undefined;
  captions?: readonly NotationCaption[] | undefined;
  onBarClick?: ((line: number, measure: number) => void) | undefined;
}

/**
 * Draw the labels, captions and hit rects into the SVG abcjs just rendered.
 *
 * Everything is positioned from the rendered elements' own `getBBox`, so the
 * drawing follows abcjs's layout instead of guessing at it — and so the whole
 * pass is skipped where `getBBox` does not exist, which is jsdom.
 */
function decorate(container: HTMLElement, { staveLabels, captions, onBarClick }: Decoration): void {
  const svg = container.querySelector("svg");
  if (!svg) return;
  svg.querySelectorAll(`.${DECORATION_CLASS}`).forEach((old) => old.remove());

  // The one place the browser is required: with no `getBBox` there is nothing
  // to position anything against, so jsdom keeps the plain notation.
  const wrappers = Array.from(container.querySelectorAll(".abcjs-staff-wrapper"));
  const firstWrapper = wrappers[0];
  if (firstWrapper === undefined || measurable(firstWrapper) === null) return;
  // Kept index-aligned with abcjs's own `abcjs-l{line}` numbering rather than
  // compacted, so a stave that cannot be measured costs only its own drawing.
  const staves = wrappers.map((wrapper) => boxOf([wrapper]));
  if (staves.every((stave) => stave === null)) return;

  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", DECORATION_CLASS);

  staves.forEach((stave, line) => {
    if (stave === null) return;
    const spans = barSpans(container, line, stave);
    const captionTop = (captions?.length ?? 0) === 0 ? 0 : CAPTION_BASELINE + CAPTION_TICK_BELOW;

    const label = staveLabels?.[line];
    if (label !== undefined && label !== "") {
      group.append(
        textAt(LABEL_X, stave.y + LABEL_BASELINE, label, STAVE_LABEL_CLASS, {
          current: false,
        }),
      );
    }

    if (onBarClick) {
      spans.forEach((span, measure) => {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("class", BAR_HIT_CLASS);
        rect.setAttribute("x", String(span.x));
        rect.setAttribute("y", String(stave.y - HIT_OVERHANG));
        rect.setAttribute("width", String(span.width));
        rect.setAttribute("height", String(stave.height + HIT_OVERHANG + captionTop));
        rect.setAttribute("fill", "transparent");
        // `stroke` is inherited in SVG and abcjs paints its notes with one, so
        // an unstated rect would draw a box around every bar.
        rect.setAttribute("stroke", "none");
        rect.dataset["line"] = String(line);
        rect.dataset["measure"] = String(measure);
        rect.style.cursor = "pointer";
        rect.addEventListener("click", () => {
          onBarClick(line, measure);
        });
        group.append(rect);
      });
    }

    let first = true;
    for (const caption of captions ?? []) {
      if (caption.line !== line) continue;
      const span = spanOf(spans, caption, stave);
      if (span === null) continue;
      const y = stave.y + stave.height + CAPTION_BASELINE;
      if (!first) {
        const tick = document.createElementNS(SVG_NS, "line");
        tick.setAttribute("class", CAPTION_TICK_CLASS);
        tick.setAttribute("x1", String(span.x));
        tick.setAttribute("x2", String(span.x));
        tick.setAttribute("y1", String(y - CAPTION_TICK_ABOVE));
        tick.setAttribute("y2", String(y + CAPTION_TICK_BELOW));
        group.append(tick);
      }
      first = false;
      const text = textAt(span.x, y, caption.text, CAPTION_CLASS, {
        current: caption.current === true,
      });
      group.append(text);
      // The text has to be in the document before it can be measured, so the
      // trim happens after the append rather than before it.
      fitText(text, caption.text, span.width - CAPTION_SIDE_PADDING);
    }
  });

  if (group.childNodes.length > 0) svg.append(group);
}

/**
 * The longest prefix of `text` that `fits`, with an ellipsis where anything
 * was dropped. Pure, so the measuring — which needs a browser — stays out of it.
 *
 * Never returns an empty string for a non-empty `text`: a caption trimmed to
 * nothing is a bug that looks like a layout, so the last resort is one
 * character and the ellipsis.
 */
export function trimToWidth(text: string, fits: (candidate: string) => boolean): string {
  if (text === "" || fits(text)) return text;
  for (let n = text.length - 1; n > 0; n--) {
    const candidate = `${text.slice(0, n).trimEnd()}…`;
    if (fits(candidate)) return candidate;
  }
  return `${text.slice(0, 1)}…`;
}

/** Trim `text`'s content in place until `getComputedTextLength` fits `width`. */
function fitText(element: SVGTextElement, text: string, width: number): void {
  if (typeof element.getComputedTextLength !== "function") return;
  element.textContent = trimToWidth(text, (candidate) => {
    element.textContent = candidate;
    return element.getComputedTextLength() <= width;
  });
}

/** A `<text>` at a point, in one of this file's classes. */
function textAt(
  x: number,
  y: number,
  content: string,
  className: string,
  { current }: { current: boolean },
): SVGTextElement {
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("class", current ? `${className} current` : className);
  // Inherited from abcjs's own drawing otherwise, which outlines the glyphs.
  text.setAttribute("stroke", "none");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.textContent = content;
  return text;
}

/** The x-span a caption covers: its first bar's left to its last bar's right. */
function spanOf(
  spans: readonly Box[],
  caption: NotationCaption,
  stave: Box,
): { x: number; width: number } | null {
  const from = spans[caption.fromBar];
  if (from === undefined) return null;
  const last = spans[caption.fromBar + Math.max(1, caption.bars) - 1];
  const right = last === undefined ? stave.x + stave.width : last.x + last.width;
  return { x: from.x, width: Math.max(0, right - from.x) };
}

/**
 * Each bar of one stave, as a box: from its own leftmost element to the next
 * bar's leftmost one, and the last bar to the stave's right edge. abcjs tags
 * every drawn element with `abcjs-l{line} abcjs-m{measure}`, which is the same
 * mechanism the beat cursor rides on.
 */
function barSpans(container: HTMLElement, line: number, stave: Box): Box[] {
  const lefts: Array<Box | null> = [];
  for (let measure = 0; measure < MAX_BARS_PER_STAVE; measure++) {
    const found = container.querySelectorAll(`.abcjs-l${line}.abcjs-m${measure}`);
    if (found.length === 0) break;
    lefts.push(boxOf(found));
  }
  return lefts.map((box, measure) => {
    if (box === null) return { x: stave.x, y: stave.y, width: 0, height: stave.height };
    const next = lefts.slice(measure + 1).find((b) => b !== null);
    const right = next ? next.x : stave.x + stave.width;
    return { x: box.x, y: stave.y, width: Math.max(0, right - box.x), height: stave.height };
  });
}

/** A guard against a tune whose classes run away; no bundled tune has more. */
const MAX_BARS_PER_STAVE = 64;

/** The element as something with a box, or `null` where `getBBox` is missing. */
function measurable(element: Element): SVGGraphicsElement | null {
  const graphic = element as SVGGraphicsElement;
  return typeof graphic.getBBox === "function" ? graphic : null;
}

/** The union of some elements' boxes, or `null` if there is nothing to measure. */
function boxOf(elements: ArrayLike<Element>): Box | null {
  let union: Box | null = null;
  for (const element of Array.from(elements)) {
    const graphic = measurable(element);
    if (graphic === null) return null;
    const { x, y, width, height } = graphic.getBBox();
    if (width === 0 && height === 0) continue;
    union =
      union === null
        ? { x, y, width, height }
        : {
            x: Math.min(union.x, x),
            y: Math.min(union.y, y),
            width: Math.max(union.x + union.width, x + width) - Math.min(union.x, x),
            height: Math.max(union.y + union.height, y + height) - Math.min(union.y, y),
          };
  }
  return union;
}
