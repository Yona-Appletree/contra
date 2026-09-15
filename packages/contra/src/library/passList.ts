/**
 * **The pass list** (D5): a hey written as the passes it is made of.
 *
 * ```text
 * RR NL LR PL RR NL LR
 * ```
 *
 * Two capitals per pass, **who then shoulder**: robins right, neighbor left,
 * larks right, partner left. The app disambiguates the role letter from the side
 * letter by lightly colouring it with the role colour
 * (`docs/role-colours.md`); in plain text the first is always the who and the
 * last is always the shoulder, so nothing is ambiguous here.
 *
 * It maps one to one on to the Caller's Box's own notation (`WR;NL;MR;PL`) with
 * `W` → `R` and `M` → `L`, and {@link parsePassList} accepts both spellings and
 * both separators so a transcript can be pasted in verbatim.
 * {@link printPassList} always prints the repository's own spelling, which is
 * what makes the round trip a *normalisation* rather than an identity: a
 * Caller's Box line comes back as the same hey in this repository's words.
 *
 * ## What a token says, and what it does not
 *
 * A token names **a meeting and a shoulder**, not a dancer's path. `WR` is "the
 * two robins pass right shoulders", which happens in the middle of the set and
 * leaves the two larks looping at the ends; `NL` is "each dancer passes their
 * neighbour by the left", which happens at the two lanes' edges at once and
 * involves all four. So a role word is a pass for two and a relation word is a
 * pass for four, and that alternation is the whole structure of a hey for four.
 * `kinds/schedule.ts` is what turns the list into a per-role schedule.
 *
 * Two marks beyond the two letters, both of which the corpus writes:
 *
 * - **`!` in place of the shoulder** — a **ricochet**: those dancers come into
 *   the middle and bounce back the way they came instead of passing through.
 *   The Caller's Box writes it out (`M ricochet`); `L!` is the same thing.
 * - **`~` after a token** — the hey **ends short** on that pass: you get there
 *   and stop, and the honest end is "beside them, facing them".
 *
 * On the Prowl's B2 is both at once: `RR NL LR PL RR NL L! NL~`, which is the
 * Caller's Box's `WR;NL;MR;PL;WR;NL;M ricochet;NL~` in this spelling.
 */

/** Which shoulder a pass is by. */
export type Shoulder = "right" | "left";

/**
 * Who a pass is between: a **contra role** (both robins, both larks) or a
 * **relation** (your neighbour, your partner, your shadow, N2).
 *
 * Left as a string rather than a union of the words the tables answer today,
 * because the relation vocabulary is `set/relations.ts`' and a hey may be
 * written on any row of it — Are You 'Most Done?'s diagonal hey passes N2.
 */
export type PassWho = string;

/** One pass of a hey, as the pass list writes it. */
export interface PassToken {
  /** `"robins"`, `"larks"`, `"neighbor"`, `"partner"`, `"N2"`, … */
  who: PassWho;
  /** Which shoulder; a ricochet has none, and carries the one it came in on. */
  by: Shoulder;
  /** Those dancers bounce back out of the middle instead of passing through. */
  ricochet?: boolean;
  /** The hey stops here: you reach this meeting and do not complete it. */
  short?: boolean;
}

/** The letter each `who` is written with, and the words it is read as. */
const WHO_WORDS: Readonly<Record<string, PassWho>> = {
  R: "robins",
  L: "larks",
  // The Caller's Box's own two, accepted on input and never printed.
  W: "robins",
  M: "larks",
  N: "neighbor",
  P: "partner",
  S: "shadow",
  O: "opposite",
  T: "trail-buddy",
  C: "corner",
};

/** The letter a word is printed with: the table above, first spelling wins. */
const WHO_LETTERS: Readonly<Record<PassWho, string>> = {
  robins: "R",
  larks: "L",
  neighbor: "N",
  partner: "P",
  shadow: "S",
  opposite: "O",
  "trail-buddy": "T",
  corner: "C",
};

/**
 * The Caller's Box spells a ricochet out — `M ricochet` — where the pass list
 * marks it. Folded in before the split so a transcript pastes in whole.
 */
const RICOCHET_WRITTEN = /([A-Za-z]\d*)\s+ricochets?/gi;

