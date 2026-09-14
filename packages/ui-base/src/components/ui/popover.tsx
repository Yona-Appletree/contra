import type { CSSProperties, JSX, ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inflateRect, mergedOutlinePath, type OutlineRect } from "../../lib/mergedOutlinePath.js";
import { cn } from "../../lib/utils.js";

/**
 * The contiguous popover: a trigger and its panel drawn as **one** shape.
 *
 * Neither the trigger button nor the panel paints a border, a background or a
 * shadow of its own. While open, a single SVG path — the rounded union of
 * their two rects, see `lib/mergedOutlinePath.ts` — draws all three in a
 * fixed layer portalled to `document.body`, so the panel escapes any
 * `overflow` on the trigger's ancestors and the two read as one piece of
 * chrome with concave fillets where they meet. The outline swells by
 * {@link TRIGGER_INFLATE_PX} around the trigger while open, which is what
 * makes opening read as diving into the button rather than dropping a card
 * next to it.
 *
 * Because the layer paints above the page, the trigger's *visual* re-parents
 * into it while open; the in-flow button stays as an invisible placeholder
 * holding layout and keyboard focus, and its content still renders (at
 * `opacity: 0`, with its size pinned) so its baseline — and therefore the
 * line box around it — cannot move when the popover opens. Triggers must
 * therefore stay presentational: the subtree renders twice while open.
 *
 * Ported from lightplayer's `base/popover.rs` (placement, the swelling
 * outline, the open/close animation, the close handle). Anchored mode — where
 * the outline welds to an external element instead of the trigger — is
 * deliberately not ported.
 */
