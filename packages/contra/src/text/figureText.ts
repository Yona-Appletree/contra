import type { AnyFigureDef, FigureParams, Group, StationId } from "@caller/choreo";
import { WALK_TO_STATION } from "@caller/choreo";
import { CONTRA_FIGURE_IDS, contraFigureOf } from "../figures/registry.js";
import { waitOut } from "../figures/wait-out.js";
import { DATA_DEFINITIONS, dataOnlyFigureIds } from "../library/figures/index.js";
import { localFigureTexts } from "../dances/danceFiles.js";
import { interpretDefinition } from "../library/interpret.js";
import { landmark } from "./landmark.js";

// Every figure's texts, as data. The same shape `data/dances/` has: plain JSON
// on disk, one file per figure, imported by name so a file that goes missing is
// a build error rather than a blank panel on the page.
import allemandeText from "../../../../data/figures/allemande.json" with { type: "json" };
import balanceAndSwingText from "../../../../data/figures/balance-and-swing.json" with { type: "json" };
import balanceRingText from "../../../../data/figures/balance-ring.json" with { type: "json" };
import balanceText from "../../../../data/figures/balance.json" with { type: "json" };
import californiaTwirlText from "../../../../data/figures/california-twirl.json" with { type: "json" };
import circleText from "../../../../data/figures/circle.json" with { type: "json" };
import doSiDoText from "../../../../data/figures/do-si-do.json" with { type: "json" };
import grandRightAndLeftText from "../../../../data/figures/grand-right-and-left.json" with { type: "json" };
import heyText from "../../../../data/figures/hey.json" with { type: "json" };
import longLinesText from "../../../../data/figures/long-lines.json" with { type: "json" };
import madRobinText from "../../../../data/figures/mad-robin.json" with { type: "json" };
import passThroughText from "../../../../data/figures/pass-through.json" with { type: "json" };
import petronellaText from "../../../../data/figures/petronella.json" with { type: "json" };
import pullByText from "../../../../data/figures/pull-by.json" with { type: "json" };
import rightAndLeftThroughText from "../../../../data/figures/right-and-left-through.json" with { type: "json" };
import robinsChainText from "../../../../data/figures/robins-chain.json" with { type: "json" };
import rollAwayText from "../../../../data/figures/roll-away.json" with { type: "json" };
import shoulderRoundText from "../../../../data/figures/shoulder-round.json" with { type: "json" };
import singleFilePromenadeText from "../../../../data/figures/single-file-promenade.json" with { type: "json" };
import slideLeftText from "../../../../data/figures/slide-left.json" with { type: "json" };
import starText from "../../../../data/figures/star.json" with { type: "json" };
import swingText from "../../../../data/figures/swing.json" with { type: "json" };
import waitOutText from "../../../../data/figures/wait-out.json" with { type: "json" };
import walkToStationText from "../../../../data/figures/walk-to-station.json" with { type: "json" };
import balanceWaveText from "../../../../data/figures/balance-wave.json" with { type: "json" };
import bendTheLineText from "../../../../data/figures/bend-the-line.json" with { type: "json" };
import castOffText from "../../../../data/figures/cast-off.json" with { type: "json" };
import circulateText from "../../../../data/figures/circulate.json" with { type: "json" };
import downTheHallText from "../../../../data/figures/down-the-hall.json" with { type: "json" };
import goDownOutsideText from "../../../../data/figures/go-down-outside.json" with { type: "json" };
import goUpOutsideText from "../../../../data/figures/go-up-outside.json" with { type: "json" };
import leadDownText from "../../../../data/figures/lead-down.json" with { type: "json" };
import leadUpText from "../../../../data/figures/lead-up.json" with { type: "json" };
import loopText from "../../../../data/figures/loop.json" with { type: "json" };
import castBackText from "../../../../data/figures/cast-back.json" with { type: "json" };
import promenadeText from "../../../../data/figures/promenade.json" with { type: "json" };
import balanceWaveOfFourText from "../../../../data/figures/balance-wave-of-four.json" with { type: "json" };
import turnAloneText from "../../../../data/figures/turn-alone.json" with { type: "json" };
import turnAsCouplesText from "../../../../data/figures/turn-as-couples.json" with { type: "json" };
import turnContraCornersText from "../../../../data/figures/turn-contra-corners.json" with { type: "json" };
import upTheHallText from "../../../../data/figures/up-the-hall.json" with { type: "json" };

