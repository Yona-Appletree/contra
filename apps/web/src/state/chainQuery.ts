import type { FigureDefaultsOverride } from "@caller/contra";
import { CHAIN_CANDIDATES } from "@caller/contra";

/**
 * `?chain=1|2|3|4` from the URL, read the same way `?facing=` is
 * (`facingFromQuery` in `../traces/traceDrawings.js`): one parser, an
 * `undefined`-shaped default, no query at all restates the shipped figure.
 *
 * Picks one of PR #35's four courtesy-turn candidates for `robins-chain`
 * (see {@link CHAIN_CANDIDATES}) and returns it as a
 * {@link FigureDefaultsOverride} ready for `createContraRegistry`'s second
 * argument — the same override map the Moves gallery, the figure page and the
 * Stage all build their registry from, so one query parameter reaches every
 * route through the one mechanism the registry already offers. An absent or
 * unrecognised value is the empty override: the figure's own shipped default.
 */
export function chainOverridesFromQuery(param: string | null): FigureDefaultsOverride {
  if (param === null) return {};
  const candidate = CHAIN_CANDIDATES[param];
  return candidate === undefined ? {} : { "robins-chain": candidate };
}
