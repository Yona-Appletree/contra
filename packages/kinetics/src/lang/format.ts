import type { Comment } from "./lexer.js";
import { parseWithComments } from "./parser.js";
import type { Arg, Expr, File, Item, Param, Span, Stmt, Transform } from "./syntax.js";

/**
 * The one way a `.dance` file looks (P1): parse it and print it back.
 *
 * A language that opines about formatting needs a formatter with it (the
 * user: *"if you make a language, you need to decide all those things and
 * build a formatter, linter, etc."*). Two-space indent, one statement a
 * line, a blank line between items, `a = b`, `a: T`, `f(x, y = 1)`, spaced
 * operators, and every comment kept: a `//` on its own line stays a leading
 * comment of the next statement (or the closing brace), one at the end of a
 * line stays at the end of that statement's line. `format` is idempotent,
 * and every `.dance` file in the repo is checked `format(text) === text`.
 */
export function format(source: string): string {
  const { file, comments } = parseWithComments(source);
  return new Printer(file, comments).print();
}

/** Print a parsed file with no comments (they live only in the source text). */
export const printFile = (file: File): string => new Printer(file, []).print();

class Printer {
  private readonly lines: string[] = [];
  private nextComment = 0;

  constructor(
    private readonly file: File,
    private readonly comments: readonly Comment[],
  ) {}

  print(): string {
    this.file.items.forEach((item, i) => {
      // A blank line between items — except between enums, which sit
      // together the way a prelude lists them.
      const previous = this.file.items[i - 1];
      if (previous !== undefined && !(previous.kind === "enum" && item.kind === "enum")) {
        this.lines.push("");
      }
      this.leading(item.span, "");
      this.item(item);
    });
    this.rest("");
    while (this.lines[0] === "") this.lines.shift();
    while (this.lines[this.lines.length - 1] === "") this.lines.pop();
    return this.lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }

  /** Comments that sit before `span` on their own lines. */
  private leading(span: Span, indent: string): void {
    while (this.nextComment < this.comments.length) {
      const c = this.comments[this.nextComment] as Comment;
      if (c.start >= span.start) break;
      this.lines.push(`${indent}// ${c.text}`.trimEnd());
      this.nextComment += 1;
      // A comment block the source set apart with a blank line stays apart.
      const following = this.comments[this.nextComment];
      const until = following && following.start < span.start ? following.start : span.start;
      if (/\n[ \t]*\n/.test(this.file.source.slice(c.end, until))) this.lines.push("");
    }
  }

  /** A comment on the same source line as the end of the statement just printed. */
  private trailing(span: Span): string {
    const c = this.comments[this.nextComment];
    if (c && c.start >= span.end && c.line === lineOfOffset(this.file.source, span.end)) {
      this.nextComment += 1;
      return ` // ${c.text}`;
    }
    return "";
  }

  /** Every comment not yet printed — the ones before a closing brace, or the end. */
  private rest(indent: string, before?: number): void {
    while (this.nextComment < this.comments.length) {
      const c = this.comments[this.nextComment] as Comment;
      if (before !== undefined && c.start >= before) break;
      this.lines.push(`${indent}// ${c.text}`.trimEnd());
      this.nextComment += 1;
    }
  }

  private item(item: Item): void {
    if (item.kind === "enum") {
      this.lines.push(
        `enum ${item.name} { ${item.members.join(", ")} }${this.trailing(item.span)}`,
      );
      return;
    }
    const head = `module ${item.name}(${item.params.map(param).join(", ")}) {`;
    this.block(head, item.body, "", item.span);
  }

  private block(head: string, body: readonly Stmt[], indent: string, span: Span): void {
    this.lines.push(`${indent}${head}`);
    for (const stmt of body) this.stmt(stmt, `${indent}  `);
    this.rest(`${indent}  `, span.end);
    this.lines.push(`${indent}}${this.trailing(span)}`);
  }