/**
 * The four texts a move is written in, as data: what a caller says and what a
 * caller teaches, each short and long.
 *
 * The user, who calls: "the moves all have a lot of ai generated text
 * description. it feels very ai-generated. what we're going to want is a few
 * descriptions for each move, and we really want them not to sound like ai
 * slop." So the prose left the figure files and became
 * `data/figures/<id>.json` — hand-editable without a build, beside
 * `data/dances/` and under the same rules. This module is the loader.
 *
 * A text is a **template**, because the words depend on who is where: a do-si-do
 * with your neighbor and a do-si-do with your partner are not the same
 * sentence. `{pairs}`, `{hand}`, `{amount}` and the rest name the figure's own
 * parameters and are filled in per call. `{where}` is the one slot nobody
 * writes — {@link landmark} fills it from the engine's own end places, which is
 * how a sentence like "you should be across the set from your partner, next to
 * your neighbor" can be true of *this* dance rather than of figures in general.
 *
 * `FigureDef.describe` stays where it is as the fallback for anything with no
 * file; the next cleanup removes it.
 */

/** One move's four texts, with every slot still in place. */
export interface FigureTextFile {
  /** The figure id, which is also the file's name. */
  id: string;
  walkthrough: FigureWalkthrough;
  call: FigureCallText;
  /**
   * Prose for one parameter value, where a slot is not enough: a hey with the
   * larks starting is a different sentence, not the same sentence with one word
   * swapped.
   *
   * Keyed `"<param>=<value>"`, applied in the order they are written, each
   * overriding what came before. Any subset of the shape above, so a variant
   * that only changes the long call writes only that.
   */
  variants?: Record<string, PartialFigureText>;
}

/** What the dancers do, in a caller's words: the teach, short and long. */
export interface FigureWalkthrough {
  /** One or two sentences, under {@link SHORT_WORDS} words. */
  short: string;
  /** The full teach, under {@link LONG_WORDS} words, ending in `{where}`. */
  long: string;
}

/** What a caller says, in rhythm: the shorthand and the full first-time call. */
export interface FigureCallText {
  /** The words said in the rhythm of the dance: {@link SHORT_CALL_WORDS} at most. */
  short: string;
  /** The full call, under {@link LONG_CALL_WORDS} words. */
  long: string;
}

/** A variant's override: any subset of a file's texts. */
export interface PartialFigureText {
  walkthrough?: Partial<FigureWalkthrough>;
  call?: Partial<FigureCallText>;
}

/** One move's four texts, resolved against a call's own parameters. */
export interface FigureTexts {
  walkthrough: FigureWalkthrough;
  call: FigureCallText;
}

/** The word budgets the voice asks for; see `docs/move-texts.md`. */
export const SHORT_WORDS = 25;
/** @see SHORT_WORDS */
export const LONG_WORDS = 80;
/** @see SHORT_WORDS */
export const SHORT_CALL_WORDS = 4;
/** @see SHORT_WORDS */
export const LONG_CALL_WORDS = 9;

/** Every move's texts, by figure id. */
export const FIGURE_TEXTS: Readonly<Record<string, FigureTextFile>> = Object.fromEntries(
  (
    [
      allemandeText,
      balanceAndSwingText,
      balanceRingText,
      balanceText,
      californiaTwirlText,
      circleText,
      doSiDoText,
      grandRightAndLeftText,
      heyText,
      longLinesText,
      madRobinText,
      passThroughText,
      petronellaText,
      pullByText,
      rightAndLeftThroughText,
      robinsChainText,
      rollAwayText,
      shoulderRoundText,
      singleFilePromenadeText,
      slideLeftText,
      starText,
      swingText,
      waitOutText,
      walkToStationText,
      balanceWaveText,
      bendTheLineText,
      castOffText,
      circulateText,
      downTheHallText,
      goDownOutsideText,
      goUpOutsideText,
      leadDownText,
      leadUpText,
      loopText,
      turnAloneText,
      turnAsCouplesText,
      turnContraCornersText,
      upTheHallText,
      castBackText,
      promenadeText,
      balanceWaveOfFourText,
      // **A dance-local figure's texts are in its own dance file** (D10, M8),
      // beside the definition literal they belong to, so that promoting one is
      // still a copy of one thing rather than of two things in two directories.
      ...localFigureTexts(),
    ] as FigureTextFile[]
  ).map((file) => [file.id, file]),
);

