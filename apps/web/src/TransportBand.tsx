import type { JSX } from "react";

/**
 * The Stage's transport: |◀◀ |◀ ▶/▮▮ ▶| ▶▶|, bare on the wall in the strip
 * under the hall (the spike's 1F, converged at round 3).
 *
 * Named for the band it fills rather than plain `Transport` because the
 * arithmetic behind the five presses already lives in `transport.ts`, and on a
 * case-insensitive filesystem `Transport.tsx` and `transport.ts` are the same
 * name — TypeScript resolves `../Transport.js` to the wrong one of the two.
 *
 * No chips and no borders — the glyphs sit straight on the hall's own wall
 * colour with a faint one-unit dark outline round each, which is what lets
 * them read against a wall that is nearly their own value. The outline is the
 * same rects drawn first, stroked two units wide with no fill, so only the
 * outer unit of the stroke shows past the shape the fill layer then paints
 * over it: one list of rectangles, two `<g>`s.
 *
 * Every glyph is on one 11-row grid — six-column triangles, one-column bars —
 * so the five of them share a baseline and a weight no matter how wide each
 * is. The bars are the gold accent, and so is the whole ▶ (the one thing on
 * the wall that says "start here"); ▮▮ is two two-unit bars in the ink
 * colour, because a paused evening is not an invitation.
 */
export function TransportBand(props: {
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrevDance: () => void;
  onPrevMove: () => void;
  onNextMove: () => void;
  onNextDance: () => void;
}): JSX.Element {
  const playLabel = props.playing ? "Pause" : "Play";
  return (
    <div className="caller-stage-band" data-testid="hall-transport">
      <Button
        testId="hall-prev-dance"
        label="Start of this dance"
        glyph={GLYPHS.prevDance}
        onPress={props.onPrevDance}
      />
      <Button
        testId="hall-prev-move"
        label="Start of this move"
        glyph={GLYPHS.prevMove}
        onPress={props.onPrevMove}
      />
      <Button
        testId="hall-play"
        label={playLabel}
        glyph={props.playing ? GLYPHS.pause : GLYPHS.play}
        onPress={props.playing ? props.onPause : props.onPlay}
        pressed={props.playing}
        // Only the ▶ face is gold; ▮▮ is the ink colour like the rest.
        accent={!props.playing}
      />
      <Button
        testId="hall-next-move"
        label="Next move"
        glyph={GLYPHS.nextMove}
        onPress={props.onNextMove}
      />
      <Button
        testId="hall-next-dance"
        label="Next dance"
        glyph={GLYPHS.nextDance}
        onPress={props.onNextDance}
      />
    </div>
  );
}

/** One rectangle of a glyph, in grid units; `gold` paints it the accent. */
interface GlyphRect {
  x: number;
  y: number;
  w: number;
  h: number;
  gold?: true;
}

/** A glyph: how many units wide its rects run, and the rects. */
interface Glyph {
  width: number;
  rects: readonly GlyphRect[];
}

/** The grid every glyph is drawn on: eleven rows, one unit to a row. */
const ROWS = 11;

/** A solid triangle pointing left, six columns from `x`, narrowest at the point. */
const triL = (x: number): GlyphRect[] =>
  [0, 1, 2, 3, 4, 5].map((i) => ({ x: x + i, y: 5 - i, w: 1, h: 2 * i + 1 }));

/** The same triangle pointing right, widest at the left. */
const triR = (x: number): GlyphRect[] =>
  [0, 1, 2, 3, 4, 5].map((i) => ({ x: x + i, y: i, w: 1, h: ROWS - 2 * i }));

/** The stop edge a skip lands on: one gold column, full height. */
const bar = (x: number): GlyphRect[] => [{ x, y: 0, w: 1, h: ROWS, gold: true }];

const GLYPHS: Record<
  "prevDance" | "prevMove" | "play" | "pause" | "nextMove" | "nextDance",
  Glyph
> = {
  prevDance: { width: 15, rects: [...bar(0), ...triL(2), ...triL(9)] },
  prevMove: { width: 8, rects: [...bar(0), ...triL(2)] },
  play: { width: 6, rects: triR(0) },
  pause: {
    width: 6,
    rects: [
      { x: 0, y: 0, w: 2, h: ROWS },
      { x: 4, y: 0, w: 2, h: ROWS },
    ],
  },
  nextMove: { width: 8, rects: [...triR(0), ...bar(7)] },
  nextDance: { width: 15, rects: [...triR(0), ...triR(7), ...bar(14)] },
};

function Button({
  testId,
  label,
  glyph,
  onPress,
  pressed,
  accent = false,
}: {
  testId: string;
  label: string;
  glyph: Glyph;
  onPress: () => void;
  /** Only ▶/▮▮ has a state to report; the four seeks are plain buttons. */
  pressed?: boolean;
  accent?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid={testId}
      className={accent ? "transport-button transport-button-accent" : "transport-button"}
      aria-label={label}
      title={label}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
    >
      <GlyphArt glyph={glyph} />
    </button>
  );
}

/**
 * The outline layer under the fill layer, from one list of rects.
 *
 * The viewBox is one unit bigger than the glyph on every side, so the outline
 * stroke — two units wide, half of it outside the shape — is not clipped.
 */
function GlyphArt({ glyph }: { glyph: Glyph }): JSX.Element {
  const rects = glyph.rects.map((r, i) => (
    <rect
      key={i}
      x={r.x}
      y={r.y}
      width={r.w}
      height={r.h}
      {...(r.gold === true ? { className: "gold" } : {})}
    />
  ));
  return (
    <svg viewBox={`-1 -1 ${String(glyph.width + 2)} 13`} aria-hidden focusable="false">
      <g className="transport-outline">{rects}</g>
      <g className="transport-fill">{rects}</g>
    </svg>
  );
}
