import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Diagnostic, Source } from "../diagnostics/Diagnostic.js";
import { lineAt, renderText } from "../diagnostics/render.js";
import { loadProgram, loadTexts } from "../load.js";
import { check, checkProgram } from "./check.js";

const dances = fileURLToPath(new URL("../../dances", import.meta.url));

/** A fixture, checked the way the CLI will check it: load, then check. */
function checkFixture(name: string): {
  diagnostics: Diagnostic[];
  sources: readonly Source[];
  text: string;
} {
  const program = loadProgram(`${dances}/${name}`);
  const diagnostics = [...program.diagnostics, ...check(program)];
  return { diagnostics, sources: program.sources, text: renderText(diagnostics, program.sources) };
}

/** The 1-based line a diagnostic points at, so a test can pin the line and not the offset. */
function lineOf(diagnostic: Diagnostic, sources: readonly Source[]): number {
  const span = diagnostic.span;
  if (span === undefined) return 0;
  const source = sources.find((s) => s.name === span.file);
  return source === undefined ? 0 : lineAt(source.text, span.start).line;
}

/** What one diagnostic is, in the shape a test wants to read: code, file and line. */
const at = (diagnostic: Diagnostic, sources: readonly Source[]): string =>
  `${diagnostic.code} ${diagnostic.span?.file ?? "—"}:${String(lineOf(diagnostic, sources))}`;

// ---------------------------------------------------------------------------
// The fixtures
// ---------------------------------------------------------------------------

/**
 * Every file that is meant to be right. `medley.dance` and `triple-minor.dance`
 * are not here: they hold a deliberate check error each, outside `broken/`,
 * because the thing they demonstrate (a floor mismatch, `one!` over three ids)
 * belongs beside the formation it is about.
 */
const HAPPY = [
  "prelude.dance",
  "contra.dance",
  "becket.dance",
  "improper.dance",
  "butter.dance",
  "role-swap.dance",
  "square.dance",
];

describe("the happy fixtures", () => {
  for (const name of HAPPY) {
    it(`${name} has no complaints`, () => {
      const { text } = checkFixture(name);
      expect(text).toBe("no complaints\n");
    });
  }
});

describe("the check-time failures that live beside their formation", () => {
  it("triple-minor: `one!` over three ids cannot hold", () => {
    const { diagnostics, sources, text } = checkFixture("triple-minor.dance");
    expect(diagnostics.map((d) => at(d, sources))).toEqual(["L020 triple-minor.dance:40"]);
    expect(text).toMatchInlineSnapshot(`
      "error[L020] not one: this matches 2 at once, and \`one!\` wants exactly one
        --> triple-minor.dance:40:14
           |
        40 |   across   = one!(select(Couple = other, Role = other));
           |              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         = check: "Couple" admits 2 of Ones, Twos, Threes
         = check: "Role" admits 1 of Lark, Robin
         = help: "Couple = other" is every other Couple, and "Couple" has 3 ids — name the one you mean

      1 error, 0 warnings
      "
    `);
  });

  it("medley: a becket dance on an improper floor", () => {
    const { diagnostics, sources, text } = checkFixture("medley.dance");
    expect(diagnostics.map((d) => at(d, sources))).toEqual(["L023 medley.dance:24"]);
    expect(text).toMatchInlineSnapshot(`
      "error[L023] floor mismatch: "mismatch" lays "improper::MajorSet" and then dances "butter", which stands on "becket::MajorSet"
        --> medley.dance:24:3
           |
        24 |   butter(minor-sets = minor-sets);
           |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         = check: "mismatch" sets up "improper::MajorSet"
         = check: "butter" sets up "becket::MajorSet"
         = help: two dances composed must agree on their floor: set up "becket::MajorSet", or dance something written for "improper::MajorSet"

      1 error, 0 warnings
      "
    `);
  });
});