/** Whether this figure's texts are written. */
export const hasFigureText = (id: string): boolean => FIGURE_TEXTS[id] !== undefined;

/**
 * One move's four texts, every slot filled in from this call's own parameters.
 *
 * `group` is only wanted by the `{where}` landmark, so a figure whose texts do
 * not use it resolves without one. A slot that cannot be filled throws, loudly
 * and by name: a `{slot}` still showing on the page is worse than a page that
 * refused to build.
 */
export function resolveFigureText(
  id: string,
  params: FigureParams,
  group?: Group,
): FigureTexts | undefined {
  const file = FIGURE_TEXTS[id];
  if (file === undefined) return undefined;
  const merged = mergeVariants(file, params);
  // Trimmed, because the landmark is a whole sentence at the end of a
  // walkthrough and a figure that has none leaves the space before it behind.
  const teach = (text: string): string =>
    capitalise(resolveSlots(id, text, params, "prose", group).trim());
  const shout = (text: string): string =>
    resolveSlots(id, text, params, "call", group).trim().toUpperCase();
  return {
    walkthrough: { short: teach(merged.walkthrough.short), long: teach(merged.walkthrough.long) },
    call: { short: shout(merged.call.short), long: shout(merged.call.long) },
  };
}

/**
 * Just the two calls, for the places that want the caller's words and nothing
 * else: the dance card's figure line, a programme, a printed card.
 *
 * No `group`, because no call says `{where}` — the landmark is a teach, not
 * something anybody shouts over a band. That is what makes this the cheap one,
 * and the one a card can call for every figure of every dance.
 */
export function resolveFigureCall(id: string, params: FigureParams): FigureCallText | undefined {
  const file = FIGURE_TEXTS[id];
  if (file === undefined) return undefined;
  const merged = mergeVariants(file, params);
  const shout = (text: string): string =>
    resolveSlots(id, text, params, "call", undefined).toUpperCase();
  return { short: shout(merged.call.short), long: shout(merged.call.long) };
}

/**
 * A walkthrough's first letter, capitalised.
 *
 * A template may open on a slot — `"{chains} take right hands in the middle"` —
 * and the slot's words are written in the case they take in the middle of a
 * sentence, because that is where most of them land. One rule here beats a
 * capital in the vocabulary and a lowercase exception everywhere else.
 */
const capitalise = (text: string): string => text.slice(0, 1).toUpperCase() + text.slice(1);

/** The file's own texts with every variant this call matches applied over them. */
export function mergeVariants(file: FigureTextFile, params: FigureParams): FigureTexts {
  let out: FigureTexts = { walkthrough: { ...file.walkthrough }, call: { ...file.call } };
  for (const [key, override] of Object.entries(file.variants ?? {})) {
    if (!variantMatches(key, params)) continue;
    out = {
      walkthrough: { ...out.walkthrough, ...override.walkthrough },
      call: { ...out.call, ...override.call },
    };
  }
  return out;
}

/** Whether a `"<param>=<value>"` key describes this call. */
export function variantMatches(key: string, params: FigureParams): boolean {
  const at = key.indexOf("=");
  if (at < 0) return false;
  const held = paramsOf(params)[key.slice(0, at)];
  return held !== undefined && variantValue(held) === key.slice(at + 1);
}

/** How a parameter value is written on the left of a variant key. */
export function variantValue(value: unknown): string {
  return pairingName(value) ?? String(value);
}

/** Which register a slot is written in: a call shouts, a walkthrough teaches. */
export type Register = "call" | "prose";

/** `{slot}`, and nothing else: the whole of the template language. */
const SLOT = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

