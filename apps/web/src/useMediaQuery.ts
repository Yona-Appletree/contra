import { useEffect, useState } from "react";

/**
 * Whether a CSS media query matches right now, kept live.
 *
 * The page already has a breakpoint written out as a string (`WIDE_QUERY` in
 * `routes/hall.tsx`) because the auto-zoom arithmetic has to agree with the
 * layout about which one is running. P4 adds a second consumer — the move
 * popup is a bottom sheet on a phone and a popover beside the call on a laptop
 * — and that is a *rendering* choice rather than a measurement, so it needs
 * the answer in React state rather than in an effect that writes a number.
 *
 * Server-side (the static render `hall.test.tsx` does, which has no `window`
 * at all) it answers `false`: the narrow dressing is the one that needs no
 * measurement, so a page rendered without a viewport is rendered phone-first.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => queryMatches(query));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const onChange = (): void => {
      setMatches(media.matches);
    };
    // The window may have been resized between the first render and this
    // effect, and a stale `false` would leave a laptop with the phone's sheet.
    onChange();
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [query]);
  return matches;
}

function queryMatches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}
