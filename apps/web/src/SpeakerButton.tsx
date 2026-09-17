import type { JSX } from "react";
import { SpeakerGlyph } from "./SpeakerGlyph.js";

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
 *
 * P3 took the Stage's copy of this away (the transport under the hall is the
 * play control now, and the mute chip at the stage's top-right is the other
 * speaker) and the pixels moved into {@link SpeakerGlyph}; what is left here
 * is the Tunes tab's per-tune play button, unchanged.
 */
export function SpeakerButton({
  playing,
  onToggle,
  testId = "hall-play",
  label,
}: {
  playing: boolean;
  onToggle: () => void;
  /** The Tunes tab (F4) puts one on every card, so the test id is a prop; the Stage keeps its own. */
  testId?: string;
  /** What the button says it does, when "Play music" is not it: "Play Soldier's Joy". */
  label?: string;
}): JSX.Element {
  const title = label ?? (playing ? "Pause music" : "Play music");
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={testId}
      className="speaker-button"
      aria-label={title}
      aria-pressed={playing}
      title={title}
    >
      <SpeakerGlyph waves={playing} />
    </button>
  );
}