export function Popover({
  trigger,
  label,
  title,
  placement = "bottom-end",
  className,
  openClassName,
  panelClassName,
  panelStyle,
  triggerTestId,
  panelTestId,
  children,
}: PopoverProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [triggerRect, setTriggerRect] = useState<RectSnapshot | null>(null);
  const [panelSize, setPanelSize] = useState<SizeSnapshot | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The animation reads where it is starting from; a state read inside the
  // effect would be one render stale when a close interrupts an open.
  const progressRef = useRef(0);
  // Focus returns to the trigger on close, but only when the popover was
  // actually open: restoring on mount would steal focus from the page.
  const wasOpen = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const advance = useCallback((value: number) => {
    progressRef.current = value;
    setProgress(value);
  }, []);

  const measure = useCallback(() => {
    const button = triggerRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setTriggerRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    }
    const panel = panelRef.current;
    if (panel) {
      const box = panel.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) setPanelSize({ width: box.width, height: box.height });
    }
  }, []);

  const measured = triggerRect !== null && panelSize !== null;

  // Open/close animation. A rAF loop rather than a CSS transition: the shape
  // is re-unioned from an interpolated panel rect every frame, so corners
  // appear and grow as segments become long enough to hold them, which no
  // path interpolation can do. `prefers-reduced-motion` jumps to the end.
  //
  // The entrance waits for the first measurement: until trigger and panel
  // have both been measured there is no shape to grow, and starting early
  // would spend the timeline on an invisible panel.
  useEffect(() => {
    if (open && !measured) return;
    const target = open ? 1 : 0;
    const from = progressRef.current;
    if (from === target) return;
    if (reducedMotion()) {
      advance(target);
      return;
    }
    const duration = (open ? OPEN_ANIM_MS : CLOSE_ANIM_MS) * Math.abs(target - from);
    let raf = 0;
    let start: number | null = null;
    const step = (now: number): void => {
      start ??= now;
      const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
      advance(from + (target - from) * t);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [open, measured, advance]);

  // Measure while open, and keep measuring: the panel's own content can grow
  // (a fetch landing), the page can scroll, the window can resize.
  useEffect(() => {
    if (!open) return;
    measure();
    const onChange = (): void => {
      measure();
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    const panel = panelRef.current;
    const observer = panel ? new ResizeObserver(onChange) : null;
    if (panel && observer) observer.observe(panel);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      observer?.disconnect();
    };
  }, [open, measure]);

  // Escape dismisses from anywhere, including from inside the panel.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const rendered = open || progress > 0;
  const position =
    triggerRect && panelSize ? popoverPosition(triggerRect, panelSize, placement) : null;
  // The merged chrome activates once the first measurement lands; until then
  // the trigger keeps its ordinary open look, so nothing flashes.
  const attached = rendered && position !== null && progress > 0;
  const t = Math.min(1, Math.max(0, progress));

  const shape =
    attached && triggerRect && panelSize && position
      ? animatedOutline(triggerRect, panelSize, position, t)
      : null;

  return (
    <span className="relative inline-grid min-w-0 place-items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={title}
        data-testid={triggerTestId}
        data-open={open ? "1" : undefined}
        className={cn(open ? (openClassName ?? className) : className, "cursor-pointer")}
        style={
          attached && triggerRect
            ? {
                opacity: 0,
                boxShadow: "none",
                width: triggerRect.width,
                height: triggerRect.height,
              }
            : undefined
        }
        onClick={(event) => {
          event.stopPropagation();
          if (!open) measure();
          setOpen((was) => !was);
        }}
      >
        {trigger}
      </button>
      {rendered && typeof document !== "undefined"
        ? createPortal(
            <div style={LAYER_STYLE} data-testid={panelTestId ? `${panelTestId}-layer` : undefined}>
              {/* Outside click. Covers the viewport under the panel and the
                  trigger's copy, both of which sit above it in the layer. */}
              <div
                aria-hidden="true"
                style={BACKDROP_STYLE}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  close();
                }}
              />
              <svg aria-hidden="true" style={SVG_STYLE}>
                <path
                  d={shape?.path ?? ""}
                  fillRule="evenodd"
                  fill="var(--popover-fill, var(--color-secondary))"
                  stroke="var(--popover-border, var(--color-border))"
                  strokeWidth={POPOVER_BORDER_WIDTH_PX}
                  style={{ filter: "drop-shadow(0 12px 28px rgb(0 0 0 / 0.45))" }}
                />
              </svg>
              <div
                ref={panelRef}
                role="dialog"
                aria-label={label}
                data-testid={panelTestId}
                data-settled={t >= 1 && position !== null ? "1" : "0"}
                // The panel keeps its layout but paints no chrome of its own:
                // the outline path owns background, border and shadow.
                className={cn(panelClassName, "m-0 border-0 bg-transparent shadow-none")}
                style={{
                  position: "fixed",
                  zIndex: 2,
                  pointerEvents: "auto",
                  left: position?.left ?? 0,
                  top: position?.top ?? 0,
                  visibility: position ? "visible" : "hidden",
                  clipPath: shape?.clip ?? "none",
                  ...panelStyle,
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
              >
                <div style={contentStyle(t)}>
                  <PopoverCloseContext.Provider value={close}>
                    {children}
                  </PopoverCloseContext.Provider>
                </div>
              </div>
              {attached && triggerRect ? (
                <div
                  aria-hidden="true"
                  className={cn(
                    openClassName ?? className,
                    "grid place-items-center border-transparent bg-transparent p-0 shadow-none",
                  )}
                  style={{
                    position: "fixed",
                    zIndex: 3,
                    pointerEvents: "auto",
                    left: triggerRect.x,
                    top: triggerRect.y,
                    width: triggerRect.width,
                    height: triggerRect.height,
                    background: "transparent",
                    boxShadow: "none",
                    cursor: "pointer",
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    close();
                  }}
                >
                  {trigger}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

export interface PopoverProps {
  /** The trigger button's content. Presentational only — it renders twice while open. */
  trigger: ReactNode;
  /** Accessible name for both the trigger and the panel. */
  label: string;
  /** Hover title on the trigger. An icon-only trigger should carry its detail here. */
  title?: string;
  placement?: PopoverPlacement;
  /** Classes on the in-flow trigger button. */
  className?: string;
  /** Classes on the trigger while open; falls back to {@link PopoverProps.className}. */
  openClassName?: string;
  /** Classes on the panel. Give it its width, padding and text colour; never its chrome. */
  panelClassName?: string;
  panelStyle?: CSSProperties;
  triggerTestId?: string;
  panelTestId?: string;
  children: ReactNode;
}

/** Which side the panel goes on, and which of its edges lines up with the trigger's. */
export type PopoverPlacement =
  "bottom-start" | "bottom-middle" | "bottom-end" | "top-start" | "top-middle" | "top-end";

const PopoverCloseContext = createContext<(() => void) | null>(null);

/**
 * Close the enclosing popover, for menu-style content that dismisses on
 * selection. A no-op outside a popover, so a row can be used either way.
 */
export function usePopoverClose(): () => void {
  const close = useContext(PopoverCloseContext);
  return useCallback(() => {
    close?.();
  }, [close]);
}

/** Margin kept between the panel and the viewport edge. */
const POPOVER_MARGIN_PX = 12;
const POPOVER_BORDER_WIDTH_PX = 1;
const POPOVER_CORNER_RADIUS_PX = 8;
/** The outline swells this much around the trigger while open ("diving in"). */
const TRIGGER_INFLATE_PX = 3;
/**
 * A shelf narrower than the corner radius reads as a rendering mistake, so a
 * panel edge within this distance of a trigger edge snaps to weld exactly.
 */
const EDGE_SNAP_PX = POPOVER_CORNER_RADIUS_PX;
const OPEN_ANIM_MS = 160;
const CLOSE_ANIM_MS = 120;
/** The panel's content starts fading in after this fraction of the open timeline. */
const CONTENT_FADE_DELAY = 0.1;

const LAYER_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  pointerEvents: "none",
  // Defaults the consumer can override: the wall, one shade up from the tab
  // bar it opens out of, with the page's own hairline.
  ["--popover-fill" as string]: "var(--color-secondary)",
  ["--popover-border" as string]: "var(--color-border)",
};
const BACKDROP_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
  pointerEvents: "auto",
  background: "transparent",
};
const SVG_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1,
  width: "100vw",
  height: "100vh",
  overflow: "visible",
  pointerEvents: "none",
};

interface RectSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface SizeSnapshot {
  width: number;
  height: number;
}
interface PopoverPosition {
  left: number;
  top: number;
  side: "above" | "below";
}

/**
 * Where the panel goes: the requested side unless it does not fit and the
 * other one does, aligned on the trigger's **visible** (inflated) edge, then
 * clamped into the viewport and magnetically welded to a trigger edge it
 * nearly touches.
 *
 * Exported for tests; the component calls it every measured frame.
 */
export function popoverPosition(
  anchor: RectSnapshot,
  panel: SizeSnapshot,
  placement: PopoverPlacement,
  viewport: SizeSnapshot = {
    width: typeof window === "undefined" ? 1024 : window.innerWidth,
    height: typeof window === "undefined" ? 768 : window.innerHeight,
  },
): PopoverPosition {
  const wanted = placement.startsWith("top") ? "above" : "below";
  const topFor = (side: "above" | "below"): number =>
    side === "below"
      ? anchor.y + anchor.height - POPOVER_BORDER_WIDTH_PX
      : anchor.y - panel.height + POPOVER_BORDER_WIDTH_PX;
  const maxTop = viewport.height - panel.height - POPOVER_MARGIN_PX;
  const fits = (side: "above" | "below"): boolean =>
    side === "below" ? topFor("below") <= maxTop : topFor("above") >= POPOVER_MARGIN_PX;
  const other = wanted === "below" ? "above" : "below";
  const side = fits(wanted) || !fits(other) ? wanted : other;
  const top = clamp(topFor(side), POPOVER_MARGIN_PX, Math.max(POPOVER_MARGIN_PX, maxTop));

  const visible = inflateRect(
    { x: anchor.x, y: anchor.y, w: anchor.width, h: anchor.height },
    TRIGGER_INFLATE_PX,
  );
  const align = placement.endsWith("start")
    ? "start"
    : placement.endsWith("middle")
      ? "middle"
      : "end";
  const desired =
    align === "start"
      ? visible.x
      : align === "middle"
        ? visible.x + (visible.w - panel.width) / 2
        : visible.x + visible.w - panel.width;
  const maxLeft = Math.max(POPOVER_MARGIN_PX, viewport.width - panel.width - POPOVER_MARGIN_PX);
  const clamped = clamp(desired, POPOVER_MARGIN_PX, maxLeft);
  // Weld rather than leave a sub-radius shelf: the nearer edge wins, and the
  // shift may exceed the viewport margin by up to the snap distance.
  const forLeft = visible.x - clamped;
  const forRight = visible.x + visible.w - (clamped + panel.width);
  const shift = Math.abs(forLeft) <= Math.abs(forRight) ? forLeft : forRight;
  const left = Math.abs(shift) <= EDGE_SNAP_PX ? clamped + shift : clamped;

  return { left: snapToDevicePx(left), top: snapToDevicePx(top), side };
}

/**
 * The merged trigger+panel outline at animation time `t` (0 closed, 1
 * settled), plus the `clip-path` that reveals the panel's content in step
 * with the growing shape.
 *
 * The animation interpolates the panel's *input rect* and re-unions every
 * frame; the path itself is never morphed.
 */
function animatedOutline(
  anchor: RectSnapshot,
  panel: SizeSnapshot,
  position: PopoverPosition,
  t: number,
): { path: string; clip: string } {
  const inflate = TRIGGER_INFLATE_PX * easeOutCubic(clamp(t / 0.5, 0, 1));
  const anchorRect = inflateRect(
    { x: anchor.x, y: anchor.y, w: anchor.width, h: anchor.height },
    inflate,
  );
  const finalRect: OutlineRect = {
    x: position.left,
    y: position.top,
    w: panel.width,
    h: panel.height,
  };
  const panelRect = panelRectAt(t, anchorRect, finalRect, position.side);
  return {
    path: mergedOutlinePath(
      [anchorRect, panelRect],
      POPOVER_CORNER_RADIUS_PX,
      typeof window === "undefined" ? 1 : window.devicePixelRatio,
    ),
    clip: panelClip(t, panelRect, finalRect),
  };
}

/**
 * The panel's input rect at animation time `t`: a sliver at the trigger's
 * seam edge growing out to its final rect. The seam edge overlaps the
 * (inflated) trigger by the border width so the union always merges, and it
 * lerps to the *final* rect's edge rather than the trigger's — when the panel
 * fits on its side those are the same value, and when the viewport clamp slid
 * it back across its own trigger they are not, and the drawn box must land on
 * the panel's actual rect or the chrome detaches from its content.
 */
function panelRectAt(
  t: number,
  anchor: OutlineRect,
  fin: OutlineRect,
  side: "above" | "below",
): OutlineRect {
  const eased = easeOutCubic(t);
  const left = lerp(anchor.x, fin.x, eased);
  const right = lerp(anchor.x + anchor.w, fin.x + fin.w, eased);
  if (side === "below") {
    const seam = anchor.y + anchor.h - POPOVER_BORDER_WIDTH_PX;
    const top = lerp(seam, fin.y, eased);
    const bottom = lerp(anchor.y + anchor.h, fin.y + fin.h, eased);
    return { x: left, y: top, w: right - left, h: Math.max(0, bottom - top) };
  }
  const seam = anchor.y + POPOVER_BORDER_WIDTH_PX;
  const bottom = lerp(seam, fin.y + fin.h, eased);
  const top = lerp(anchor.y, fin.y, eased);
  return { x: left, y: top, w: right - left, h: Math.max(0, bottom - top) };
}

/** An inset revealing exactly the animated box; `none` once settled. */
function panelClip(t: number, panelRect: OutlineRect, finalRect: OutlineRect): string {
  if (t >= 1) return "none";
  const top = Math.max(0, panelRect.y - finalRect.y);
  const right = Math.max(0, finalRect.x + finalRect.w - (panelRect.x + panelRect.w));
  const bottom = Math.max(0, finalRect.y + finalRect.h - (panelRect.y + panelRect.h));
  const left = Math.max(0, panelRect.x - finalRect.x);
  return `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px round ${String(POPOVER_CORNER_RADIUS_PX)}px)`;
}

/** Fade and slide for the panel's content, delayed slightly behind the shape. */
function contentStyle(t: number): CSSProperties {
  const eased = easeOutCubic(clamp((t - CONTENT_FADE_DELAY) / (1 - CONTENT_FADE_DELAY), 0, 1));
  if (eased >= 1) return { opacity: 1, transform: "none" };
  return { opacity: eased, transform: `translateY(${(-6 * (1 - eased)).toFixed(1)}px)` };
}

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function snapToDevicePx(value: number): number {
  const dpr =
    typeof window === "undefined" || window.devicePixelRatio <= 0 ? 1 : window.devicePixelRatio;
  return Math.round(value * dpr) / dpr;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