/** Every slot name this text uses, in the order it uses them. */
export function slotsIn(text: string): string[] {
  return [...text.matchAll(SLOT)].map((m) => m[1]!);
}

/** One text with every slot filled in. */
function resolveSlots(
  id: string,
  text: string,
  params: FigureParams,
  register: Register,
  group: Group | undefined,
): string {
  return text.replace(SLOT, (_whole, name: string) => {
    const filled = slotText(id, name, params, register, group);
    if (filled === undefined) {
      throw new Error(
        `${id}: nothing to put in "{${name}}" — ` +
          `the call has no such parameter, or its value has no words`,
      );
    }
    return filled;
  });
}

/** The one slot nobody writes: the landmark, generated from the end places. */
export const WHERE = "where";

/** A call's parameters as the plain bag a slot name looks a value up in. */
const paramsOf = (params: FigureParams): Record<string, unknown> =>
  params as unknown as Record<string, unknown>;

/** What one slot resolves to, or `undefined` when nothing can fill it. */
function slotText(
  id: string,
  name: string,
  params: FigureParams,
  register: Register,
  group: Group | undefined,
): string | undefined {
  if (name === WHERE) return whereText(id, params, group);
  const held = paramsOf(params)[name];
  return held === undefined ? undefined : renderSlot(name, held, register);
}

/**
 * The landmark, with the three ways it can be asked for and fail named apart.
 *
 * Two of them are misuse and throw: no group at all, and a group that is not a
 * minor set of four, because `landmark` is written in terms of home, partner
 * and neighbour and has nothing to say outside one.
 *
 * The third is not misuse and says **nothing**: a figure whose ends no caller
 * would describe in one sentence. `landmark` is already built to stand down
 * rather than invent one — "anything finer than by role is not a sentence a
 * caller says" — and the Moves gallery really can put a figure in such a
 * position, because it runs every figure three times over from the formation's
 * own stations whether or not a dance ever hands it over there. A becket
 * neighbour swing from the stations is the case: the two of them start across
 * the set from each other, so they end 32 px apart on their own two places,
 * which is a true answer and not a sentence. The landmark is the last sentence
 * of a walkthrough, so leaving it out leaves a walkthrough; a `{slot}` showing
 * on the page, which is what the loud rule exists to prevent, still cannot
 * happen.
 */
function whereText(id: string, params: FigureParams, group: Group | undefined): string {
  if (group === undefined) {
    throw new Error(`${id}: "{${WHERE}}" needs a group to say where the figure leaves people`);
  }
  if (group.stations.length !== 4) {
    throw new Error(
      `${id}: no landmark for a group of ${String(group.stations.length)} — ` +
        `a figure danced outside a minor set of four must not use "{${WHERE}}"`,
    );
  }
  const def = figureDefOf(id);
  if (def === undefined) throw new Error(`${id}: no figure of that id, so no landmark`);
  return landmark(def, params, group) ?? "";
}

/** The figure a text belongs to, the two engine-supplied ones included. */
export function figureDefOf(id: string): AnyFigureDef | undefined {
  if (id === waitOut.id) return waitOut as AnyFigureDef;
  if (id === WALK_TO_STATION.id) return WALK_TO_STATION as AnyFigureDef;
  const coded = contraFigureOf(id) as AnyFigureDef | undefined;
  if (coded) return coded;
  // **A figure that is data with no coded twin** (M6's `pull-by`): its
  // parameters, its beats and its call text live on the `FigureDefinition`, and
  // the interpreter is what turns those into the `AnyFigureDef` a text is
  // checked and resolved against.
  const definition = DATA_DEFINITIONS.find((def) => def.id === id);
  return definition === undefined
    ? undefined
    : (interpretDefinition(definition) as unknown as AnyFigureDef);
}

/**
 * Every parameter a text may name, and the words it turns into.
 *
 * A slot is only as good as its vocabulary, and this one is small on purpose:
 * these are the parameters that change what a caller *says*. A parameter
 * measured in pixels or beats has no words and cannot be a slot, which
 * {@link checkFigureTexts} catches at load rather than the page discovering it.
 *
 * Two registers, because a call and a teach are different English. A caller
 * says "NEIGHBOR SWING" and teaches "swing your neighbor"; writing both out of
 * one slot is what keeps the dance card and the walkthrough from drifting.
 */
