import type { JSX } from "react";

/**
 * The play/pause control, an 8-bit speaker overlaid on a corner of the stage
 * (U3, the user: "the 'play' button is not at all obvious. it should be a
 * sound icon somewhere obvious, probably in the corner of the stage like a
 * shorts video? make it 8-bit themed").
 *
 * Two states, drawn as unit `<rect>`s on an integer grid with
 * `shape-rendering: crispEdges` in `hall.css` — no curves, no emoji: the
 * speaker body stays the theme's ink colour in both, and the "on" state adds
 * the gold accent's sound waves. Tapping calls `onToggle`, which is the same
 * click handler the old text button used — the user gesture the browser's
 * autoplay policy needs is unchanged, only the button's face is new.
 */
export function SpeakerButton({
  playing,
  onToggle,
}: {
  playing: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="hall-play"
      className="speaker-button"
      aria-label={playing ? "Pause music" : "Play music"}
      aria-pressed={playing}
      title={playing ? "Pause music" : "Play music"}
    >
      <svg viewBox="0 0 9 6" aria-hidden focusable="false">
        {/* The speaker body: a box and a cone, both the ink colour, in
            either state. */}
        <g className="speaker-body">
          <rect x="2" y="0" width="2" height="1" />
          <rect x="1" y="1" width="3" height="1" />
          <rect x="0" y="2" width="5" height="1" />
          <rect x="0" y="3" width="5" height="1" />
          <rect x="1" y="4" width="3" height="1" />
          <rect x="2" y="5" width="2" height="1" />
        </g>
        {playing ? (
          // Playing: two blocky waves off the cone, the gold accent.
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
    </button>
  );
}
