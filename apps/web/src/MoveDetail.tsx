import type { Dance } from "@caller/choreo";
import {
  contraDataFigures,
  createContraRegistry,
  formationFor,
  probeGroup,
  renderSlot,
} from "@caller/contra";
import type { JSX } from "react";
import { useMemo } from "react";
import type { DanceMove } from "./danceMoves.js";
import { textsFor } from "./danceWalkthrough.js";
import { paramValueText } from "./moveParams.js";

/**
 * **What is behind the ⓘ** (AC7): one move of this dance, said four ways.
 *
 * The figure's name and where it falls in the cycle; the dance's own call with
 * its `‖` branches; the tuning as chips, in the caller's words rather than in
 * the record's; the short walkthrough resolved against *this* call's own
 * parameters, with the full teach behind a disclosure; then the jump and the
 * two links out to the move's own pages.
 *
 * One component for both dressings (D6). The bottom sheet on a phone and
 * `@caller/ui-base`'s `Popover` on a laptop are two pieces of chrome around
 * exactly this, which is what keeps them from drifting apart — the sheet owns
 * its backdrop and its ×, the popover owns its outline, and neither owns a
 * word of the content.
 */
export function MoveDetail({ move, dance, onJump }: MoveDetailProps): JSX.Element {
  const texts = useMemo(() => walkthroughOf(move, dance), [move, dance]);
  const title = figureTitle(move.figure);
  return (
    <div className="move-detail" data-testid="hall-move-detail" data-figure={move.figure}>
      <div className="pop-head">
        <b>{title}</b>
        {/* 1-based within the cycle, as a caller counts: "A2 · beats 9–16". */}
        <span className="dim">
          {move.phrase} &middot; beats {move.start + 1}&ndash;{move.start + move.beats}
        </span>
      </div>
      <p className="pop-call">
        {move.call}
        {move.with.map((line) => (
          <span key={line} className="with">
            {line}
          </span>
        ))}
      </p>
      <p className="pop-params">
        {paramChips(move).map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </p>
      {texts === undefined ? (
        <p className="pop-short">No text for this move yet.</p>
      ) : (
        <>
          <p className="pop-short">{texts.walkthrough.short}</p>
          <details>
            <summary>The long teach</summary>
            <p>{texts.walkthrough.long}</p>
          </details>
        </>
      )}
      <div className="pop-actions">
        <button type="button" className="jump" data-testid="move-detail-jump" onClick={onJump}>
          &#9654; Jump here
        </button>
        <a href={`#/moves/${move.figure}`}>{title} on the Moves page &rarr;</a>
        <a href={`#/moves/${move.figure}/traces`}>all views</a>
      </div>
    </div>
  );
}

export interface MoveDetailProps {
  move: DanceMove;
  /** For the walkthrough's group, which is the dance's own formation. */
  dance: Dance;
  /** "▶ Jump here": seeks as a tap on the call does, and closes the popup. */
  onJump(): void;
}

/**
 * The figure's name, in words.
 *
 * The Moves page titles a figure tile with its bare id (`galleryTiles.ts`'
 * `title`), and the library's definitions carry no display name of their own,
 * so this is the id read out: hyphens become spaces and the first letter is
 * capitalised. {@link HYPHENATED} is the short list of ids a caller writes with
 * the hyphens in — "do-si-do" is one word with two hyphens, not three words.
 */
export function figureTitle(id: string): string {
  // A dance-local figure is written `<dance-slug>/<id>` (D10); only the id is
  // the move's name.
  const bare = id.slice(id.lastIndexOf("/") + 1);
  const words = HYPHENATED.has(bare) ? bare : bare.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Figure ids whose hyphens are part of the word rather than gaps between words. */
const HYPHENATED = new Set(["do-si-do", "si-do"]);

/**
 * The chips: how long the move is, then the tuning the **record** wrote, in the
 * words the text layer uses for each value.
 *
 * `renderSlot(key, value, "prose")` is the same vocabulary the walkthroughs are
 * resolved in — `pairs: [["1R","2R"]]` is "the other robin", not a list of
 * station ids — and a parameter it has no words for falls back to the value as
 * the Moves page writes it.
 *
 * `from` and `carried` are left out: they are threaded on to a call at load
 * time (where the dance has the set standing, what it is carrying in), not
 * something a choreographer wrote.
 */
export function paramChips(move: DanceMove): string[] {
  const params = (move.params ?? {}) as Record<string, unknown>;
  const chips = [`${String(move.beats)} beats`];
  for (const [key, value] of Object.entries(params)) {
    if (THREADED.has(key)) continue;
    chips.push(`${key}: ${renderSlot(key, value, "prose") ?? paramValueText(value)}`);
  }
  return chips;
}

/** Parameters a dance record never writes: the loader threads them on. */
const THREADED = new Set(["from", "carried"]);

/**
 * This move's walkthrough, resolved against its own parameters, or `undefined`.
 *
 * The registry and the probe group are exactly what the dance page's own
 * walkthrough uses (`danceWalkthrough.ts`): the interpreted definitions in the
 * registry, because a programme dance calls figures that are data and have no
 * coded twin, and a plain four-station group in the dance's own formation,
 * because the `{where}` landmark reads the four canonical stations off it.
 */
function walkthroughOf(move: DanceMove, dance: Dance): ReturnType<typeof textsFor> {
  const registry = createContraRegistry(contraDataFigures());
  const group = probeGroup(formationFor(dance), 4);
  return textsFor(registry, group, {
    figure: move.figure,
    beats: move.beats,
    ...(move.params === undefined ? {} : { params: move.params }),
  });
}
