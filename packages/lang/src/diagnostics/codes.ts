/**
 * Every diagnostic code of the dance language, with the one-line explanation
 * `pnpm lang check --explain` prints. Codes are stable: a test that pins a
 * code is pinning a **kind** of complaint, not a message, so the wording may
 * improve without breaking anything.
 *
 * The bands (notes D7): `L001–L009` parse, `L010–L099` check, `L100–` run.
 * P1 fills the parse band, P2 the check band, P3 the run band.
 */
export const CODES: Readonly<Record<string, { title: string; explain: string }>> = {
  L001: {
    title: "syntax",
    explain: "The text does not parse. The caret marks what was read where something else was due.",
  },
  L002: {
    title: "casing",
    explain:
      "Casing is grammar here. A name is kebab-case (`minor-set`); a type, a group and an enum member are TitleCase (`MinorSet`). `minorSet` and `minor_set` are neither.",
  },
  L003: {
    title: "unterminated string",
    explain: "A string ran to the end of its line without a closing quote. Strings do not wrap.",
  },
  L004: {
    title: "stray character",
    explain: "A character that begins nothing the language can read.",
  },
  L005: {
    title: "unknown unit",
    explain:
      "A number carries a unit the language does not have. There are two: `m` for a length and `deg` for an angle. Beats are a plain count (`beats = 8`).",
  },
  L006: {
    title: "no dots",
    explain:
      "The language has no dot syntax. A group's id is `id(MinorSet)`, an anchor is `anchor(MinorSet, center)`, an enum member of another module is `becket::OutTop`.",
  },
  L007: {
    title: "no sigil",
    explain:
      "`$name` was round 2's spelling. A relation is now a member of a group declaration and is read bare: `partner`, `neighbor`, `shadow`.",
  },
  L008: {
    title: "retired keyword",
    explain:
      "A keyword from an earlier reading of the language. A node is a `group`, a move or a dance is a `fn`, and a relation is a member of a group.",
  },
  L009: {
    title: "unclosed",
    explain:
      "A bracket, a brace or a block was opened and the file ended before it closed. The caret marks where it opened.",
  },

  L010: {
    title: "no such module",
    explain:
      "A file is a module and its name is the file's stem. `use becket::…` wants `becket.dance` beside the file, or one directory up.",
  },
  L011: {
    title: "not declared there",
    explain:
      "The module named does not declare that name. A module exports everything it declares at the top: its groups (with their ids), its enums and its functions.",
  },
  L012: {
    title: "unknown name",
    explain:
      "Nothing in scope is called this. A name is a parameter, a local, a member of a group above the reader, a group, an enum member, a function, or one of the cursor reads (`beat`, `time`, `first-time`, `last-time`).",
  },
  L013: {
    title: "declared twice",
    explain:
      "One module declares one name once, and one group declares each member once. Two formations that want the same name are two modules.",
  },
  L014: {
    title: "not on every path",
    explain:
      "A kind, or a relation declared on one, is read where not every path below has it — the couple waiting at the end of the line has no `MinorSet`. In a body or on a group, narrow first (`match Station { In => … }`). In a dance's script this is the dance's contract instead, and the dancers who lack the kind run the floor's `out`.",
  },
  L015: {
    title: "no dancer here",
    explain:
      "A `body` runs once at invocation, for nobody, and a `setup` builds the tree the same way. A relation, a group name meaning *mine*, a cursor read, an `assign` and a move all need a dancer to be about. `select` in a body is the exception: it is relative to the node being built.",
  },
  L016: {
    title: "nothing to build",
    explain:
      "A group invocation and an anchor build the tree, and the tree is built once, in a `setup` or a `body`. A script moves dancers about a tree that already stands.",
  },
  L017: {
    title: "nothing to be other than",
    explain:
      "`other`, `first` and `last` compare a candidate against the reader, so they mean something in `select` and `assign` and nothing in `is` or `match`.",
  },
  L018: {
    title: "not exhaustive",
    explain:
      "A `match` covers every member of its subject's enum or it is an error. `_` is always available to say “the rest” out loud.",
  },
  L019: {
    title: "the wrong enum",
    explain:
      "An enum member was written where a member of another enum is due. `Left` is a `Hand` and a `Turn`; which one is settled by what is being filled in.",
  },
  L020: {
    title: "not one",
    explain:
      "`one!` is the mark that says “exactly one”, and the checker can count this one: it is not. `other` over an enum of three is two of them; name the id you mean, or take the selection.",
  },
  L021: {
    title: "already one",
    explain:
      "`other(K)` on a two-member enum is total and yields one group, so the `one!` around it says nothing.",
  },
  L022: {
    title: "two of that name",
    explain:
      "Every group above a dancer contributes its members to that dancer's scope, and two of them declaring the same name is an error naming both, not a resolution rule.",
  },
  L023: {
    title: "floor mismatch",
    explain:
      "Two dances composed must agree on their floor: a medley lays one formation and dances what was written for it. `becket::MajorSet` and `improper::MajorSet` are different names.",
  },
  L024: {
    title: "a selection, not a dancer",
    explain:
      "A move takes groups, and this argument may match several. `one!(…)` is how a selection becomes one.",
  },
  L025: {
    title: "assign to nowhere",
    explain:
      "`_` matches anything, which is a question a `select` may ask and an `assign` may not: an event names exactly one place.",
  },
  L026: {
    title: "not on that branch",
    explain:
      "An `assign` may name a kind on another branch, and doing so drops the kinds that branch lacks — but the branch it lands on must have the kinds it names.",
  },
  L027: {
    title: "too many arguments",
    explain: "A function's parameters are its contract. Positional arguments fill them in order.",
  },
  L028: {
    title: "no such argument",
    explain: "A named argument names a parameter the function does not have.",
  },
  L029: {
    title: "given twice",
    explain:
      "One parameter, filled by a positional argument and again by name. Positional arguments fill the parameters in order, so an extra one lands on the next parameter along.",
  },
  L030: {
    title: "missing argument",
    explain: "A parameter with no default was not filled.",
  },
  L031: {
    title: "the cursor is elsewhere",
    explain:
      "An `assert` the checker could settle from the text alone is false: the beats before it do not come to what it asserts. `phrase(A2)` asserts the cursor is at 16, so an A1 of eighteen beats is caught before anybody dances.",
  },
  L032: {
    title: "built inside itself",
    explain: "A path never repeats a kind, so a group cannot be invoked below itself.",
  },

  // L100– : what only running can find out (notes D7). The checker (P2) turns
  // most of these into check-time errors where it can see the arity or the
  // path shape; the evaluator keeps them because a spike runs text the checker
  // has not read, and because a commit can only fail at a beat.
  L100: {
    title: "cannot evaluate",
    explain:
      "The evaluator read something it could not make sense of where it stood: a name that resolves to nothing, a group invocation outside `setup`, an anchor in a script, arithmetic on a dancer. Most of these are the checker's to catch first.",
  },
  L101: {
    title: "assert failed",
    explain:
      "An `assert` was false where it stands. `phrase(A2)` asserts the cursor is at beat 16, so a phrase that spends eighteen beats is caught at the next phrase rather than at the end of the dance.",
  },
  L102: {
    title: "two dancers, one place",
    explain:
      "The events of one beat sent two dancers to the same place. Every place holds one dancer, and the commit at the end of the beat is where that is checked \u2014 the diagnostic names the pair and the beat.",
  },
  L103: {
    title: "a dancer with nowhere to stand",
    explain:
      "An event sent a dancer to a node that is not a place. A place is a group whose body says `dancer();`.",
  },
  L104: {
    title: "one! did not name one",
    explain:
      "`one!` is the mark that says a selection must be exactly one, and this one was not. Either the pattern is wider than it looks (`other` over three ids names two), or the place it names is empty.",
  },
  L105: {
    title: "assign found no place",
    explain:
      "An `assign` named no place and nothing caught it. `assign` is a `Bool`, so `or` chains the fallbacks: a formation's `progress` says where a couple goes when it runs off the end of the line.",
  },
  L106: {
    title: "assign named more than one place",
    explain:
      "An event goes to exactly one place. Name another kind to narrow it; a kind not named is mine, and a kind the target branch lacks is dropped.",
  },
  L107: {
    title: "floors do not agree",
    explain:
      "A dance was composed into another dance standing on a different formation. Two dances composed must agree on their floor: a medley stands in one.",
  },
  L108: {
    title: "the dance does not end",
    explain:
      "Every dancer still had something to do after the beat limit. A dance is one time through and is expected to end; this is the guard, not a budget.",
  },
  L109: {
    title: "nobody is dancing here",
    explain:
      "A move is a thing a dancer does, so it has no meaning in `setup`, in a group's body or inside an expression \u2014 there is no cursor there to advance.",
  },
};

/** The explanation line for a code, or a stub when the code is not one of ours. */
export const explain = (code: string): string =>
  CODES[code]?.explain ?? `${code} is not a code this language issues.`;
