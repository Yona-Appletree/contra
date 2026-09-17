import type { RoleName } from "@caller/choreo";
import type { Relation } from "../set/relations.js";
import { parseRelation } from "../set/relations.js";

/**
 * **The one vocabulary for "who"**: what a caller calls the dancer a relation
 * names, in the two registers a caller speaks in.
 *
 * Every text that names somebody names them through here — the `{who}` of a
 * call form, the `{to}` of a chain, the subject of a seam hint — so that
 * "partner" is one word in one place. Before this the pairing words were a
 * table inside `figureText.ts` and the hint had a second set of its own, and
 * two tables of the same words are two tables that drift.
 *
 * A **call** shouts ("SWING YOUR PARTNER"); a **walkthrough** teaches ("swing
 * your partner"). They are not the same string lower-cased: the call register
 * drops the "your" that the sentence around it supplies, and a role selector is
 * a plural in the call ("ROBINS ALLEMANDE LEFT") and a singular in the prose
 * ("the other robin"), because a caller shouting at the hall is talking to both
 * robins and a sentence teaching one dancer is talking about the other one.
 */

/** Which English a word is wanted in: a call shouts, a walkthrough teaches. */
export type Register = "call" | "prose";

/**
 * Who a text names: a relation on the set's lattice, or a contra role.
 *
 * The two answers the record actually writes. A pair figure's relation comes
 * from the call's own pairing parameter (`params.pairs`, `params.couples`); a
 * role comes from the call's `who` selector — "robins loop right" pairs nobody
 * with anybody and still has a subject.
 */
export type WhoWord = Relation | RoleName;

/**
 * What a caller calls this dancer, or `undefined` when there are no words for
 * them.
 *
 * `undefined` is a real answer and a load-time failure: a text whose `{who}`
 * cannot be said is a text with a `{slot}` in it, and a `{slot}` on the page is
 * the one thing the loader exists to prevent.
 */
export function relationWords(who: WhoWord, register: Register): string | undefined {
  if (typeof who === "string") return roleWords(who, register);
  switch (who.kind) {
    case "partner":
      return register === "call" ? "PARTNER" : "your partner";
    case "neighbor":
      return neighborWords(who.k, register);
    case "shadow":
      return who.k === 1
        ? register === "call"
          ? "SHADOW"
          : "your shadow"
        : indexed("SHADOW", "shadow", who.k, register);
    case "opposite":
      return register === "call" ? "OPPOSITE" : "your opposite";
    case "corner":
      return cornerWords(who.k, register);
    case "trail-buddy":
      return register === "call" ? "TRAIL BUDDY" : "your trail buddy";
    case "self":
      // A figure you dance by yourself names nobody, and a text that tried to
      // would be saying "do-si-do yourself". Texts for these figures write no
      // `{who}` at all.
      return undefined;
  }
}

/**
 * The two robins or the two larks, said as a caller says them.
 *
 * A role is plural to the hall and singular to the dancer: "ROBINS ALLEMANDE
 * LEFT" is shouted at both of them, and the sentence that teaches one of them
 * says "the other robin", which is the user's own word for the two of a role.
 */
function roleWords(role: string, register: Register): string | undefined {
  const one = role.replace(/s$/, "").toLowerCase();
  if (one !== "lark" && one !== "robin") return undefined;
  return register === "call" ? `${one.toUpperCase()}S` : `the other ${one}`;
}

/**
 * The neighbours, counted along the line.
 *
 * `N1` is the neighbour you are dancing with now, `N0` the one you have just
 * left and `N2` the one you are going to — and those three are words rather
 * than numbers, because "your next neighbor" is what a caller says.
 *
 * **Past N2 a caller counts** (a deviation from the plan, which asked for no
 * words at all past N2): two programme dances reach that far and both write the
 * count out in their own transcripts — A Rare Bird's "right shoulder round
 * number three" and Whoosh's "allemande left once with number four" — so the
 * corpus's own word is the honest one, and refusing it would take those two
 * dances' texts off the page.
 */
