/**
 * The acceptance set: the twelve duple-longways dances the figure model is
 * built to dance (`vision.md` D7), as data.
 *
 * Every transcript below is quoted verbatim from that dance's own page on The
 * Caller's Box, each of which states `Permission: full`
 * (`docs/adr/2026-09-13-corpus-and-permission.md`). Nothing here is
 * reconstructed from memory, and nothing here is a dance record: a dance record
 * is a `data/dances/<slug>.json` file, and these twelve arrive one milestone at
 * a time from M5 onwards.
 *
 * What this file is *for* is the **vocabulary test** (`acceptance.test.ts`):
 * every figure name and every relation word the twelve use either resolves
 * today or is on an explicit unsupported list naming the milestone that owns
 * it. So the list of what the rebuild still owes is a test rather than a
 * memory, and a figure that becomes supported and is still listed fails.
 */

/** One of the twelve, with the vocabulary its transcript uses. */
export interface AcceptanceDance {
  /** The slug its dance record will have. */
  slug: string;
  title: string;
  author: string;
  /** The Caller's Box dance id. */
  callersBoxId: number;
  /** The form, as the Caller's Box page states it. */
  form: string;
  /** The A1/A2/B1/B2 sequence, quoted from that page. */
  transcript: string;
  /**
   * Every figure the transcript calls, as the **library id** it resolves to.
   *
   * A parameter is not a figure (D4): a half hey, a ricochet hey and a hey on
   * the right diagonal are all `hey`, and "shift right" is `slide-left` with a
   * direction. A name a caller would teach from scratch is its own id, whether
   * or not the library has it yet.
   */
  figures: readonly string[];
  /** Every relation word the transcript names, in the dance record's spelling. */
  relations: readonly string[];
  /** What this dance is in the set to break, from `vision.md`'s own table. */
  tests: string;
}