describe("the broken fixtures", () => {
  it("neighbor-from-out: `neighbor` where there is no minor set", () => {
    const { diagnostics, sources, text } = checkFixture("broken/neighbor-from-out.dance");
    expect(diagnostics.map((d) => at(d, sources))).toEqual(["L014 neighbor-from-out.dance:31"]);
    expect(text).toMatchInlineSnapshot(`
      "error[L014] not on every path: "neighbor" needs a "MinorSet" above the dancer, and not every path here has one
        --> neighbor-from-out.dance:31:31
           |
        31 |   fn out(length: i32) { swing(neighbor, beats = length); }
           |                               ^^^^^^^^
         = check: "neighbor" is declared on "MinorSet"
         = check: this path has no "MinorSet" — MajorSet / Station / Couple / Role
         = help: match on "Station" first: its arms say which paths you are on

      1 error, 0 warnings
      "
    `);
  });

  it("partner-in-body: a relation read where there is no reader", () => {
    const { diagnostics, sources, text } = checkFixture("broken/partner-in-body.dance");
    expect(diagnostics.map((d) => at(d, sources))).toEqual(["L015 partner-in-body.dance:17"]);
    expect(text).toMatchInlineSnapshot(`
      "error[L015] no dancer here: "partner" is a relation, read by a dancer, and a \`body\` runs for nobody
        --> partner-in-body.dance:17:31
           |
        17 |     anchor facing = direction(partner);
           |                               ^^^^^^^
         = check: "Couple" declares "partner"
         = help: "partner" is declared on "Couple" and every dancer under it may read it — a body may not

      1 error, 0 warnings
      "
    `);
  });

  it("move-in-setup: a move where nobody is dancing yet", () => {
    const { diagnostics, sources, text } = checkFixture("broken/move-in-setup.dance");
    expect(diagnostics.map((d) => at(d, sources))).toEqual(["L015 move-in-setup.dance:16"]);
    expect(text).toMatchInlineSnapshot(`
      "error[L015] no dancer here: "swing" is something a dancer does, and a \`setup\` runs for nobody
        --> move-in-setup.dance:16:5
           |
        16 |     swing(partner, beats = 8);
           |     ^^^^^^^^^^^^^^^^^^^^^^^^^^
         = check: "swing" is a move
         = help: a \`setup\` builds the tree; the script below it is what the dancers do

      1 error, 0 warnings
      "
    `);
  });

  it("other-in-is: nothing to be other than", () => {
    const { diagnostics, sources, text } = checkFixture("broken/other-in-is.dance");
    expect(diagnostics.map((d) => at(d, sources))).toEqual(["L017 other-in-is.dance:16"]);
    expect(text).toMatchInlineSnapshot(`
      "error[L017] nothing to be other than: "other" compares a candidate against the reader, and there is no candidate here
        --> other-in-is.dance:16:17
           |
        16 |   if (Couple is other) {
           |                 ^^^^^
         = help: in an \`is\` or a \`match\`, name the id you mean, or ask "select(K = other)" for the group

      1 error, 0 warnings
      "
    `);
  });

  it("non-exhaustive-match: two arms of three", () => {
    const { diagnostics, sources, text } = checkFixture("broken/non-exhaustive-match.dance");
    expect(diagnostics.map((d) => at(d, sources))).toEqual(["L018 non-exhaustive-match.dance:17"]);
    expect(text).toMatchInlineSnapshot(`
      "error[L018] not exhaustive: this \`match\` does not cover "OutBottom"
        --> non-exhaustive-match.dance:17:3
           |
        17 |   match Station {
           |   ^^^^^^^^^^^^^^^
         = check: "Station" is OutTop, In, OutBottom
         = help: add an arm for OutBottom, or "_ => …" to say "the rest" out loud

      1 error, 0 warnings
      "
    `);
  });

  it("duplicate-member: two groups on one path declare `neighbor`", () => {
    const { diagnostics, sources, text } = checkFixture("broken/duplicate-member.dance");
    expect(diagnostics.map((d) => at(d, sources))).toEqual(["L022 duplicate-member.dance:23"]);
    expect(text).toMatchInlineSnapshot(`
      "error[L022] two of that name: "neighbor" is declared on "MajorSet" and on "MinorSet", and a dancer is under both
        --> duplicate-member.dance:23:3
           |
        23 |   neighbor = one!(select(Couple = other, Role = other));
           |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         = check: "MajorSet" declares "neighbor"
         = check: "MinorSet" declares "neighbor"
         = check: the path MajorSet / Station / MinorSet / Couple / Role has both
         = help: rename one of them: a dancer reads "neighbor" bare, and the language will not pick for you

      1 error, 0 warnings
      "
    `);
  });

  it("wrong-arity: a move's parameters are its contract", () => {
    const { diagnostics, sources, text } = checkFixture("broken/wrong-arity.dance");
    expect(diagnostics.map((d) => at(d, sources))).toEqual([
      "L029 wrong-arity.dance:17",
      "L028 wrong-arity.dance:20",
    ]);
    expect(text).toMatchInlineSnapshot(`
      "error[L029] given twice: "beats" is given twice — once in order, once by name
        --> wrong-arity.dance:17:28
           |
        17 |   swing(partner, neighbor, beats = 8);
           |                            ^^^^^^^^^
         = check: "beats" was already filled by the argument before it
         = check: "swing" is a move
         = help: "swing" takes with: Role, beats: i32, and the arguments without names fill them in order

      error[L028] no such argument: "circle" has no argument called "turns"
        --> wrong-arity.dance:20:26
           |
        20 |   circle(MinorSet, Left, turns = 3, beats = 8);
           |                          ^^^^^^^^^
         = check: "circle" is a move
         = help: it takes ring: group, direction: Turn, places: i32, beats: i32

      2 errors, 0 warnings
      "
    `);
  });

  it("phrase-assert: an A1 of eighteen beats", () => {
    const { diagnostics, sources, text } = checkFixture("broken/phrase-assert.dance");
    expect(diagnostics.map((d) => at(d, sources))).toEqual(["L031 phrase-assert.dance:20"]);
    expect(diagnostics[0]?.beat).toBe(18);
    expect(text).toMatchInlineSnapshot(`
      "error[L031] the cursor is elsewhere: "A2" starts at beat 18, and asserts that it starts at 16
        --> phrase-assert.dance:20:3
           |
        20 |   phrase(A2) {
           |   ^^^^^^^^^^^^
         = beat 18
         = check: the assert is in contra.dance
         = help: count the beats of what comes before: they come to 18, not 16

      1 error, 0 warnings
      "
    `);
  });

  /**
   * The ninth broken file is not a check error and must not become one: every
   * name in it resolves and every `assign` is well formed. It goes wrong at the
   * **commit** at the end of beat 0, when two couples land on one set — which
   * is the evaluator's L102, with the pair and the beat in it.
   */
  it("broken-progression is a run-time failure, not a check-time one", () => {
    const { text } = checkFixture("broken/broken-progression.dance");
    expect(text).toBe("no complaints\n");
  });
});