function neighborWords(k: number, register: Register): string | undefined {
  if (k === 0) return register === "call" ? "PREVIOUS NEIGHBOR" : "your previous neighbor";
  if (k === 1) return register === "call" ? "NEIGHBOR" : "your neighbor";
  if (k === 2) return register === "call" ? "NEXT NEIGHBOR" : "your next neighbor";
  return indexed("NUMBER", "number", k, register);
}

/** Your first corner and your second: contra corners' own two dancers. */
function cornerWords(k: number, register: Register): string | undefined {
  const word = ORDINALS[k];
  if (word === undefined) return undefined;
  return register === "call" ? `${word.toUpperCase()} CORNER` : `your ${word} corner`;
}

/** A relation written with a number, said with the number in words. */
function indexed(shout: string, spoken: string, k: number, register: Register): string | undefined {
  const word = NUMBER_WORDS[k];
  if (word === undefined) return undefined;
  return register === "call" ? `${shout} ${word.toUpperCase()}` : `${spoken} ${word}`;
}

/** The small counts a relation is indexed by, in words. */
const NUMBER_WORDS: Readonly<Record<number, string>> = {
  0: "zero",
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
};

/** First, second: how a caller counts corners. */
const ORDINALS: Readonly<Record<number, string>> = { 1: "first", 2: "second" };

/**
 * A `who` written as a dance record writes it, parsed — or `undefined` when the
 * word names nobody this table knows.
 *
 * A record writes a relation as a word (`"partner"`, `"N2"`, `"shadow"`), a
 * role as a plural (`"robins"`), and a pairing as the station pairs written out
 * (`[["1R", "2R"]]`, which is the two robins). All three reach a text as its
 * `{who}`, so all three are read here rather than three times over.
 */
export function whoOf(value: unknown): WhoWord | undefined {
  if (Array.isArray(value)) return rolePairOf(value);
  if (typeof value !== "string") return undefined;
  const word = value.trim();
  if (word === "") return undefined;
  const role = roleWords(word, "prose") === undefined ? undefined : word.replace(/s$/, "");
  if (role !== undefined) return role.toLowerCase();
  try {
    return parseRelation(word);
  } catch {
    return undefined;
  }
}

/**
 * The role two written-out stations name, when they are the two of one role.
 *
 * `[["1R", "2R"]]` is how a record says "the robins allemande": a list of pairs
 * of station ids whose two ends are both that role's. Anything else — a mixed
 * pair, three pairs, a list of something other than stations — is not a role
 * and gets no words.
 */
function rolePairOf(value: readonly unknown[]): WhoWord | undefined {
  const ids = (value.flat() as unknown[]).filter((x): x is string => typeof x === "string");
  if (ids.length !== 2) return undefined;
  const ends = ids
    .map((s) => s.slice(-1))
    .sort()
    .join("");
  if (ends === "RR") return "robin";
  if (ends === "LL") return "lark";
  return undefined;
}

/**
 * How a `who` is written on the left of a variant key: `who=robins`,
 * `who=partner`.
 *
 * The record's own spelling, so that a caller editing `data/figures/` writes
 * the word they read in `data/dances/`.
 */
export function whoKey(who: WhoWord): string {
  if (typeof who === "string") return `${who}s`;
  switch (who.kind) {
    case "partner":
      return "partner";
    case "neighbor":
      return who.k === 1 ? "neighbor" : `N${String(who.k)}`;
    case "shadow":
      return who.k === 1 ? "shadow" : `S${String(who.k)}`;
    case "opposite":
      return "opposite";
    case "corner":
      return who.k === 1 ? "corner" : `C${String(who.k)}`;
    case "trail-buddy":
      return who.k === 1 ? "trail-buddy" : `T${String(who.k)}`;
    case "self":
      return "self";
  }
}
