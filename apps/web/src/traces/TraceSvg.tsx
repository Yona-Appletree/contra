import type { JSX } from "react";

/**
 * One trace drawing on the page.
 *
 * The renderers in `@caller/hall` return SVG as a string — they have to, since
 * the same four functions write the files `pnpm traces:export` commits — so the
 * app drops that string in rather than building a React tree twice. It is the
 * app's own markup, built from the app's own data by a pure function in a
 * workspace package; nothing here is user input.
 */
export function TraceSvg({ svg, kind, label }: TraceSvgProps): JSX.Element {
  return (
    <div
      className="trace-svg"
      data-testid="trace-svg"
      data-kind={kind}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** What one drawing needs to go on the page. */
export interface TraceSvgProps {
  svg: string;
  /** Which of the four this is, for the tests and the screenshots. */
  kind: "pen" | "march" | "seismograph" | "strip";
  /** What a screen reader says instead of the picture. */
  label: string;
}
