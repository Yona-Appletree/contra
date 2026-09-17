import type { Frame } from "./Frame.js";
import type { Anchor, Group, Place } from "./Tree.js";

/**
 * What an expression in a `.dance` file evaluates to (P2). One union for
 * build time (a formation's numbers, lengths, places and anchors) and for
 * resolve time (a `$` variable's place, group or nobody) — the same
 * evaluator runs both, with `me` bound only in the second.
 */
export type Value =
  | { kind: "number"; value: number }
  | { kind: "length"; m: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "member"; enum?: string; member: string }
  /** `x`, `y`, `-y`, `direction(…)`: a unit vector. */
  | { kind: "direction"; frame: Frame }
  | { kind: "place"; place: Place }
  | { kind: "group"; group: Group }
  | { kind: "anchor"; anchor: Anchor }
  | { kind: "nobody" }
  | { kind: "list"; items: readonly Value[] }
  /** `duple-progression(…)` and the like: a plan for `next`, run by `progress`. */
  | { kind: "progression"; name: string; args: Readonly<Record<string, Value>> }
  /** `alternate(minor-set)`, `all(couple)`: which groups are seated at beat 0. */
  | { kind: "seating"; name: string; args: Readonly<Record<string, Value>> };

export type Env = ReadonlyMap<string, Value>;

export const NOBODY: Value = { kind: "nobody" };
export const num = (value: number): Value => ({ kind: "number", value });
export const len = (m: number): Value => ({ kind: "length", m });
export const bool = (value: boolean): Value => ({ kind: "bool", value });

/** A value described for an error message. */
export function describe(v: Value): string {
  switch (v.kind) {
    case "number":
      return String(v.value);
    case "length":
      return `${String(v.m)}m`;
    case "string":
      return `"${v.value}"`;
    case "bool":
      return String(v.value);
    case "member":
      return v.enum === undefined ? v.member : `${v.enum}.${v.member}`;
    case "direction":
      return `direction ${String(v.frame.facing)}°`;
    case "place":
      return `place ${v.place.path}`;
    case "group":
      return `group ${v.group.path}`;
    case "anchor":
      return `${v.anchor.kind} anchor`;
    case "nobody":
      return "nobody";
    case "list":
      return `[${v.items.map(describe).join(", ")}]`;
    case "progression":
      return `${v.name} progression`;
    case "seating":
      return `${v.name} seating`;
  }
}

/** Whether a value is somebody: a place, a group with places, or a non-empty list. */
export const isSomebody = (v: Value): boolean =>
  v.kind === "place" ||
  (v.kind === "group" && v.group.places.length + v.group.children.length > 0) ||
  (v.kind === "list" && v.items.length > 0) ||
  v.kind === "anchor";
