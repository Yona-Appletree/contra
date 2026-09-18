/**
 * The setup pass: run a dance's `setup` **once, for nobody**, and get the tree
 * it builds.
 *
 * Every group invocation is a node — its id, its parameters, its frame and its
 * anchors — and every `dancer();` is a person standing in the node whose body
 * called it. Nothing here knows about beats: the tree is the floor, and the
 * script (P3's other half) runs against it afterwards without ever moving a
 * node (§5, §9).
 */
import type { Diagnostic } from "../diagnostics/Diagnostic.js";
import type { FnDecl, InvokeStmt, Span, Stmt } from "../syntax/ast.js";
import type { Builder, Ctx } from "./evaluate.js";
import { drain, evaluateExpr, execStmt, fail, isEvalFailure, nodeEnv } from "./evaluate.js";
import type { Frame } from "./frame.js";
import { originFrame } from "./frame.js";
import type { Module, Program } from "./loadForEval.js";
import { findGroup } from "./loadForEval.js";
import type { Dancer, Node, Tree } from "./tree.js";
import { dancerIdFor, declaresDancer } from "./tree.js";
import type { Value } from "./value.js";
import { newEnv, showValue } from "./value.js";

/** A dance, found: its declaration and the module it was written in. */
export interface DanceRef {
  module: Module;
  decl: FnDecl;
}

export interface BuildResult {
  tree: Tree;
  diagnostics: Diagnostic[];
}

/** Find a dance by name — `butter`, or `becket::progress` if you must qualify. */
export function findDance(
  program: Program,
  name: string,
  moduleName?: string,
): DanceRef | undefined {
  if (moduleName !== undefined) {
    const module = program.modules.get(moduleName);
    const decl = module?.fns.get(name);
    return module !== undefined && decl !== undefined ? { module, decl } : undefined;
  }
  for (const module of program.modules.values()) {
    const decl = module.fns.get(name);
    if (decl !== undefined) return { module, decl };
  }
  return undefined;
}

const emptyTree = (): Tree => ({
  roots: [],
  nodes: [],
  places: [],
  dancers: [],
  byId: new Map(),
});

/**
 * Run `setup` and return the floor. `args` are the hall's facts, which arrive
 * as the dance's parameters (`butter(minor-sets = 4)`).
 */
export function buildTree(
  program: Program,
  dance: DanceRef,
  args: Readonly<Record<string, Value>> = {},
): BuildResult {
  const tree = emptyTree();
  const diagnostics: Diagnostic[] = [];
  const env = newEnv();
  for (const param of dance.decl.params) {
    const given = args[param.name];
    if (given !== undefined) env.vars.set(param.name, given);
  }

  const ctx: Ctx = {
    program,
    tree,
    module: dance.module,
    env,
    builder: rootBuilder(tree),
    trace: [{ layer: "setup", what: `setup of ${dance.decl.name}`, span: dance.decl.span }],
  };
  for (const param of dance.decl.params) {
    if (env.vars.has(param.name)) continue;
    if (param.default === undefined) {
      diagnostics.push({
        code: "L100",
        severity: "error",
        stage: "setup",
        message: `"${param.name}" is a hall fact this dance needs, and the evening did not say it`,
        span: param.span,
        dancers: [],
        trace: [],
      });
      return { tree, diagnostics };
    }
    env.vars.set(param.name, evaluateExpr(param.default, ctx));
  }

  try {
    for (const stmt of dance.decl.body) if (stmt.kind === "setup") drain(execStmt(stmt, ctx));
  } catch (error) {
    if (!isEvalFailure(error)) throw error;
    diagnostics.push(error.diagnostic);
  }
  mintDancerIds(tree);
  return { tree, diagnostics };
}

function rootBuilder(tree: Tree): Builder {
  return {
    frame: originFrame,
    invoke: (stmt, childFrame, ctx) => {
      invokeGroup(stmt, childFrame, ctx, undefined, tree);
    },
    dancer: (span, ctx) => {
      fail(ctx, "L100", "setup", "a dancer stands in a group: there is no group here", span);
    },
    anchor: (_name, _value, span, ctx) => {
      fail(ctx, "L100", "setup", "an anchor belongs to a group: there is no group here", span);
    },
  };
}