// ---------------------------------------------------------------------------
// One minimal program per rule
// ---------------------------------------------------------------------------

/**
 * A formation in miniature, the shape of becket: a hall with one couple out at
 * the top and one minor set in the middle, so that `Set` is on one path and
 * not the other — which is the case every path rule is about.
 */
const BASE = `
group Role { id: enum { Lark, Robin } body { dancer(); } }

group Couple {
  id: enum { Ones, Twos }
  body { Role(Lark); Role(Robin); }
  partner = other(Role);
}

group Station { id: enum { OutTop, In, OutBottom } }

group Set {
  id: i32
  body { Couple(Ones); Couple(Twos); }
  neighbor = one!(select(Couple = other, Role = other));
}

group Hall {
  id: i32
  body {
    Station(OutTop) Couple(Ones);
    Station(In) { Set(0); }
  }
  fn out(length: i32) { wait(beats = length); }
}

fn wait(beats: i32 = 64) { ir "wait"; }
fn swing(with: Role, beats: i32 = 8) { ir "swing"; }
fn turn(who: enum Role, beats: i32 = 8) { ir "turn"; }
`;

/** Check one little module written against `BASE`, and say only what went wrong. */
function checkText(source: string, base = BASE): string[] {
  const program = loadTexts([
    { name: "base.dance", text: base },
    { name: "little.dance", text: `use base::*;\n${source}` },
  ]);
  const diagnostics = [...program.diagnostics, ...check(program)];
  return diagnostics.map((d) => `${d.code} ${d.message}`);
}

