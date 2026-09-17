import type { FigureCall } from "@caller/choreo";
import type { FigureTexts } from "@caller/contra";
import { callWho, relationWords, renderSlot, resolveFigureText, whoOf } from "@caller/contra";
import type { JSX } from "react";
import { useMemo } from "react";
import type { DanceMove } from "./danceMoves.js";
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
export function MoveDetail({ move, onJump }: MoveDetailProps): JSX.Element {
  const texts = useMemo(() => walkthroughOf(move), [move]);
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
        {move.fullCall}
        {move.fullWith.map((line) => (
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
          <p className="pop-short">{texts.walkthrough.line}</p>
          <details>
            <summary>The long teach</summary>
            <p>{texts.walkthrough.teach}</p>
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
    chips.push(
      `${key}: ${renderSlot(key, value, "prose") ?? whoWords(value) ?? paramValueText(value)}`,
    );
  }
  return chips;
}

/**
 * A pairing or a role, in the caller's words — `[["1R", "2R"]]` is "the robins",
 * `"neighbors"` is "your neighbor" — through M13's own relation vocabulary,
 * which is what the walkthroughs themselves are resolved with.
 */
function whoWords(value: unknown): string | undefined {
  const who = whoOf(value);
  return who === undefined ? undefined : relationWords(who, "prose");
}

/** Parameters a dance record never writes: the loader threads them on. */
const THREADED = new Set(["from", "carried"]);

/**
 * This move's texts, resolved against its own parameters and the dancer it
 * names, or `undefined`.
 *
 * The same call the Moves page makes for a row (`galleryTiles.ts`, M13):
 * `resolveFigureText` fills the figure's own defaults in and throws by name on
 * a slot it has no words for — right for the dance page, wrong for a popup that
 * should still open on the rest of the move — so the throw is caught and the
 * popup says it has no text.
 */
function walkthroughOf(move: DanceMove): FigureTexts | undefined {
  const call: FigureCall = {
    figure: move.figure,
    beats: move.beats,
    ...(move.params === undefined ? {} : { params: move.params }),
    ...(move.who === undefined ? {} : { who: move.who }),
  };
  try {
    return resolveFigureText(
      move.figure,
      { ...(move.params ?? {}), beats: move.beats },
      { who: callWho(call) },
    );
  } catch {
    return undefined;
  }
}