  private stmt(stmt: Stmt, indent: string): void {
    this.leading(stmt.span, indent);
    switch (stmt.kind) {
      case "place": {
        const role = stmt.role === undefined ? "" : ` role ${stmt.role}`;
        this.line(`place ${stmt.name}${role}${at(stmt.at)};`, indent, stmt.span);
        return;
      }
      case "anchor": {
        const type = stmt.type === undefined ? "" : `: ${stmt.type}`;
        this.line(`anchor ${stmt.name}${type} = ${expr(stmt.value)};`, indent, stmt.span);
        return;
      }
      case "group": {
        const name = stmt.name === undefined ? "" : `${stmt.name} = `;
        const head = `group ${name}${stmt.module}(${args(stmt.args)})${at(stmt.at)}`;
        if (stmt.children === undefined) this.line(`${head};`, indent, stmt.span);
        else this.block(`${head} {`, stmt.children, indent, stmt.span);
        return;
      }
      case "provide":
        this.line(`provide $${stmt.name}: ${stmt.type} = ${expr(stmt.value)};`, indent, stmt.span);
        return;
      case "provide-fn":
        this.block(
          `provide ${stmt.name}(${stmt.params.map(param).join(", ")}) {`,
          stmt.body,
          indent,
          stmt.span,
        );
        return;
      case "dancers":
        this.line("dancers;", indent, stmt.span);
        return;
      case "children":
        this.line("children();", indent, stmt.span);
        return;
      case "assign":
        this.line(`$${stmt.name} = ${expr(stmt.value)};`, indent, stmt.span);
        return;
      case "assert":
        this.line(
          `assert(${expr(stmt.condition)}${stmt.message === undefined ? "" : `, "${stmt.message}"`});`,
          indent,
          stmt.span,
        );
        return;
      case "card":
      case "say":
        this.line(`${stmt.kind} "${stmt.text}";`, indent, stmt.span);
        return;
      case "for":
        this.block(
          `for ${stmt.binder} in ${expr(stmt.from)}${stmt.inclusive ? "..=" : ".."}${expr(stmt.to)} {`,
          stmt.body,
          indent,
          stmt.span,
        );
        return;
      case "match":
        this.matchStmt(stmt, indent);
        return;
      case "next":
        this.line(`next = ${expr(stmt.value)};`, indent, stmt.span);
        return;
      case "seat":
        this.line(`seat = ${expr(stmt.value)};`, indent, stmt.span);
        return;
      case "let":
        this.line(`let ${stmt.name} = ${expr(stmt.value)};`, indent, stmt.span);
        return;
      case "ir":
        this.line(`ir "${stmt.id}";`, indent, stmt.span);
        return;
      case "call":
        if (stmt.children === undefined)
          this.line(`${stmt.name}(${args(stmt.args)});`, indent, stmt.span);
        else this.block(`${stmt.name}(${args(stmt.args)}) {`, stmt.children, indent, stmt.span);
        return;
      case "repeat": {
        const head = `repeat (${expr(stmt.count)})`;
        const only = stmt.body[0];
        if (stmt.body.length === 1 && only !== undefined && isOneLiner(only)) {
          // `repeat (i in 3) group minor-set() at …;` stays on one line.
          this.lines.push(`${indent}${head} ${this.oneLine(only)}${this.trailing(stmt.span)}`);
          return;
        }
        this.block(`${head} {`, stmt.body, indent, stmt.span);
        return;
      }
      case "if":
        this.ifStmt(stmt, indent, "if");
        return;
    }
  }

  private ifStmt(stmt: Extract<Stmt, { kind: "if" }>, indent: string, head: string): void {
    this.lines.push(`${indent}${head} (${expr(stmt.condition)}) {`);
    for (const s of stmt.then) this.stmt(s, `${indent}  `);
    const elseStart = stmt.else[0]?.span.start;
    this.rest(`${indent}  `, elseStart ?? stmt.span.end);
    if (stmt.else.length === 0) {
      this.lines.push(`${indent}}${this.trailing(stmt.span)}`);
      return;
    }
    const chained = stmt.else[0];
    if (stmt.else.length === 1 && chained !== undefined && chained.kind === "if") {
      // `} else if (…) {` — the chain is nested in the tree, flat in the text.
      this.ifStmt(chained, indent, "} else if");
      return;
    }
    this.lines.push(`${indent}} else {`);
    for (const s of stmt.else) this.stmt(s, `${indent}  `);
    this.rest(`${indent}  `, stmt.span.end);
    this.lines.push(`${indent}}${this.trailing(stmt.span)}`);
  }

