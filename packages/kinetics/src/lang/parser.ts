import type { Comment, Token } from "./lexer.js";
import { syntaxError, tokenize } from "./lexer.js";
import type {
  Arg,
  BinaryOp,
  EnumItem,
  Expr,
  File,
  Item,
  MatchArm,
  ModuleItem,
  Param,
  Span,
  Stmt,
  Transform,
  TransformOp,
} from "./syntax.js";
import { TRANSFORM_OPS, UNITS } from "./syntax.js";

/**
 * Read a `.dance` file (round 2). Hand-written recursive descent; the
 * grammar is the plan's:
 *
 * ```text
 * file       := item*
 * item       := "enum" Type "{" Member {"," Member} [","] "}"
 *             | "module" name "(" params ")" block
 * params     := [param {"," param} [","]]
 * param      := ["$"] name ":" Type ["=" expr]
 * block      := "{" stmt* "}"
 * stmt       := "place" name ["role" Member] ["at" transform+] ";"
 *             | "anchor" name [":" Type] "=" expr ";"
 *             | "group" [name "="] name "(" args ")" ["at" transform+] (";" | block)
 *             | "provide" "$" name ":" Type "=" expr ";"
 *             | "provide" name "(" params ")" block
 *             | "dancers" ";"  |  "children" "(" ")" ";"
 *             | "let" name "=" expr ";"  |  "$" name "=" expr ";"
 *             | "assert" "(" expr ["," String] ")" ";"
 *             | ("card" | "say" | "ir") String ";"
 *             | "repeat" "(" expr ")" (block | stmt)
 *             | "for" name "in" expr (".." | "..=") expr block
 *             | "if" "(" expr ")" block {"else" "if" "(" expr ")" block} ["else" block]
 *             | "match" "(" expr ")" "{" {arm [","]} "}"      arm := (Member | "_") "=>" (block | stmt)
 *             | name "(" args ")" (";" | block)
 * transform  := ("translate" | "rotate" | "mirror" | "fwd" | "back" | "left" | "right") "(" args ")"
 * args       := [arg {"," arg} [","]] ;  arg := [["$"] name "="] expr
 * expr       := or ; or := and {"or" and} ; and := not {"and" not}
 * not        := "not" not | cmp
 * cmp        := add [("is" | "==" | "!=" | "<" | "<=" | ">" | ">=") add]
 * add        := mul {("+" | "-") mul} ; mul := unary {("*" | "/" | "%") unary}
 * unary      := "-" unary | postfix ; postfix := primary {"." name}
 * primary    := Number [unit] | String | Member | Type "." Member | "$" name
 *             | name ["(" args ")"] | "me" | "nobody" | "(" expr ")"
 *             | "if" "(" expr ")" expr "else" expr
 * ```
 *
 * One `module` keyword: what a statement emits, not where it sits, decides
 * which pass reads it. Statements end with `;` and blocks with `}`;
 * newlines mean nothing. `is` tests an enum value and its right side is a
 * bare member, typed from the left; that typing is the checker's.
 */
export function parse(source: string): File {
  const { tokens } = tokenize(source);
  return new Parser(tokens, source).file();
}

/** Parse, and hand back the comments too — what the formatter needs. */
export function parseWithComments(source: string): { file: File; comments: Comment[] } {
  const { tokens, comments } = tokenize(source);
  return { file: new Parser(tokens, source).file(), comments };
}

