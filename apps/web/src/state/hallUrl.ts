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

/**
 * The seed for the evening's medley shuffle: `?seed=<n>` when given and a
 * finite number, else a number derived from the date, so the evening's
 * running order of medleys differs day to day and a seeded URL still
 * reproduces one exactly (T1: "ensure we have more tunes to randomize").
 *
 * The date is read as UTC (`toISOString`), not the visitor's local zone,
 * so the seed does not change mid-evening for someone dancing near
 * midnight in a zone west of UTC, and two visitors on the same calendar
 * date get the same shuffle regardless of where they are.
 */
export function readSeed(params: URLSearchParams, now: Date = new Date()): number {
  const raw = params.get("seed");
  if (raw !== null) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return Number(now.toISOString().slice(0, 10).replaceAll("-", ""));
}
