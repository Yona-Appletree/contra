/**
 * What an expression evaluates to. The design's table of values (§2), as data:
 * five base types and three domain values, no records, no maps, no dots.
 *
 * Numbers carry their unit (`""`, `"m"`, `"deg"`) rather than being three
 * types, because the arithmetic is the same and the unit is what a diagnostic
 * wants to print. Beats are a plain count (notes D1), so `beats = 8` is a
 * unitless number. An enum member is remembered by name: the checker (P2)
 * types them, and the evaluator only ever compares them, so `Left` of `Hand`
 * and `Left` of `Turn` are the same word here and told apart where they are
 * declared.
 */
import type { FnDecl, FnExpr } from "../syntax/ast.js";
import type { Dancer, Node } from "./tree.js";

export type Unit = "" | "m" | "deg";

export type Value =
  | { t: "num"; v: number; unit: Unit }
  | { t: "bool"; v: boolean }
  | { t: "string"; v: string }
  | { t: "enum"; member: string; enumName?: string }
  | { t: "fn"; decl: FnDecl | FnExpr; env: Env; module: string; self?: Node }
  | { t: "node"; node: Node }
  | { t: "dancer"; dancer: Dancer }
  | { t: "selection"; items: readonly Value[] }
  | { t: "anchor"; form: string; args: readonly { name: string; value: Value }[] }
  | { t: "point"; x: number; y: number }
  | { t: "void" };

/** A lexical scope: a fn's parameters, a `for`'s variable, a group's own id. */
export interface Env {
  vars: Map<string, Value>;
  parent?: Env;
}

export const newEnv = (parent?: Env): Env => ({ vars: new Map(), parent });

export function lookupEnv(env: Env | undefined, name: string): Value | undefined {
  for (let at = env; at !== undefined; at = at.parent) {
    const found = at.vars.get(name);
    if (found !== undefined) return found;
  }
  return undefined;
}

export const num = (v: number, unit: Unit = ""): Value => ({ t: "num", v, unit });
export const bool = (v: boolean): Value => ({ t: "bool", v });
export const enumValue = (member: string, enumName?: string): Value => ({
  t: "enum",
  member,
  ...(enumName === undefined ? {} : { enumName }),
});
export const VOID: Value = { t: "void" };

/** Metres to the millimetres a frame is stored in. */
export const toMillimetres = (value: Value): number =>
  value.t === "num" ? (value.unit === "m" ? value.v * 1000 : value.v) : 0;

/** A number as an `i32`: beats, counts and ids are whole. */
export const toInt = (value: Value): number => (value.t === "num" ? Math.round(value.v) : 0);

/** JavaScript's truthiness is not borrowed: only a `Bool` is true or false. */
export const isTrue = (value: Value): boolean => value.t === "bool" && value.v;

/** Everything a selection can hold, as a flat list; a single value is a list of one. */
export function itemsOf(value: Value): readonly Value[] {
  if (value.t === "selection") return value.items;
  if (value.t === "void") return [];
  return [value];
}

/**
 * Are two values the same fact? Ids, enum members and numbers compare; nodes
 * and dancers compare by identity, which is what makes `other` mean "not me".
 */
export function sameValue(a: Value, b: Value): boolean {
  if (a.t === "num" && b.t === "num") return a.v === b.v;
  if (a.t === "enum" && b.t === "enum") return a.member === b.member;
  if (a.t === "bool" && b.t === "bool") return a.v === b.v;
  if (a.t === "string" && b.t === "string") return a.v === b.v;
  if (a.t === "node" && b.t === "node") return a.node === b.node;
  if (a.t === "dancer" && b.t === "dancer") return a.dancer === b.dancer;
  return false;
}

/** A value as a fact in a dump or a diagnostic. */
export function showValue(value: Value): string {
  switch (value.t) {
    case "num":
      return `${Number.isInteger(value.v) ? String(value.v) : value.v.toFixed(3)}${value.unit}`;
    case "bool":
      return value.v ? "true" : "false";
    case "string":
      return JSON.stringify(value.v);
    case "enum":
      return value.member;
    case "fn":
      return `fn ${"name" in value.decl ? value.decl.name : "(…)"}`;
    case "node":
      return value.node.occupant === undefined ? value.node.label : value.node.occupant.id;
    case "dancer":
      return value.dancer.id;
    case "selection":
      return `[${value.items.map(showValue).join(", ")}]`;
    case "anchor":
      return `${value.form}(${value.args
        .map((arg) =>
          arg.name === "" ? showValue(arg.value) : `${arg.name} = ${showValue(arg.value)}`,
        )
        .join(", ")})`;
    case "point":
      return `point(${(value.x / 1000).toFixed(3)}, ${(value.y / 1000).toFixed(3)})`;
    case "void":
      return "()";
  }
}

/** The name of a value's type, for a diagnostic that has to say what it got. */
export function typeName(value: Value): string {
  switch (value.t) {
    case "num":
      return value.unit === "" ? "a number" : `a ${value.unit === "m" ? "length" : "angle"}`;
    case "bool":
      return "a Bool";
    case "string":
      return "a string";
    case "enum":
      return "an enum member";
    case "fn":
      return "a fn";
    case "node":
      return `a ${value.node.kind}`;
    case "dancer":
      return "a dancer";
    case "selection":
      return `a selection of ${String(value.items.length)}`;
    case "anchor":
      return "an anchor";
    case "point":
      return "a point";
    case "void":
      return "nothing";
  }
}
