import type { FigureDefinition } from "../library/FigureDefinition.js";
import type { PassToken, Shoulder } from "../library/passList.js";
import { WEAVE_LEGS, legsOfAmount, readPassList } from "../library/passList.js";
import { relationWords, whoOf } from "./relationWords.js";

/**
 * **A schedule figure's teach, generated from its own schedule** (vision §5,
 * A24).
 *
 * The hey is the one figure in the library whose teach is a *list*: a caller
 * teaching one reads the dancer's own meetings out in order, and the user's own
 * text is exactly that —
 *
 * > "Note where you are standing. You will return here after walking across the
 * > set. Robins start by passing right shoulders in the middle, neighbors by the
 * > left on the outside, loop around, partner by the left on the outside,
 * > neighbor by the right in the center, face your partner on your side."
 *
 * Which meant W1's `hey.json` had a teach per *combination* of parameters —
 * start by the left, half a hey, a ricochet on the second pass, a hey for three
 * — and there are more combinations than a caller will ever write by hand. So
 * the hey's teach is not written at all: the file keeps the opening sentence
 * ("note where you are standing") and the rest is read off the pass list, which
 * is the schedule written down.
 *
 * ## What it reads, and what it does not
 *
 * The **pass list**, not the planned schedule. `kinds/schedule.ts`'s
 * `scheduleOf` needs a real set to expand against — where each dancer is
 * standing decides which of them loops first — and a text is resolved with a
 * call's parameters and nothing else. The list carries everything the sentence
 * needs: who each meeting is with, which shoulder it is by, whether anybody
 * bounces out of it, and whether the hey stops there. Whether a meeting is in
 * the middle or on the outside falls out of *who* it is with rather than out of
 * its index — a meeting with your own role is in the middle of the set and one
 * with a relation is at the lanes' edges — which is the one thing P8's brief
 * says must never be guessed from the count.
 */

/**
 * The teach for one schedule figure, as the app prints it.
 *
 * `opening` is whatever the file still writes; the sentences follow it.
 */
export function scheduleTeach(
  def: FigureDefinition,
  params: Record<string, unknown>,
  opening: string,
  budget: number,
): string {
  const sentences = scheduleSentences(def, params);
  const parts = [opening, ...sentences].filter((part) => part.trim() !== "");
  // **The other role's sentence is dropped when the two will not fit** (P8's
  // own rule): a full hey's two sentences are about ninety words between them
  // and the teach budget is eighty. The dancer reading a walkthrough is one
  // dancer, and the sentence that is theirs is the first one.
  while (parts.length > 2 && words(parts.join(" ")) > budget) parts.pop();
  return parts.join(" ");
}

/** How many words a run of text is. */
const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * One sentence per role that dances: the starting role first.
 *
 * Exported whole because the Moves page has room for both and a walkthrough
 * entry does not.
 */
export function scheduleSentences(
  def: FigureDefinition,
  params: Record<string, unknown>,
): string[] {
  if (def.shape.kind !== "schedule") return [];
  const shorthand = def.shape.shorthand;
  const passes = passListFor(params, shorthand);
  if (passes.length === 0) return [];

  // **The written list's own first token says which role steps off**, exactly as
  // `kinds/schedule.ts` reads it: a record that writes the hey out does not also
  // have to set `start`, and a diagonal hey that opens `LR` is the larks'.
  const starting = roleOf(passes[0]?.who) ?? roleOf(params[shorthand.start]) ?? "robin";
  const other = starting === "robin" ? "lark" : "robin";
  const ricochets = ricochetOf(params[shorthand.ricochet]);
  const ending = endingOf(passes);

  const out = [sentenceFor(starting, starting, passes, ricochets, ending)];
  // **A hey for three** stands one dancer out, not a whole role, so it is a
  // sentence of its own — and it comes before the other role's, because it is
  // the one a dancer standing out needs and the teach budget drops the last.
  const idle = roleOfStation(params[shorthand.idle]);
  if (idle !== undefined) {
    out.push(
      `One ${idle} stands this one out: stay on your place while the others weave, and face your partner when they finish.`,
    );
  }
  out.push(sentenceFor(other, starting, passes, ricochets, ending));
  return out;
}

