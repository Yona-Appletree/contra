import type { File } from "../lang/syntax.js";
import type { Modules } from "./evaluate.js";
import { buildFormation, collect } from "./evaluate.js";
import type { Membership } from "./membership.js";
import { seatAll } from "./membership.js";
import type { Group } from "./Tree.js";
import type { Value } from "./values.js";
import { num } from "./values.js";

/**
 * A floor: a formation built and seated (P4). What a dance is compiled on,
 * and what the adapter turns into a `Dialect` for the rest of the stack.
 */
export interface Floor {
  /** The formation's name: the root module's, the file's. */
  name: string;
  mods: Modules;
  root: Group;
  /** Who stands where at beat 0. */
  initial: Membership;
}

/** Build and seat a formation from its files (the prelude, the couple, the formation), with `args` as plain numbers. */
export function floorOf(
  files: readonly File[],
  name: string,
  args: Readonly<Record<string, number>> = {},
): Floor {
  const mods = collect(files);
  const values: Record<string, Value> = {};
  for (const [key, value] of Object.entries(args)) values[key] = num(value);
  const root = buildFormation(mods, name, values);
  return { name, mods, root, initial: seatAll(root, mods) };
}