  /** `match (x) {` with one arm a line: `A1 => stmt,` or `A1 => {` … `},`. */
  private matchStmt(stmt: Extract<Stmt, { kind: "match" }>, indent: string): void {
    this.lines.push(`${indent}match (${expr(stmt.subject)}) {`);
    for (const arm of stmt.arms) {
      this.leading(arm.span, `${indent}  `);
      const head = `${indent}  ${arm.pattern ?? "_"} =>`;
      const only = arm.body[0];
      if (arm.body.length === 1 && only !== undefined && isOneLiner(only)) {
        this.lines.push(`${head} ${this.oneLine(only)}${this.trailing(arm.span)}`);
        continue;
      }
      this.lines.push(`${head} {`);
      for (const s of arm.body) this.stmt(s, `${indent}    `);
      this.rest(`${indent}    `, arm.span.end);
      this.lines.push(`${indent}  }`);
    }
    this.rest(`${indent}  `, stmt.span.end);
    this.lines.push(`${indent}}${this.trailing(stmt.span)}`);
  }

  private oneLine(stmt: Stmt): string {
    const before = this.lines.length;
    this.stmt(stmt, "");
    const text = this.lines.splice(before).join(" ").trim();
    return text;
  }

  private line(text: string, indent: string, span: Span): void {
    this.lines.push(`${indent}${text}${this.trailing(span)}`);
  }
}

const isOneLiner = (stmt: Stmt): boolean => stmt.kind !== "repeat" && stmt.kind !== "if";

const param = (p: Param): string =>
  `${p.dynamic ? "$" : ""}${p.name}: ${p.type}${p.default === undefined ? "" : ` = ${expr(p.default)}`}`;

const args = (list: readonly Arg[]): string =>
  list
    .map((a) =>
      a.name === undefined ? expr(a.value) : `${a.dynamic ? "$" : ""}${a.name} = ${expr(a.value)}`,
    )
    .join(", ");

const at = (transforms: readonly Transform[]): string =>
  transforms.length === 0
    ? ""
    : ` at ${transforms.map((t) => `${t.op}(${args(t.args)})`).join(" ")}`;

/** Binding strength, for the parentheses a printed expression needs. */
const PRECEDENCE: Record<string, number> = {
  or: 1,
  and: 2,
  not: 3,
  is: 4,
  "==": 4,
  "!=": 4,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
  neg: 7,
};

const precedenceOf = (e: Expr): number => {
  if (e.kind === "binary") return PRECEDENCE[e.op] ?? 8;
  if (e.kind === "unary")
    return e.op === "not" ? (PRECEDENCE["not"] ?? 3) : (PRECEDENCE["neg"] ?? 7);
  if (e.kind === "cond") return 0;
  return 9;
};

export function expr(e: Expr): string {
  switch (e.kind) {
    case "number":
      return `${numberText(e.value)}${e.unit}`;
    case "string":
      return `"${e.value}"`;
    case "member":
      return e.type === undefined ? e.member : `${e.type}.${e.member}`;
    case "dyn":
      return `$${e.name}`;
    case "name":
      return e.name;
    case "me":
      return "me";
    case "nobody":
      return "nobody";
    case "call":
      return `${e.name}(${args(e.args)})`;
    case "path":
      return `${wrap(e.of, 9)}.${e.name}`;
    case "unary":
      return e.op === "not"
        ? `not ${wrap(e.of, PRECEDENCE["not"] ?? 3)}`
        : `-${wrap(e.of, PRECEDENCE["neg"] ?? 7)}`;
    case "binary": {
      const p = PRECEDENCE[e.op] ?? 8;
      // Left-associative: the right operand needs parentheses at equal strength.
      return `${wrap(e.left, p)} ${e.op} ${wrap(e.right, p + 1)}`;
    }
    case "cond":
      return `if (${expr(e.condition)}) ${expr(e.then)} else ${expr(e.else)}`;
  }
}

const wrap = (e: Expr, atLeast: number): string =>
  precedenceOf(e) < atLeast ? `(${expr(e)})` : expr(e);

/** `0.6`, `3`, never `3.0` or `1e-7`. */
const numberText = (n: number): string => {
  const text = String(n);
  return text.includes("e") ? n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "") : text;
};

const lineOfOffset = (source: string, offset: number): number => {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) if (source[i] === "\n") line += 1;
  return line;
};
