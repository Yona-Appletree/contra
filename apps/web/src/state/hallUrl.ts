/** The front page's URL: which dance, and which tune set. */
export interface HallRoute {
  /** The dance slug from `#/dance/<slug>`, or `undefined` on `#/`. */
  dance: string | undefined;
  /** The medley slug from `?tune=<slug>`, or `undefined`. */
  tune: string | undefined;
}

/** Read `#/dance/<slug>?tune=<slug>`; `#/` and an empty hash both mean "the top". */
export function readHallRoute(path: string, params: URLSearchParams): HallRoute {
  const parts = path.split("/").filter((s) => s.length > 0);
  const dance = parts[0] === "dance" ? parts[1] : undefined;
  return {
    ...(dance === undefined || dance === "" ? { dance: undefined } : { dance }),
    tune: params.get("tune") ?? undefined,
  };
}

/** The hash for a dance and a tune set. */
export function hallHash(dance: string | undefined, tune: string | undefined): string {
  const path = dance === undefined ? "#/" : `#/dance/${dance}`;
  return tune === undefined ? path : `${path}?tune=${tune}`;
}

/**
 * Point the address bar at this dance and tune without reloading.
 *
 * `replaceState` rather than `pushState`: the page changes dance every couple
 * of minutes on its own, and filling the back button with every dance of the
 * evening would make leaving the page take twenty presses.
 */
export function setHallUrl(dance: string | undefined, tune: string | undefined): void {
  const next = hallHash(dance, tune);
  if (window.location.hash === next) return;
  window.history.replaceState(null, "", next);
}
