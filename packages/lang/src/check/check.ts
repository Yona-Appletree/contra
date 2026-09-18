import type { Diagnostic, Fact } from "../diagnostics/Diagnostic.js";
import { diagnostic } from "../diagnostics/Diagnostic.js";
import type { Module, Program } from "../load.js";
import type {
  Arg,
  CallExpr,
  EnumDecl,
  Expr,
  FnDecl,
  GroupDecl,
  InvokeStmt,
  KindArg,
  Member,
  NameExpr,
  Param,
  Pattern,
  QualifiedExpr,
  SelectExpr,
  Span,
  Stmt,
  TypeRef,
} from "../syntax/ast.js";
import { checkBeats } from "./beats.js";
import type {
  Binding,
  CalleeBinding,
  EnumInfo,
  FnInfo,
  GroupInfo,
  IdValue,
  KindBinding,
  PathShape,
  Resolution,
} from "./resolution.js";
import { allStmts, invocationsIn } from "./walk.js";

/**
 * Check a loaded program and say what is wrong with it.
 *
 * The checker is where the design's rules stop being prose. A group is
 * declared once and invoked to build a node, so **the shapes of the paths from
 * a dance's floor down to its dancers are lexical** (§3) — read off the
 * nesting of invocations, loops and all — and almost every rule here is a
 * question about those paths: may this dancer read `neighbor` (is `MinorSet`
 * above it?), is this `match` exhaustive, can `one!` hold, whose `partner` is
 * this. What it cannot answer from the text alone it leaves to the evaluator,
 * and what it can, it answers before anybody dances.
 *
 * Diagnostics are rustc-shaped: a code from the `L010–L099` band, the span of
 * the text to blame, a trace of the facts that led there (the declaration that
 * gives a name, the path that lacks a kind, the arm that is missing) and a
 * suggestion where one is obvious.
 */
export function check(program: Program): Diagnostic[] {
  return [...checkProgram(program).diagnostics];
}

/** The same check, with the table of who-is-who that P3 and P4 read. */
export function checkProgram(program: Program): CheckResult {
  return checker(program).run();
}

export interface CheckResult {
  diagnostics: readonly Diagnostic[];
  resolution: Resolution;
}

// ---------------------------------------------------------------------------
// The vocabulary the checker knows without being told
// ---------------------------------------------------------------------------

/** The built-ins, with what they take. `select` and `assign` have their own node. */
const BUILTINS: Readonly<Record<string, BuiltinSig>> = {
  id: { kind: 0, positional: 1 },
  other: { kind: 0, positional: 1 },
  dancers: { kind: 0, positional: 1 },
  anchor: { kind: 0, positional: 2, anchorName: 1 },
  count: { positional: 1 },
  dancer: { positional: 0, bodyOnly: true },
  assert: { positional: 2, min: 1 },
  line: { positional: 0, names: ["through", "along", "from", "to"] },
  direction: { positional: 1, names: ["of"] },
  progress: { positional: 0 },
};

interface BuiltinSig {
  /** The index of an argument that names a group ("mine"), when there is one. */
  kind?: number;
  /** The index of an argument that is an anchor's name rather than a value. */
  anchorName?: number;
  positional: number;
  min?: number;
  names?: readonly string[];
  bodyOnly?: boolean;
}

/** The prefix transforms and what they are given. */
const MODIFIER_SIGS: Readonly<Record<string, { positional: number; names: readonly string[] }>> = {
  translate: { positional: 0, names: ["x", "y"] },
  rotate: { positional: 1, names: ["deg", "about"] },
  mirror: { positional: 1, names: ["axis"] },
  left: { positional: 1, names: ["by"] },
  right: { positional: 1, names: ["by"] },
  fwd: { positional: 1, names: ["by"] },
  back: { positional: 1, names: ["by"] },
};

/** What a dancer may read of its own cursor (§6). */
const CURSOR: readonly string[] = ["beat", "time", "first-time", "last-time"];

// ---------------------------------------------------------------------------
// Types, as far as the checker needs them
// ---------------------------------------------------------------------------

type Type =
  | { kind: "unknown" }
  | { kind: "prim"; name: "i32" | "f64" | "Bool" | "Length" | "Angle" | "fn" | "group" }
  | { kind: "enum"; enum: EnumInfo }
  | { kind: "group-ref"; group: GroupInfo }
  | { kind: "selection"; group?: GroupInfo };

const UNKNOWN: Type = { kind: "unknown" };

// ---------------------------------------------------------------------------
// The checker
// ---------------------------------------------------------------------------

interface ModuleScope {
  module: Module;
  groups: Map<string, GroupInfo>;
  enums: Map<string, EnumInfo>;
  /** A member name may belong to several enums — `Left` is a `Hand` and a `Turn`. */
  enumMembers: Map<string, EnumInfo[]>;
  fns: Map<string, MutableFnInfo>;
}

interface MutableFnInfo extends Omit<FnInfo, "contract"> {
  contract: GroupInfo[];
}

/** Where the walk is, and what the reader below it can see. */
interface Ctx {
  scope: ModuleScope;
  where: "body" | "setup" | "member" | "script";
  /**
   * Whether a kind that is not on every path is an error (a body, a member, a
   * formation's own `progress` and `out`) or the dance's contract (a script).
   */
  strict: boolean;
  self?: GroupInfo;
  roots: readonly GroupInfo[];
  /** The paths below the reader, narrowed by the `match` arms we are inside. */
  shapes: readonly PathShape[];
  /** The same before any narrowing — what an `assign` may send a dancer to. */
  allShapes: readonly PathShape[];
  locals: Map<string, Binding>;
  anchors: Set<string>;
  fn?: MutableFnInfo;
}

