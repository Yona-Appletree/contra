/**
 * The script pass and the driver: one time through a dance.
 *
 * Every dancer runs the same text and gets a different dance out of it,
 * because everything it reads it reads from where it stands. The driver runs
 * them **in lock step**: each dancer runs until its cursor passes beat `b`,
 * then the events issued during `b` commit together, and the commit is where
 * the diagnostics live — two dancers in one place names the pair and the beat
 * (§6). Reads during a beat see the state before that beat's commit, which is
 * what makes a swap (`assign(Role = other)` said by both partners) work and a
 * half-swap fail.
 *
 * A dancer the dance cannot address is **out**: its path lacks one of the
 * kinds the dance reads, so it runs the formation's `out(length)` instead
 * (§5). It still takes part in the set-wide `progress()`, which is how the
 * couple waiting at the top comes in on the same commit as the couple leaving
 * (D5).
 */
import type { Diagnostic, Fact } from "../diagnostics/Diagnostic.js";
import { diagnostic } from "../diagnostics/Diagnostic.js";
import type { Expr, FnDecl, Pattern, SelectExpr, Span, Stmt } from "../syntax/ast.js";
import type { DanceRef } from "./buildTree.js";
import type { Ctx, ScriptCtx } from "./evaluate.js";
import { callFn, drain, execStmts, floorOf, isEvalFailure, isMove, nodeEnv } from "./evaluate.js";
import type { Module, Program } from "./loadForEval.js";
import { findFn, findGroup, groupsDeclaringMember, visibleModules } from "./loadForEval.js";
import type { EventRecord, Move, Position, Snapshot, TimeResult } from "./timeline.js";
import type { Dancer, Node, Tree } from "./tree.js";
import { kindsOf, shortPath } from "./tree.js";
import type { Value } from "./value.js";
import { newEnv } from "./value.js";

export interface RunOptions {
  time?: number;
  firstTime?: boolean;
  lastTime?: boolean;
  /** A guard: a dance that never ends is a diagnostic, not a hung process. */
  maxBeats?: number;
}

interface Pending {
  dancer: Dancer;
  to: Node;
  beat: number;
  span: Span;
  trace: readonly Fact[];
}

interface Run {
  program: Program;
  tree: Tree;
  time: number;
  firstTime: boolean;
  lastTime: boolean;
  moves: Move[];
  events: EventRecord[];
  cards: { beat: number; text: string; dancers: string[] }[];
  diagnostics: Diagnostic[];
  snapshots: Snapshot[];
  pending: Pending[];
  progressed: Set<number>;
  memo: Map<string, Value>;
  stopped: boolean;
}

interface Runner {
  script: ScriptCtx;
  gen: Generator<void, void, void>;
  done: boolean;
  /** Set when the dance stopped being able to address this dancer mid-way. */
  wentOut?: boolean;
}

const DEFAULT_MAX_BEATS = 4096;