describe("rule 1: names and scopes", () => {
  it("the base it is all written against is clean", () => {
    expect(checkText("fn dance() { setup { Hall(1); } swing(partner, beats = 64); }")).toEqual([]);
  });

  it("imports a name the module does not declare", () => {
    const program = loadTexts([
      { name: "base.dance", text: BASE },
      { name: "little.dance", text: "use base::{Couple, shadow};" },
    ]);
    expect(check(program).map((d) => d.code)).toEqual(["L011"]);
  });

  it("reads a name nothing declares", () => {
    expect(checkText("fn dance() { setup { Hall(1); } swing(nobody, beats = 64); }")).toEqual([
      'L012 nothing here is called "nobody"',
    ]);
  });

  it("names a module there is none of", () => {
    const program = loadTexts([{ name: "little.dance", text: "use nowhere::{Thing};" }]);
    expect(program.diagnostics.map((d) => d.code)).toEqual(["L010"]);
  });

  it("declares one name twice", () => {
    expect(checkText('fn twice() { ir "a"; }\nfn twice() { ir "b"; }')).toEqual([
      'L013 "twice" is declared twice in this module',
    ]);
  });
});

describe("rule 2: path shapes", () => {
  it("a formation's own script may not read a kind half its paths lack", () => {
    expect(
      checkText(`group Bad {
        id: i32
        body { Station(OutTop) Couple(Ones); Station(In) { Set(0); } }
        fn out(length: i32) { swing(neighbor, beats = length); }
      }`),
    ).toEqual(['L014 "neighbor" needs a "Set" above the dancer, and not every path here has one']);
  });

  it("a `match` on the kind that tells the paths apart is the narrowing", () => {
    expect(
      checkText(`group Fine {
        id: i32
        body { Station(OutTop) Couple(Ones); Station(In) { Set(0); } }
        fn out(length: i32) {
          match Station {
            In => swing(neighbor, beats = length);
            OutTop | OutBottom => wait(beats = length);
          }
        }
      }`),
    ).toEqual([]);
  });

  it("a dance's script reads what it likes: that is its contract", () => {
    expect(checkText("fn dance() { setup { Hall(1); } swing(neighbor, beats = 64); }")).toEqual([]);
  });

  it("but not a kind that is nowhere in the formation", () => {
    const diagnostics = checkText(
      "group Lonely { id: i32 body { Couple(Ones); } }\n" +
        "fn dance() { setup { Lonely(1); } swing(neighbor, beats = 64); }",
    );
    expect(diagnostics).toEqual([
      'L014 "neighbor" needs a "Set" above the dancer, and not every path here has one',
    ]);
  });
});

