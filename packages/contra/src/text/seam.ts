import type { Angle } from "@caller/core";
import { angleDiff } from "@caller/core";
import type { DancerId, RoleName, Side } from "@caller/choreo";
import { localAngle, localPoint } from "@caller/choreo";
import type { FigureDefinition } from "../library/FigureDefinition.js";
import { DATA_DEFINITIONS } from "../library/figures/index.js";
import type { Relation, RelationTable } from "../set/relations.js";
import { relate } from "../set/relations.js";
import type { SetModel } from "../set/SetModel.js";
import { setRulesOf } from "../set/SetRules.js";
import type { BoundarySnapshot } from "../set/planCycle.js";
import type { FigureInstance } from "../set/resolve.js";
import type { WhoWord } from "./relationWords.js";
import { relationWords } from "./relationWords.js";

/**
 * **Where you are, said at the seam** (D22, M13 §2).
 *
 * The written language stops at how far (`docs/move-texts.md` §3); this is the
 * other half — the sentence the app writes itself, between one call and the
 * next, from the engine's own honest ends. The user:
 *
 * > "I really like the 'Your neighbor is beside you.' bit at the end. so
 * > useful. 'Your neighbor is beside you. Your partner is across from you'."
 *
 * Two facts make it a seam sentence rather than a figure's last line. It is
 * about **this dance**: the same circle left three places leaves a becket
 * dancer across from their partner and a duple dancer beside them. And it is
 * about **what comes next**: it is said when something changed, and the thing
 * that decides whether anything changed is who the next call puts you with.
 *
 * Every sentence here is one of five shapes over one of eight places, and
 * nothing else is ever said. A hint that reads wrong is a rule to change in
 * this file, not prose to write in forty-five others.
 */

/** Which side of you somebody is on. */
export type SeamSide = "left" | "right";

/** One dancer's place, in the set's own axes. */
export interface Place {
  /** Across the set: one sign is one line, the other sign the other. */
  across: number;
  /** Along the set: up and down the hall. */
  along: number;
  /** Which way they face, in the set's axes; 90° is down the hall. */
  facing: Angle;
}

/**
 * How close across the set two dancers stand to be in one line, px.
 *
 * The lines are `ACROSS_PX` — 32 px — apart, so a third of that separates "the
 * same line" from "the other one" with room to spare either way. Generous on
 * purpose: a swing opens out a px or two off the exact stations and a caller
 * still says "beside you".
 */
export const SAME_LINE_PX = 11;

/** How close along the set two dancers stand to be level with each other, px. */
export const SAME_ROW_PX = 11;

/** No further along your own line than this and a caller says "beside you", px. */
export const NEXT_TO_PX = 30;

/**
 * How one dancer stands to another, from where the first one is standing.
 *
 * `in-hand` outranks the geometry (Q11): if you are holding somebody, that is
 * what a caller says about them, however far apart the two of you are.
 */
export type SeamRelation =
  | { kind: "across" | "beside" | "diagonal" | "along" | "behind"; side: SeamSide }
  | { kind: "in-hand"; hand: Side };

/**
 * Where `them` stands seen from `me`, in my own facing and the set's axes.
 *
 * The spike's rule, port for port: same line and near → beside; same line and
 * far → behind when they are more than 120° off my facing, else along; a
 * different line and level with me → across; otherwise a diagonal, on whichever
 * side of my facing the bearing falls.
 */
export function relationTo(me: Place, them: Place, held?: Side): SeamRelation {
  if (held !== undefined) return { kind: "in-hand", hand: held };
  const across = them.across - me.across;
  const along = them.along - me.along;
  const bearing = (Math.atan2(along, across) * 180) / Math.PI;
  const off = angleDiff(me.facing, bearing);
  const side: SeamSide = off > 0 ? "right" : "left";
  if (Math.abs(across) <= SAME_LINE_PX) {
    if (Math.abs(along) <= NEXT_TO_PX) return { kind: "beside", side };
    return Math.abs(off) > BEHIND_DEG ? { kind: "behind", side } : { kind: "along", side };
  }
  return Math.abs(along) <= SAME_ROW_PX ? { kind: "across", side } : { kind: "diagonal", side };
}

/** More than this far off your facing and somebody along your line is behind you. */
const BEHIND_DEG = 120;

/**
 * "Your partner is across from you." — one sentence, in the user's own form.
 *
 * `who` is the relation word for that dancer in the **prose** register, and it
 * opens the sentence, so it is capitalised here rather than written capitalised
 * in the table (where most of its uses are mid-sentence).
 */
