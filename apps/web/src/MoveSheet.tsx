import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MoveDetail } from "./MoveDetail.js";
import type { DanceMove } from "./danceMoves.js";

/**
 * **The phone's dressing for the move popup** (D6): a bottom sheet over a
 * backdrop, portalled to `document.body`.
 *
 * A popover beside the call is a laptop's idea — on a 390 px screen the panel
 * is the screen, so it comes up from the bottom edge with a grab bar on it and
 * the page dimmed behind. It closes four ways: the ×, Escape, a tap on the
 * backdrop, and the Jump button, because a caller who has jumped is watching
 * the hall rather than reading about it.
 *
 * Portalled rather than rendered in place because the notecard is inside a
 * column that scrolls and has its own stacking context; `position: fixed`
 * inside one of those is fixed to *it*, not to the window.
 */
export function MoveSheet({
  move,
  onJump,
  onClose,
}: {
  move: DanceMove;
  onJump(): void;
  onClose(): void;
}): JSX.Element | null {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Where the focus was when the sheet opened — the ⓘ that opened it — so
  // closing puts it back rather than dropping it on the body.
  const openedFrom = useRef<Element | null>(null);

  useEffect(() => {
    openedFrom.current = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const was = openedFrom.current;
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (was instanceof HTMLElement) was.focus();
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div
        className="move-backdrop"
        aria-hidden="true"
        data-testid="hall-move-backdrop"
        onClick={onClose}
      />
      <div
        className="move-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="About this move"
        data-testid="hall-move-sheet"
      >
        <i className="grab" aria-hidden="true" />
        <button
          ref={closeRef}
          type="button"
          className="pop-x"
          aria-label="Close"
          data-testid="hall-move-close"
          onClick={onClose}
        >
          &times;
        </button>
        <MoveDetail move={move} onJump={onJump} />
      </div>
    </>,
    document.body,
  );
}