/** One role's own reading of the list, from the first meeting to the last. */
function sentenceFor(
  role: string,
  starting: string,
  passes: readonly PassToken[],
  ricochets: { role: string; at: number } | undefined,
  ending: string,
): string {
  const clauses: string[] = [];
  for (const [index, token] of passes.entries()) {
    const mine = inTheMiddle(token) ? isMine(token, role) : true;
    if (!mine) {
      clauses.push("loop around");
      continue;
    }
    // **Both ricochet spellings say the same thing** (P7, the PR body's own
    // finding): the `ricochet` parameter (`"robins@2"`) and a pass written `!`
    // in the list itself (`L!`, On the Prowl's B2) are both legal, and a written
    // one was reaching this function without ever being read — the pass looked
    // like an ordinary meeting and got an ordinary clause.
    if (
      token.ricochet === true ||
      (ricochets !== undefined && ricochets.role === role && ricochets.at === index + 1)
    ) {
      // The lane is the meeting's, not the word "middle": `ricochet: "robins@2"`
      // names a **pass of the list**, and the second pass of an ordinary hey is
      // at the lanes' edges.
      clauses.push(
        `bounce back off ${nameOf(token, role)} ${inTheMiddle(token) ? "in the middle" : "on the outside"}`,
      );
      continue;
    }
    if (index === 0 && role === starting) {
      clauses.push(`${plural(role)} start by passing ${token.by} shoulders in the middle`);
      continue;
    }
    if (index === 0) {
      clauses.push(`${plural(role)}, you start by looping at the end`);
      continue;
    }
    clauses.push(
      `${nameOf(token, role)} by the ${token.by} ${inTheMiddle(token) ? "in the middle" : "on the outside"}`,
    );
  }
  const sentence = `${clauses.join(", ")}, ${ending}`;
  return `${sentence.slice(0, 1).toUpperCase()}${sentence.slice(1)}.`;
}

/** Whether this meeting happens in the middle of the set or at the lanes' edges. */
const inTheMiddle = (token: PassToken): boolean => token.who === "robins" || token.who === "larks";

/** Whether this dancer is one of the two the meeting is between. */
const isMine = (token: PassToken, role: string): boolean => token.who === `${role}s`;

/** What a dancer of `role` calls whoever this meeting is with. */
function nameOf(token: PassToken, role: string): string {
  if (inTheMiddle(token)) return `the other ${role}`;
  const who = whoOf(token.who);
  const words = who === undefined ? undefined : relationWords(who, "prose");
  return words === undefined ? token.who : words.replace(/^your /, "");
}

/** How the sentence ends: where the weave leaves you. */
function endingOf(passes: readonly PassToken[]): string {
  const last = passes[passes.length - 1];
  if (last?.short === true) return "and stop beside your neighbor, facing them";
  // A weave danced for fewer than its eight legs stops half way across.
  return passes.length >= WEAVE_LEGS - 1
    ? "face your partner on your side"
    : "and stop when everybody has crossed the set";
}

/** Both robins, both larks. */
const plural = (role: string): string => `${role.slice(0, 1).toUpperCase()}${role.slice(1)}s`;

/**
 * **The pass list a call dances**: the one it wrote, or the one its shorthand
 * means.
 *
 * The canonical weave alternates — a meeting in the middle with your own role,
 * then one at the edge with whoever the set says is there — and the roles and
 * the relations alternate with it. Which is why "half a hey" is a prefix of the
 * same list rather than a figure of its own.
 */
export function passListFor(
  params: Record<string, unknown>,
  shorthand: { passes: string; start: string; by: string; amount: string },
): PassToken[] {
  const written = readPassList(params[shorthand.passes]);
  if (written !== undefined && written.length > 0) return written;

  const starting = roleOf(params[shorthand.start]) ?? "robin";
  const by = params[shorthand.by] === "left" ? "left" : "right";
  const other: Shoulder = by === "right" ? "left" : "right";
  const asked = params[shorthand.amount];
  const legs = legsOfAmount(typeof asked === "number" ? asked : 1);

  const out: PassToken[] = [];
  for (let i = 0; i < legs - 1; i++) {
    if (i % 2 === 0) {
      const role = i % 4 === 0 ? starting : starting === "robin" ? "lark" : "robin";
      out.push({ who: `${role}s`, by });
    } else {
      out.push({ who: i % 4 === 1 ? "neighbor" : "partner", by: other });
    }
  }
  return out;
}

/** A contra role written any of the ways a record writes one. */
function roleOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const one = value.trim().replace(/s$/, "").toLowerCase();
  return one === "robin" || one === "lark" ? one : undefined;
}

/** Which contra role a figure-role such as `"2L"` belongs to. */
function roleOfStation(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const last = value.trim().slice(-1).toUpperCase();
  return last === "L" ? "lark" : last === "R" ? "robin" : undefined;
}

/** `"robins@2"`: whose bounce, and on which meeting, counting from one. */
function ricochetOf(value: unknown): { role: string; at: number } | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const [who, at] = value.split("@");
  const role = roleOf(who ?? "");
  const on = Number(at ?? "");
  return role === undefined || !Number.isFinite(on) ? undefined : { role, at: on };
}