const SLOTS: Record<string, (value: unknown, register: Register) => string | undefined> = {
  pairs: pairingWords,
  couples: pairingWords,
  hand: sideWords,
  amount: amountWords,
  places: placesWords,
  direction: directionWords,
  chains: roleWords,
  roller: rollerWords,
  hold: holdWords,
  start: startWords,
};

/** Every slot name a text is allowed to use, `{where}` included. */
export const SLOT_NAMES: readonly string[] = [WHERE, ...Object.keys(SLOTS)];

/** One parameter value, in the words this register uses for it. */
export function renderSlot(name: string, value: unknown, register: Register): string | undefined {
  return SLOTS[name]?.(value, register);
}

/** `"partners"`, `"neighbors"`, or the two robins or the two larks written out. */
export function pairingName(value: unknown): string | undefined {
  if (value === "partners" || value === "neighbors") return value;
  if (!Array.isArray(value)) return undefined;
  const ids = (value.flat() as unknown[]).filter((x): x is StationId => typeof x === "string");
  if (ids.length !== 2) return undefined;
  const ends = ids
    .map((s) => s.slice(-1))
    .sort()
    .join("");
  if (ends === "RR") return "robins";
  if (ends === "LL") return "larks";
  return undefined;
}

function pairingWords(value: unknown, register: Register): string | undefined {
  const name = pairingName(value);
  if (name === undefined) return undefined;
  const words: Record<string, { call: string; prose: string }> = {
    partners: { call: "partner", prose: "your partner" },
    neighbors: { call: "neighbor", prose: "your neighbor" },
    robins: { call: "robins", prose: "the other robin" },
    larks: { call: "larks", prose: "the other lark" },
  };
  return words[name]?.[register];
}

function sideWords(value: unknown): string | undefined {
  return value === "R" ? "right" : value === "L" ? "left" : undefined;
}

/** How far round a turn for two goes. */
function amountWords(value: unknown, register: Register): string | undefined {
  return typeof value === "number" ? AMOUNTS[value]?.[register] : undefined;
}

const AMOUNTS: Record<number, { call: string; prose: string }> = {
  // A quarter and three quarters since M5: a single file promenade is a
  // fraction of the ring rather than a count of places, and the corpus asks for
  // both.
  0.25: { call: "a quarter", prose: "a quarter of the way round" },
  0.5: { call: "half way", prose: "half way round" },
  0.75: { call: "three quarters", prose: "three quarters of the way round" },
  1: { call: "once", prose: "once around" },
  1.5: { call: "one and a half", prose: "once and a half" },
  2: { call: "twice", prose: "twice around" },
};

/** How many quarters of a ring a figure travels round. */
function placesWords(value: unknown, register: Register): string | undefined {
  return typeof value === "number" ? PLACES[value]?.[register] : undefined;
}

const PLACES: Record<number, { call: string; prose: string }> = {
  1: { call: "one place", prose: "one place" },
  2: { call: "half way", prose: "half way round" },
  3: { call: "three quarters", prose: "three places" },
  4: { call: "once", prose: "all the way round" },
};

/** Which way a figure travels: a word, or the `1`/`-1` a figure counts in. */
function directionWords(value: unknown): string | undefined {
  if (value === 1) return "left";
  if (value === -1) return "right";
  // `clockwise` and `counterclockwise` since M5: a mad robin and a single file
  // promenade are the first figures whose direction is a way round rather than
  // a hand, and a caller says the whole word.
  const words = ["left", "right", "across", "along", "clockwise", "counterclockwise"];
  return typeof value === "string" && words.includes(value) ? value : undefined;
}

/** A role, as the two dancers of it: the pair who chain across. */
function roleWords(value: unknown, register: Register): string | undefined {
  if (value !== "lark" && value !== "robin") return undefined;
  return register === "call" ? `${value}s` : `the ${value}s`;
}