/** Build one node, run its body, then run the children the invocation carried. */
function invokeGroup(
  stmt: InvokeStmt,
  childFrame: Frame,
  ctx: Ctx,
  parent: Node | undefined,
  tree: Tree,
): void {
  const found = findGroup(ctx.program, ctx.module, stmt.name, stmt.module);
  if (found === undefined)
    fail(ctx, "L100", "setup", `there is no group called "${stmt.name}" here`, stmt.span);

  const positional = stmt.args.filter((arg) => arg.name === undefined);
  const named = new Map(
    stmt.args.filter((arg) => arg.name !== undefined).map((arg) => [arg.name ?? "", arg.value]),
  );
  const idExpr = positional[0]?.value;
  if (idExpr === undefined)
    fail(ctx, "L100", "setup", `${stmt.name} is invoked with its id: ${stmt.name}(…)`, stmt.span);
  const id = evaluateExpr(idExpr, ctx);

  const node: Node = {
    kind: found.decl.name,
    decl: found.decl,
    module: found.module.name,
    id,
    idLabel: showValue(id),
    label: `${found.decl.name}(${showValue(id)})`,
    path: `${parent === undefined ? "" : `${parent.path}/`}${found.decl.name}(${showValue(id)})`,
    params: {},
    frame: childFrame,
    anchors: {},
    children: [],
    ...(parent === undefined ? {} : { parent }),
    place: declaresDancer(found.decl),
  };

  // Parameters bind in declaration order, so a default may read the one before
  // it, and `id` is in scope for all of them (§3).
  const params: Record<string, Value> = {};
  const paramEnv = newEnv();
  paramEnv.vars.set("id", id);
  const paramCtx: Ctx = { ...ctx, module: found.module, env: paramEnv, self: node };
  found.decl.params.forEach((param, index) => {
    const given = named.get(param.name) ?? positional[index + 1]?.value;
    const value =
      given !== undefined
        ? evaluateExpr(given, ctx)
        : param.default === undefined
          ? fail(
              ctx,
              "L100",
              "setup",
              `${found.decl.name} wants "${param.name}", and it has no default`,
              stmt.span,
            )
          : evaluateExpr(param.default, paramCtx);
    params[param.name] = value;
    paramEnv.vars.set(param.name, value);
  });
  node.params = params;

  if (parent === undefined) tree.roots.push(node);
  else parent.children.push(node);
  tree.nodes.push(node);
  if (node.place) tree.places.push(node);

  // The body is the declaration's own text, so it reads the declaration's
  // module and the node's own scope; the invocation's children are the
  // caller's text, so they keep the caller's scope and only change where they
  // land (§3).
  const bodyCtx: Ctx = {
    ...ctx,
    module: found.module,
    env: nodeEnv(node),
    self: node,
    builder: childBuilder(node, tree),
    trace: [...ctx.trace, { layer: "setup", what: `body of ${node.label}`, span: stmt.span }],
  };
  drain(execStmtsIn(found.decl.body, bodyCtx));

  const childrenCtx: Ctx = { ...ctx, builder: childBuilder(node, tree) };
  drain(execStmtsIn(stmt.children, childrenCtx));
}

function* execStmtsIn(stmts: readonly Stmt[], ctx: Ctx): Generator<void, void, void> {
  for (const stmt of stmts) yield* execStmt(stmt, ctx);
}

function childBuilder(node: Node, tree: Tree): Builder {
  return {
    node,
    frame: node.frame,
    invoke: (stmt, childFrame, ctx) => {
      invokeGroup(stmt, childFrame, ctx, node, tree);
    },
    dancer: (span, ctx) => {
      placeDancer(node, span, ctx, tree);
    },
    anchor: (name, value) => {
      node.anchors[name] = value;
    },
  };
}

function placeDancer(node: Node, span: Span, ctx: Ctx, tree: Tree): void {
  if (node.occupant !== undefined)
    fail(ctx, "L100", "setup", `${node.label} already holds a dancer`, span);
  const dancer: Dancer = { id: "", home: node, at: node };
  node.occupant = dancer;
  tree.dancers.push(dancer);
}

/**
 * Names, once the whole floor is there: a person is named for where they
 * started and keeps that name all evening, because the person is the constant
 * and the place is what the progression moves them through.
 */
function mintDancerIds(tree: Tree): void {
  const singleRoot = tree.roots.length === 1;
  const used = new Map<string, number>();
  for (const dancer of tree.dancers) {
    const base = dancerIdFor(dancer.home, singleRoot);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    dancer.id = seen === 0 ? base : `${base}.${String(seen + 1)}`;
    tree.byId.set(dancer.id, dancer);
  }
}