/** A whole hey's worth of passes, from the pass list or the Caller's Box's own. */
export function parsePassList(text: string): PassToken[] {
  const words = text
    .replace(RICOCHET_WRITTEN, "$1!")
    .split(/[\s;,]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  return words.map((word) => parsePass(word, text));
}

/** One token: `RR`, `N2L`, `L!`, `NL~`. */
export function parsePass(word: string, within = word): PassToken {
  const short = word.endsWith("~");
  const body = short ? word.slice(0, -1) : word;
  if (body.length < 2) {
    throw new Error(`pass list: "${word}" is not a pass (in "${within}")`);
  }
  const mark = body[body.length - 1]!;
  const head = body.slice(0, -1);
  const who = WHO_WORDS[head[0]!.toUpperCase()];
  if (who === undefined) {
    throw new Error(
      `pass list: "${word}" starts with "${head[0]!}", which is not one of ` +
        `[${Object.keys(WHO_WORDS).join(", ")}] (in "${within}")`,
    );
  }
  // A relation may be numbered — `N2`, `S2` — and a role may not: there is only
  // one set of robins.
  const tail = head.slice(1);
  if (tail !== "" && !/^\d+$/.test(tail)) {
    throw new Error(`pass list: "${word}" has "${tail}" where a number would go (in "${within}")`);
  }
  if (tail !== "" && (who === "robins" || who === "larks")) {
    throw new Error(`pass list: "${word}" numbers a role, and there is only one set of them`);
  }
  // `N1` **is** "neighbor": `relations.ts`' own `relationWord` writes the first
  // of a numbered row without its number, so normalising here is what makes a
  // token's `who` a relation word the tables answer to.
  const numbered = tail === "" || tail === "1" ? who : `${WHO_LETTERS[who] ?? who}${tail}`;
  if (mark === "!") {
    return { who: numbered, by: "right", ricochet: true, ...(short ? { short: true } : {}) };
  }
  const by = shoulderOf(mark);
  if (by === undefined) {
    throw new Error(
      `pass list: "${word}" ends with "${mark}", which is not a shoulder (R, L) or a ricochet (!)`,
    );
  }
  return { who: numbered, by, ...(short ? { short: true } : {}) };
}

/** `R`/`L` as a shoulder, in either case. */
const shoulderOf = (letter: string): Shoulder | undefined =>
  letter.toUpperCase() === "R" ? "right" : letter.toUpperCase() === "L" ? "left" : undefined;

/**
 * A pass list back as the string a dance record writes.
 *
 * A ricochet loses its shoulder, because it has none: the dancers never pass.
 * The shoulder the token carries is the one they came in on and is what
 * {@link PassToken.by} keeps for the schedule to read.
 */
export function printPassList(tokens: readonly PassToken[]): string {
  return tokens.map(printPass).join(" ");
}

/** One token as it is written. */
export function printPass(token: PassToken): string {
  const letter = WHO_LETTERS[token.who] ?? token.who;
  const mark = token.ricochet === true ? "!" : token.by === "right" ? "R" : "L";
  return `${letter}${mark}${token.short === true ? "~" : ""}`;
}

/**
 * A pass list as plain JSON objects, and back.
 *
 * "JSON spells the words out" (D5): a dance record may write
 * `[{ "who": "robins", "by": "right" }, …]` instead of `"RR NL …"`, and both
 * reach the schedule as the same tokens. This is the reader for whichever of the
 * two a record wrote.
 */
export function readPassList(value: unknown): PassToken[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return parsePassList(value);
  if (!Array.isArray(value)) {
    throw new Error(`a pass list is a string or a list of passes, not ${JSON.stringify(value)}`);
  }
  return value.map((item, i) => {
    if (typeof item === "string") return parsePass(item);
    if (typeof item !== "object" || item === null) {
      throw new Error(`pass ${String(i + 1)} is ${JSON.stringify(item)}, not a pass`);
    }
    const pass = item as Partial<PassToken>;
    if (typeof pass.who !== "string") {
      throw new Error(`pass ${String(i + 1)} has no "who"`);
    }
    if (pass.by !== "right" && pass.by !== "left") {
      throw new Error(`pass ${String(i + 1)} is by ${JSON.stringify(pass.by)}, not right or left`);
    }
    return {
      who: pass.who,
      by: pass.by,
      ...(pass.ricochet === true ? { ricochet: true as const } : {}),
      ...(pass.short === true ? { short: true as const } : {}),
    };
  });
}

/**
 * How many **legs** a pass list is: the walks between one meeting and the next,
 * counting the one that takes you home.
 *
 * A hey for four's weave is a closed track with eight legs — four meetings in
 * the middle and four at the two ends — so a full hey's seven passes are seven
 * of them and the eighth is the walk home. A hey that **ends short** has no walk
 * home: the last token *is* where it stops. That is the whole of the arithmetic
 * that puts a full hey's passes on counts 2, 4, 6, 8, 10, 12 and 14 of sixteen,
 * and a half hey's on 2, 4 and 6 of eight.
 */
export const legsOfPassList = (tokens: readonly PassToken[]): number =>
  tokens.length + (endsShort(tokens) ? 0 : 1);

/** Whether the list stops on its last token instead of completing the weave. */
export const endsShort = (tokens: readonly PassToken[]): boolean =>
  tokens.length > 0 && tokens[tokens.length - 1]!.short === true;

/** How many legs a whole turn of the weave has: four meetings and four ends. */
export const WEAVE_LEGS = 8;

/** How much of the weave a pass list dances, as a fraction of the whole. */
export const amountOfPassList = (tokens: readonly PassToken[]): number =>
  legsOfPassList(tokens) / WEAVE_LEGS;

/** How many legs an `amount` of the weave is, rounded to a whole one. */
export const legsOfAmount = (amount: number): number =>
  Math.max(1, Math.round(amount * WEAVE_LEGS));
