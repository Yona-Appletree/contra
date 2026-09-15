import type { JSX } from "react";

/**
 * The reset control (U4, the user: "we do need a pause and reset button" —
 * the speaker U3 added is the play/pause; this is the reset). Tapping it
 * returns the dance now playing to the very start of its own line-up — the
 * same beat a fresh selection of it starts at (U4's requirement 6) — rather
 * than to its dancing beat 0.
 *
 * Pixel-art like `SpeakerButton`, at the same size and hit area: unit
 * `<rect>`s on an integer grid with `shape-rendering: crispEdges` in
 * `hall.css`, no curves, no emoji. A "skip to the start" glyph — a solid
 * triangle pointing back at a stop bar — reads unambiguously at 22 px, where
 * a circular arrow's curve would not survive the pixel grid. The triangle is
 * the theme's ink colour; the bar is `--primary`, the same "on" accent the
 * speaker's waves use (director ruling DD42), so the two controls read as a
 * pair.
 */
export function ResetButton({ onReset }: { onReset: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onReset}
      data-testid="hall-reset"
      className="reset-button"
      aria-label="Restart this dance"
      title="Restart this dance"
    >
      <svg viewBox="0 0 8 7" aria-hidden focusable="false">
        {/* A solid triangle pointing left — "skip back" — built one column of
            rects at a time, narrowest at the point and widest at the base. */}
        <g className="reset-triangle">
          <rect x="0" y="3" width="1" height="1" />
          <rect x="1" y="2" width="1" height="3" />
          <rect x="2" y="1" width="1" height="5" />
          <rect x="3" y="0" width="1" height="7" />
          <rect x="4" y="0" width="1" height="7" />
        </g>
        {/* The stop edge: the start you skip back to. */}
        <g className="reset-bar">
          <rect x="6" y="0" width="1" height="7" />
        </g>
      </svg>
    </button>
  );
}
