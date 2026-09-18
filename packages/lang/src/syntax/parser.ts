import type { Diagnostic } from "../diagnostics/Diagnostic.js";
import { diagnostic } from "../diagnostics/Diagnostic.js";
import type {
  AnchorStmt,
  Arg,
  BinaryOp,
  CallExpr,
  Decl,
  EnumDecl,
  EnumMember,
  Expr,
  FileNode,
  FnDecl,
  GroupDecl,
  IdType,
  KindArg,
  MatchExprArm,
  MatchStmtArm,
  Member,
  Param,
  Pattern,
  Span,
  Stmt,
  TypeRef,
  UseDecl,
  UseName,
  ValueMember,
} from "./ast.js";
import { MODIFIERS } from "./ast.js";
import type { Comment, Token } from "./lexer.js";
import { isSyntaxFailure, syntaxFailure, tokenize } from "./lexer.js";

/**
 * Read a `.dance` file into the tree of `ast.ts`. Hand-written recursive
 * descent over `lexer.ts`'s tokens, one closure per production; the grammar is
 * the plan's (`p1-syntax.md`), with the three bends §"Grammar notes" below.
 *
 * Nothing is resolved here. A TitleCase word stays a name until the checker
 * (P2) decides whether it is a group, an enum member or a type; a call stays a
 * call whether its callee turns out to be a move, a built-in or a group's `fn`.
 * The parser's whole job is shape, casing and spans.
 *
 * ## Grammar notes
 *
 * - **A group invocation may carry one trailing statement**, not only `;` or a
 *   block: `Station(OutTop) Couple(Ones, seated = false);` is design §8's own
 *   line, and it is OpenSCAD's `translate(…) cube();` one level up.
 * - **Any expression is a pattern.** The design parenthesises a computed
 *   pattern (`(id + travel)`); requiring the parentheses would break §8's
 *   `select(MinorSet = id + travel, …)`, so they are optional.
 * - **A block's last expression, written without a `;`, is its value** —
 *   `fn wrap(n: i32) { ((n - 1) % 4 + 4) % 4 + 1 }`. JS-subset enough, and
 *   what square.dance needs.
 *
 * The first error stops the read: there is no recovery, because every
 * consumer of this package wants either a tree or a complaint, never half a
 * tree.
 */
export function parseFile(text: string, fileName: string): ParseResult {
  try {
    const { tokens, comments } = tokenize(text, fileName);
    return { file: parseTokens(tokens, fileName), diagnostics: [], comments };
  } catch (error) {
    if (isSyntaxFailure(error)) return { diagnostics: [error.diagnostic], comments: [] };
    throw error;
  }
}

export interface ParseResult {
  /** Absent when the file did not parse. */
  file?: FileNode;
  diagnostics: readonly Diagnostic[];
  comments: readonly Comment[];
}

/** The module name a file contributes: its stem, without directories or `.dance`. */
export const moduleNameOf = (fileName: string): string =>
  (fileName.split("/").pop() ?? fileName).replace(/\.dance$/, "");

/** Declaration keywords from earlier readings of the language, and what replaced them. */
const RETIRED: Readonly<Record<string, string>> = {
  module: 'a node is a "group"; a namespace is the file itself',
  formation: 'a formation is a "group" with a body and members',
  move: 'a move is a "fn" with an "ir" in it',
  dance: 'a dance is a "fn" with a "setup" in it',
  provide: 'a relation is a member of a group: "neighbor = one!(select(…));"',
  place: 'a place is the innermost group; write "dancer();" in a group body',
};

const COMPARISONS: readonly BinaryOp[] = ["==", "!=", "<", "<=", ">", ">="];

