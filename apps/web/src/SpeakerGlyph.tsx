import type { JSX } from "react";

/**
 * The 8-bit speaker, as unit `<rect>`s on a 9 × 6 grid.
 *
 * Two controls draw it: the Tunes tab's play button (`SpeakerButton`) and the
 * Stage's mute chip (`MuteButton`), which want the same pixels and opposite
 * meanings — waves mean "sounding" on one and "not muted" on the other — so
 * the rects live here and each button says which face it wants. The classes
 * are the ones `hall.css` colours (`speaker-body` the ink, `speaker-waves`
 * the gold accent, `speaker-mute` the ink again), unchanged from when both
 * lists sat inside `SpeakerButton`.
 *
 * No curves and no emoji: `shape-rendering: crispEdges` in the stylesheet,
 * whole-number coordinates here, so it stays on the pixel grid at any size.
 */
export function SpeakerGlyph({ waves }: { waves: boolean }): JSX.Element {
  return (
    <svg viewBox="0 0 9 6" aria-hidden focusable="false">
      {/* The speaker body: a box and a cone, both the ink colour, in either state. */}
      <g className="speaker-body">
        <rect x="2" y="0" width="2" height="1" />
        <rect x="1" y="1" width="3" height="1" />
        <rect x="0" y="2" width="5" height="1" />
        <rect x="0" y="3" width="5" height="1" />
        <rect x="1" y="4" width="3" height="1" />
        <rect x="2" y="5" width="2" height="1" />
      </g>
      {waves ? (
        // Sounding: two blocky waves off the cone, the gold accent.
        <g className="speaker-waves">
          <rect x="6" y="2" width="1" height="2" />
          <rect x="7.5" y="1" width="1" height="4" />
        </g>
      ) : (
        // Silent: a blocky × where the waves would be, the ink colour.
        <g className="speaker-mute">
          <rect x="6" y="1" width="1" height="1" />
          <rect x="8" y="1" width="1" height="1" />
          <rect x="7" y="2" width="1" height="1" />
          <rect x="6" y="3" width="1" height="1" />
          <rect x="8" y="3" width="1" height="1" />
        </g>
      )}
    </svg>
  );
}