describe("rule 3: no dancer here", () => {
  it("a relation read in a body", () => {
    expect(
      checkText("group Pair { id: i32 body { Couple(Ones); anchor a = direction(partner); } }"),
    ).toEqual(['L015 "partner" is a relation, read by a dancer, and a `body` runs for nobody']);
  });

  it("a group name meaning *mine* in a body", () => {
    expect(
      checkText("group Pair { id: i32 body { Couple(Ones); anchor a = direction(Set); } }"),
    ).toEqual(['L015 "Set" here means *my* Set, and a `body` runs for nobody']);
  });

  it("a move in a setup", () => {
    expect(
      checkText("fn dance() { setup { Hall(1); swing(partner, beats = 8); } wait(beats = 64); }"),
    ).toEqual(['L015 "swing" is something a dancer does, and a `setup` runs for nobody']);
  });

  it("an `assign` in a body", () => {
    expect(
      checkText("group Pair { id: i32 body { Couple(Ones); assign(Role = other); } }"),
    ).toEqual(['L015 an "assign" moves a dancer, and a `body` runs for nobody']);
  });

  it("but a `select` in a body is node-relative, and allowed", () => {
    expect(
      checkText(
        "group Pair { id: i32 body { Couple(Ones); anchor a = direction(select(Couple = Ones)); } }",
      ),
    ).toEqual([]);
  });

  it("a group invocation in a script builds nothing", () => {
    expect(checkText("fn dance() { setup { Hall(1); } Couple(Ones); wait(beats = 64); }")).toEqual([
      'L016 "Couple(…)" builds a node, and the tree is built once, in a `setup` or a `body`',
    ]);
  });
});

describe("rule 4: patterns", () => {
  it("`other` outside a select or an assign", () => {
    expect(
      checkText("fn dance() { setup { Hall(1); } if (Couple is other) { wait(beats = 64); } }"),
    ).toEqual([
      'L017 "other" compares a candidate against the reader, and there is no candidate here',
    ]);
  });

  it("a `match` that misses an id", () => {
    expect(
      checkText(`fn dance() {
        setup { Hall(1); }
        match Station { OutTop => wait(beats = 64); In => wait(beats = 64); }
      }`),
    ).toEqual(['L018 this `match` does not cover "OutBottom"']);
  });

  it("`_` says the rest out loud", () => {
    expect(
      checkText(`fn dance() {
        setup { Hall(1); }
        match Station { In => wait(beats = 64); _ => wait(beats = 64); }
      }`),
    ).toEqual([]);
  });

  it("an enum member of the wrong enum", () => {
    expect(checkText("fn dance() { setup { Hall(1); } turn(Ones, beats = 64); }")).toEqual([
      'L019 "Ones" is a member of "Couple", and "Role" is due here',
    ]);
  });
});

describe("rule 5: arity", () => {
  it("`one!` on a select that can match two", () => {
    expect(
      checkText(
        "group Trio { id: enum { A, B, C } body { Role(Lark); Role(Robin); } }\n" +
          "group Big { id: i32 body { Trio(A); Trio(B); Trio(C); } " +
          "across = one!(select(Trio = other, Role = other)); }",
      ),
    ).toEqual(["L020 this matches 2 at once, and `one!` wants exactly one"]);
  });

  it("`one!` around an `other` that is already one", () => {
    const diagnostics = checkText(
      "group Pair { id: i32 body { Couple(Ones); } mine = one!(other(Couple)); }",
    );
    expect(diagnostics).toEqual([
      'L021 "other(Couple)" is already one: "Couple" has two ids, so there is only one other',
    ]);
  });

  it("a select with every kind pinned is one, and `one!` still earns its keep", () => {
    expect(
      checkText(
        "group Pair { id: i32 body { Couple(Ones); Couple(Twos); } " +
          "across = one!(select(Couple = other, Role = other)); }",
      ),
    ).toEqual([]);
  });
});

describe("rule 6: member collisions", () => {
  it("two groups on one path declaring the same name", () => {
    expect(
      checkText(`group Above {
        id: i32
        body { Set(0); }
        neighbor = one!(select(Set = other, Role = other));
      }`),
    ).toEqual(['L022 "neighbor" is declared on "Above" and on "Set", and a dancer is under both']);
  });

  it("two formations may declare the same name, since a dance stands in one", () => {
    expect(
      checkText(
        "group Other { id: i32 body { Couple(Ones); } neighbor = one!(select(Couple = other)); }",
      ),
    ).toEqual([]);
  });
});

