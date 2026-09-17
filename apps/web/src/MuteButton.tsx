import type { JSX } from "react";
import { SpeakerGlyph } from "./SpeakerGlyph.js";

/**
 * The Stage's mute chip: a 32 px speaker at the top-right of the hall canvas.
 *
 * **Mute is not pause** (round 2's ruling, AC4). Pause — the ▮▮ in the band
 * under the hall — freezes the whole evening; this only turns the band's
 * master gain down, so the dancers keep dancing, the notation's cursor keeps
 * walking and the beat stays a linear function of `AudioContext.currentTime`.
 * The two therefore look nothing alike and sit nowhere near each other: the
 * transport is a row of outlined pixel glyphs in the strip under the canvas,
 * this is a chip on the wall above it.
 *
 * The spike's `.pixbtn.xs` — the 44 px chip's face at 32 px, the glyph 16 px
 * wide. Muted shows the ×; unmuted shows the gold waves.
 */
export function MuteButton({
  muted,
  onToggle,
}: {
  muted: boolean;
  onToggle: () => void;
}): JSX.Element {
  const title = muted ? "Unmute the band" : "Mute the band";
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="hall-mute"
      className="stage-mute-button"
      aria-label={title}
      aria-pressed={muted}
      title={title}
    >
      <SpeakerGlyph waves={!muted} />
    </button>
  );
}