/** The twelve, in `vision.md`'s own order. */
export const ACCEPTANCE_SET: readonly AcceptanceDance[] = [
  {
    slug: "butter",
    title: "Butter",
    author: "Gene Hubert",
    callersBoxId: 10320,
    form: "becket",
    transcript: [
      "A1: (2) Shift left / (6) Circle left 3/4 / (8) Neighbor swing",
      "A2: (8) In long lines, go forward and back / (8) Ladies chain to partner",
      "B1: (16) Hey (WR;NL;MR;PL;WR;NL;MR)",
      "B2: (4) Partner balance / (12) Partner swing",
    ].join("\n"),
    figures: ["slide-left", "circle", "swing", "long-lines", "robins-chain", "hey", "balance"],
    relations: ["partner", "neighbor"],
    tests: "Smoke test: circle 3/4 in 6, chain, full hey into balance and swing",
  },
  {
    slug: "whoosh",
    title: "Whoosh",
    author: "Becky Hill",
    callersBoxId: 10875,
    form: "improper",
    transcript: [
      "A1: (6) Grand right and left (N1R;N2L;N3R) / (6) N4 neighbor allemande left 1 / (2) N3 neighbor pull by right / (2) N2 neighbor allemande left 1/2",
      "A2: (4) Balance long wave (N1R, men face in) / (4) Circulate: Men cross, women loop right [with N2] / (8) Partner swing",
      "B1: (8) Right and left through with partner / (8) Ladies chain to neighbor N1",
      "B2: (8) Star left 1 / (8) N2 neighbor do-si-do",
    ].join("\n"),
    figures: [
      "grand-right-and-left",
      "allemande",
      "pull-by",
      "balance-wave",
      "circulate",
      "loop",
      "swing",
      "right-and-left-through",
      "robins-chain",
      "star",
      "do-si-do",
    ],
    relations: ["partner", "neighbor", "N1", "N2", "N3", "N4"],
    tests: "Pull-bys out along the set and back, long wave, circulate, single progression on slots",
  },
  {
    slug: "chorus-jig",
    title: "Chorus Jig",
    author: "traditional",
    callersBoxId: 3418,
    form: "proper",
    transcript: [
      "A1: (8) Ones go down outside / (8) Ones go up outside",
      "A2: (4) Ones lead down / (4) Ones turn alone / (4) Ones lead up / (4) Ones cast off",
      "B1: (16) Ones turn contra corners",
      "B2: (4) Ones balance / (12) Ones swing; face up",
    ].join("\n"),
    // M1 wrote `down-the-outside`, `lead-along` and `contra-corners` here from
    // the transcript's own words. M7's brief names the definitions it wanted —
    // `go-down-outside`/`go-up-outside`, `lead-down`/`lead-up`,
    // `turn-contra-corners` — and those are the ids that landed, because down
    // the outside and up the outside really are two calls with two counts, as
    // the transcript itself writes them.
    figures: [
      "go-down-outside",
      "go-up-outside",
      "lead-down",
      "turn-alone",
      "lead-up",
      "cast-off",
      "turn-contra-corners",
      "balance",
      "swing",
    ],
    relations: [],
    tests: "Ones-only figures with the twos standing 48 beats, cast off, contra corners",
  },
  {
    slug: "the-nice-combination",
    title: "The Nice Combination",
    author: "Gene Hubert",
    callersBoxId: 1,
    form: "improper",
    transcript: [
      "A1: (4) Neighbor balance / (12) Neighbor swing",
      "A2: (6) In a line of four, go down the hall (M1-W2-M2-W1) / (2) Neighbor turn as couples / (6) In a line of four, go up the hall (W2-M1-W1-M2) / (2) Bend the line",
      "B1: (6) Circle left 3/4 / (10) Partner swing",
      "B2: (8) Ladies chain to neighbor / (8) Star left 1",
    ].join("\n"),
    figures: [
      "balance",
      "swing",
      "down-the-hall",
      "turn-as-couples",
      "up-the-hall",
      "bend-the-line",
      "circle",
      "robins-chain",
      "star",
    ],
    relations: ["partner", "neighbor"],
    tests: "Line of four with an order, turn as couples, bend the line",
  },
  {
    slug: "are-you-most-done",
    title: "Are You 'Most Done?",
    author: "Russell Owen",
    callersBoxId: 2842,
    form: "becket",
    transcript: [
      "A1: (8) Men allemande left 1 & 1/2 / (8) Neighbor swing",
      "A2: (8) In long lines, go forward and back / (8) Star left 7/8",
      "B1: (16) On right diagonal, hey (MR;N2L;WR;PL;MR;N2L;WR;PL)",
      "B2: (4) Men allemande right 1 || Women loop right / (12) Partner swing",
      "(#4700 alternate B2: (4) Men right shoulder round 3/4 || Women shift right)",
      "notes: Hey can straighten out as it proceeds. Dance begins with same neighbors as in the hey.",
    ].join("\n"),
    figures: [
      "allemande",
      "swing",
      "long-lines",
      "star",
      "hey",
      "loop",
      "shoulder-round",
      "slide-left",
    ],
    relations: ["partner", "neighbor", "N2"],
    tests: "Full hey on the right diagonal with N2, star left 7/8, concurrent B2",
  },
  {
    slug: "on-the-prowl",
    title: "On the Prowl",
    author: "Chris Page",
    callersBoxId: 10626,
    form: "improper",
    transcript: [
      "A1: (3) Mad robin clockwise 1/2 around neighbor / (2) Single file promenade clockwise 1/4 / (3) Partner right shoulder round 1/2 / (8) Partner swing",
      "A2: (3) Mad robin clockwise 1/2 around partner / (2) Single file promenade clockwise 1/4 / (3) Neighbor right shoulder round 1/2 / (8) Neighbor swing",
      "B1: (8) In long lines, go forward and back / (8) Ladies chain to partner",
      "B2: (16) Ricochet hey (WR;NL;MR;PL;WR;NL;M ricochet;NL~)",
    ].join("\n"),
    figures: [
      "mad-robin",
      "single-file-promenade",
      "shoulder-round",
      "swing",
      "long-lines",
      "robins-chain",
      "hey",
    ],
    relations: ["partner", "neighbor"],
    tests: "Ricochet hey ending short, mad robin in 3, shoulder round in 3, promenade in 2",
  },
  {
    slug: "annas-reel",
    title: "Anna's Reel",
    author: "Rick Mohr",
    callersBoxId: 140,
    form: "other (swap sides)",
    transcript: [
      "A1: (8) Women allemande right 1 & 1/2 / (4) Balance wave of four (NL,WR) / (4) Neighbor allemande left 3/4",
      "A2: (7) N2 neighbor allemande right 1 & 1/4 / (9) Hey 1/2 (WL;PR;ML;N2R)",
      "B1: (4) Women balance / (12) Women swing",
      "B2: (16) Partner swing",
      "2A1: (8) Men allemande left 1 & 1/2 / (4) Balance wave of four (N2R,ML) / (4) N2 neighbor allemande right 3/4",
      "2A2: (7) N3 neighbor allemande left 1 & 1/4 / (9) Hey 1/2 (MR;PL;WR;N3L)",
      "2B1: (4) Men balance / (12) Men swing",
      "2B2: (16) Partner swing",
    ].join("\n"),
    figures: ["allemande", "balance-wave", "hey", "balance", "swing"],
    relations: ["partner", "neighbor", "N2", "N3"],
    tests: "Seven-beat allemande 1¼, nine-beat half hey, same-role balance and swing, two passes",
  },
  {
    slug: "contrablend",
    title: "Contrablend",
    author: "Cary Ravitz",
    callersBoxId: 219,
    form: "improper (M1, W3)",
    transcript: [
      "A1: (4) Neighbor balance / (12) Neighbor swing",
      "A2: (6) Circle left 3/4 / (10) Partner swing",
      "B1: (8) In long lines, go forward and back while partner roll away (W roll L, M side-step R) / (8) In long lines, go forward and back while shadow roll away (W roll L, M side-step R) (new partner)",
      "B2: (6) Circle right 3/4 [with shadow]; turn alone / (10) N2 neighbor right shoulder round 1 & 1/2; face N3",
    ].join("\n"),
    figures: [
      "balance",
      "swing",
      "circle",
      "long-lines",
      "roll-away",
      "turn-alone",
      "shoulder-round",
    ],
    relations: ["partner", "neighbor", "shadow", "N2", "N3"],
    tests: "Role-asymmetric progression, partner rebound by a roll-away, figures with shadow",
  },
  {
    slug: "a-rare-bird",
    title: "A Rare Bird",
    author: "Bob Isaacs",
    callersBoxId: 10247,
    form: "improper",
    transcript: [
      "A1: (16) Hey along sides: (2) Pass through along (NR) / (2) Pass through along (N2L) / (6) N3 neighbor right shoulder round 1 / (2) Pass through along (N2L) / (4) N1 neighbor right shoulder round 1/2",
      "A2: (4) Single file promenade clockwise 1/2 (facing neighbor N1) / (12) N1 neighbor swing",
      "B1: (6) Circle left 3/4 / (10) Partner swing",
      "B2: (8) In long lines, go forward and back / (6) Star left 3/4 / (2) N1 neighbor pull by left",
    ].join("\n"),
    figures: [
      "pass-through",
      "shoulder-round",
      "single-file-promenade",
      "swing",
      "circle",
      "long-lines",
      "star",
      "pull-by",
    ],
    relations: ["partner", "neighbor", "N1", "N2", "N3"],
    tests:
      "A hey along the sides written entirely as passes and shoulder rounds: the schedule form",
  },
  {
    slug: "jeremy-corners",
    title: "Jeremy Corners",
    author: "Isaac Banner",
    callersBoxId: 20362,
    form: "improper (two passes)",
    transcript: [
      "A1: (8) Ones pass through across (1R); turn right; cast clockwise around one; step into center and face partner in distance; form diamonds / (8) Interrupted square through 2 [with twos, W1, and N2 M1]: (4) Neighbor balance (RH) / (4) Square through 2 (NR;SRNL)",
      "A2: (16) Ones turn contra corners (along the set)",
      "B1: (4) Ones balance / (12) Ones swing; face down",
      "B2: (4) Balance ring / (4) [Man one and twos] Single file promenade clockwise 1/3 / (8) Neighbor swing",
      "2A1-2B2: the same with the twos active, [with N2]/[N3] selections.",
      "notes: Author recommends you _not_ call this dance. Square through is done in a diamond formation.",
    ].join("\n"),
    figures: [
      "pass-through",
      "turn-alone",
      "cast-off",
      "diamond",
      "interrupted-square-through",
      "balance",
      "square-through",
      "turn-contra-corners",
      "swing",
      "balance-ring",
      "single-file-promenade",
    ],
    relations: ["partner", "neighbor", "N2", "N3"],
    tests: "Diamonds formed by a cast, interrupted square through with N2, promenade by three",
  },
  {
    slug: "the-set-monster",
    title: "The Set Monster",
    author: "Isaac Banner",
    callersBoxId: 18307,
    form: "becket (triple)",
    transcript: [
      "A1: (4) Balance ring / (4) Petronella turn / (8) Neighbor swing",
      "A2: (8) Ladies chain to partner / (4) Women balance (RH) / (2) Women pull by right / (2) N2 neighbor pull by left",
      "B1: (8) Interrupted square through 2 [with N3]: (4) N3 neighbor balance (RH) / (4) Square through 2 (N3R;PL) / (4) In long lines, go forward (facing out) / (4) N4 neighbor Jersey twirl",
      "B2: (4) Balance ring [with N4] / (4) Petronella turn / (8) Partner swing",
    ].join("\n"),
    figures: [
      "balance-ring",
      "petronella",
      "swing",
      "robins-chain",
      "balance",
      "pull-by",
      "interrupted-square-through",
      "square-through",
      "long-lines",
      "jersey-twirl",
    ],
    relations: ["partner", "neighbor", "N2", "N3", "N4"],
    tests: "Triple progression, square through with N3, Jersey twirl and balance ring with N4",
  },
  {
    slug: "fatal-attraction",
    title: "Fatal Attraction",
    author: "Roger Auman",
    callersBoxId: 10426,
    form: "becket",
    transcript: [
      "A1: (8) Ladies chain to neighbor / (8) Neighbor promenade counterclockwise around the major set",
      "A2: (2) Women cast back || Men go forward / (6) N2 neighbor right shoulder round / (8) N2 neighbor swing",
      "B1: (8) N2 neighbor promenade clockwise around the major set / (8) Women allemande right 1 & 1/2",
      "B2: (4) Partner balance / (12) Partner swing",
    ].join("\n"),
    figures: [
      "robins-chain",
      "promenade",
      "cast-off",
      "shoulder-round",
      "swing",
      "allemande",
      "balance",
    ],
    relations: ["partner", "neighbor", "N2"],
    tests: "Couples as units promenading around the major set, a concurrent cast-back",
  },
];

