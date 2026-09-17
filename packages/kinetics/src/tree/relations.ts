import type { Ctx } from "./evaluate.js";
import { evalExpr, evalError, truthy } from "./evaluate.js";
import type { Modules } from "./evaluate.js";
import type { Assignment, Dancers, Dancer } from "./state.js";
import type { Group, Place, ProvidedFn } from "./Tree.js";
import { chainTo, groupsOf, placeAt } from "./Tree.js";
import type { Value } from "./values.js";
import { NOBODY, describe } from "./values.js";

/**
 * `$name`, for one dancer (round 2): the one-sigil rule's second half.
 *
 * The dancer's place has a chain of groups above it. `$kind-name` binds the
 * innermost group of that kind on the chain (`$couple`, `$minor-set`).
 * Otherwise the chain is walked innermost first for a group that provides
 * the name, and its expression is evaluated with `me` bound to the child of
 * that group on the way down — the place itself at the bottom, the couple
 * one level up. Roles are the dancers' own, not the places', so a swapped
 * role is seen by every relation.
 *
 * A name **no group of the formation provides** is a compile error the
 * checker reports with a span; one that is provided but evaluates to
 * **nobody** is the end effect. `providedNames` is the static half,
 * `resolve` the dynamic one.
 */
export interface Resolved {
  value: Value;
  provided: boolean;
}

export function resolve(
  name: string,
  dancer: Dancer,
  root: Group,
  mods: Modules,
  dancers: Dancers,
): Resolved {
  const place = placeAt(root, dancer.place);
  if (place === undefined) return { value: NOBODY, provided: false };
  const chain = chainTo(root, dancer.place);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const group = chain[i] as Group;
    if (group.kind === name) return { value: { kind: "group", group }, provided: true };
  }
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const group = chain[i] as Group;
    const provide = group.provides.find((p) => p.name === name);
    if (provide === undefined) continue;
    const me: Group | Place = chain[i + 1] ?? place;
    const ctx = ctxFor(group, me, dancer, place, root, mods, dancers, provide.deferred.env, name);
    return { value: evalExpr(provide.deferred.expr, ctx), provided: true };
  }
  return { value: NOBODY, provided: false };
}

/** The context a provide or a provided function runs in, for one dancer. */
function ctxFor(
  group: Group,
  me: Group | Place,
  dancer: Dancer,
  place: Place,
  root: Group,
  mods: Modules,
  dancers: Dancers,
  env: Ctx["env"],
  self?: string,
): Ctx {
  const rel: NonNullable<Ctx["rel"]> = {
    group,
    place,
    root,
    me,
    dyn: (other) =>
      other === self ? undefined : resolve(other, dancer, root, mods, dancers).value,
    roleAt: (path) => dancers.at(path)?.role ?? placeAt(root, path)?.role,
  };
  if (dancer.role !== undefined) rel.role = dancer.role;
  return { mods, env, world: (f) => f, rel };
}

/** Every `$name` some group of the tree provides, plus every kind a group has, plus every function — the static answer. */
export function providedNames(root: Group): Set<string> {
  const names = new Set<string>();
  for (const group of groupsOf(root)) {
    names.add(group.kind);
    for (const p of group.provides) names.add(p.name);
    for (const f of group.functions) names.add(f.name);
  }
  return names;
}

/** The nearest provided function of that name up a dancer's chain, with its group. */
export function findFunction(
  name: string,
  dancer: Dancer,
  root: Group,
): { fn: ProvidedFn; group: Group } | undefined {
  const chain = chainTo(root, dancer.place);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const group = chain[i] as Group;
    const fn = group.functions.find((f) => f.name === name);
    if (fn !== undefined) return { fn, group };
  }
  return undefined;
}

/**
 * Run a provided function (`progress()`) for one dancer at a beat: its
 * `if`/`match`/`let` run against the state as it is, and every `$x = …`
 * becomes an {@link Assignment} to be committed with everybody else's. The
 * function reads the dancer's world through `me` (their place) and `$`.
 */
export function runFunction(
  found: { fn: ProvidedFn; group: Group },
  dancer: Dancer,
  root: Group,
  mods: Modules,
  dancers: Dancers,
  beat: number,
): Assignment[] {
  const place = placeAt(root, dancer.place);
  if (place === undefined) return [];
  const env = new Map(found.fn.env);
  const ctx = ctxFor(found.group, place, dancer, place, root, mods, dancers, env);
  const out: Assignment[] = [];
  const walk = (stmts: readonly import("../lang/syntax.js").Stmt[]): void => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case "let":
          env.set(stmt.name, evalExpr(stmt.value, ctx));
          break;
        case "assign": {
          const value = evalExpr(stmt.value, ctx);
          const text =
            value.kind === "group"
              ? value.group.path
              : value.kind === "place"
                ? value.place.path
                : value.kind === "string"
                  ? value.value
                  : value.kind === "member"
                    ? value.member
                    : value.kind === "nobody"
                      ? undefined
                      : undefined;
          if (text === undefined) {
            throw evalError(
              `$${stmt.name} = ${describe(value)}: a group, a place, a name or a role is what a reassignment takes`,
              stmt.span,
            );
          }
          out.push({ dancer: dancer.id, beat, property: stmt.name, value: text, span: stmt.span });
          break;
        }
        case "if":
          walk(truthy(evalExpr(stmt.condition, ctx)) ? stmt.then : stmt.else);
          break;
        case "match": {
          const subject = evalExpr(stmt.subject, ctx);
          const arm =
            stmt.arms.find(
              (a) =>
                a.pattern !== undefined &&
                subject.kind === "member" &&
                subject.member === a.pattern,
            ) ?? stmt.arms.find((a) => a.pattern === undefined);
          if (arm) walk(arm.body);
          break;
        }
        case "assert":
          if (!truthy(evalExpr(stmt.condition, ctx))) {
            throw evalError(
              `assert failed in ${found.fn.name}${stmt.message === undefined ? "" : `: ${stmt.message}`}`,
              stmt.span,
            );
          }
          break;
        default:
          throw evalError(
            `"${stmt.kind}" cannot be in a provided function: only let, if, match, assert and $x = …`,
            stmt.span,
          );
      }
    }
  };
  walk(found.fn.body);
  return out;
}