/** A role, as the one dancer of it who does the thing: the roller. */
function rollerWords(value: unknown, register: Register): string | undefined {
  if (value !== "lark" && value !== "robin") return undefined;
  return register === "call" ? `${value}s` : `the ${value}`;
}

/** What the dancers have hold of. */
function holdWords(value: unknown): string | undefined {
  const words: Record<string, string> = {
    two: "both hands",
    one: "one hand",
    ring: "hands round the ring",
    none: "no hands",
    wrist: "a wrist hold",
    "hands-across": "hands across",
  };
  return typeof value === "string" ? words[value] : undefined;
}

/**
 * Which role steps off into the middle of a hey.
 *
 * Two words where there used to be one: M5 split the coded hey's
 * `start: "robins-right"` into the role that starts and the shoulder it starts
 * by, because `robins-left` and `larks-right` are heys a caller can ask for and
 * the coded pair of words could not say either (D4's two tiers — `start` and
 * `by` are both a caller's own vocabulary).
 */
function startWords(value: unknown, register: Register): string | undefined {
  if (value !== "lark" && value !== "robin") return undefined;
  return register === "call" ? `${value}s` : `the ${value}s`;
}

/**
 * What is wrong with the texts on disk, one line per fault, empty when nothing
 * is.
 *
 * Every figure the registry holds has a file; every file has all four texts and
 * an `id` that is its own key; every slot in every text — the base texts and
 * every variant's — names either `{where}` or a parameter the figure declares
 * *and* the vocabulary above has words for; every variant key names a declared
 * parameter too. That is the whole contract, and it is checked at load, because
 * the alternative is a `{pairs}` printed on the Moves page.
 */
export function checkFigureTexts(): string[] {
  const faults: string[] = [];
  const ids = [...CONTRA_FIGURE_IDS, ...dataOnlyFigureIds(), waitOut.id, WALK_TO_STATION.id];
  for (const id of ids) {
    if (!hasFigureText(id)) faults.push(`${id}: no data/figures/${id}.json`);
  }
  for (const [key, file] of Object.entries(FIGURE_TEXTS)) {
    if (file.id !== key) faults.push(`${key}: the file inside says its id is "${file.id}"`);
    const def = figureDefOf(file.id);
    if (def === undefined) {
      faults.push(`${file.id}: a text file for a figure the registry does not hold`);
      continue;
    }
    const declared = new Set(Object.keys(def.defaults));
    for (const [where, texts] of textsOf(file)) {
      for (const [field, text] of Object.entries(texts)) {
        if (typeof text !== "string" || text.trim() === "") {
          faults.push(`${file.id} ${where}.${field}: empty`);
          continue;
        }
        for (const slot of slotsIn(text)) {
          if (slot === WHERE) continue;
          if (!declared.has(slot)) {
            faults.push(
              `${file.id} ${where}.${field}: "{${slot}}" is not a parameter of ${file.id}`,
            );
          } else if (!SLOT_NAMES.includes(slot)) {
            faults.push(`${file.id} ${where}.${field}: "{${slot}}" has no words (see SLOTS)`);
          }
        }
      }
    }
    for (const key2 of Object.keys(file.variants ?? {})) {
      const name = key2.slice(0, Math.max(0, key2.indexOf("=")));
      if (name === "" || !declared.has(name)) {
        faults.push(`${file.id} variant "${key2}": ${file.id} has no parameter "${name}"`);
      }
    }
  }
  return faults;
}

/** Every text in a file, base and variants, labelled by where it came from. */
export function textsOf(file: FigureTextFile): Array<[string, Record<string, unknown>]> {
  const out: Array<[string, Record<string, unknown>]> = [
    ["walkthrough", { ...file.walkthrough }],
    ["call", { ...file.call }],
  ];
  for (const [key, override] of Object.entries(file.variants ?? {})) {
    if (override.walkthrough) out.push([`${key} walkthrough`, { ...override.walkthrough }]);
    if (override.call) out.push([`${key} call`, { ...override.call }]);
  }
  return out;
}

const FAULTS = checkFigureTexts();
if (FAULTS.length > 0) {
  throw new Error(`data/figures is not loadable:\n  ${FAULTS.join("\n  ")}`);
}
