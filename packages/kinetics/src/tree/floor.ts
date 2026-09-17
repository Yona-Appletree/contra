import type { File } from "../lang/syntax.js";
import type { Modules } from "./evaluate.js";
import { buildFormation, collect } from "./evaluate.js";
import type { Dancers, Membership } from "./state.js";
import { instantiate, membershipOf } from "./state.js";
import type { Group } from "./Tree.js";
import type { Env, Value } from "./values.js";
import { num } from "./values.js";

/**
 * A floor (round 2): a module's space evaluated for nobody, and the dancers
 * its `dancers;` statements asked for. What a dance is compiled on, and
 * what the adapter turns into a `Dialect` for the rest of the stack. A dance
 * that owns its floor is its own root module here.
 */
export interface Floor {
  /** The root module's name: the formation's, or the dance's. */
  name: string;
  mods: Modules;
  root: Group;
  /** Everybody at beat 0: who they are and where they stand. */
  dancers: Dancers;
  /** The same, as the rest of the stack reads it. */
  initial: Membership;
}

/** Build a module's space and seat it, with `args` as plain numbers and `dynamics` as the call chain's `$` values. */
export function floorOf(
  files: readonly File[],
  name: string,
  args: Readonly<Record<string, number>> = {},
  dynamics: Readonly<Record<string, number>> = {},
): Floor {
  const mods = collect(files);
  const values: Record<string, Value> = {};
  for (const [key, value] of Object.entries(args)) values[key] = num(value);
  const dyn: Env = new Map(Object.entries(dynamics).map(([k, v]) => [k, num(v)]));
  const { root, seated } = buildFormation(mods, name, values, dyn);
  const dancers = instantiate(seated);
  return { name, mods, root, dancers, initial: membershipOf(dancers) };
}