describe("rule 7: contracts and floors", () => {
  it("two dances composed on two floors", () => {
    expect(
      checkText(`group Elsewhere { id: i32 body { Couple(Ones); } }
        fn here() { setup { Hall(1); } wait(beats = 64); }
        fn there() { setup { Elsewhere(1); } here(); }`),
    ).toEqual([
      'L023 "there" lays "little::Elsewhere" and then dances "here", which stands on "base::Hall"',
    ]);
  });

  it("a move given a selection rather than a dancer", () => {
    expect(
      checkText("fn dance() { setup { Hall(1); } swing(select(Couple = _), beats = 64); }"),
    ).toEqual(['L024 "swing" takes one "Role", and this is a selection']);
  });

  it("a dance's contract is the kinds it reads", () => {
    const program = loadTexts([
      { name: "base.dance", text: BASE },
      {
        name: "little.dance",
        text: "use base::*;\nfn dance() { setup { Hall(1); } swing(neighbor, beats = 64); }",
      },
    ]);
    const { resolution } = checkProgram(program);
    const dance = resolution.dances.find((fn) => fn.name === "dance");
    expect(dance?.contract.map((group) => group.name)).toEqual(["Set"]);
    expect(dance?.floor?.name).toBe("Hall");
    expect(dance?.out?.name).toBe("out");
    expect(dance?.beats).toBe(64);
  });
});

describe("rule 8: assign targets", () => {
  it("`_` does not say where to go", () => {
    expect(
      checkText("fn dance() { setup { Hall(1); } assign(Role = _); wait(beats = 64); }"),
    ).toEqual(['L025 "Role = _" does not say where to go']);
  });

  it("an assign that names a kind the branch it lands on does not have", () => {
    expect(
      checkText(`fn dance() {
        setup { Hall(1); }
        assign(Station = OutTop, Set = 0);
        wait(beats = 64);
      }`),
    ).toEqual(['L026 this "assign" lands where there is no "Set"']);
  });

  it("but naming another branch is how a dancer leaves the line", () => {
    expect(
      checkText(`fn dance() {
        setup { Hall(1); }
        assign(Station = OutTop, Couple = other);
        wait(beats = 64);
      }`),
    ).toEqual([]);
  });
});

describe("arguments", () => {
  it("too many", () => {
    expect(checkText("fn dance() { setup { Hall(1); } wait(1, 2, 3); }")).toEqual([
      'L027 "wait" does not take 2 arguments',
      'L027 "wait" does not take 3 arguments',
    ]);
  });

  it("a name the function does not have", () => {
    expect(checkText("fn dance() { setup { Hall(1); } wait(bars = 8); }")).toEqual([
      'L028 "wait" has no argument called "bars"',
    ]);
  });

  it("filled in order and again by name", () => {
    expect(checkText("fn dance() { setup { Hall(1); } swing(partner, 4, beats = 8); }")).toEqual([
      'L029 "beats" is given twice — once in order, once by name',
    ]);
  });

  it("a parameter with no default, unfilled", () => {
    expect(checkText("fn dance() { setup { Hall(1); } swing(beats = 8); }")).toEqual([
      'L030 "swing" is missing "with"',
    ]);
  });
});