function parseTokens(tokens: readonly Token[], file: string): FileNode {
  let pos = 0;

  // -- the token cursor ----------------------------------------------------

  const peek = (ahead = 0): Token => tokens[Math.min(pos + ahead, tokens.length - 1)] as Token;
  const take = (): Token => {
    const token = peek();
    if (token.kind !== "end") pos += 1;
    return token;
  };
  const prev = (): Token => tokens[Math.max(0, pos - 1)] as Token;
  const isPunct = (text: string, ahead = 0): boolean => {
    const t = peek(ahead);
    return t.kind === "punct" && t.text === text;
  };
  const isName = (text: string, ahead = 0): boolean => {
    const t = peek(ahead);
    return t.kind === "name" && t.text === text;
  };
  const from = (start: Token): Span => ({ file, start: start.start, end: prev().end });
  const spanOf = (token: Token): Span => ({ file, start: token.start, end: token.end });

  const fail = (token: Token, message: string, suggestion?: string, code = "L001"): never => {
    throw syntaxFailure(
      diagnostic(code, "parse", message, {
        span: spanOf(token),
        ...(suggestion ? { suggestion } : {}),
      }),
    );
  };

  /** Expect a closer; when the file simply ended, complain about the opener instead. */
  const expectPunct = (text: string, what: string, opener?: Token): Token => {
    if (isPunct(text)) return take();
    if (peek().kind === "end" && opener !== undefined) {
      throw syntaxFailure(
        diagnostic("L009", "parse", `this is never closed: the file ends before its "${text}"`, {
          span: spanOf(opener),
        }),
      );
    }
    return fail(peek(), `expected "${text}" ${what}, found ${describe(peek())}`);
  };
  const expectKeyword = (text: string, what: string): Token => {
    if (isName(text)) return take();
    return fail(peek(), `expected "${text}" ${what}, found ${describe(peek())}`);
  };
  const expectLower = (what: string): Token => {
    if (peek().kind === "name") return take();
    return fail(peek(), `expected ${what}, found ${describe(peek())}`);
  };
  const expectTitle = (what: string): Token => {
    if (peek().kind === "cap") return take();
    return fail(peek(), `expected ${what}, found ${describe(peek())}`);
  };
  const expectWord = (what: string): Token => {
    if (peek().kind === "name" || peek().kind === "cap") return take();
    return fail(peek(), `expected ${what}, found ${describe(peek())}`);
  };

  // -- file ----------------------------------------------------------------

  const fileNode = (): FileNode => {
    const uses: UseDecl[] = [];
    const decls: Decl[] = [];
    while (peek().kind !== "end") {
      if (isName("use")) uses.push(importDecl());
      else decls.push(decl());
    }
    return {
      kind: "file",
      module: moduleNameOf(file),
      uses,
      decls,
      span: { file, start: 0, end: peek().end },
    };
  };

  const importDecl = (): UseDecl => {
    const start = expectKeyword("use", "to import from another module");
    const module = expectLower("a module name").text;
    expectPunct("::", "after a module name");
    let names: UseName[] | undefined;
    if (isPunct("*")) {
      take();
    } else if (isPunct("{")) {
      const brace = take();
      names = [];
      while (!isPunct("}")) {
        const token = expectWord("a name to import");
        names.push({ name: token.text, span: spanOf(token) });
        if (isPunct(",")) take();
        else break;
      }
      expectPunct("}", "to close the import list", brace);
    } else {
      const token = expectWord('a name to import, a list in braces, or "*"');
      names = [{ name: token.text, span: spanOf(token) }];
    }
    expectPunct(";", "to end the import");
    return { kind: "use", module, ...(names ? { names } : {}), span: from(start) };
  };

  const decl = (): Decl => {
    const token = peek();
    if (isName("enum")) return enumDecl();
    if (isName("group")) return groupDecl();
    if (isName("fn")) return fnDecl();
    if (token.kind === "name" && token.text in RETIRED) {
      return fail(
        token,
        `"${token.text}" is not a keyword of this language`,
        RETIRED[token.text],
        "L008",
      );
    }
    return fail(
      token,
      `expected "use", "enum", "group" or "fn", found ${describe(token)}`,
      "a file holds imports and declarations, nothing else",
    );
  };

  const enumDecl = (): EnumDecl => {
    const start = expectKeyword("enum", "to declare an enum");
    const name = expectTitle("a TitleCase enum name").text;
    const members = enumMembers();
    return { kind: "enum", name, members, span: from(start) };
  };

  const enumMembers = (): EnumMember[] => {
    const brace = expectPunct("{", "to open the members");
    const members: EnumMember[] = [];
    while (!isPunct("}")) {
      const token = expectTitle("a TitleCase enum member");
      members.push({ name: token.text, span: spanOf(token) });
      if (isPunct(",")) take();
      else break;
    }
    expectPunct("}", "to close the members", brace);
    return members;
  };

  // -- group ---------------------------------------------------------------

  const groupDecl = (): GroupDecl => {
    const start = expectKeyword("group", "to declare a group");
    const name = expectTitle("a TitleCase group name").text;
    const brace = expectPunct("{", "to open the group");
    let idType: IdType | undefined;
    let body: Stmt[] | undefined;
    let bodySpan: Span | undefined;
    const params: Param[] = [];
    const members: Member[] = [];
    while (!isPunct("}") && peek().kind !== "end") {
      if (isName("body") && isPunct("{", 1)) {
        const bodyStart = take();
        body = block();
        bodySpan = from(bodyStart);
        if (isPunct(";")) take();
        continue;
      }
      if (isName("fn")) {
        members.push(fnDecl());
        continue;
      }
      const token = peek();
      if (token.kind === "name" && isPunct(":", 1)) {
        if (token.text === "id") {
          if (idType !== undefined) {
            fail(token, "this group declares the type of its ids twice");
          }
          idType = idTypeDecl();
        } else {
          params.push(param());
          if (isPunct(";")) take();
        }
        continue;
      }
      if (token.kind === "name" && isPunct("=", 1)) {
        members.push(valueMember());
        continue;
      }
      fail(
        token,
        `expected a parameter, "body", a member or "fn" in a group, found ${describe(token)}`,
        'a parameter is "name: Type", a member is "name = expr;"',
      );
    }
    expectPunct("}", "to close the group", brace);
    if (idType === undefined) {
      throw syntaxFailure(
        diagnostic("L001", "parse", `group "${name}" does not say what its ids are`, {
          span: from(start),
          suggestion: 'every group opens with "id: i32" or "id: enum { … }"',
        }),
      );
    }
    return {
      kind: "group",
      name,
      idType,
      params,
      body: body ?? [],
      ...(bodySpan ? { bodySpan } : {}),
      members,
      span: from(start),
    };
  };

  const idTypeDecl = (): IdType => {
    const start = expectKeyword("id", "to open a group");
    expectPunct(":", 'after "id"');
    let result: IdType;
    if (isName("enum")) {
      take();
      const members = enumMembers();
      result = { kind: "enum", members, span: from(start) };
    } else if (isName("i32")) {
      take();
      result = { kind: "i32", span: from(start) };
    } else {
      return fail(
        peek(),
        `expected "i32" or "enum { … }" as the type of the ids, found ${describe(peek())}`,
      );
    }
    if (isPunct(";")) take();
    return result;
  };

  const valueMember = (): ValueMember => {
    const start = expectLower("a member name");
    expectPunct("=", "after a member name");
    const value = expr();
    expectPunct(";", "to end the member");
    return { kind: "member", name: start.text, value, span: from(start) };
  };

  const fnDecl = (): FnDecl => {
    const start = expectKeyword("fn", "to declare a function");
    const name = expectLower("a kebab-case function name").text;
    const params = paramList();
    const body = block();
    return { kind: "fn", name, params, body, span: from(start) };
  };

  const paramList = (): Param[] => {
    const paren = expectPunct("(", "to open the parameters");
    const params: Param[] = [];
    while (!isPunct(")")) {
      params.push(param());
      if (isPunct(",")) take();
      else break;
    }
    expectPunct(")", "to close the parameters", paren);
    return params;
  };

  const param = (): Param => {
    const start = expectLower("a kebab-case parameter name");
    expectPunct(":", "after a parameter name");
    const type = typeRef();
    let def: Expr | undefined;
    if (isPunct("=")) {
      take();
      def = expr();
    }
    return {
      kind: "param",
      name: start.text,
      type,
      ...(def ? { default: def } : {}),
      span: from(start),
    };
  };

  const typeRef = (): TypeRef => {
    const token = peek();
    if (token.kind === "name") {
      if (token.text === "enum") {
        take();
        const named = expectTitle("the group whose ids this is");
        return { kind: "enum-of", name: named.text, span: from(token) };
      }
      if (["i32", "f64", "fn", "group"].includes(token.text)) {
        take();
        return {
          kind: "primitive",
          name: token.text as "i32" | "f64" | "fn" | "group",
          span: from(token),
        };
      }
      return fail(
        token,
        `"${token.text}" is not a type`,
        'the types are i32, f64, Bool, Length, Angle, fn, group, a group or an enum name, and "enum K"',
      );
    }
    if (token.kind === "cap") {
      take();
      if (token.text === "Bool" || token.text === "Length" || token.text === "Angle") {
        return { kind: "primitive", name: token.text, span: from(token) };
      }
      return { kind: "named", name: token.text, span: from(token) };
    }
    return fail(token, `expected a type, found ${describe(token)}`);
  };

  // -- statements ----------------------------------------------------------

  const block = (): Stmt[] => {
    const brace = expectPunct("{", "to open a block");
    const stmts: Stmt[] = [];
    while (!isPunct("}") && peek().kind !== "end") stmts.push(stmt());
    expectPunct("}", "to close a block", brace);
    return stmts;
  };

  const stmtOrBlock = (): Stmt[] => (isPunct("{") ? block() : [stmt()]);

  const stmt = (): Stmt => {
    const token = peek();

    if (isName("setup") && isPunct("{", 1)) {
      const start = take();
      return { kind: "setup", body: block(), span: from(start) };
    }
    if (isName("anchor") && peek(1).kind === "name" && isPunct("=", 2)) return anchorStmt();
    if (isName("ir") || isName("card")) {
      const start = take();
      const text = peek();
      if (text.kind !== "string") fail(text, `expected a string after "${start.text}"`);
      take();
      expectPunct(";", `to end the "${start.text}"`);
      return start.text === "ir"
        ? { kind: "ir", name: text.text, span: from(start) }
        : { kind: "card", text: text.text, span: from(start) };
    }
    if (isName("for")) {
      const start = take();
      const name = expectLower("the loop's name").text;
      expectKeyword("in", "after the loop's name");
      const range = rangeExpr();
      const body = block();
      return { kind: "for", name, range, body, span: from(start) };
    }
    if (isName("if") && isPunct("(", 1)) {
      const start = take();
      const paren = expectPunct("(", 'after "if"');
      const test = expr();
      expectPunct(")", "to close the condition", paren);
      const then = stmtOrBlock();
      let otherwise: Stmt[] | undefined;
      if (isName("else")) {
        take();
        otherwise = stmtOrBlock();
      }
      return {
        kind: "if",
        test,
        then,
        ...(otherwise ? { else: otherwise } : {}),
        span: from(start),
      };
    }
    if (isName("match")) {
      const start = take();
      const subject = expr();
      const brace = expectPunct("{", "to open the arms");
      const arms: MatchStmtArm[] = [];
      while (!isPunct("}") && peek().kind !== "end") {
        const armStart = peek();
        const pat = pattern();
        expectPunct("=>", "after an arm's pattern");
        const body = stmtOrBlock();
        if (isPunct(",")) take();
        arms.push({ pattern: pat, body, span: from(armStart) });
      }
      expectPunct("}", "to close the arms", brace);
      return { kind: "match", subject, arms, span: from(start) };
    }
    if (token.kind === "name" && MODIFIERS.includes(token.text) && isPunct("(", 1)) {
      const start = token;
      const modifiers: CallExpr[] = [];
      while (peek().kind === "name" && MODIFIERS.includes(peek().text) && isPunct("(", 1)) {
        modifiers.push(callExpr());
      }
      return { kind: "modified", modifiers, stmt: stmt(), span: from(start) };
    }
    if (token.kind === "cap" && isPunct("(", 1)) return invokeStmt();
    if (token.kind === "name" && isPunct("::", 1) && peek(2).kind === "cap" && isPunct("(", 3)) {
      return invokeStmt();
    }
    if (token.kind === "name" && token.text in RETIRED) {
      return fail(
        token,
        `"${token.text}" is not a keyword of this language`,
        RETIRED[token.text],
        "L008",
      );
    }
    return exprStmt();
  };

  const anchorStmt = (): AnchorStmt => {
    const start = expectKeyword("anchor", "to declare an anchor");
    const name = expectLower("the anchor's name").text;
    expectPunct("=", "after an anchor's name");
    const value = expr();
    expectPunct(";", "to end the anchor");
    return { kind: "anchor", name, value, span: from(start) };
  };

  const invokeStmt = (): Stmt => {
    const start = peek();
    let module: string | undefined;
    if (start.kind === "name") {
      take();
      module = start.text;
      expectPunct("::", "after a module name");
    }
    const name = expectTitle("a TitleCase group name").text;
    const paren = expectPunct("(", "to open the arguments");
    const args = argList(paren);
    let children: Stmt[];
    if (isPunct(";")) {
      take();
      children = [];
    } else if (isPunct("{")) {
      children = block();
    } else {
      children = [stmt()];
    }
    return {
      kind: "invoke",
      ...(module ? { module } : {}),
      name,
      args,
      children,
      span: from(start),
    };
  };

  const exprStmt = (): Stmt => {
    const start = peek();
    const value = expr();
    if (isPunct("{")) {
      if (value.kind !== "call") {
        fail(start, "only a call may take a trailing block", 'write "phrase(A1) { … }"');
      }
      const body = block();
      return { kind: "expr", expr: value, block: body, tail: false, span: from(start) };
    }
    if (isPunct(";")) {
      take();
      return { kind: "expr", expr: value, tail: false, span: from(start) };
    }
    if (isPunct("}")) return { kind: "expr", expr: value, tail: true, span: from(start) };
    return fail(
      peek(),
      `expected ";" to end the statement, found ${describe(peek())}`,
      "a block's last expression may drop the \";\" — it is the block's value",
    );
  };

  // -- expressions ---------------------------------------------------------

  const rangeExpr = (): Expr => {
    const start = peek();
    const low = expr();
    if (isPunct("..") || isPunct("..=")) {
      const inclusive = peek().text === "..=";
      take();
      const high = expr();
      return { kind: "range", from: low, to: high, inclusive, span: from(start) };
    }
    return low;
  };

  const expr = (): Expr => orExpr();

  const orExpr = (): Expr => wordBinary(andExpr, "or");
  const andExpr = (): Expr => wordBinary(notExpr, "and");

  /** `a or b or c`, `a and b` — the two word-shaped operators. */
  const wordBinary = (next: () => Expr, op: "or" | "and"): Expr => {
    const start = peek();
    let left = next();
    while (isName(op)) {
      take();
      left = { kind: "binary", op, left, right: next(), span: from(start) };
    }
    return left;
  };

  const notExpr = (): Expr => {
    if (isName("not")) {
      const start = take();
      return { kind: "unary", op: "not", operand: notExpr(), span: from(start) };
    }
    return cmpExpr();
  };

  const cmpExpr = (): Expr => {
    const start = peek();
    const left = addExpr();
    if (isName("is")) {
      take();
      return { kind: "is", subject: left, pattern: pattern(), span: from(start) };
    }
    const token = peek();
    if (token.kind === "punct" && COMPARISONS.includes(token.text as BinaryOp)) {
      take();
      const right = addExpr();
      return { kind: "binary", op: token.text as BinaryOp, left, right, span: from(start) };
    }
    return left;
  };

  const addExpr = (): Expr => {
    const start = peek();
    let left = mulExpr();
    while (isPunct("+") || isPunct("-")) {
      const op = take().text as BinaryOp;
      left = { kind: "binary", op, left, right: mulExpr(), span: from(start) };
    }
    return left;
  };

  const mulExpr = (): Expr => {
    const start = peek();
    let left = unaryExpr();
    while (isPunct("*") || isPunct("/") || isPunct("%")) {
      const op = take().text as BinaryOp;
      left = { kind: "binary", op, left, right: unaryExpr(), span: from(start) };
    }
    return left;
  };

  const unaryExpr = (): Expr => {
    if (isPunct("-")) {
      const start = take();
      return { kind: "unary", op: "-", operand: unaryExpr(), span: from(start) };
    }
    return primary();
  };

  const primary = (): Expr => {
    const token = peek();

    if (token.kind === "number") {
      take();
      const unit = (token.unit ?? "") as "m" | "deg" | "";
      if (token.float === true || unit !== "") {
        return { kind: "float", value: Number(token.text), unit, span: spanOf(token) };
      }
      return { kind: "int", value: Number(token.text), span: spanOf(token) };
    }
    if (token.kind === "string") {
      take();
      return { kind: "string", value: token.text, span: spanOf(token) };
    }
    if (isPunct("(")) {
      const paren = take();
      const inner = expr();
      expectPunct(")", "to close the parentheses", paren);
      return inner;
    }
    if (token.kind === "name") {
      if (token.text === "true" || token.text === "false") {
        take();
        return { kind: "bool", value: token.text === "true", span: spanOf(token) };
      }
      if (token.text === "if" && isPunct("(", 1)) {
        const start = take();
        const paren = expectPunct("(", 'after "if"');
        const test = expr();
        expectPunct(")", "to close the condition", paren);
        const then = expr();
        expectKeyword("else", "— an if used as a value needs both halves");
        return { kind: "if-expr", test, then, else: expr(), span: from(start) };
      }
      if (token.text === "match") {
        const start = take();
        const subject = expr();
        const brace = expectPunct("{", "to open the arms");
        const arms: MatchExprArm[] = [];
        while (!isPunct("}") && peek().kind !== "end") {
          const armStart = peek();
          const pat = pattern();
          expectPunct("=>", "after an arm's pattern");
          const value = expr();
          if (isPunct(",") || isPunct(";")) take();
          arms.push({ pattern: pat, value, span: from(armStart) });
        }
        expectPunct("}", "to close the arms", brace);
        return { kind: "match-expr", subject, arms, span: from(start) };
      }
      if (token.text === "fn" && isPunct("(", 1)) {
        const start = take();
        const params = paramList();
        return { kind: "fn-expr", params, body: block(), span: from(start) };
      }
      if (token.text === "one" && isPunct("!", 1)) {
        const start = take();
        take();
        const paren = expectPunct("(", 'after "one!"');
        const arg = expr();
        expectPunct(")", 'to close the "one!"', paren);
        return { kind: "one", arg, span: from(start) };
      }
      if ((token.text === "select" || token.text === "assign") && isPunct("(", 1)) {
        const which = token.text === "select" ? ("select" as const) : ("assign" as const);
        const start = take();
        const paren = expectPunct("(", `after "${which}"`);
        return { kind: which, args: kindArgs(paren), span: from(start) };
      }
      if (isPunct("::", 1)) {
        const start = take();
        take();
        const named = expectWord("a name after the module");
        if (isPunct("(")) {
          const paren = take();
          const args = argList(paren);
          return {
            kind: "call",
            module: start.text,
            callee: named.text,
            title: named.kind === "cap",
            args,
            span: from(start),
          };
        }
        return {
          kind: "qualified",
          module: start.text,
          name: named.text,
          title: named.kind === "cap",
          span: from(start),
        };
      }
      if (isPunct("(", 1)) return callExpr();
      take();
      return { kind: "name", name: token.text, title: false, span: spanOf(token) };
    }
    if (token.kind === "cap") {
      if (isPunct("(", 1)) return callExpr();
      take();
      return { kind: "name", name: token.text, title: true, span: spanOf(token) };
    }
    return fail(token, `expected a value, found ${describe(token)}`);
  };

  const callExpr = (): CallExpr => {
    const start = take();
    const paren = expectPunct("(", "to open the arguments");
    const args = argList(paren);
    return {
      kind: "call",
      callee: start.text,
      title: start.kind === "cap",
      args,
      span: from(start),
    };
  };

  const argList = (paren: Token): Arg[] => {
    const args: Arg[] = [];
    while (!isPunct(")") && peek().kind !== "end") {
      const start = peek();
      if (start.kind === "name" && isPunct("=", 1)) {
        take();
        take();
        args.push({ kind: "arg", name: start.text, value: expr(), span: from(start) });
      } else {
        args.push({ kind: "arg", value: expr(), span: from(start) });
      }
      if (isPunct(",")) take();
      else break;
    }
    expectPunct(")", "to close the arguments", paren);
    return args;
  };

  const kindArgs = (paren: Token): KindArg[] => {
    const args: KindArg[] = [];
    while (!isPunct(")") && peek().kind !== "end") {
      const start = expectTitle("a group's name on the left of a pattern");
      expectPunct("=", "after a group's name");
      args.push({ group: start.text, pattern: pattern(), span: from(start) });
      if (isPunct(",")) take();
      else break;
    }
    expectPunct(")", "to close the arguments", paren);
    return args;
  };

  // -- patterns ------------------------------------------------------------

  const pattern = (): Pattern => {
    const start = peek();
    const first = patternPrimary();
    if (!isPunct("|")) return first;
    const options: Pattern[] = [first];
    while (isPunct("|")) {
      take();
      options.push(patternPrimary());
    }
    return { kind: "alt", options, span: from(start) };
  };

  const RELATIVE = ["other", "first", "last"] as const;

  const patternPrimary = (): Pattern => {
    const token = peek();
    if (isPunct("_")) {
      take();
      return { kind: "wildcard", span: spanOf(token) };
    }
    if (
      token.kind === "name" &&
      (RELATIVE as readonly string[]).includes(token.text) &&
      !isPunct("(", 1)
    ) {
      take();
      return {
        kind: "relative",
        which: token.text as (typeof RELATIVE)[number],
        span: spanOf(token),
      };
    }
    const low = expr();
    if (isPunct("..") || isPunct("..=")) {
      const inclusive = peek().text === "..=";
      take();
      const high = expr();
      return { kind: "range-pattern", from: low, to: high, inclusive, span: from(token) };
    }
    return { kind: "expr-pattern", expr: low, span: from(token) };
  };

  return fileNode();
}

const describe = (token: Token): string => {
  switch (token.kind) {
    case "end":
      return "the end of the file";
    case "string":
      return `the string "${token.text}"`;
    case "number":
      return `the number ${token.text}${token.unit ?? ""}`;
    default:
      return `"${token.text}"`;
  }
};