const COMPARISONS: readonly BinaryOp[] = ["is", "==", "!=", "<", "<=", ">", ">="];
const OLD_KEYWORDS = ["formation", "move", "dance"];

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly source: string,
  ) {}

  private peek(ahead = 0): Token {
    return this.tokens[Math.min(this.pos + ahead, this.tokens.length - 1)] as Token;
  }

  private take(): Token {
    const token = this.peek();
    if (token.kind !== "end") this.pos += 1;
    return token;
  }

  private isPunct(text: string, ahead = 0): boolean {
    const token = this.peek(ahead);
    return token.kind === "punct" && token.text === text;
  }

  private isName(text: string, ahead = 0): boolean {
    const token = this.peek(ahead);
    return token.kind === "name" && token.text === text;
  }

  private fail(token: Token, message: string): never {
    throw syntaxError(message, token.line, token.col, token.start);
  }

  private expectPunct(text: string, what: string): Token {
    if (!this.isPunct(text)) {
      this.fail(this.peek(), `expected "${text}" ${what}, found ${describe(this.peek())}`);
    }
    return this.take();
  }

  private expectName(what: string): Token {
    const token = this.peek();
    if (token.kind !== "name") this.fail(token, `expected ${what}, found ${describe(token)}`);
    return this.take();
  }

  private expectKeyword(word: string): Token {
    if (!this.isName(word)) {
      this.fail(this.peek(), `expected "${word}", found ${describe(this.peek())}`);
    }
    return this.take();
  }

  private expectCap(what: string): Token {
    const token = this.peek();
    if (token.kind !== "cap") {
      this.fail(token, `expected ${what} (TitleCase), found ${describe(token)}`);
    }
    return this.take();
  }

  private expectString(what: string): Token {
    const token = this.peek();
    if (token.kind !== "string") {
      this.fail(token, `expected ${what} in quotes, found ${describe(token)}`);
    }
    return this.take();
  }

  private lastEnd(): number {
    return (this.tokens[this.pos - 1] as Token | undefined)?.end ?? 0;
  }

  private spanFrom(first: Token): Span {
    return { start: first.start, end: this.lastEnd(), line: first.line };
  }

  // ---- items ----------------------------------------------------------------

  file(): File {
    const items: Item[] = [];
    while (this.peek().kind !== "end") items.push(this.item());
    return { items, source: this.source };
  }

  private item(): Item {
    const first = this.peek();
    if (this.isName("enum")) return this.enumItem();
    if (this.isName("module")) return this.moduleItem();
    if (first.kind === "name" && OLD_KEYWORDS.includes(first.text)) {
      this.fail(
        first,
        `"${first.text}" is not a keyword any more: every module is "module" (round 2 of the dance language)`,
      );
    }
    return this.fail(
      first,
      `expected "enum" or "module" at the top of the file, found ${describe(first)}`,
    );
  }

  private enumItem(): EnumItem {
    const first = this.take();
    const name = this.expectCap("the enum's name");
    this.expectPunct("{", `after "enum ${name.text}"`);
    const members: string[] = [];
    while (!this.isPunct("}")) {
      members.push(this.expectCap("an enum member").text);
      if (this.isPunct(",")) this.take();
      else break;
    }
    this.expectPunct("}", `to close "enum ${name.text}"`);
    if (members.length === 0) this.fail(first, `enum ${name.text} has no members`);
    return { kind: "enum", name: name.text, members, span: this.spanFrom(first) };
  }

  private moduleItem(): ModuleItem {
    const first = this.take();
    const name = this.expectName("the module's name");
    const params = this.params(name.text);
    const body = this.block(`module ${name.text}`);
    return { kind: "module", name: name.text, params, body, span: this.spanFrom(first) };
  }

  private params(owner: string): Param[] {
    this.expectPunct("(", `after "${owner}"`);
    const params: Param[] = [];
    while (!this.isPunct(")")) {
      const first = this.peek();
      let dynamic = false;
      let name: string;
      if (first.kind === "dyn") {
        dynamic = true;
        name = this.take().text;
      } else {
        name = this.expectName("a parameter name").text;
      }
      this.expectPunct(":", `after parameter "${name}" (every parameter declares its type)`);
      const type = this.expectCap(`the type of "${name}"`).text;
      const param: Param = { dynamic, name, type, span: this.spanFrom(first) };
      if (this.isPunct("=")) {
        this.take();
        param.default = this.expr();
        param.span = this.spanFrom(first);
      }
      params.push(param);
      if (this.isPunct(",")) this.take();
      else break;
    }
    this.expectPunct(")", `to close "${owner}("`);
    return params;
  }

  private block(what: string): Stmt[] {
    this.expectPunct("{", `to open ${what}`);
    const body: Stmt[] = [];
    while (!this.isPunct("}")) {
      if (this.peek().kind === "end") this.fail(this.peek(), `expected "}" to close ${what}`);
      body.push(this.stmt());
    }
    this.expectPunct("}", `to close ${what}`);
    return body;
  }

  // ---- statements -------------------------------------------------------------

  private stmt(): Stmt {
    const first = this.peek();
    if (first.kind === "dyn" && this.isPunct("=", 1)) return this.assignStmt();
    if (first.kind !== "name") {
      this.fail(first, `expected a statement, found ${describe(first)}`);
    }
    switch (first.text) {
      case "place":
        return this.placeStmt();
      case "anchor":
        return this.anchorStmt();
      case "group":
        if (!this.isPunct("(", 1)) return this.groupStmt();
        break;
      case "provide":
        return this.provideStmt();
      case "dancers":
        if (this.isPunct(";", 1)) {
          this.take();
          this.take();
          return { kind: "dancers", span: this.spanFrom(first) };
        }
        break;
      case "children":
        if (this.isPunct("(", 1)) {
          this.take();
          this.expectPunct("(", 'after "children"');
          this.expectPunct(")", 'to close "children("');
          this.expectPunct(";", 'after "children()"');
          return { kind: "children", span: this.spanFrom(first) };
        }
        break;
      case "let":
        return this.letStmt();
      case "assert":
        return this.assertStmt();
      case "card":
      case "say":
      case "ir":
        return this.textStmt(first.text);
      case "repeat":
        return this.repeatStmt();
      case "for":
        return this.forStmt();
      case "if":
        return this.ifStmt();
      case "match":
        if (this.isPunct("(", 1)) return this.matchStmt();
        break;
      default:
        break;
    }
    return this.callStmt();
  }

  private placeStmt(): Stmt {
    const first = this.take();
    const name = this.expectName("the place's name");
    const stmt: Stmt = { kind: "place", name: name.text, at: [], span: this.spanFrom(first) };
    if (this.isName("role")) {
      this.take();
      stmt.role = this.expectCap("a role").text;
    }
    stmt.at = this.transforms();
    this.expectPunct(";", `after "place ${name.text}"`);
    stmt.span = this.spanFrom(first);
    return stmt;
  }

  private anchorStmt(): Stmt {
    const first = this.take();
    const name = this.expectName("the anchor's name");
    let type: string | undefined;
    if (this.isPunct(":")) {
      this.take();
      type = this.expectCap("the anchor's type").text;
    }
    this.expectPunct("=", `after "anchor ${name.text}"`);
    const value = this.expr();
    this.expectPunct(";", `after "anchor ${name.text}"`);
    const stmt: Stmt = { kind: "anchor", name: name.text, value, span: this.spanFrom(first) };
    if (type !== undefined) stmt.type = type;
    return stmt;
  }

  private groupStmt(): Stmt {
    const first = this.take();
    let name: string | undefined;
    let module = this.expectName("a module to make the group from").text;
    if (this.isPunct("=")) {
      this.take();
      name = module;
      module = this.expectName("a module to make the group from").text;
    }
    const args = this.args(module);
    const at = this.transforms();
    const stmt: Stmt = { kind: "group", module, args, at, span: this.spanFrom(first) };
    if (name !== undefined) stmt.name = name;
    if (this.isPunct("{")) stmt.children = this.block(`"group ${module}(…)"`);
    else this.expectPunct(";", `after "group ${module}(…)"`);
    stmt.span = this.spanFrom(first);
    return stmt;
  }

  private provideStmt(): Stmt {
    const first = this.take();
    const next = this.peek();
    if (next.kind === "name") {
      // `provide progress() { … }`: a function, evaluated for one dancer.
      this.take();
      const params = this.params(`provide ${next.text}`);
      const body = this.block(`"provide ${next.text}()"`);
      return { kind: "provide-fn", name: next.text, params, body, span: this.spanFrom(first) };
    }
    if (next.kind !== "dyn") {
      this.fail(
        next,
        `expected a $variable or a function name after "provide", found ${describe(next)}`,
      );
    }
    this.take();
    this.expectPunct(":", `after "provide $${next.text}" (a provide declares its type)`);
    const type = this.expectCap(`the type of $${next.text}`).text;
    this.expectPunct("=", `after "provide $${next.text}: ${type}"`);
    const value = this.expr();
    this.expectPunct(";", `after "provide $${next.text}"`);
    return { kind: "provide", name: next.text, type, value, span: this.spanFrom(first) };
  }

  private letStmt(): Stmt {
    const first = this.take();
    const name = this.expectName("a name to bind");
    this.expectPunct("=", `after "let ${name.text}"`);
    const value = this.expr();
    this.expectPunct(";", `after "let ${name.text} = …"`);
    return { kind: "let", name: name.text, value, span: this.spanFrom(first) };
  }

  private assignStmt(): Stmt {
    const first = this.take();
    this.expectPunct("=", `after "$${first.text}"`);
    const value = this.expr();
    this.expectPunct(";", `after "$${first.text} = …"`);
    return { kind: "assign", name: first.text, value, span: this.spanFrom(first) };
  }

  private assertStmt(): Stmt {
    const first = this.take();
    this.expectPunct("(", 'after "assert"');
    const condition = this.expr();
    let message: string | undefined;
    if (this.isPunct(",")) {
      this.take();
      message = this.expectString("what the assert means").text;
    }
    this.expectPunct(")", 'to close "assert("');
    this.expectPunct(";", 'after "assert(…)"');
    const stmt: Stmt = { kind: "assert", condition, span: this.spanFrom(first) };
    if (message !== undefined) stmt.message = message;
    return stmt;
  }

  private textStmt(word: "card" | "say" | "ir"): Stmt {
    const first = this.take();
    const text = this.expectString(word === "ir" ? "the figure's id" : `what the ${word} says`);
    this.expectPunct(";", `after "${word}"`);
    return word === "ir"
      ? { kind: "ir", id: text.text, span: this.spanFrom(first) }
      : { kind: word, text: text.text, span: this.spanFrom(first) };
  }

  private repeatStmt(): Stmt {
    const first = this.take();
    this.expectPunct("(", 'after "repeat"');
    const count = this.expr();
    this.expectPunct(")", 'to close "repeat("');
    const body = this.isPunct("{") ? this.block('"repeat"') : [this.stmt()];
    return { kind: "repeat", count, body, span: this.spanFrom(first) };
  }

  private forStmt(): Stmt {
    const first = this.take();
    const binder = this.expectName("a name to count with");
    this.expectKeyword("in");
    const from = this.expr();
    let inclusive = false;
    if (this.isPunct("..=")) inclusive = true;
    else if (!this.isPunct("..")) {
      this.fail(
        this.peek(),
        `expected ".." or "..=" in the range of "for ${binder.text}", found ${describe(this.peek())}`,
      );
    }
    this.take();
    const to = this.expr();
    const body = this.block(`"for ${binder.text}"`);
    return {
      kind: "for",
      binder: binder.text,
      from,
      to,
      inclusive,
      body,
      span: this.spanFrom(first),
    };
  }

  private ifStmt(): Stmt {
    const first = this.take();
    this.expectPunct("(", 'after "if"');
    const condition = this.expr();
    this.expectPunct(")", 'to close "if ("');
    const then = this.block('"if"');
    let otherwise: Stmt[] = [];
    if (this.isName("else")) {
      this.take();
      otherwise = this.isName("if") ? [this.ifStmt()] : this.block('"else"');
    }
    return { kind: "if", condition, then, else: otherwise, span: this.spanFrom(first) };
  }

  private matchStmt(): Stmt {
    const first = this.take();
    this.expectPunct("(", 'after "match"');
    const subject = this.expr();
    this.expectPunct(")", 'to close "match ("');
    this.expectPunct("{", 'to open "match"');
    const arms: MatchArm[] = [];
    while (!this.isPunct("}")) {
      const armFirst = this.peek();
      let pattern: string | undefined;
      if (this.isPunct("_")) this.take();
      else pattern = this.expectCap('a member to match, or "_"').text;
      this.expectPunct("=>", `after the pattern ${pattern ?? "_"}`);
      const body = this.isPunct("{") ? this.block(`the arm ${pattern ?? "_"}`) : [this.stmt()];
      const arm: MatchArm = { body, span: this.spanFrom(armFirst) };
      if (pattern !== undefined) arm.pattern = pattern;
      arms.push(arm);
      if (this.isPunct(",")) this.take();
    }
    this.expectPunct("}", 'to close "match"');
    if (arms.length === 0) this.fail(first, "match has no arms");
    return { kind: "match", subject, arms, span: this.spanFrom(first) };
  }

  private callStmt(): Stmt {
    const first = this.take();
    if (!this.isPunct("(")) {
      this.fail(
        this.peek(),
        `expected "(" after "${first.text}" (a call), found ${describe(this.peek())}`,
      );
    }
    const args = this.args(first.text);
    const stmt: Stmt = { kind: "call", name: first.text, args, span: this.spanFrom(first) };
    if (this.isPunct("{")) stmt.children = this.block(`"${first.text}(…)"`);
    else this.expectPunct(";", `after "${first.text}(…)"`);
    stmt.span = this.spanFrom(first);
    return stmt;
  }

  private transforms(): Transform[] {
    if (!this.isName("at")) return [];
    this.take();
    const list: Transform[] = [];
    while (
      this.peek().kind === "name" &&
      (TRANSFORM_OPS as readonly string[]).includes(this.peek().text)
    ) {
      const first = this.take();
      const args = this.args(first.text);
      list.push({ op: first.text as TransformOp, args, span: this.spanFrom(first) });
    }
    if (list.length === 0) {
      this.fail(
        this.peek(),
        `expected a transform after "at" (${TRANSFORM_OPS.join(", ")}), found ${describe(this.peek())}`,
      );
    }
    return list;
  }

  private args(owner: string): Arg[] {
    this.expectPunct("(", `after "${owner}"`);
    const args: Arg[] = [];
    while (!this.isPunct(")")) {
      const first = this.peek();
      let arg: Arg;
      if ((first.kind === "name" || first.kind === "dyn") && this.isPunct("=", 1)) {
        this.take();
        this.take();
        const value = this.expr();
        arg = {
          name: first.text,
          dynamic: first.kind === "dyn",
          value,
          span: this.spanFrom(first),
        };
      } else {
        const value = this.expr();
        arg = { dynamic: false, value, span: this.spanFrom(first) };
      }
      args.push(arg);
      if (this.isPunct(",")) this.take();
      else break;
    }
    this.expectPunct(")", `to close "${owner}("`);
    return args;
  }

  // ---- expressions ------------------------------------------------------------

  expr(): Expr {
    return this.or();
  }

  private or(): Expr {
    let left = this.and();
    while (this.isName("or")) {
      this.take();
      const right = this.and();
      left = { kind: "binary", op: "or", left, right, span: join(left.span, right.span) };
    }
    return left;
  }

  private and(): Expr {
    let left = this.not();
    while (this.isName("and")) {
      this.take();
      const right = this.not();
      left = { kind: "binary", op: "and", left, right, span: join(left.span, right.span) };
    }
    return left;
  }

  private not(): Expr {
    if (this.isName("not")) {
      const first = this.take();
      const of = this.not();
      return {
        kind: "unary",
        op: "not",
        of,
        span: { start: first.start, end: of.span.end, line: first.line },
      };
    }
    return this.cmp();
  }

  private cmp(): Expr {
    const left = this.add();
    const token = this.peek();
    const op = token.text as BinaryOp;
    if ((token.kind === "punct" || token.kind === "name") && COMPARISONS.includes(op)) {
      this.take();
      const right = this.add();
      if (op === "is" && right.kind !== "member") {
        this.fail(
          token,
          `the right side of "is" is an enum member (TitleCase), found ${describeExpr(right)}`,
        );
      }
      return { kind: "binary", op, left, right, span: join(left.span, right.span) };
    }
    return left;
  }

  private add(): Expr {
    let left = this.mul();
    while (this.isPunct("+") || this.isPunct("-")) {
      const op = this.take().text as "+" | "-";
      const right = this.mul();
      left = { kind: "binary", op, left, right, span: join(left.span, right.span) };
    }
    return left;
  }

  private mul(): Expr {
    let left = this.unary();
    while (this.isPunct("*") || this.isPunct("/") || this.isPunct("%")) {
      const op = this.take().text as "*" | "/" | "%";
      const right = this.unary();
      left = { kind: "binary", op, left, right, span: join(left.span, right.span) };
    }
    return left;
  }

  private unary(): Expr {
    if (this.isPunct("-")) {
      const first = this.take();
      const of = this.unary();
      return {
        kind: "unary",
        op: "-",
        of,
        span: { start: first.start, end: of.span.end, line: first.line },
      };
    }
    return this.postfix();
  }

  private postfix(): Expr {
    let e = this.primary();
    while (this.isPunct(".") && this.peek(1).kind === "name") {
      this.take();
      const name = this.take();
      e = {
        kind: "path",
        of: e,
        name: name.text,
        span: { start: e.span.start, end: name.end, line: e.span.line },
      };
    }
    return e;
  }

  private primary(): Expr {
    const token = this.peek();
    switch (token.kind) {
      case "number": {
        this.take();
        const unit = token.unit ?? "";
        if (unit !== "" && !(unit in UNITS)) {
          this.fail(token, `"${unit}" is not a unit: ${Object.keys(UNITS).join(", ")}`);
        }
        return { kind: "number", value: Number(token.text), unit, span: this.spanFrom(token) };
      }
      case "string":
        this.take();
        return { kind: "string", value: token.text, span: this.spanFrom(token) };
      case "cap": {
        this.take();
        if (this.isPunct(".") && this.peek(1).kind === "cap") {
          this.take();
          const member = this.take();
          return {
            kind: "member",
            type: token.text,
            member: member.text,
            span: this.spanFrom(token),
          };
        }
        return { kind: "member", member: token.text, span: this.spanFrom(token) };
      }
      case "dyn":
        this.take();
        return { kind: "dyn", name: token.text, span: this.spanFrom(token) };
      case "name": {
        if (token.text === "me") {
          this.take();
          return { kind: "me", span: this.spanFrom(token) };
        }
        if (token.text === "nobody") {
          this.take();
          return { kind: "nobody", span: this.spanFrom(token) };
        }
        if (token.text === "if") {
          this.take();
          this.expectPunct("(", 'after "if"');
          const condition = this.expr();
          this.expectPunct(")", 'to close "if ("');
          const then = this.expr();
          this.expectKeyword("else");
          const otherwise = this.expr();
          return { kind: "cond", condition, then, else: otherwise, span: this.spanFrom(token) };
        }
        this.take();
        if (this.isPunct("(")) {
          const args = this.args(token.text);
          return { kind: "call", name: token.text, args, span: this.spanFrom(token) };
        }
        return { kind: "name", name: token.text, span: this.spanFrom(token) };
      }
      case "punct":
        if (token.text === "(") {
          this.take();
          const inner = this.expr();
          this.expectPunct(")", "to close the parenthesis");
          return inner;
        }
        break;
      case "end":
        break;
    }
    return this.fail(token, `expected a value, found ${describe(token)}`);
  }
}

const join = (a: Span, b: Span): Span => ({ start: a.start, end: b.end, line: a.line });

const describe = (token: Token): string => {
  switch (token.kind) {
    case "end":
      return "the end of the file";
    case "dyn":
      return `"$${token.text}"`;
    case "string":
      return `"${token.text}" (a string)`;
    default:
      return `"${token.text}${token.unit ?? ""}"`;
  }
};

const describeExpr = (e: Expr): string => {
  switch (e.kind) {
    case "name":
      return `"${e.name}" (a name)`;
    case "dyn":
      return `"$${e.name}"`;
    case "string":
      return "a string";
    case "number":
      return "a number";
    default:
      return `a ${e.kind}`;
  }
};