export function sayWhoIsWhere(rel: SeamRelation, who: string): string {
  const subject = who.slice(0, 1).toUpperCase() + who.slice(1);
  switch (rel.kind) {
    case "across":
      return `${subject} is across from you.`;
    case "beside":
      return `${subject} is beside you.`;
    case "diagonal":
      return `${subject} is on your ${rel.side} diagonal.`;
    case "along":
      return `${subject} is along your line.`;
    case "behind":
      return `${subject} is behind you.`;
    case "in-hand":
      return `${subject} is in your ${rel.hand === "R" ? "right" : "left"} hand.`;
  }
}

/** Where one dancer of a model stands, in the set's own axes. */
export function placeOf(model: SetModel, dancer: DancerId): Place | undefined {
  const state = model.dancers[dancer];
  if (state === undefined) return undefined;
  const local = localPoint(model.frame, state.spot.p);
  return {
    across: local[0]!,
    along: local[1]!,
    facing: normalise(localAngle(model.frame, state.spot.facing)),
  };
}

/** An angle in `[0, 360)`: a dancer's facing accumulates whole turns. */
const normalise = (a: Angle): Angle => ((a % 360) + 360) % 360;

/**
 * **Who the next call puts me with**, and how firmly.
 *
 * Four answers, because the hint needs to tell three kinds of silence apart. A
 * call that pairs people and pairs *me* names a dancer; a call that pairs people
 * and leaves me out — the robins while the larks allemande, the larks while the
 * robins chain — says nothing about where I am, because the sentence would be
 * about somebody else's figure; a call everybody dances together names nobody
 * and the hint says both people; and a dancer nobody cast is standing out.
 */
export type Need =
  | { kind: "with"; dancer: DancerId }
  | { kind: "unpaired" }
  | { kind: "together" }
  | { kind: "idle" };

/** What the call whose instances these are puts `me` with. */
export function needOf(instances: readonly FigureInstance[], me: DancerId, model: SetModel): Need {
  if (instances.length === 0) return { kind: "idle" };
  let pairs = false;
  for (const instance of instances) {
    if (instance.holdPlace) continue;
    const def = definitionOf(instance.figure);
    if (def === undefined) continue;
    if (!pairsDancers(def)) continue;
    pairs = true;
    const cast = Object.values(instance.cast);
    if (!cast.includes(me)) continue;
    const other = otherOf(instance, def, me, model);
    if (other !== undefined) return { kind: "with", dancer: other };
  }
  if (pairs) return { kind: "unpaired" };
  const cast = instances.some((i) => !i.holdPlace && Object.values(i.cast).includes(me));
  return cast ? { kind: "together" } : { kind: "idle" };
}

/** Whether this figure puts two named dancers together at all. */
function pairsDancers(def: FigureDefinition): boolean {
  if (def.actors === "pairs") return true;
  return def.shape.kind === "courtesyTurn" && def.shape.pairing.kind === "chain";
}

/** The dancer this instance puts `me` with, or `undefined` when it puts me with nobody. */
function otherOf(
  instance: FigureInstance,
  def: FigureDefinition,
  me: DancerId,
  model: SetModel,
): DancerId | undefined {
  if (def.actors === "pairs") {
    const cast = Object.values(instance.cast);
    return cast.find((dancer) => dancer !== me);
  }
  // **A chain** is one instance over the whole four, and the pair it makes is
  // not written anywhere: the robin crosses the set and is turned by whichever
  // lark she arrives at. Which one that is falls out of where she is standing
  // when the figure starts, which is exactly {@link chainTarget}.
  return chainTarget(model, me);
}

/**
 * **The dancer a chain lands `me` with**: whoever is straight across the set
 * from me when it starts.
 *
 * The one derivation this file exports for two consumers (A18, Q7's trap): the
 * seam hint needs the dancer, and the calling card needs the **word** — "ROBINS
 * CHAIN TO YOUR PARTNER" — and a second relation function written beside the
 * card would be a second answer to one question. `undefined` for a dancer the
 * chain does not send across, which is every lark.
 */
export function chainTarget(model: SetModel, me: DancerId): DancerId | undefined {
  const here = placeOf(model, me);
  if (here === undefined) return undefined;
  const table = setRulesOf(model.formation).relations;
  for (const rel of [PARTNER, NEIGHBOR] as const) {
    const them = related(model, table, me, rel);
    if (them === undefined) continue;
    const there = placeOf(model, them);
    if (there === undefined) continue;
    if (relationTo(here, there).kind === "across") return them;
  }
  return undefined;
}

/**
 * **The word a chain's call names**: "ROBINS CHAIN TO YOUR PARTNER".
 *
 * The `{to}` slot (A18), derived rather than written: the record says which role
 * chains and the geometry says whom they land with, so no dance file has to
 * carry a target and no dance file can get it wrong. `undefined` where the call
 * starting here is no chain, which is every other call.
 */