/** One time through: what everybody danced, and what the commits made of it. */
export function runDance(
  program: Program,
  tree: Tree,
  dance: DanceRef,
  args: Readonly<Record<string, Value>> = {},
  options: RunOptions = {},
): TimeResult {
  const run: Run = {
    program,
    tree,
    time: options.time ?? 1,
    firstTime: options.firstTime ?? (options.time ?? 1) === 1,
    lastTime: options.lastTime ?? false,
    moves: [],
    events: [],
    cards: [],
    diagnostics: [],
    snapshots: [],
    pending: [],
    progressed: new Set(),
    memo: new Map(),
    stopped: false,
  };

  const contract = contractKinds(program, dance);
  const inDancers: Dancer[] = [];
  const outDancers: Dancer[] = [];
  for (const dancer of tree.dancers)
    (addresses(contract, dancer) ? inDancers : outDancers).push(dancer);

  const runners = inDancers.map((dancer) => makeDanceRunner(run, dancer, dance, args));
  const maxBeats = options.maxBeats ?? DEFAULT_MAX_BEATS;
  driveBeats(run, runners, maxBeats, contract);

  // D4: a dance's length is what its dancers' cursors reached, and `out` runs
  // for exactly that, afterwards, on the same time through. A dancer the
  // progression carried out of the dance waits for what is left of it.
  const length = runners.reduce((max, runner) => Math.max(max, runner.script.cursor), 0);
  if (!run.stopped) {
    const waiting: { dancer: Dancer; from: number }[] = [
      ...outDancers.map((dancer) => ({ dancer, from: 0 })),
      ...runners
        .filter((runner) => runner.wentOut === true)
        .map((runner) => ({ dancer: runner.script.dancer, from: runner.script.cursor })),
    ];
    const outRunners = waiting
      .map(({ dancer, from }) => makeOutRunner(run, dancer, length - from, from))
      .filter((runner): runner is Runner => runner !== undefined);
    if (outRunners.length > 0) driveBeats(run, outRunners, maxBeats, undefined);
  }

  return {
    time: run.time,
    firstTime: run.firstTime,
    lastTime: run.lastTime,
    length,
    inDancers: inDancers
      .filter((dancer) => !runners.some((r) => r.script.dancer === dancer && r.wentOut === true))
      .map((dancer) => dancer.id),
    outDancers: [
      ...outDancers.map((dancer) => dancer.id),
      ...runners.filter((r) => r.wentOut === true).map((r) => r.script.dancer.id),
    ],
    moves: run.moves,
    events: run.events,
    cards: run.cards,
    diagnostics: run.diagnostics,
    snapshots: run.snapshots,
  };
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

function driveBeats(
  run: Run,
  runners: readonly Runner[],
  maxBeats: number,
  contract: ReadonlySet<string> | undefined,
): void {
  if (runners.length === 0) {
    commitBeat(run, 0);
    return;
  }
  for (let beat = 0; ; beat += 1) {
    run.memo.clear();
    for (const runner of runners) pump(run, runner, beat);
    commitBeat(run, beat);
    if (contract !== undefined) reviewMembership(runners, contract);
    if (run.stopped) return;
    if (runners.every((runner) => runner.done)) return;
    if (beat > maxBeats) {
      run.diagnostics.push(
        diagnostic(
          "L108",
          "script",
          `this dance has not finished after ${String(maxBeats)} beats`,
          {
            beat,
            dancers: runners.filter((r) => !r.done).map((r) => r.script.dancer.id),
          },
        ),
      );
      run.stopped = true;
      return;
    }
  }
}

/**
 * A commit can carry a dancer out of the dance: becket's progression sends the
 * couple at the end of the line to a `Station`, which has no `MinorSet`, and
 * the rest of the text would read one. That couple stops dancing where it
 * stands and waits out what is left of the time — which is what happens at a
 * dance, and the reason the shift at beat 2 is the last thing it does.
 */
function reviewMembership(runners: readonly Runner[], contract: ReadonlySet<string>): void {
  for (const runner of runners) {
    if (runner.done || runner.wentOut === true) continue;
    if (addresses(contract, runner.script.dancer)) continue;
    runner.wentOut = true;
    runner.done = true;
  }
}

/** Can a dance that reads these kinds address this dancer (§5)? */
function addresses(contract: ReadonlySet<string>, dancer: Dancer): boolean {
  const kinds = new Set(kindsOf(dancer.at));
  return [...contract].every((kind) => kinds.has(kind));
}

/** Run one dancer until its cursor is past this beat, or its script ends. */
function pump(run: Run, runner: Runner, beat: number): void {
  while (!runner.done && runner.script.cursor <= beat && !run.stopped) {
    try {
      if (runner.gen.next().done === true) runner.done = true;
    } catch (error) {
      if (!isEvalFailure(error)) throw error;
      run.diagnostics.push(error.diagnostic);
      runner.done = true;
      run.stopped = true;
    }
  }
}

/**
 * The commit at the end of a beat (§6): every event issued during it applies
 * at once, and the tree is checked before anything is written — no place with
 * two dancers, no dancer without a place.
 */
function commitBeat(run: Run, beat: number): void {
  const due = run.pending.filter((event) => event.beat === beat);
  run.pending = run.pending.filter((event) => event.beat !== beat);
  if (due.length === 0) return;

  const moving = new Map<Dancer, Pending>();
  for (const event of due) moving.set(event.dancer, event);

  const wanted = new Map<Node, Dancer[]>();
  for (const dancer of run.tree.dancers) {
    const to = moving.get(dancer)?.to ?? dancer.at;
    const list = wanted.get(to);
    if (list === undefined) wanted.set(to, [dancer]);
    else list.push(dancer);
  }

  let failed = false;
  for (const [node, dancers] of wanted) {
    if (dancers.length < 2) continue;
    failed = true;
    const culprit = dancers.map((d) => moving.get(d)).find((event) => event !== undefined);
    run.diagnostics.push(
      diagnostic(
        "L102",
        "commit",
        `${dancers.map((d) => d.id).join(" and ")} both end beat ${String(beat)} at ${shortPath(node)}`,
        {
          beat,
          ...(culprit === undefined ? {} : { span: culprit.span }),
          dancers: dancers.map((d) => d.id),
          trace: [
            ...(culprit?.trace ?? []),
            ...dancers.map((d) => ({
              layer: "commit" as const,
              what: `${d.id} came from ${shortPath(d.at)}${moving.has(d) ? " on this beat's event" : " and issued no event"}`,
              beat,
            })),
          ],
          suggestion:
            "every place holds one dancer: the events of this beat send two to the same one",
        },
      ),
    );
  }
  for (const dancer of run.tree.dancers) {
    const to = moving.get(dancer)?.to ?? dancer.at;
    if (to.place) continue;
    failed = true;
    run.diagnostics.push(
      diagnostic("L103", "commit", `${dancer.id} ends beat ${String(beat)} with nowhere to stand`, {
        beat,
        dancers: [dancer.id],
        suggestion: "an event goes to a place — a group whose body says `dancer();`",
      }),
    );
  }
  if (failed) {
    run.stopped = true;
    return;
  }

  for (const node of run.tree.places) delete node.occupant;
  for (const dancer of run.tree.dancers) {
    const event = moving.get(dancer);
    if (event !== undefined) {
      run.events.push({
        dancer: dancer.id,
        beat,
        from: shortPath(dancer.at),
        to: shortPath(event.to),
      });
      dancer.at = event.to;
    }
    dancer.at.occupant = dancer;
  }
  run.memo.clear();
  run.snapshots.push({ time: run.time, beat, at: "commit", positions: positionsOf(run.tree) });
}

/** Everybody's place, for the playground's dots and the evening's record. */
export function positionsOf(tree: Tree): Position[] {
  return tree.dancers.map((dancer) => ({
    dancer: dancer.id,
    place: shortPath(dancer.at),
    x: dancer.at.frame.x,
    y: dancer.at.frame.y,
    heading: dancer.at.frame.heading,
  }));
}

// ---------------------------------------------------------------------------
// One dancer's script
// ---------------------------------------------------------------------------

function makeScript(run: Run, dancer: Dancer, cursor: number, canMove: boolean): ScriptCtx {
  const script: ScriptCtx = {
    dancer,
    cursor,
    origin: cursor,
    time: run.time,
    firstTime: run.firstTime,
    lastTime: run.lastTime,
    canMove,
    move: (ir, args, beats) => {
      run.moves.push({ dancer: dancer.id, ir, args: [...args], start: script.cursor, beats });
      script.cursor += beats;
    },
    queue: (to, span, ctx) => {
      run.pending.push({ dancer, to, beat: script.cursor, span, trace: ctx.trace });
    },
    card: (text) => {
      const existing = run.cards.find((card) => card.beat === script.cursor && card.text === text);
      if (existing === undefined)
        run.cards.push({ beat: script.cursor, text, dancers: [dancer.id] });
      else existing.dancers.push(dancer.id);
    },
    progress: (span, ctx) => {
      triggerProgress(run, script.cursor, span, ctx);
    },
    floorCheck: (decl, module, span, ctx) => {
      checkFloor(run, decl, module, span, ctx);
    },
  };
  return script;
}

function baseCtx(run: Run, module: Module, script: ScriptCtx, trace: readonly Fact[]): Ctx {
  return {
    program: run.program,
    tree: run.tree,
    module,
    env: newEnv(),
    reader: script.dancer,
    script,
    memo: run.memo,
    trace,
  };
}

function makeDanceRunner(
  run: Run,
  dancer: Dancer,
  dance: DanceRef,
  args: Readonly<Record<string, Value>>,
): Runner {
  const script = makeScript(run, dancer, 0, true);
  const ctx = baseCtx(run, dance.module, script, [
    {
      layer: "script",
      what: `${dance.decl.name} for ${dancer.id}`,
      span: dance.decl.span,
      beat: 0,
    },
  ]);
  const callee: Value = {
    t: "fn",
    decl: dance.decl,
    env: newEnv(),
    module: dance.module.name,
  };
  const given = dance.decl.params
    .filter((param) => args[param.name] !== undefined)
    .map((param) => ({ name: param.name, value: args[param.name] as Value }));
  return {
    script,
    done: false,
    gen: (function* body() {
      yield* callFn(callee, given, dance.decl.span, ctx);
    })(),
  };
}

/** A dancer the dance cannot address runs the formation's `out(length)` (§5). */
function makeOutRunner(run: Run, dancer: Dancer, length: number, from = 0): Runner | undefined {
  const found = findMemberFnOnPath(dancer, "out");
  if (found === undefined || length <= 0) return undefined;
  const script = makeScript(run, dancer, from, true);
  const module = run.program.modules.get(found.node.module);
  if (module === undefined) return undefined;
  const ctx = baseCtx(run, module, script, [
    {
      layer: "script",
      what: `out of ${found.node.label} for ${dancer.id}`,
      span: found.decl.span,
      beat: from,
    },
  ]);
  const callee: Value = {
    t: "fn",
    decl: found.decl,
    env: nodeEnv(found.node),
    module: found.node.module,
    self: found.node,
  };
  return {
    script,
    done: false,
    gen: (function* body() {
      yield* callFn(callee, [{ value: { t: "num", v: length, unit: "" } }], found.decl.span, ctx);
    })(),
  };
}

/**
 * `progress()` is set-wide (D5): the first call at a beat evaluates the
 * formation's `progress` for **every** dancer at that beat, in or out, and
 * later calls at the same beat are the same trigger.
 */
function triggerProgress(run: Run, beat: number, span: Span, ctx: Ctx): void {
  if (run.progressed.has(beat)) return;
  run.progressed.add(beat);
  for (const dancer of run.tree.dancers) {
    const found = findMemberFnOnPath(dancer, "progress");
    if (found === undefined) continue;
    const module = run.program.modules.get(found.node.module);
    if (module === undefined) continue;
    const script = makeScript(run, dancer, beat, false);
    const inner: Ctx = {
      ...baseCtx(run, module, script, [
        ...ctx.trace,
        {
          layer: "script",
          what: `progress of ${found.node.label} for ${dancer.id}, set-wide`,
          span,
          beat,
        },
      ]),
      env: nodeEnv(found.node),
      self: found.node,
    };
    try {
      drain(execStmts(found.decl.body, inner));
    } catch (error) {
      if (!isEvalFailure(error)) throw error;
      run.diagnostics.push(error.diagnostic);
      run.stopped = true;
      return;
    }
  }
}

/** Two dances composed must agree on their floor (§5). */
function checkFloor(run: Run, decl: FnDecl, module: Module, span: Span, ctx: Ctx): void {
  const invoke = floorOf(decl);
  const root = run.tree.roots[0];
  if (invoke === undefined || root === undefined) return;
  const found = findGroup(run.program, module, invoke.name, invoke.module);
  if (found === undefined || found.decl === root.decl) return;
  run.diagnostics.push(
    diagnostic(
      "L107",
      "script",
      `"${decl.name}" stands on ${found.module.name}::${invoke.name}, and the floor is ${root.module}::${root.kind}`,
      {
        span,
        beat: ctx.script?.cursor ?? 0,
        dancers: ctx.reader === undefined ? [] : [ctx.reader.id],
        trace: ctx.trace,
        suggestion: "two dances composed must agree on their formation: a medley stands in one",
      },
    ),
  );
  run.stopped = true;
}

/** The nearest `fn` member of that name at or above the dancer. */
function findMemberFnOnPath(
  dancer: Dancer,
  name: string,
): { node: Node; decl: FnDecl } | undefined {
  for (let at: Node | undefined = dancer.at; at !== undefined; at = at.parent) {
    const member = at.decl.members.find((m) => m.kind === "fn" && m.name === name);
    if (member !== undefined && member.kind === "fn") return { node: at, decl: member };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The contract: which kinds a dance reads (§5)
// ---------------------------------------------------------------------------

/**
 * The kinds a dance reads, found by walking its text: a group named in an
 * expression, a kind named in a `select` or an `assign`, and the group that
 * declares any relation it reads bare. The formation's own `fn`s (`progress`,
 * `out`) are **not** walked: they are what the ends run, and reading them
 * would make everybody out.
 */
export function contractKinds(program: Program, dance: DanceRef): Set<string> {
  const kinds = new Set<string>();
  const seen = new Set<FnDecl>();
  const modules = visibleModules(program, dance.module);
  const memberFnNames = new Set<string>();
  for (const module of modules)
    for (const group of module.groups.values())
      for (const member of group.members) if (member.kind === "fn") memberFnNames.add(member.name);

  const walkFn = (module: Module, decl: FnDecl): void => {
    if (seen.has(decl) || isMove(decl)) return;
    seen.add(decl);
    walkStmts(decl.body, module);
  };

  const walkStmts = (stmts: readonly Stmt[], module: Module): void => {
    for (const stmt of stmts) walkStmt(stmt, module);
  };

  const walkStmt = (stmt: Stmt, module: Module): void => {
    switch (stmt.kind) {
      case "setup":
      case "ir":
      case "card":
        return;
      case "anchor":
        walkExpr(stmt.value, module);
        return;
      case "for":
        walkExpr(stmt.range, module);
        walkStmts(stmt.body, module);
        return;
      case "if":
        walkExpr(stmt.test, module);
        walkStmts(stmt.then, module);
        if (stmt.else !== undefined) walkStmts(stmt.else, module);
        return;
      case "match":
        walkExpr(stmt.subject, module);
        for (const arm of stmt.arms) {
          walkPattern(arm.pattern, module);
          walkStmts(arm.body, module);
        }
        return;
      case "modified":
        walkStmt(stmt.stmt, module);
        return;
      case "invoke":
        return;
      case "expr":
        walkExpr(stmt.expr, module);
        if (stmt.block !== undefined) walkStmts(stmt.block, module);
        return;
    }
  };

  const walkExpr = (expr: Expr, module: Module): void => {
    switch (expr.kind) {
      case "name":
      case "qualified": {
        const qualifier = expr.kind === "qualified" ? expr.module : undefined;
        if (expr.title) {
          if (findGroup(program, module, expr.name, qualifier) !== undefined) kinds.add(expr.name);
          return;
        }
        for (const decl of groupsDeclaringMember(program, expr.name))
          if (modules.some((m) => m.groups.get(decl.name) === decl)) kinds.add(decl.name);
        return;
      }
      case "call": {
        for (const arg of expr.args) walkExpr(arg.value, module);
        if (memberFnNames.has(expr.callee)) return;
        const found = findFn(program, module, expr.callee, expr.module);
        if (found !== undefined) walkFn(found.module, found.decl);
        return;
      }
      case "one":
        walkExpr(expr.arg, module);
        return;
      case "select":
      case "assign":
        walkSelect(expr, module);
        return;
      case "unary":
        walkExpr(expr.operand, module);
        return;
      case "binary":
        walkExpr(expr.left, module);
        walkExpr(expr.right, module);
        return;
      case "is":
        walkExpr(expr.subject, module);
        walkPattern(expr.pattern, module);
        return;
      case "if-expr":
        walkExpr(expr.test, module);
        walkExpr(expr.then, module);
        walkExpr(expr.else, module);
        return;
      case "match-expr":
        walkExpr(expr.subject, module);
        for (const arm of expr.arms) {
          walkPattern(arm.pattern, module);
          walkExpr(arm.value, module);
        }
        return;
      case "range":
        walkExpr(expr.from, module);
        walkExpr(expr.to, module);
        return;
      case "fn-expr":
        walkStmts(expr.body, module);
        return;
      default:
        return;
    }
  };

  const walkSelect = (expr: SelectExpr, module: Module): void => {
    for (const arg of expr.args) {
      if (findGroup(program, module, arg.group) !== undefined) kinds.add(arg.group);
      walkPattern(arg.pattern, module);
    }
  };

  const walkPattern = (pattern: Pattern, module: Module): void => {
    switch (pattern.kind) {
      case "alt":
        for (const option of pattern.options) walkPattern(option, module);
        return;
      case "range-pattern":
        walkExpr(pattern.from, module);
        walkExpr(pattern.to, module);
        return;
      case "expr-pattern":
        walkExpr(pattern.expr, module);
        return;
      default:
        return;
    }
  };

  walkFn(dance.module, dance.decl);
  return kinds;
}