/**
 * Every figure the twelve name that the library has not got yet, and the
 * milestone that owns it.
 *
 * Read off `plan.md`'s milestone table, not guessed. M5's three landed with the
 * hey, M6's and M7's with the shapes and their named places; what is left is
 * M8's record growth and M9's two Banner dances.
 */
export const UNSUPPORTED_FIGURES: Readonly<Record<string, string>> = {
  // M5 emptied its own row with the hey, and M7 emptied its own and M6's with
  // it: `balance-wave`, `circulate` and `loop` are the shapes M6's report handed
  // over, and the nine M1 left as `unsupported … (M7)` are the definitions in
  // `library/figures/`.
  // M8 — the dance record grows. `promenade` landed here (Fatal Attraction's
  // two trips round the major set); `square-through` did not, because the only
  // thing in the corpus that calls one is Jeremy Corners' and The Set Monster's
  // **interrupted** square through, which is M9's figure in M9's dances.
  // **Empty since M9**, which is the milestone's own definition of done. The
  // four it emptied are the two Banner dances': `diamond` (the cast that forms
  // one — the *shape* landed in M7 and nothing made one), `square-through` and
  // `interrupted-square-through` (the named composite both dances call), and
  // `jersey-twirl`, which had no predecessor anywhere in the library.
};

/**
 * Every relation the twelve name that the formation tables do not answer, and
 * the milestone that owns it.
 *
 * **Empty since M6**, which is the milestone's own definition of done: N0…Nk,
 * shadow k and opposite are rows of both contra formations' tables now, with
 * the end-of-set rule being simply that a slot nobody stands on answers nobody
 * (`relations.ts`) and `pnpm dance`'s end-effects table saying who that leaves
 * out of which call.
 */
export const UNSUPPORTED_RELATIONS: Readonly<Record<string, string>> = {};