export function toOf(at: BoundarySnapshot, among: readonly DancerId[]): WhoWord | undefined {
  const table = setRulesOf(at.model.formation).relations;
  for (const instance of at.starting) {
    if (instance.holdPlace) continue;
    const def = definitionOf(instance.figure);
    if (def === undefined || def.shape.kind !== "courtesyTurn") continue;
    if (def.shape.pairing.kind !== "chain") continue;
    const cast = new Set(Object.values(instance.cast));
    for (const dancer of among) {
      if (!cast.has(dancer)) continue;
      const them = chainTarget(at.model, dancer);
      if (them === undefined) continue;
      const word = relationWordBetween(at.model, table, dancer, them);
      if (word !== undefined) return word;
    }
  }
  return undefined;
}

/**
 * The relation word from `me` to `them`, read off the formation's own table:
 * `relate`'s inverse.
 *
 * The order is the order a caller would reach for — your partner, your
 * neighbours out from the one you are dancing with, your shadow, the dancer
 * opposite — and the first that names `them` wins. A dancer of your own role
 * that no relation names is the role itself, which is what "the other robin"
 * is; anything else has no word and the hint stands down rather than invent
 * one.
 */
export function relationWordBetween(
  model: SetModel,
  table: RelationTable,
  me: DancerId,
  them: DancerId,
): WhoWord | undefined {
  for (const rel of RELATION_ORDER) {
    if (related(model, table, me, rel) === them) return rel;
  }
  const mine = model.dancers[me]?.role;
  const theirs = model.dancers[them]?.role;
  return mine !== undefined && mine === theirs ? mine : undefined;
}

const PARTNER: Relation = { kind: "partner" };
const NEIGHBOR: Relation = { kind: "neighbor", k: 1 };

/** The relations a hint will name, in the order a caller reaches for them. */
const RELATION_ORDER: readonly Relation[] = [
  PARTNER,
  NEIGHBOR,
  { kind: "neighbor", k: 0 },
  { kind: "neighbor", k: 2 },
  { kind: "shadow", k: 1 },
  { kind: "shadow", k: 2 },
  { kind: "opposite" },
];

/**
 * `relate`, with a relation the formation has not built answering nobody.
 *
 * A table throws by name for a row it does not have (`unsupported: T1 (M6)`),
 * which is right for a dance that *calls* one and wrong for a sentence that is
 * only asking whether this dancer happens to be that.
 */
function related(
  model: SetModel,
  table: RelationTable,
  me: DancerId,
  rel: Relation,
): DancerId | undefined {
  try {
    return relate(model, table, me, rel);
  } catch {
    return undefined;
  }
}

/** The hint said at one seam: one sentence for everybody, or one per role. */
export type Hint = { text: string } | { byRole: { robins?: string; larks?: string } };

/** The text of a hint, whichever shape it is — for a test, a table, a report. */
export const hintText = (hint: Hint): string =>
  "text" in hint
    ? hint.text
    : [
        hint.byRole.robins === undefined ? undefined : `Robins: ${hint.byRole.robins}`,
        hint.byRole.larks === undefined ? undefined : `Larks: ${hint.byRole.larks}`,
      ]
        .filter((part): part is string => part !== undefined)
        .join(" ");

/**
 * **What a caller says at this seam**, or nothing.
 *
 * The rule, in the order it is applied, per dancer of the hands-four the hint is
 * about:
 *
 * 1. The next call puts me with the dancer this one did — every balance into a
 *    swing, every do-si-do into an "AND SWING" — and nothing is said.
 * 2. The next call pairs people up and leaves me out: the robins while the
 *    larks allemande. Nothing is said, because the sentence would be about
 *    somebody else's figure.
 * 3. Otherwise, the person the next call needs **first**, then the other of
 *    partner and neighbour. A dancer the next call names who is neither — your
 *    next neighbour, the other lark — is the whole sentence on their own: a
 *    caller who has just told you where to look does not then tell you where
 *    two other people are.
 *
 * Then the four are collapsed: one sentence they all say is the hint; otherwise
 * one per role, and a role whose two dancers disagree takes the whole hint down,
 * because anything finer than by role is not a sentence a caller says.
 */
