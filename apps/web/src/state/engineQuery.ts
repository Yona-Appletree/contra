/**
 * Which of the two engines a page dances on: `?engine=new|old`.
 *
 * The rebuild (`plan.md`, the figure-model roadmap) runs two paths side by side
 * for its whole length, and this is the switch between them.
 *
 * - **`new`** — the contra `CyclePlanner` (`@caller/contra`'s `planCycle.ts`):
 *   every call is resolved against live set state, and the five migrated
 *   gatherers are `FigureDefinition`s read as data rather than coded figures.
 *   The default since M3.
 * - **`old`** — `@caller/choreo`'s `defaultCyclePlanner` over the coded figure
 *   registry: the path the whole demo ran on before M1, and the one every
 *   golden was taken against. It stays reachable until M11 deletes the old
 *   figure layer.
 *
 * Deliberately a *two-valued* word rather than a boolean flag: the URL says
 * which engine, and a reviewer comparing `?engine=new` against `?engine=old`
 * can read both links at a glance. Anything unrecognised — a typo, a stale
 * link, no query at all — is the default, because a page that refuses to draw
 * is worse than a page that draws the shipped thing.
 */
export type EngineChoice = "new" | "old";

/** The engine a page runs on when the URL does not say: the new one (M3). */
export const DEFAULT_ENGINE: EngineChoice = "new";

/** `?engine=` read off a query string; anything but `old` is {@link DEFAULT_ENGINE}. */
export function engineFromQuery(raw: string | null): EngineChoice {
  return raw === "old" ? "old" : raw === "new" ? "new" : DEFAULT_ENGINE;
}

/** The other engine, for the link that offers a reviewer the comparison. */
export const otherEngine = (engine: EngineChoice): EngineChoice =>
  engine === "new" ? "old" : "new";