describe("the cursor", () => {
  it("an assert the text alone settles", () => {
    expect(
      checkText(`fn at-eight(body: fn) { assert(beat == 8); body(); }
        fn dance() { setup { Hall(1); } wait(beats = 4); at-eight() { wait(beats = 60); } }`),
    ).toEqual(["L031 this starts at beat 4, and asserts that it starts at 8"]);
  });

  it("and one it cannot, because the branches disagree", () => {
    expect(
      checkText(`fn at-eight(body: fn) { assert(beat == 8); body(); }
        fn dance() {
          setup { Hall(1); }
          if (first-time) { wait(beats = 8); } else { wait(beats = 4); }
          at-eight() { wait(beats = 56); }
        }`),
    ).toEqual([]);
  });

  it("a dance inside a dance counts from its own beat 0", () => {
    expect(
      checkText(`fn phrase(which: enum Station, body: fn) {
          assert(beat == match which { OutTop => 0, In => 32, OutBottom => 48 });
          body();
        }
        fn one-time() { setup { Hall(1); } phrase(OutTop) { wait(beats = 64); } }
        fn twice() { setup { Hall(1); } one-time(); one-time(); }`),
    ).toEqual([]);
  });
});

describe("groups", () => {
  it("a group built inside itself", () => {
    expect(checkText("group Loop { id: i32 body { Loop(1); } }")).toEqual([
      'L032 "Loop" is built inside itself',
    ]);
  });
});

// ---------------------------------------------------------------------------
// The table the rest of the pipeline reads
// ---------------------------------------------------------------------------

describe("the resolution table", () => {
  it("says what every function is, and what a dance stands on", () => {
    const program = loadProgram(`${dances}/butter.dance`);
    const { diagnostics, resolution } = checkProgram(program);
    expect(diagnostics).toEqual([]);

    const butter = resolution.dances.find((fn) => fn.name === "butter");
    expect(butter?.role).toBe("dance");
    expect(butter?.floor?.name).toBe("MajorSet");
    expect(butter?.floor?.module).toBe("becket");
    expect(butter?.beats).toBe(64);
    expect(butter?.contract.map((group) => group.name).sort()).toEqual(["Couple", "MinorSet"]);
    expect(butter?.progress?.name).toBe("progress");
    expect(butter?.out?.name).toBe("out");

    const swing = [...resolution.fns.values()].find((fn) => fn.name === "swing");
    expect(swing?.role).toBe("move");
    expect(swing?.ir).toBe("swing");
  });

  it("says what the paths below a group are", () => {
    const program = loadProgram(`${dances}/becket.dance`);
    const { resolution } = checkProgram(program);
    const major = [...resolution.groups.values()].find((group) => group.name === "MajorSet");
    const shapes = (major?.shapes ?? []).map((shape) =>
      shape
        .map((step) => `${step.group.name}${step.id.kind === "enum" ? `(${step.id.name})` : ""}`)
        .join("/"),
    );
    expect([...new Set(shapes)]).toEqual([
      "Station(OutTop)/Couple(Ones)/Role(Lark)",
      "Station(OutTop)/Couple(Ones)/Role(Robin)",
      "Station(In)/MinorSet/Couple(Ones)/Role(Lark)",
      "Station(In)/MinorSet/Couple(Ones)/Role(Robin)",
      "Station(In)/MinorSet/Couple(Twos)/Role(Lark)",
      "Station(In)/MinorSet/Couple(Twos)/Role(Robin)",
      "Station(OutBottom)/Couple(Twos)/Role(Lark)",
      "Station(OutBottom)/Couple(Twos)/Role(Robin)",
    ]);
  });

  it("says what a name in an expression binds to", () => {
    const program = loadProgram(`${dances}/butter.dance`);
    const { resolution } = checkProgram(program);
    const bound = new Map<string, string>();
    for (const [expr, binding] of resolution.names) {
      const name = expr.kind === "name" ? expr.name : expr.name;
      bound.set(name, binding.kind);
    }
    expect(bound.get("partner")).toBe("member");
    expect(bound.get("neighbor")).toBe("member");
    expect(bound.get("MinorSet")).toBe("group");
    expect(bound.get("Robin")).toBe("enum-member");
    expect(bound.get("first-time")).toBe("cursor");
  });
});