export function seamHint(at: BoundarySnapshot, reference: readonly DancerId[]): Hint | undefined {
  if (at.starting.length === 0) return undefined;
  const table = setRulesOf(at.model.formation).relations;
  // **Whether a role has just moved on its own**: the robins have allemanded,
  // or chained, while the larks stood. That is the one thing that makes a ring
  // figure worth a sentence — the dancers who moved are somewhere new and the
  // ones who stood are not.
  const roleMoved = reference.some(
    (dancer) => needOf(at.ending, dancer, at.model).kind === "unpaired",
  );
  const said = new Map<DancerId, string | undefined>();
  for (const dancer of reference) {
    said.set(dancer, sentenceFor(at, table, dancer, roleMoved));
  }
  const spoken = [...said.values()].filter((text): text is string => text !== undefined);
  if (spoken.length === 0) return undefined;
  const distinct = new Set(spoken);
  if (distinct.size === 1 && spoken.length === reference.length) {
    return { text: [...distinct][0]! };
  }

  const byRole: { robins?: string; larks?: string } = {};
  for (const role of ["robin", "lark"] as const) {
    const mine = reference.filter((dancer) => at.model.dancers[dancer]?.role === role);
    if (mine.length === 0) continue;
    const theirs = new Set(mine.map((dancer) => said.get(dancer)));
    // Finer than by role is not a sentence a caller says: the whole hint goes.
    if (theirs.size !== 1) return undefined;
    const one = [...theirs][0];
    if (one === undefined) continue;
    if (role === "robin") byRole.robins = one;
    else byRole.larks = one;
  }
  return byRole.robins === undefined && byRole.larks === undefined ? undefined : { byRole };
}

/** What one dancer says at this seam, or nothing. */
function sentenceFor(
  at: BoundarySnapshot,
  table: RelationTable,
  me: DancerId,
  roleMoved: boolean,
): string | undefined {
  const need = needOf(at.starting, me, at.model);
  const had = needOf(at.ending, me, at.model);
  if (need.kind === "unpaired" || need.kind === "idle") return undefined;
  if (need.kind === "with" && had.kind === "with" && had.dancer === need.dancer) return undefined;
  // **A ring or a line names nobody**, so there is nothing a caller would be
  // telling you to look for, and saying where your two people are before every
  // circle is how a walkthrough ends up saying the same sentence sixty times.
  // The exception is a role that has just danced on its own: those dancers are
  // somewhere new and the ones who stood still are not.
  if (need.kind === "together" && !(roleMoved && had.kind === "with")) return undefined;

  const wanted =
    need.kind === "with" ? relationWordBetween(at.model, table, me, need.dancer) : undefined;
  const order = sentenceOrder(wanted);
  const sentences: string[] = [];
  for (const who of order) {
    const them =
      typeof who === "string" ? roleMate(at, me, who) : related(at.model, table, me, who);
    if (them === undefined) return undefined;
    const sentence = sayAbout(at, me, them, who);
    if (sentence === undefined) return undefined;
    sentences.push(sentence);
  }
  return sentences.length === 0 ? undefined : sentences.join(" ");
}

/** Whom to name, in which order: the dancer the next call needs comes first. */
function sentenceOrder(wanted: WhoWord | undefined): readonly WhoWord[] {
  if (wanted === undefined) return [NEIGHBOR, PARTNER];
  if (typeof wanted !== "string" && wanted.kind === "partner") return [PARTNER, NEIGHBOR];
  if (typeof wanted !== "string" && wanted.kind === "neighbor" && wanted.k === 1) {
    return [NEIGHBOR, PARTNER];
  }
  return [wanted];
}

/** The other dancer of my own role in the hands-four this hint is about. */
function roleMate(at: BoundarySnapshot, me: DancerId, role: RoleName): DancerId | undefined {
  for (const instance of at.starting) {
    if (instance.holdPlace) continue;
    const cast = Object.values(instance.cast);
    if (!cast.includes(me)) continue;
    const other = cast.find((dancer) => dancer !== me && at.model.dancers[dancer]?.role === role);
    if (other !== undefined) return other;
  }
  return undefined;
}

/** One "who is where" sentence, or nothing when the vocabulary cannot say it. */
function sayAbout(
  at: BoundarySnapshot,
  me: DancerId,
  them: DancerId,
  who: WhoWord,
): string | undefined {
  const here = placeOf(at.model, me);
  const there = placeOf(at.model, them);
  const words = relationWords(who, "prose");
  if (here === undefined || there === undefined || words === undefined) return undefined;
  return sayWhoIsWhere(relationTo(here, there, heldHand(at.model, me, them)), words);
}

/** Which of my hands `them` is in, when I am holding them at all (A19, Q11). */
function heldHand(model: SetModel, me: DancerId, them: DancerId): Side | undefined {
  const holds = model.dancers[me]?.holds ?? {};
  for (const [side, hold] of Object.entries(holds)) {
    if (hold?.with === them) return side as Side;
  }
  return undefined;
}

/** The library definition of that id, or `undefined` for the engine's own two. */
function definitionOf(id: string): FigureDefinition | undefined {
  return DATA_DEFINITIONS.find((def) => def.id === id);
}
