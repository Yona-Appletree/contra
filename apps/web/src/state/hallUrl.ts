import { danceOrder, lineUpStartBeat } from "../program.js";

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

/**
 * The beat the Stage should start its clock at (U4, the user: "when you
 * select a new dance it starts immediately... it should start with the
 * normal line up").
 *
 * `?beat=<n>` always wins — it is what freezes a frame for a golden or a
 * test. Otherwise: no dance named in the route (`#/`, the plain evening) is
 * beat 0, the ordinary start; a dance named (`#/dance/<slug>`, which
 * `createDemoProgram`'s `danceOrder` rotates to lead the programme) starts at
 * the beginning of *that* dance's own line-up rather than its dancing beat 0
 * — `lineUpStartBeat(DEMO_DANCES.length)` defaults its `danceIndex` to 0,
 * which is exactly where a freshly rotated dance sits.
 */
export function startBeatFor(dance: string | undefined, params: URLSearchParams): number {
  const frozen = params.get("beat");
  if (frozen !== null) return Number(frozen);
  // `danceOrder(dance).length`, not `DEMO_DANCES.length`: a **lab dance** makes
  // the programme one item longer (`danceOrder` puts a dance the programme does
  // not hold in front of it, M3), and `lineUpStartBeat` counts backwards from
  // the chosen dance to the item that announces it, so it has to be counting
  // the same programme the decider is.
  return dance === undefined ? 0 : lineUpStartBeat(danceOrder(dance).length);
}

/**
 * The hash for a dance and a tune set, keeping every other query the URL was
 * already carrying.
 *
 * The Stage owns exactly two things in its own URL — which dance and which
 * medley — and reads several more that belong to whoever wrote the link:
 * `?engine=`, `?chain=`, `?lines=`, `?seed=`, `?zoom=`, `?beat=`, `?bare=`.
 * Rebuilding the hash from the two it owns and dropping the rest meant that
 * the address bar stopped agreeing with the page the moment the programme
 * moved on — so a reviewer who opened `#/dance/butter?engine=old` and then
 * reloaded, or copied the address to send to somebody, got the *other*
 * engine. `keep` is the query the page is actually running on, and everything
 * in it but `tune` (which this function owns) comes through unchanged.
 */
export function hallHash(
  dance: string | undefined,
  tune: string | undefined,
  keep: URLSearchParams = new URLSearchParams(),
): string {
  const path = dance === undefined ? "#/" : `#/dance/${dance}`;
  const query = new URLSearchParams(keep);
  query.delete("tune");
  if (tune !== undefined) query.set("tune", tune);
  const text = query.toString();
  return text === "" ? path : `${path}?${text}`;
}

/**
 * Point the address bar at this dance and tune without reloading, keeping
 * whatever else the hash was carrying.
 *
 * `replaceState` rather than `pushState`: the page changes dance every couple
 * of minutes on its own, and filling the back button with every dance of the
 * evening would make leaving the page take twenty presses.
 */
export function setHallUrl(dance: string | undefined, tune: string | undefined): void {
  const raw = window.location.hash;
  const q = raw.indexOf("?");
  const next = hallHash(dance, tune, new URLSearchParams(q < 0 ? "" : raw.slice(q + 1)));
  if (raw === next) return;
  window.history.replaceState(null, "", next);
}

/**
 * This same hall on the other engine: the link gate G1 is reviewed through.
 *
 * Everything the URL already says is kept — the dance, the tune, the seed,
 * the chain candidate, the zoom — and only `?engine=` is written, so a
 * reviewer switches engines without losing the frame they were looking at.
 */
export function engineHash(
  dance: string | undefined,
  params: URLSearchParams,
  engine: string,
): string {
  const query = new URLSearchParams(params);
  query.set("engine", engine);
  return hallHash(dance, undefined, query);
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
/** How many lines of dancers the hall may be asked for. */
export const MIN_LINES = 1;
export const MAX_LINES = 4;

/**
 * How many lines of dancers the hall is laid out with: `?lines=<n>`, else two.
 *
 * Two is the shipped hall and the one the review gate is about, because the
 * world's width is `SIDE_W * 2 + SET_PITCH * lines` and two lines are the
 * 268 px a phone fits at 1× (U1). A third set is a real hall and the renderer
 * and the decider both take it, so it is on the URL; what it does to a phone
 * is a look decision, not this function's.
 *
 * Clamped rather than rejected: a hall is the page, and `?lines=99` should
 * give a hall rather than a blank screen. Anything that is not a number at
 * all is two.
 */
export function readLines(params: URLSearchParams): number {
  const raw = params.get("lines");
  if (raw === null) return 2;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 2;
  return Math.min(MAX_LINES, Math.max(MIN_LINES, n));
}

export function readSeed(params: URLSearchParams, now: Date = new Date()): number {
  const raw = params.get("seed");
  if (raw !== null) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return Number(now.toISOString().slice(0, 10).replaceAll("-", ""));
}