function checker(program: Program) {
  const diagnostics: Diagnostic[] = [];
  const names = new Map<NameExpr | QualifiedExpr, Binding>();
  const calls = new Map<CallExpr | InvokeStmt, CalleeBinding>();
  const kinds = new Map<KindArg, KindBinding>();
  const fns = new Map<FnDecl, MutableFnInfo>();
  const groups = new Map<GroupDecl, GroupInfo>();
  const scopes = new Map<string, ModuleScope>();
  const exports = new Map<string, Map<string, Exported>>();
  const memberTypes = new Map<Member, Type>();
  const typing = new Set<Member>();

  type Exported =
    | { kind: "group"; group: GroupInfo }
    | { kind: "enum"; enum: EnumInfo }
    | { kind: "enum-member"; enum: EnumInfo; member: string }
    | { kind: "fn"; fn: MutableFnInfo };

  const report = (
    code: string,
    message: string,
    span: Span | undefined,
    rest: {
      suggestion?: string;
      trace?: readonly Fact[];
      severity?: "error" | "warning";
      beat?: number;
    } = {},
  ): void => {
    diagnostics.push(
      diagnostic(code, "check", message, {
        ...(span ? { span } : {}),
        ...(rest.suggestion === undefined ? {} : { suggestion: rest.suggestion }),
        ...(rest.trace === undefined ? {} : { trace: rest.trace }),
        ...(rest.severity === undefined ? {} : { severity: rest.severity }),
        ...(rest.beat === undefined ? {} : { beat: rest.beat }),
      }),
    );
  };

  const declFact = (what: string, span: Span): Fact => ({ layer: "check", what, span });

  // -- building the tables -------------------------------------------------

  function collect(): void {
    for (const module of program.modules) {
      const scope: ModuleScope = {
        module,
        groups: new Map(),
        enums: new Map(),
        enumMembers: new Map(),
        fns: new Map(),
      };
      scopes.set(module.name, scope);
      const exported = new Map<string, Exported>();
      exports.set(module.name, exported);

      const declare = (name: string, what: Exported, span: Span): void => {
        if (exported.has(name) && what.kind !== "enum-member") {
          report("L013", `"${name}" is declared twice in this module`, span, {
            suggestion: "a module declares each name once; two formations use two modules",
          });
          return;
        }
        exported.set(name, what);
      };

      for (const decl of module.ast.decls) {
        if (decl.kind === "enum") {
          const info = enumOf(decl, module.name);
          scope.enums.set(decl.name, info);
          declare(decl.name, { kind: "enum", enum: info }, decl.span);
          for (const member of decl.members) {
            addEnumMember(scope, info, member.name);
            exported.set(member.name, { kind: "enum-member", enum: info, member: member.name });
          }
        }
        if (decl.kind === "group") {
          const info = groupOf(decl, module.name);
          groups.set(decl, info);
          scope.groups.set(decl.name, info);
          declare(decl.name, { kind: "group", group: info }, decl.span);
          if (info.ids !== undefined) {
            for (const member of info.ids.members) {
              addEnumMember(scope, info.ids, member);
              exported.set(member, { kind: "enum-member", enum: info.ids, member });
            }
          }
          for (const member of decl.members) {
            if (member.kind === "fn") {
              const fn = fnOf(member, module.name, info);
              fns.set(member, fn);
            }
          }
        }
        if (decl.kind === "fn") {
          const fn = fnOf(decl, module.name);
          fns.set(decl, fn);
          scope.fns.set(decl.name, fn);
          declare(decl.name, { kind: "fn", fn }, decl.span);
        }
      }
    }
  }

  const addEnumMember = (scope: ModuleScope, info: EnumInfo, member: string): void => {
    const list = scope.enumMembers.get(member);
    if (list === undefined) scope.enumMembers.set(member, [info]);
    else if (!list.includes(info)) list.push(info);
  };

  const enumOf = (decl: EnumDecl, module: string): EnumInfo => ({
    name: decl.name,
    module,
    members: decl.members.map((m) => m.name),
    decl,
    span: decl.span,
  });

  const groupOf = (decl: GroupDecl, module: string): GroupInfo => {
    const members = new Map<string, Member>();
    for (const member of decl.members) {
      const name = member.kind === "fn" ? member.name : member.name;
      const already = members.get(name);
      if (already !== undefined) {
        report("L013", `"${decl.name}" declares "${name}" twice`, member.span, {
          trace: [declFact(`the first "${name}"`, already.span)],
        });
      }
      members.set(name, member);
    }
    return {
      decl,
      module,
      name: decl.name,
      ...(decl.idType.kind === "enum"
        ? {
            ids: {
              name: decl.name,
              module,
              members: decl.idType.members.map((m) => m.name),
              group: decl,
              span: decl.idType.span,
            },
          }
        : {}),
      members,
      shapes: [],
    };
  };

  const fnOf = (decl: FnDecl, module: string, owner?: GroupInfo): MutableFnInfo => {
    const inside = allStmts(decl.body);
    const ir = inside.find((s) => s.kind === "ir");
    const setup = inside.some((s) => s.kind === "setup");
    return {
      decl,
      module,
      name: decl.name,
      role: ir !== undefined ? "move" : setup ? "dance" : "composition",
      ...(ir !== undefined && ir.kind === "ir" ? { ir: ir.name } : {}),
      ...(owner ? { owner } : {}),
      contract: [],
    };
  };

  /** `use m::{a, b}` and `use m::*`: the imports, once every module is read. */
  function link(): void {
    for (const module of program.modules) {
      const scope = scopes.get(module.name);
      if (scope === undefined) continue;
      const prelude = program.prelude;
      if (prelude !== undefined && prelude.name !== module.name) {
        bringAll(scope, prelude.name);
      }
      for (const use of module.ast.uses) {
        const from = exports.get(use.module);
        if (from === undefined) continue; // the loader has already said so
        if (use.names === undefined) {
          bringAll(scope, use.module);
          continue;
        }
        for (const named of use.names) {
          const found = from.get(named.name);
          if (found === undefined) {
            report("L011", `"${use.module}" declares nothing called "${named.name}"`, named.span, {
              suggestion: nearest(named.name, [...from.keys()]),
              trace: [{ layer: "check", what: `"${use.module}" declares ${listOf(from)}` }],
            });
            continue;
          }
          bring(scope, named.name, found);
        }
      }
    }
  }

  const bringAll = (scope: ModuleScope, module: string): void => {
    const from = exports.get(module);
    if (from === undefined) return;
    for (const [name, what] of from) bring(scope, name, what);
  };

  const bring = (scope: ModuleScope, name: string, what: Exported): void => {
    if (what.kind === "group") {
      if (!scope.groups.has(name)) scope.groups.set(name, what.group);
      // A group brings its ids along: `match Station { OutTop => … }` needs them.
      if (what.group.ids !== undefined) {
        for (const member of what.group.ids.members) addEnumMember(scope, what.group.ids, member);
      }
    }
    if (what.kind === "enum" && !scope.enums.has(name)) scope.enums.set(name, what.enum);
    if (what.kind === "enum-member") addEnumMember(scope, what.enum, what.member);
    if (what.kind === "fn" && !scope.fns.has(name)) scope.fns.set(name, what.fn);
  };

  // -- path shapes ---------------------------------------------------------

  const shapeMemo = new Map<GroupDecl, readonly PathShape[]>();
  const shaping = new Set<GroupDecl>();

  /** Every path of kinds from a group down to a leaf, read off the invocations. */
  function shapesBelow(
    group: GroupInfo,
    extra: readonly Stmt[],
    scope: ModuleScope,
  ): readonly PathShape[] {
    const memoed = extra.length === 0 ? shapeMemo.get(group.decl) : undefined;
    if (memoed !== undefined) return memoed;
    if (shaping.has(group.decl)) {
      report("L032", `"${group.name}" is built inside itself`, group.decl.span, {
        suggestion: "a path never repeats a kind (§3), so a group cannot invoke itself",
      });
      return [[]];
    }
    shaping.add(group.decl);
    const own = scopes.get(group.module) ?? scope;
    const invocations = [...invocationsIn(group.decl.body), ...invocationsIn(extra)];
    let out: PathShape[];
    if (invocations.length === 0) {
      out = [[]];
    } else {
      out = [];
      for (const invocation of invocations) {
        const child = groupRef(invocation.name, invocation.module, own);
        if (child === undefined) {
          out.push([]);
          continue;
        }
        const step: { group: GroupInfo; id: IdValue; site: InvokeStmt } = {
          group: child,
          id: idOf(invocation, child),
          site: invocation,
        };
        for (const below of shapesBelow(child, invocation.children, own)) {
          out.push([step, ...below]);
        }
      }
    }
    shaping.delete(group.decl);
    if (extra.length === 0) shapeMemo.set(group.decl, out);
    return out;
  }

  /** The id an invocation was given, when the text says outright what it is. */
  const idOf = (invocation: InvokeStmt, group: GroupInfo): IdValue => {
    const first = invocation.args.find((arg) => arg.name === undefined || arg.name === "id");
    if (first === undefined) return { kind: "unknown" };
    const value = first.value;
    if (value.kind === "int") return { kind: "int", value: value.value };
    if (value.kind === "name" && value.title && group.ids?.members.includes(value.name) === true) {
      return { kind: "enum", name: value.name };
    }
    if (value.kind === "qualified" && group.ids?.members.includes(value.name) === true) {
      return { kind: "enum", name: value.name };
    }
    return { kind: "unknown" };
  };

  const groupRef = (
    name: string,
    module: string | undefined,
    scope: ModuleScope,
  ): GroupInfo | undefined => {
    if (module === undefined) return scope.groups.get(name);
    const found = exports.get(module)?.get(name);
    return found?.kind === "group" ? found.group : undefined;
  };

  // -- member collisions ---------------------------------------------------

  /** Two groups on one path declaring the same bare name is an error, not a rule (§4). */
  const collided = new Set<string>();
  function checkCollisions(): void {
    for (const group of groups.values()) {
      for (const shape of group.shapes) {
        const path = [group, ...shape.map((step) => step.group)];
        for (let i = 0; i < path.length; i += 1) {
          for (let j = i + 1; j < path.length; j += 1) {
            const above = path[i];
            const below = path[j];
            if (above === undefined || below === undefined) continue;
            for (const [name, member] of below.members) {
              const clash = above.members.get(name);
              if (clash === undefined) continue;
              const key = `${above.name}.${name}/${below.name}.${name}`;
              if (collided.has(key)) continue;
              collided.add(key);
              report(
                "L022",
                `"${name}" is declared on "${above.name}" and on "${below.name}", and a dancer is under both`,
                member.span,
                {
                  suggestion: `rename one of them: a dancer reads "${name}" bare, and the language will not pick for you`,
                  trace: [
                    declFact(`"${above.name}" declares "${name}"`, clash.span),
                    declFact(`"${below.name}" declares "${name}"`, member.span),
                    {
                      layer: "check",
                      what: `the path ${path.map((g) => g.name).join(" / ")} has both`,
                    },
                  ],
                },
              );
            }
          }
        }
      }
    }
  }

  // -- functions: what they are, and what they need ------------------------

  function classify(): void {
    for (const module of program.modules) {
      const scope = scopes.get(module.name);
      if (scope === undefined) continue;
      for (const decl of module.ast.decls) {
        if (decl.kind !== "fn") continue;
        const fn = fns.get(decl);
        if (fn === undefined || fn.role !== "dance") continue;
        const setup = allStmts(decl.body).find((s) => s.kind === "setup");
        if (setup === undefined || setup.kind !== "setup") continue;
        const root = invocationsIn(setup.body)[0];
        if (root === undefined) continue;
        const floor = groupRef(root.name, root.module, scope);
        if (floor === undefined) continue;
        fn.floor = floor;
        const progress = floor.members.get("progress");
        const out = floor.members.get("out");
        if (progress?.kind === "fn") fn.progress = fns.get(progress);
        if (out?.kind === "fn") fn.out = fns.get(out);
      }
    }
  }

  /** Two dances composed must stand on one floor (§5). */
  function checkFloors(): void {
    for (const fn of fns.values()) {
      if (fn.role !== "dance" || fn.floor === undefined) continue;
      const scope = scopes.get(fn.module);
      if (scope === undefined) continue;
      for (const stmt of allStmts(fn.decl.body)) {
        if (stmt.kind !== "expr" || stmt.expr.kind !== "call") continue;
        const called = fnRef(stmt.expr.callee, stmt.expr.module, scope);
        if (called === undefined || called.role !== "dance" || called.floor === undefined) continue;
        if (called.floor === fn.floor) continue;
        report(
          "L023",
          `"${fn.name}" lays ${floorName(fn.floor)} and then dances "${called.name}", which stands on ${floorName(called.floor)}`,
          stmt.span,
          {
            suggestion: `two dances composed must agree on their floor: set up "${called.floor.module}::${called.floor.name}", or dance something written for ${floorName(fn.floor)}`,
            trace: [
              declFact(`"${fn.name}" sets up ${floorName(fn.floor)}`, fn.floor.decl.span),
              declFact(
                `"${called.name}" sets up ${floorName(called.floor)}`,
                called.floor.decl.span,
              ),
            ],
          },
        );
      }
    }
  }

  const floorName = (group: GroupInfo): string => `"${group.module}::${group.name}"`;

  const fnRef = (
    name: string,
    module: string | undefined,
    scope: ModuleScope,
  ): MutableFnInfo | undefined => {
    if (module === undefined) return scope.fns.get(name);
    const found = exports.get(module)?.get(name);
    return found?.kind === "fn" ? found.fn : undefined;
  };

  // -- the walk ------------------------------------------------------------

  function walkAll(): void {
    for (const module of program.modules) {
      const scope = scopes.get(module.name);
      if (scope === undefined) continue;
      for (const decl of module.ast.decls) {
        if (decl.kind === "group") walkGroup(decl, scope);
        if (decl.kind === "fn") walkTopFn(decl, scope);
      }
    }
  }

  function walkGroup(decl: GroupDecl, scope: ModuleScope): void {
    const group = groups.get(decl);
    if (group === undefined) return;
    const base = (where: Ctx["where"]): Ctx => ({
      scope,
      where,
      strict: true,
      self: group,
      roots: [group],
      shapes: group.shapes,
      allShapes: group.shapes,
      locals: paramLocals(decl.params),
      anchors: new Set(["center"]),
      ...(where === "body" ? {} : {}),
    });

    const bodyCtx = base("body");
    bodyCtx.locals.set("id", { kind: "id", group });
    for (const stmt of decl.body) walkStmt(stmt, bodyCtx);

    for (const member of decl.members) {
      const ctx = base(member.kind === "fn" ? "script" : "member");
      ctx.locals.set("id", { kind: "id", group });
      if (member.kind === "fn") {
        const fn = fns.get(member);
        if (fn !== undefined) ctx.fn = fn;
        for (const param of member.params) ctx.locals.set(param.name, { kind: "param", param });
        for (const param of member.params) walkParam(param, ctx);
        for (const stmt of member.body) walkStmt(stmt, ctx);
      } else {
        walkExpr(member.value, ctx);
      }
    }
  }

  function walkTopFn(decl: FnDecl, scope: ModuleScope): void {
    const fn = fns.get(decl);
    const floor = fn?.floor;
    const ctx: Ctx = {
      scope,
      where: "script",
      strict: false,
      ...(floor ? { roots: [floor] } : { roots: [] }),
      shapes: floor === undefined ? [] : floor.shapes,
      allShapes: floor === undefined ? [] : floor.shapes,
      locals: paramLocals(decl.params),
      anchors: new Set(),
      ...(fn ? { fn } : {}),
    };
    for (const param of decl.params) walkParam(param, ctx);
    for (const stmt of decl.body) walkStmt(stmt, ctx);
  }

  const paramLocals = (params: readonly Param[]): Map<string, Binding> => {
    const locals = new Map<string, Binding>();
    for (const param of params) locals.set(param.name, { kind: "param", param });
    return locals;
  };

  const walkParam = (param: Param, ctx: Ctx): void => {
    if (param.default !== undefined) {
      walkExpr(param.default, ctx, typeOfRef(param.type, ctx.scope));
    }
  };

  function walkStmt(stmt: Stmt, ctx: Ctx): void {
    switch (stmt.kind) {
      case "setup": {
        if (ctx.where !== "script") {
          report("L016", "a `setup` builds a dance's floor, and this is not a dance", stmt.span);
          return;
        }
        const floor = ctx.fn?.floor;
        const inner: Ctx = {
          ...ctx,
          where: "setup",
          strict: true,
          ...(floor ? { roots: [floor], shapes: floor.shapes, allShapes: floor.shapes } : {}),
          locals: new Map(ctx.locals),
          anchors: new Set(ctx.anchors),
        };
        for (const child of stmt.body) walkStmt(child, inner);
        return;
      }
      case "anchor": {
        if (ctx.where !== "body" && ctx.where !== "setup") {
          report("L016", `an anchor is a frame of a node, and there is no node here`, stmt.span, {
            suggestion: "anchors are declared in a group's `body`",
          });
        }
        walkExpr(stmt.value, ctx);
        ctx.anchors.add(stmt.name);
        return;
      }
      case "ir":
      case "card":
        return;
      case "for": {
        walkExpr(stmt.range, ctx);
        const inner: Ctx = { ...ctx, locals: new Map(ctx.locals) };
        inner.locals.set(stmt.name, { kind: "local", name: stmt.name, loop: stmt });
        for (const child of stmt.body) walkStmt(child, inner);
        return;
      }
      case "if": {
        walkExpr(stmt.test, ctx);
        for (const child of stmt.then) walkStmt(child, ctx);
        for (const child of stmt.else ?? []) walkStmt(child, ctx);
        return;
      }
      case "match": {
        const subject = asEnum(walkExpr(stmt.subject, ctx));
        checkMatch(subject, stmt.arms, stmt.span);
        for (const arm of stmt.arms) {
          walkPattern(arm.pattern, subject, ctx, false);
          const inner = narrow(ctx, stmt.subject, arm.pattern);
          for (const child of arm.body) walkStmt(child, inner);
        }
        return;
      }
      case "modified": {
        for (const modifier of stmt.modifiers) walkExpr(modifier, ctx);
        walkStmt(stmt.stmt, ctx);
        return;
      }
      case "invoke": {
        if (ctx.where !== "body" && ctx.where !== "setup") {
          report(
            "L016",
            `"${stmt.name}(…)" builds a node, and the tree is built once, in a \`setup\` or a \`body\``,
            stmt.span,
            { suggestion: "a dance's script moves dancers about a tree that already stands" },
          );
        }
        const group = groupRef(stmt.name, stmt.module, ctx.scope);
        if (group === undefined) {
          report("L012", `there is no group called "${stmt.name}"`, stmt.span, {
            suggestion: nearestGroup(stmt.name, ctx),
          });
        } else {
          calls.set(stmt, { kind: "group", group });
          checkArgs(stmt.args, group.decl.params, stmt.span, `group "${group.name}"`, ctx, {
            group,
            ...(scopes.get(group.module) ? { paramScope: scopes.get(group.module) } : {}),
          });
        }
        // The children belong to the node just built: its own anchors, not the
        // ones the enclosing body has declared so far.
        const inner: Ctx = {
          ...ctx,
          locals: new Map(ctx.locals),
          anchors: new Set(["center"]),
        };
        for (const child of stmt.children) walkStmt(child, inner);
        return;
      }
      case "expr": {
        const expr = stmt.expr;
        if (expr.kind === "call" && (ctx.where === "body" || ctx.where === "setup")) {
          const called = calleeOf(expr, ctx);
          if (called?.kind === "fn" && called.fn.role !== "composition") {
            report(
              "L015",
              `"${expr.callee}" is something a dancer does, and ${whereIs(ctx)} runs for nobody`,
              stmt.span,
              {
                suggestion:
                  ctx.where === "setup"
                    ? "a `setup` builds the tree; the script below it is what the dancers do"
                    : "a body lays this node's children and declares its anchors, nothing else",
                trace: [declFact(`"${called.fn.name}" is a move`, called.fn.decl.span)],
              },
            );
            return; // one complaint per statement: its arguments are beside the point
          }
        }
        walkExpr(expr, ctx);
        if (stmt.block !== undefined) {
          const inner: Ctx = { ...ctx, locals: new Map(ctx.locals) };
          for (const child of stmt.block) walkStmt(child, inner);
        }
        return;
      }
    }
  }

  const whereIs = (ctx: Ctx): string => (ctx.where === "setup" ? "a `setup`" : "a `body`");

  /** A `match` arm narrows the paths below it to those the pattern admits. */
  function narrow(ctx: Ctx, subject: Expr, pattern: Pattern): Ctx {
    if (subject.kind !== "name" || !subject.title) return ctx;
    const group = ctx.scope.groups.get(subject.name);
    if (group === undefined) return ctx;
    const admitted = admittedIds(pattern, group);
    if (admitted === undefined) return ctx;
    const shapes = ctx.shapes.filter((shape) => {
      const step = shape.find((s) => s.group === group);
      if (step === undefined) return true;
      if (step.id.kind === "unknown") return true;
      const name = step.id.kind === "enum" ? step.id.name : String(step.id.value);
      return admitted.includes(name);
    });
    return { ...ctx, shapes };
  }

  /** The ids a pattern admits, by name, or `undefined` when the checker cannot say. */
  function admittedIds(pattern: Pattern, group: GroupInfo): readonly string[] | undefined {
    const ids = group.ids;
    if (ids === undefined) return undefined;
    switch (pattern.kind) {
      case "wildcard":
        return ids.members;
      case "alt": {
        const parts = pattern.options.map((option) => admittedIds(option, group));
        if (parts.some((part) => part === undefined)) return undefined;
        return parts.flatMap((part) => part ?? []);
      }
      case "expr-pattern": {
        const expr = pattern.expr;
        if (expr.kind === "name" && ids.members.includes(expr.name)) return [expr.name];
        return undefined;
      }
      default:
        return undefined;
    }
  }

  // -- expressions ---------------------------------------------------------

  function walkExpr(expr: Expr, ctx: Ctx, expected: Type = UNKNOWN): Type {
    switch (expr.kind) {
      case "int":
        return { kind: "prim", name: "i32" };
      case "float":
        return { kind: "prim", name: expr.unit === "deg" ? "Angle" : "Length" };
      case "string":
        return UNKNOWN;
      case "bool":
        return { kind: "prim", name: "Bool" };
      case "name":
        return readName(expr, ctx, expected);
      case "qualified":
        return readQualified(expr, ctx);
      case "call":
        return walkCall(expr, ctx);
      case "one":
        return walkOne(expr.arg, expr.span, ctx);
      case "select":
      case "assign":
        return walkSelect(expr, ctx);
      case "unary":
        walkExpr(expr.operand, ctx);
        return expr.op === "not" ? { kind: "prim", name: "Bool" } : { kind: "prim", name: "i32" };
      case "binary": {
        const left = walkExpr(expr.left, ctx);
        walkExpr(expr.right, ctx, expr.op === "==" || expr.op === "!=" ? left : UNKNOWN);
        return expr.op === "or" || expr.op === "and" || expr.op.length === 2
          ? { kind: "prim", name: "Bool" }
          : left;
      }
      case "is": {
        const subject = asEnum(walkExpr(expr.subject, ctx));
        walkPattern(expr.pattern, subject, ctx, false);
        return { kind: "prim", name: "Bool" };
      }
      case "if-expr": {
        walkExpr(expr.test, ctx);
        const then = walkExpr(expr.then, ctx, expected);
        walkExpr(expr.else, ctx, expected);
        return then;
      }
      case "match-expr": {
        const subject = asEnum(walkExpr(expr.subject, ctx));
        checkMatch(subject, expr.arms, expr.span);
        let result: Type = UNKNOWN;
        for (const arm of expr.arms) {
          walkPattern(arm.pattern, subject, ctx, false);
          const inner = narrow(ctx, expr.subject, arm.pattern);
          const value = walkExpr(arm.value, inner, expected);
          if (result.kind === "unknown") result = value;
        }
        return result;
      }
      case "range":
        walkExpr(expr.from, ctx);
        walkExpr(expr.to, ctx);
        return UNKNOWN;
      case "fn-expr": {
        const inner: Ctx = { ...ctx, locals: new Map(ctx.locals) };
        for (const param of expr.params) inner.locals.set(param.name, { kind: "param", param });
        for (const stmt of expr.body) walkStmt(stmt, inner);
        return { kind: "prim", name: "fn" };
      }
    }
  }

  function readName(expr: NameExpr, ctx: Ctx, expected: Type): Type {
    const bind = (binding: Binding): void => void names.set(expr, binding);
    if (expr.title) {
      // An enum member first when the reader asked for one: `Left` is a `Turn`
      // here and a `Hand` there, and only the parameter says which.
      if (expected.kind === "enum" && expected.enum.members.includes(expr.name)) {
        bind({ kind: "enum-member", enum: expected.enum, member: expr.name });
        return expected;
      }
      const group = ctx.scope.groups.get(expr.name);
      if (group !== undefined) {
        bind({ kind: "group", group });
        if (ctx.where === "body" || ctx.where === "setup") {
          report(
            "L015",
            `"${expr.name}" here means *my* ${expr.name}, and ${whereIs(ctx)} runs for nobody`,
            expr.span,
            {
              suggestion: `inside a body, ${ctx.where === "body" ? "`select` is relative to the node being built" : "the tree is built for nobody"}`,
            },
          );
          return { kind: "group-ref", group };
        }
        requireKind(group, expr.span, ctx, `"${expr.name}"`);
        return { kind: "group-ref", group };
      }
      const asMember = ctx.scope.enumMembers.get(expr.name);
      if (asMember !== undefined && asMember.length > 0) {
        const found = asMember[0] as EnumInfo;
        if (expected.kind === "enum") {
          report(
            "L019",
            `"${expr.name}" is a member of "${found.name}", and "${expected.enum.name}" is due here`,
            expr.span,
            {
              suggestion: `"${expected.enum.name}" is ${expected.enum.members.join(", ")}`,
              trace: [declFact(`"${found.name}" declares "${expr.name}"`, found.span)],
            },
          );
        }
        bind({ kind: "enum-member", enum: found, member: expr.name });
        return { kind: "enum", enum: found };
      }
      const asEnum = ctx.scope.enums.get(expr.name);
      if (asEnum !== undefined) {
        bind({ kind: "enum-member", enum: asEnum, member: expr.name });
        return { kind: "enum", enum: asEnum };
      }
      report("L012", `nothing here is called "${expr.name}"`, expr.span, {
        suggestion: nearestGroup(expr.name, ctx),
      });
      return UNKNOWN;
    }

    const local = ctx.locals.get(expr.name);
    if (local !== undefined) {
      bind(local);
      return local.kind === "param" ? typeOfRef(local.param.type, ctx.scope) : idType(local);
    }
    if (CURSOR.includes(expr.name)) {
      if (ctx.where === "body" || ctx.where === "setup") {
        report(
          "L015",
          `"${expr.name}" is a dancer's own cursor, and ${whereIs(ctx)} runs for nobody`,
          expr.span,
        );
      }
      bind({ kind: "cursor", name: expr.name as "beat" });
      return { kind: "prim", name: expr.name.endsWith("time") ? "Bool" : "i32" };
    }
    if (ctx.anchors.has(expr.name)) {
      bind({ kind: "anchor", name: expr.name, ...(ctx.self ? { group: ctx.self } : {}) });
      return UNKNOWN;
    }
    const fn = ctx.scope.fns.get(expr.name);
    if (fn !== undefined) {
      bind({ kind: "fn", fn: frozen(fn) });
      return { kind: "prim", name: "fn" };
    }
    const member = memberOnPath(expr.name, ctx);
    if (member !== undefined) {
      bind({ kind: "member", member: member.member, group: member.group });
      if (ctx.where === "body" || ctx.where === "setup") {
        report(
          "L015",
          `"${expr.name}" is a relation, read by a dancer, and ${whereIs(ctx)} runs for nobody`,
          expr.span,
          {
            suggestion: `"${expr.name}" is declared on "${member.group.name}" and every dancer under it may read it — a body may not`,
            trace: [declFact(`"${member.group.name}" declares "${expr.name}"`, member.member.span)],
          },
        );
        return UNKNOWN;
      }
      requireKind(member.group, expr.span, ctx, `"${expr.name}"`, member.member.span);
      return memberType(member.member, member.group);
    }
    const elsewhere = groupDeclaring(expr.name);
    if (elsewhere !== undefined) {
      // A move or a compound may read a relation its callers provide, and the
      // contract is checked where the dance names the move. Where there *is* a
      // floor, though, the relation has to be somewhere on it.
      if (ctx.shapes.length === 0) return UNKNOWN;
      const member = elsewhere.members.get(expr.name);
      if (member !== undefined) {
        bind({ kind: "member", member, group: elsewhere });
        requireKind(elsewhere, expr.span, ctx, `"${expr.name}"`, member.span);
        return memberType(member, elsewhere);
      }
    }
    report("L012", `nothing here is called "${expr.name}"`, expr.span, {
      suggestion: nearestName(expr.name, ctx),
    });
    return UNKNOWN;
  }

  const idType = (binding: Binding): Type => {
    if (binding.kind === "id") {
      return binding.group.ids === undefined
        ? { kind: "prim", name: "i32" }
        : { kind: "enum", enum: binding.group.ids };
    }
    return UNKNOWN;
  };

  function readQualified(expr: QualifiedExpr, ctx: Ctx): Type {
    const from = exports.get(expr.module);
    const found = from?.get(expr.name);
    if (found === undefined) {
      report("L011", `"${expr.module}" declares nothing called "${expr.name}"`, expr.span, {
        suggestion: from === undefined ? undefined : nearest(expr.name, [...from.keys()]),
      });
      return UNKNOWN;
    }
    if (found.kind === "group") {
      names.set(expr, { kind: "group", group: found.group });
      requireKind(found.group, expr.span, ctx, `"${expr.module}::${expr.name}"`);
      return { kind: "group-ref", group: found.group };
    }
    if (found.kind === "enum-member") {
      names.set(expr, { kind: "enum-member", enum: found.enum, member: found.member });
      return { kind: "enum", enum: found.enum };
    }
    if (found.kind === "fn") {
      names.set(expr, { kind: "fn", fn: frozen(found.fn) });
      return { kind: "prim", name: "fn" };
    }
    return UNKNOWN;
  }

  /**
   * A kind must be on **every** path below the reader. Where it is not, a
   * body or a member is an error (narrow it first) and a dance's script is a
   * **contract**: the dancers who lack the kind are out, and run the floor's
   * `out` instead (§5).
   */
  function requireKind(
    group: GroupInfo,
    span: Span,
    ctx: Ctx,
    subject: string,
    declaredAt?: Span,
  ): void {
    if (!ctx.strict && ctx.fn !== undefined && !ctx.fn.contract.includes(group)) {
      ctx.fn.contract.push(group);
    }
    if (ctx.roots.includes(group)) return;
    if (ctx.shapes.length === 0) return; // no floor in sight: the caller's contract
    const has = (shape: PathShape): boolean => shape.some((step) => step.group === group);
    if (ctx.shapes.every(has)) return;
    if (!ctx.strict && ctx.shapes.some(has)) return;
    const lacking = ctx.shapes.find((shape) => !has(shape));
    const trace: Fact[] = [];
    if (declaredAt !== undefined) {
      trace.push(declFact(`${subject} is declared on "${group.name}"`, declaredAt));
    }
    if (lacking !== undefined) {
      trace.push({
        layer: "check",
        what: `this path has no "${group.name}"`,
        why: pathText(ctx, lacking),
      });
    }
    const narrowOn = narrowingKind(ctx, group);
    const nowhere = !ctx.shapes.some(has);
    const suggestion =
      narrowOn !== undefined
        ? `match on "${narrowOn}" first: its arms say which paths you are on`
        : nowhere
          ? `nothing under "${ctx.roots[0]?.name ?? "this group"}" is a "${group.name}"`
          : `narrow first, or move this where every dancer has a "${group.name}"`;
    report(
      "L014",
      `${subject} needs a "${group.name}" above the dancer, and not every path here has one`,
      span,
      { suggestion, trace },
    );
  }

  const pathText = (ctx: Ctx, shape: PathShape): string =>
    [ctx.roots[0]?.name ?? "", ...shape.map((step) => step.group.name)].filter(Boolean).join(" / ");

  /**
   * The kind whose arms would tell the reader whether it has the missing one:
   * a kind on every path whose ids fall apart into "the paths with it" and
   * "the paths without it" — becket's `Station`, whose `In` has a `MinorSet`
   * below it and whose two ends do not.
   */
  const narrowingKind = (ctx: Ctx, missing: GroupInfo): string | undefined => {
    const candidates = new Map<string, { with: Set<string>; without: Set<string> }>();
    for (const shape of ctx.shapes) {
      const has = shape.some((step) => step.group === missing);
      for (const step of shape) {
        if (step.group === missing || step.group.ids === undefined) continue;
        if (step.id.kind !== "enum") continue;
        const tally = candidates.get(step.group.name) ?? { with: new Set(), without: new Set() };
        (has ? tally.with : tally.without).add(step.id.name);
        candidates.set(step.group.name, tally);
      }
    }
    for (const [name, tally] of candidates) {
      if (tally.with.size === 0 || tally.without.size === 0) continue;
      if ([...tally.with].some((id) => tally.without.has(id))) continue;
      return name;
    }
    return undefined;
  };

  /** The group on the reader's path that declares a bare name, innermost first. */
  function memberOnPath(name: string, ctx: Ctx): { member: Member; group: GroupInfo } | undefined {
    const candidates: GroupInfo[] = [];
    const see = (group: GroupInfo): void => {
      if (group.members.has(name) && !candidates.includes(group)) candidates.push(group);
    };
    if (ctx.self !== undefined) see(ctx.self);
    for (const root of ctx.roots) see(root);
    for (const shape of ctx.shapes) for (const step of shape) see(step.group);
    const deepest = candidates.at(-1);
    if (deepest === undefined) return undefined;
    const member = deepest.members.get(name);
    return member === undefined ? undefined : { member, group: deepest };
  }

  /** A group anywhere in the program that declares this name, for the reads off the path. */
  const groupDeclaring = (name: string): GroupInfo | undefined => {
    for (const group of groups.values()) if (group.members.has(name)) return group;
    return undefined;
  };

  // -- calls ---------------------------------------------------------------

  function calleeOf(expr: CallExpr, ctx: Ctx): CalleeBinding | undefined {
    if (expr.title) {
      const group = groupRef(expr.callee, expr.module, ctx.scope);
      return group === undefined ? undefined : { kind: "group", group };
    }
    const local = ctx.locals.get(expr.callee);
    if (local?.kind === "param") return { kind: "param", param: local.param };
    if (expr.module === undefined) {
      if (expr.callee in MODIFIER_SIGS) return { kind: "modifier", name: expr.callee };
      if (expr.callee in BUILTINS && ctx.scope.fns.get(expr.callee) === undefined) {
        return { kind: "builtin", name: expr.callee };
      }
    }
    const fn = fnRef(expr.callee, expr.module, ctx.scope);
    if (fn !== undefined) return { kind: "fn", fn: frozen(fn) };
    const member = memberOnPath(expr.callee, ctx);
    if (member?.member.kind === "fn") {
      const found = fns.get(member.member);
      if (found !== undefined) return { kind: "fn", fn: frozen(found) };
    }
    return undefined;
  }

  function walkCall(expr: CallExpr, ctx: Ctx): Type {
    const callee = calleeOf(expr, ctx);
    if (callee === undefined) {
      report("L012", `nothing here is called "${expr.callee}"`, expr.span, {
        suggestion: nearestName(expr.callee, ctx),
      });
      for (const arg of expr.args) walkExpr(arg.value, ctx);
      return UNKNOWN;
    }
    calls.set(expr, callee);

    if (callee.kind === "modifier") {
      const sig = MODIFIER_SIGS[expr.callee];
      if (sig !== undefined) checkLoose(expr, sig.positional, sig.names, "a transform");
      return UNKNOWN;
    }
    if (callee.kind === "builtin") return walkBuiltin(expr, ctx);
    if (callee.kind === "param") {
      for (const arg of expr.args) walkExpr(arg.value, ctx);
      return UNKNOWN;
    }
    if (callee.kind === "group") {
      report(
        "L016",
        `"${expr.callee}(…)" builds a node, and a node is built once, in a \`setup\` or a \`body\``,
        expr.span,
      );
      for (const arg of expr.args) walkExpr(arg.value, ctx);
      return UNKNOWN;
    }

    const fn = callee.fn;
    const bound = checkArgs(expr.args, fn.decl.params, expr.span, `"${fn.name}"`, ctx, {
      ...(scopes.get(fn.module) ? { paramScope: scopes.get(fn.module) } : {}),
      trace: [declFact(`"${fn.name}" is ${roleText(fn)}`, fn.decl.span)],
    });
    if (fn.role === "move") {
      for (const { param, arg, want, type } of bound) {
        if (want.kind !== "group-ref" || type.kind !== "selection") continue;
        // A parameter typed as a place kind — `with: Role` — takes a
        // selection as it stands (notes D10): the end of the line's far mate
        // is nobody, and the figure's own cast rule decides what the dancer
        // does then. Several at once is the evaluator's `L110`, at the call;
        // `one!` stays the mark that says it must be exactly one.
        if (isLeafKind(want.group)) continue;
        report(
          "L024",
          `"${fn.name}" takes one "${want.group.name}", and this is a selection`,
          arg.span,
          {
            suggestion: `wrap it in "one!(…)" — a move is danced with somebody, not with a set`,
            trace: [declFact(`"${param.name}: ${want.group.name}"`, param.span)],
          },
        );
      }
    }
    return UNKNOWN;
  }

  /** A kind with no kinds below it: a place, where one dancer stands or nobody does. */
  const isLeafKind = (group: GroupInfo): boolean =>
    group.shapes.every((shape) => shape.length === 0);

  const roleText = (fn: FnInfo): string =>
    fn.role === "move" ? "a move" : fn.role === "dance" ? "a dance" : "a compound";

  function walkBuiltin(expr: CallExpr, ctx: Ctx): Type {
    const sig = BUILTINS[expr.callee] as BuiltinSig;
    if (sig.bodyOnly === true && ctx.where !== "body") {
      report(
        "L016",
        `"${expr.callee}()" makes a leaf of the tree, and belongs in a body`,
        expr.span,
      );
    }
    checkLoose(expr, sig.positional, sig.names ?? [], `"${expr.callee}"`, sig.min);

    let kindGroup: GroupInfo | undefined;
    expr.args.forEach((arg, index) => {
      if (sig.kind === index && arg.value.kind === "name" && arg.value.title) {
        const group = ctx.scope.groups.get(arg.value.name);
        if (group === undefined) {
          report("L012", `there is no group called "${arg.value.name}"`, arg.span, {
            suggestion: nearestGroup(arg.value.name, ctx),
          });
          return;
        }
        kindGroup = group;
        names.set(arg.value, { kind: "group", group });
        if (ctx.where === "body" || ctx.where === "setup") {
          report(
            "L015",
            `"${expr.callee}(${arg.value.name})" reads the reader's own "${arg.value.name}", and ${whereIs(ctx)} runs for nobody`,
            expr.span,
          );
          return;
        }
        requireKind(group, arg.span, ctx, `"${expr.callee}(${arg.value.name})"`);
        return;
      }
      if (sig.anchorName === index && arg.value.kind === "name") {
        names.set(arg.value, {
          kind: "anchor",
          name: arg.value.name,
          ...(kindGroup ? { group: kindGroup } : {}),
        });
        return;
      }
      walkExpr(arg.value, ctx);
    });

    if (expr.callee === "id" && kindGroup !== undefined) {
      return kindGroup.ids === undefined
        ? { kind: "prim", name: "i32" }
        : { kind: "enum", enum: kindGroup.ids };
    }
    if (expr.callee === "other" && kindGroup !== undefined) {
      const admits = otherCount(kindGroup);
      return admits === 1
        ? { kind: "group-ref", group: kindGroup }
        : { kind: "selection", group: kindGroup };
    }
    if (expr.callee === "dancers") return { kind: "selection" };
    if (expr.callee === "count") return { kind: "prim", name: "i32" };
    return UNKNOWN;
  }

  /** `other(K)` is total on a two-member enum and a selection everywhere else (§4). */
  const otherCount = (group: GroupInfo): number | undefined =>
    group.ids === undefined ? undefined : group.ids.members.length - 1;

  // -- one!, select and assign --------------------------------------------

  function walkOne(arg: Expr, span: Span, ctx: Ctx): Type {
    const type = walkExpr(arg, ctx);
    const count = arityOf(arg, ctx);
    if (count !== undefined && count !== 1) {
      report(
        "L020",
        count === 0
          ? "this matches nothing, so `one!` can never hold"
          : `this matches ${String(count)} at once, and \`one!\` wants exactly one`,
        span,
        {
          suggestion: whyMany(arg, ctx),
          trace: manyTrace(arg, ctx),
        },
      );
    } else if (arg.kind === "call" && arg.callee === "other") {
      const first = arg.args[0]?.value;
      const group =
        first?.kind === "name" && first.title ? ctx.scope.groups.get(first.name) : undefined;
      if (group !== undefined && otherCount(group) === 1) {
        report(
          "L021",
          `"other(${group.name})" is already one: "${group.name}" has two ids, so there is only one other`,
          span,
          {
            severity: "warning",
            suggestion: `write "other(${group.name})" without the "one!"`,
            trace: [
              declFact(
                `"${group.name}" has ${group.ids?.members.join(" and ") ?? ""}`,
                group.decl.span,
              ),
            ],
          },
        );
      }
    }
    if (type.kind === "selection" && type.group !== undefined) {
      return { kind: "group-ref", group: type.group };
    }
    return type.kind === "selection" ? UNKNOWN : type;
  }

  const whyMany = (arg: Expr, ctx: Ctx): string | undefined => {
    if (arg.kind !== "select") return undefined;
    const wide = arg.args.find((kindArg) => {
      const group = ctx.scope.groups.get(kindArg.group);
      return (
        kindArg.pattern.kind === "relative" &&
        kindArg.pattern.which === "other" &&
        group !== undefined &&
        (otherCount(group) ?? 0) > 1
      );
    });
    if (wide === undefined) return undefined;
    const group = ctx.scope.groups.get(wide.group);
    return `"${wide.group} = other" is every other ${wide.group}, and "${wide.group}" has ${String(group?.ids?.members.length ?? 0)} ids — name the one you mean`;
  };

  const manyTrace = (arg: Expr, ctx: Ctx): readonly Fact[] => {
    if (arg.kind !== "select") return [];
    const facts: Fact[] = [];
    for (const kindArg of arg.args) {
      const group = ctx.scope.groups.get(kindArg.group);
      const admits = kinds.get(kindArg)?.admits;
      if (group === undefined || admits === undefined) continue;
      facts.push(
        declFact(
          `"${kindArg.group}" admits ${String(admits)} of ${group.ids === undefined ? "its ids" : group.ids.members.join(", ")}`,
          kindArg.span,
        ),
      );
    }
    return facts;
  };

  function walkSelect(expr: SelectExpr, ctx: Ctx): Type {
    if (expr.kind === "assign" && (ctx.where === "body" || ctx.where === "setup")) {
      report("L015", `an "assign" moves a dancer, and ${whereIs(ctx)} runs for nobody`, expr.span, {
        suggestion: "the tree is built once; what moves about it is the script",
      });
    }
    for (const arg of expr.args) {
      const group = ctx.scope.groups.get(arg.group);
      if (group === undefined) {
        report("L012", `there is no group called "${arg.group}"`, arg.span, {
          suggestion: nearestGroup(arg.group, ctx),
        });
        continue;
      }
      const admits = admitCount(arg.pattern, group);
      kinds.set(arg, { group, ...(admits === undefined ? {} : { admits }) });
      const type: Type =
        group.ids === undefined ? { kind: "prim", name: "i32" } : { kind: "enum", enum: group.ids };
      walkPattern(arg.pattern, type, ctx, true);
      if (arg.pattern.kind === "relative" && arg.pattern.which === "other") {
        requireKind(group, arg.span, ctx, `"${arg.group} = other"`);
      }
      if (expr.kind === "assign" && arg.pattern.kind === "wildcard") {
        report("L025", `"${arg.group} = _" does not say where to go`, arg.span, {
          suggestion: "`_` is for `select`, which may find many; an `assign` names one place",
        });
      }
    }
    if (expr.kind === "assign") checkAssignBranch(expr, ctx);
    const count = selectCount(expr, ctx);
    const leaf = leafKind(ctx);
    if (count === 1) return leaf === undefined ? UNKNOWN : { kind: "group-ref", group: leaf };
    return { kind: "selection", ...(leaf ? { group: leaf } : {}) };
  }

  /** An `assign` may name a kind on another branch — but the branch must have it (§4). */
  function checkAssignBranch(expr: SelectExpr, ctx: Ctx): void {
    if (ctx.allShapes.length === 0) return;
    let targets = ctx.allShapes;
    for (const arg of expr.args) {
      const group = ctx.scope.groups.get(arg.group);
      if (group === undefined) continue;
      const admitted = admittedIds(arg.pattern, group);
      if (admitted === undefined) continue;
      const narrowed = targets.filter((shape) => {
        const step = shape.find((s) => s.group === group);
        if (step === undefined) return false;
        if (step.id.kind === "unknown") return true;
        const name = step.id.kind === "enum" ? step.id.name : String(step.id.value);
        return admitted.includes(name);
      });
      if (narrowed.length > 0) targets = narrowed;
    }
    for (const arg of expr.args) {
      const group = ctx.scope.groups.get(arg.group);
      if (group === undefined) continue;
      if (ctx.roots.includes(group)) continue;
      if (targets.some((shape) => shape.some((step) => step.group === group))) continue;
      report("L026", `this "assign" lands where there is no "${arg.group}"`, arg.span, {
        suggestion: `naming a kind on another branch drops the kinds that branch lacks — "${arg.group}" is one of them`,
        trace: targets.slice(0, 1).map((shape) => ({
          layer: "check" as const,
          what: `it lands on ${pathText(ctx, shape)}`,
        })),
      });
    }
  }

  /** How many ids a pattern admits of a group, when the checker can count them. */
  function admitCount(pattern: Pattern, group: GroupInfo): number | undefined {
    const ids = group.ids;
    switch (pattern.kind) {
      case "wildcard":
        return ids?.members.length;
      case "relative":
        return pattern.which === "other" ? otherCount(group) : 1;
      case "alt": {
        const parts = pattern.options.map((option) => admitCount(option, group));
        return parts.some((part) => part === undefined)
          ? undefined
          : parts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
      }
      case "range-pattern":
        return undefined;
      case "expr-pattern":
        return 1;
    }
  }

  /**
   * How many leaves a `select` can match: one for every kind below the reader,
   * multiplied. A kind nobody named is *mine* and admits one; a kind named on
   * another branch is beyond counting, and so is an `i32` id.
   */
  function selectCount(expr: SelectExpr, ctx: Ctx): number | undefined {
    const below = kindsBelow(ctx);
    if (below === undefined) return undefined;
    let total = 1;
    for (const arg of expr.args) {
      const group = ctx.scope.groups.get(arg.group);
      if (group === undefined || !below.includes(group)) return undefined;
    }
    for (const group of below) {
      const named = expr.args.find((arg) => ctx.scope.groups.get(arg.group) === group);
      const admits = named === undefined ? 1 : admitCount(named.pattern, group);
      if (admits === undefined) return undefined;
      total *= admits;
    }
    return total;
  }

  /** The kinds below the reader, when every path below has the same ones. */
  function kindsBelow(ctx: Ctx): readonly GroupInfo[] | undefined {
    if (ctx.shapes.length === 0) return undefined;
    const first = ctx.shapes[0] as PathShape;
    const kindList = first.map((step) => step.group);
    for (const shape of ctx.shapes) {
      if (shape.length !== kindList.length) return undefined;
      if (shape.some((step, index) => step.group !== kindList[index])) return undefined;
    }
    return kindList;
  }

  const leafKind = (ctx: Ctx): GroupInfo | undefined => kindsBelow(ctx)?.at(-1);

  // -- patterns ------------------------------------------------------------

  function walkPattern(pattern: Pattern, subject: Type, ctx: Ctx, relative: boolean): void {
    switch (pattern.kind) {
      case "wildcard":
        return;
      case "relative":
        if (!relative) {
          report(
            "L017",
            `"${pattern.which}" compares a candidate against the reader, and there is no candidate here`,
            pattern.span,
            {
              suggestion:
                pattern.which === "other"
                  ? 'in an `is` or a `match`, name the id you mean, or ask "select(K = other)" for the group'
                  : "`first` and `last` belong in a `select` or an `assign`",
            },
          );
        }
        return;
      case "alt":
        for (const option of pattern.options) walkPattern(option, subject, ctx, relative);
        return;
      case "range-pattern":
        walkExpr(pattern.from, ctx);
        walkExpr(pattern.to, ctx);
        return;
      case "expr-pattern":
        walkExpr(pattern.expr, ctx, subject);
        return;
    }
  }

  /** A `match` is exhaustive or it is a check error (§4). */
  function checkMatch(
    type: Type,
    arms: readonly { pattern: Pattern; span: Span }[],
    span: Span,
  ): void {
    if (type.kind !== "enum") return;
    const covered = new Set<string>();
    let anything = false;
    const cover = (pattern: Pattern): void => {
      if (pattern.kind === "wildcard") anything = true;
      else if (pattern.kind === "alt") pattern.options.forEach(cover);
      else if (pattern.kind === "expr-pattern") {
        const expr = pattern.expr;
        if (expr.kind === "name" && type.enum.members.includes(expr.name)) covered.add(expr.name);
        else if (expr.kind === "qualified" && type.enum.members.includes(expr.name)) {
          covered.add(expr.name);
        }
      }
    };
    for (const arm of arms) cover(arm.pattern);
    if (anything) return;
    const missing = type.enum.members.filter((member) => !covered.has(member));
    if (missing.length === 0) return;
    report(
      "L018",
      `this \`match\` does not cover ${missing.map((m) => `"${m}"`).join(", ")}`,
      span,
      {
        suggestion: `add ${missing.length === 1 ? "an arm" : "arms"} for ${missing.join(", ")}, or "_ => …" to say "the rest" out loud`,
        trace: [declFact(`"${type.enum.name}" is ${type.enum.members.join(", ")}`, type.enum.span)],
      },
    );
  }

  // -- arguments -----------------------------------------------------------

  /**
   * Positional arguments fill the parameters in order, then the named ones
   * fill theirs; every parameter without a default must end up filled, and
   * nothing may be filled twice. A move's parameters are its contract.
   *
   * A parameter's **type is read where it was written**, not where it is
   * filled: `chain(who: enum Role, …)` is declared in `contra`, so a dance may
   * write `chain(Robin, …)` without importing `Role` — the enum the argument
   * belongs to is settled by the declaration.
   */
  function checkArgs(
    args: readonly Arg[],
    params: readonly Param[],
    span: Span,
    what: string,
    ctx: Ctx,
    options: BoundOptions = {},
  ): Bound[] {
    const group = options.group;
    const paramScope = options.paramScope ?? ctx.scope;
    const filled = new Map<string, Arg>();
    const bound: Bound[] = [];
    const idParam: Param | undefined =
      group === undefined
        ? undefined
        : {
            kind: "param",
            name: "id",
            type: { kind: "named", name: group.name, span: group.decl.span },
            span: group.decl.idType.span,
          };
    const all = idParam === undefined ? params : [idParam, ...params];
    const fill = (param: Param, arg: Arg): void => {
      filled.set(param.name, arg);
      const want =
        group !== undefined && param === idParam
          ? group.ids === undefined
            ? ({ kind: "prim", name: "i32" } as Type)
            : ({ kind: "enum", enum: group.ids } as Type)
          : typeOfRef(param.type, paramScope);
      bound.push({ param, arg, want, type: walkExpr(arg.value, ctx, want) });
    };

    let positional = 0;
    for (const arg of args) {
      if (arg.name === undefined) {
        const param = all[positional];
        positional += 1;
        if (param === undefined) {
          report("L027", `${what} does not take ${String(positional)} arguments`, arg.span, {
            suggestion: `it takes ${signatureText(all)}`,
            trace: options.trace ?? [],
          });
          walkExpr(arg.value, ctx);
          continue;
        }
        fill(param, arg);
        continue;
      }
      const param = all.find((p) => p.name === arg.name);
      if (param === undefined) {
        report("L028", `${what} has no argument called "${arg.name}"`, arg.span, {
          suggestion:
            nearest(
              arg.name,
              all.map((p) => p.name),
            ) ?? `it takes ${signatureText(all)}`,
          trace: options.trace ?? [],
        });
        walkExpr(arg.value, ctx);
        continue;
      }
      const already = filled.get(param.name);
      if (already !== undefined) {
        report("L029", `"${param.name}" is given twice — once in order, once by name`, arg.span, {
          suggestion: `${what} takes ${signatureText(all)}, and the arguments without names fill them in order`,
          trace: [
            declFact(`"${param.name}" was already filled by the argument before it`, already.span),
            ...(options.trace ?? []),
          ],
        });
        walkExpr(arg.value, ctx);
        continue;
      }
      fill(param, arg);
    }
    const missing = all.filter(
      (param) => !filled.has(param.name) && param.default === undefined && !isBlockParam(param),
    );
    if (missing.length > 0) {
      report("L030", `${what} is missing ${missing.map((p) => `"${p.name}"`).join(", ")}`, span, {
        suggestion: `it takes ${signatureText(all)}`,
        trace: options.trace ?? [],
      });
    }
    return bound;
  }

  interface BoundOptions {
    group?: GroupInfo;
    /** The module the parameters were written in; their types are read there. */
    paramScope?: ModuleScope;
    trace?: readonly Fact[];
  }

  interface Bound {
    param: Param;
    arg: Arg;
    /** The type the parameter asks for. */
    want: Type;
    /** The type the argument turned out to have. */
    type: Type;
  }

  /** A `fn` parameter may be filled by a trailing block rather than an argument. */
  const isBlockParam = (param: Param): boolean =>
    param.type.kind === "primitive" && param.type.name === "fn";

  const signatureText = (params: readonly Param[]): string =>
    params.length === 0
      ? "nothing"
      : params.map((p) => `${p.name}: ${typeText(p.type)}`).join(", ");

  const typeText = (type: TypeRef): string =>
    type.kind === "enum-of" ? `enum ${type.name}` : type.name;

  /** The built-ins and the transforms: shape only, since their types are the evaluator's. */
  function checkLoose(
    expr: CallExpr,
    positional: number,
    names_: readonly string[],
    what: string,
    min?: number,
  ): void {
    let count = 0;
    for (const arg of expr.args) {
      if (arg.name === undefined) count += 1;
      else if (!names_.includes(arg.name)) {
        report("L028", `${what} has no argument called "${arg.name}"`, arg.span, {
          suggestion:
            names_.length === 0
              ? `${what} takes its arguments in order`
              : `it takes ${names_.join(", ")}`,
        });
      }
    }
    if (count > positional) {
      report("L027", `${what} does not take ${String(count)} arguments`, expr.span, {
        suggestion:
          positional === 0
            ? `${what} takes its arguments by name`
            : `${what} takes ${String(positional)}`,
      });
    }
    if (min !== undefined && count < min) {
      report("L030", `${what} wants ${String(min)} argument${min === 1 ? "" : "s"}`, expr.span);
    }
  }

  // -- types ---------------------------------------------------------------

  function typeOfRef(ref: TypeRef, scope: ModuleScope): Type {
    if (ref.kind === "primitive") return { kind: "prim", name: ref.name };
    if (ref.kind === "enum-of") {
      const group = scope.groups.get(ref.name);
      return group?.ids === undefined ? UNKNOWN : { kind: "enum", enum: group.ids };
    }
    const group = scope.groups.get(ref.name);
    if (group !== undefined) return { kind: "group-ref", group };
    const named = scope.enums.get(ref.name);
    if (named !== undefined) return { kind: "enum", enum: named };
    return UNKNOWN;
  }

  /** A pattern beside a group name matches its id (§3), so a group reads as its enum. */
  const asEnum = (type: Type): Type =>
    type.kind === "group-ref" && type.group.ids !== undefined
      ? { kind: "enum", enum: type.group.ids }
      : type;

  /** A member's type is the type of what it is declared to be. */
  function memberType(member: Member, group: GroupInfo): Type {
    const memoed = memberTypes.get(member);
    if (memoed !== undefined) return memoed;
    if (member.kind === "fn" || typing.has(member)) return UNKNOWN;
    typing.add(member);
    const scope = scopes.get(group.module);
    let type: Type = UNKNOWN;
    if (scope !== undefined) {
      const ctx: Ctx = {
        scope,
        where: "member",
        strict: true,
        self: group,
        roots: [group],
        shapes: group.shapes,
        allShapes: group.shapes,
        locals: new Map<string, Binding>([["id", { kind: "id", group }]]),
        anchors: new Set(["center"]),
      };
      for (const param of group.decl.params) ctx.locals.set(param.name, { kind: "param", param });
      type = quietly(() => walkExpr(member.value, ctx));
    }
    typing.delete(member);
    memberTypes.set(member, type);
    return type;
  }

  /** Work out a type without complaining twice about the same text. */
  function quietly<T>(run: () => T): T {
    const before = diagnostics.length;
    const result = run();
    diagnostics.length = before;
    return result;
  }

  /** How many an expression matches, when the checker can count (§4, `one!`). */
  function arityOf(expr: Expr, ctx: Ctx): number | undefined {
    if (expr.kind === "select") return selectCount(expr, ctx);
    if (expr.kind === "one") return 1;
    if (expr.kind === "call" && expr.callee === "other") {
      const first = expr.args[0]?.value;
      if (first?.kind === "name" && first.title) {
        const group = ctx.scope.groups.get(first.name);
        if (group !== undefined) return otherCount(group);
      }
      return undefined;
    }
    return undefined;
  }

  // -- suggestions ---------------------------------------------------------

  const nearestGroup = (name: string, ctx: Ctx): string | undefined =>
    nearest(name, [...ctx.scope.groups.keys(), ...ctx.scope.enumMembers.keys()]);

  const nearestName = (name: string, ctx: Ctx): string | undefined =>
    nearest(name, [...ctx.locals.keys(), ...ctx.scope.fns.keys(), ...CURSOR]);

  const listOf = (from: Map<string, Exported>): string =>
    [...from.keys()].slice(0, 8).join(", ") + (from.size > 8 ? ", …" : "");

  // -- running -------------------------------------------------------------

  const frozenFns = new Map<MutableFnInfo, FnInfo>();
  const frozen = (fn: MutableFnInfo): FnInfo => {
    const already = frozenFns.get(fn);
    if (already !== undefined) return already;
    frozenFns.set(fn, fn as FnInfo);
    return fn as FnInfo;
  };

  function run(): CheckResult {
    collect();
    link();
    for (const group of groups.values()) {
      const scope = scopes.get(group.module);
      if (scope === undefined) continue;
      (group as { shapes: readonly PathShape[] }).shapes = shapesBelow(group, [], scope);
    }
    checkCollisions();
    classify();
    checkFloors();
    walkAll();
    for (const fn of fns.values()) {
      if (fn.role !== "dance") continue;
      checkBeats(frozen(fn), { lookup: fnLookup }, report);
    }
    return {
      diagnostics,
      resolution: {
        names,
        calls,
        kinds,
        fns: fns as ReadonlyMap<FnDecl, FnInfo>,
        groups,
        dances: [...fns.values()].filter((fn) => fn.role === "dance"),
      },
    };
  }

  /** How the beat walk finds what a name in a script calls. */
  const fnLookup = (
    module: string,
    name: string,
    path: readonly GroupInfo[],
  ): FnInfo | undefined => {
    const scope = scopes.get(module);
    const own = scope?.fns.get(name);
    if (own !== undefined) return own;
    for (const group of path) {
      const member = group.members.get(name);
      if (member?.kind === "fn") return fns.get(member);
    }
    return undefined;
  };

  return { run };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** "did you mean …" — the nearest word by edit distance, when one is near enough. */
function nearest(word: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const score = distance(word, candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (best === undefined || bestScore > Math.max(2, Math.floor(word.length / 3))) return undefined;
  return `did you mean "${best}"?`;
}

function distance(a: string, b: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) rows.push([i, ...Array<number>(b.length).fill(0)]);
  const first = rows[0] as number[];
  for (let j = 0; j <= b.length; j += 1) first[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    const row = rows[i] as number[];
    const prev = rows[i - 1] as number[];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return (rows[a.length] as number[])[b.length] ?? 0;
}
