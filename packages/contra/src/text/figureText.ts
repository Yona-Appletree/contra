import type { Beat } from "@caller/core";
import type { AnyFigureDef, RoleName } from "@caller/choreo";
import { WALK_TO_STATION } from "@caller/choreo";
import { contraFigureOf } from "../figures/registry.js";
import { waitOut } from "../figures/wait-out.js";
import type { FigureDefinition } from "../library/FigureDefinition.js";
import { DATA_DEFINITIONS } from "../library/figures/index.js";
import { localFigureTexts } from "../dances/danceFiles.js";
import { interpretDefinition, paramDefaults } from "../library/interpret.js";
import type { Register, WhoWord } from "./relationWords.js";
import { relationWords, whoOf } from "./relationWords.js";

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
import jerseyTwirlText from "../../../../data/figures/jersey-twirl.json" with { type: "json" };
import squareThroughText from "../../../../data/figures/square-through.json" with { type: "json" };
import interruptedSquareThroughText from "../../../../data/figures/interrupted-square-through.json" with { type: "json" };

/**
 * **The seven texts a figure is written in, as data** (M13): what a figure *is*
 * in the third person, what a dancer does in one sentence and in a whole teach,
 * and what a caller says over the band at three lengths.
 *
 * The user, who calls: "the moves all have a lot of ai generated text
 * description. it feels very ai-generated. what we're going to want is a few
 * descriptions for each move, and we really want them not to sound like ai
 * slop." So the prose left the figure files and became `data/figures/<id>.json`
 * — hand-editable without a build, beside `data/dances/` and under the same
 * rules. This module is the loader, and `docs/move-texts.md` is the voice.
 *
 * A text is a **template**, because the words depend on who is where: a do-si-do
 * with your neighbor and a do-si-do with your partner are not the same sentence.
 * The slots name the **shorthand parameters the definition declares**
 * (`{hand}`, `{amount}`, `{places}`) plus the two the call carries rather than
 * the figure — `{who}`, the dancer this call names, and `{to}`, the dancer a
 * chain lands you with — both rendered by one relation word table
 * (`relationWords.ts`).
 *
 * **Where a figure leaves you is not written here at all** (D22, M13's A3).
 * W1's `{where}` slot is gone: the ending hint is generated at the *seam*, from
 * the planner's own honest ends, and rendered beside the text rather than baked
 * into it, because the same circle left three places leaves you somewhere
 * different in every dance.
 */

/** Which of the two levels a figure's entry opens at in a dance walkthrough. */
export type TextLevel = "name" | "line";

/** One figure's texts, with every slot still in place: the file on disk. */
export interface FigureTextFile {
  /** The figure id, which is also the file's name. */
  id: string;
  /** What the figure is, in the third person: the Moves page's own line. */
  description: string;
  /** Whether a dance walkthrough opens this figure's entry on its name or its line. */
  defaultLevel: TextLevel;
  walkthrough: FigureWalkthrough;
  /** The caller's words, keyed by how many beats the form takes to say. */
  call: Record<string, string>;
  /**
   * Prose for one parameter value, where a slot is not enough: a hey with the
   * larks starting is a different sentence, not the same sentence with one word
   * swapped.
   *
   * Keyed `"<param>=<value>"` on a **shorthand** name the definition declares,
   * or on `who` / `to`; applied in the order they are written, each overriding
   * what came before. Any subset of the shape above, so a variant that only
   * changes one call form writes only that form.
   */
  variants?: Record<string, PartialFigureText>;
}

/** What the dancers do, in a caller's words: the line, and the full teach. */
export interface FigureWalkthrough {
  /** The mechanics, one sentence, under {@link LINE_WORDS} words. */
  line: string;
  /** The full teach, under {@link TEACH_WORDS} words. */
  teach: string;
}

/** A variant's override: any subset of a file's texts. */
export interface PartialFigureText {
  description?: string;
  defaultLevel?: TextLevel;
  walkthrough?: Partial<FigureWalkthrough>;
  call?: Record<string, string>;
}

/** One form of a call: the words, and how many beats they take to say. */
export interface CallForm {
  beats: Beat;
  text: string;
}

/** One figure's texts, resolved against a call's own parameters. */
export interface FigureTexts {
  description: string;
  defaultLevel: TextLevel;
  walkthrough: FigureWalkthrough;
  /** Longest first. */
  forms: readonly CallForm[];
}

/**
 * What a call carries that its figure's parameters do not.
 *
 * `who` is the dancer this call names — read off the call's own pairing
 * parameter, or its role selector, and handed in by whoever is resolving. `to`
 * is the dancer a chain lands you with, which no definition declares and P2's
 * `toOf` derives from the resolution.
 */
export interface TextSlots {
  who?: WhoWord;
  to?: WhoWord;
}

/** The word budgets the voice asks for; see `docs/move-texts.md` §9. */
export const LINE_WORDS = 25;
/** @see LINE_WORDS */
export const TEACH_WORDS = 80;
/** @see LINE_WORDS */
export const DESCRIPTION_WORDS = 20;
/** @see LINE_WORDS */
export const FORM_WORDS = 9;
/** @see LINE_WORDS */
export const SHORT_FORM_WORDS = 2;

/** The three lengths every file writes, longest first. */
export const REQUIRED_FORM_BEATS: readonly Beat[] = [4, 2, 1];

/** Every figure's texts, by figure id. */
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
      jerseyTwirlText,
      squareThroughText,
      interruptedSquareThroughText,
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
 * **Every id that must have a file**: the library's definitions, and the two
 * figures the engine supplies.
 *
 * The library rather than `CONTRA_FIGURE_IDS` (M13's A16): after the figure
 * model a figure *is* a `FigureDefinition`, and the coded registry is a list of
 * things that still draw. `wait-out` and `walk-to-station` are neither — they
 * are `@caller/choreo`'s own, emitted by the planner rather than called by a
 * record — and they still say something on the Moves page, so they keep files.
 */
export const textedFigureIds = (): readonly string[] => [
  ...DATA_DEFINITIONS.map((def) => def.id),
  waitOut.id,
  WALK_TO_STATION.id,
];

/**
 * One figure's texts, every slot filled in from this call's own parameters.
 *
 * `params` are the call's **shorthand** parameters; whatever the call leaves
 * out is taken from the definition's own defaults, so a figure nobody has
 * called still resolves. A slot that cannot be filled throws, loudly and by
 * name: a `{slot}` still showing on the page is worse than a page that refused
 * to build.
 */
export function resolveFigureText(
  id: string,
  params: Record<string, unknown>,
  slots: TextSlots = {},
): FigureTexts | undefined {
  const file = FIGURE_TEXTS[id];
  if (file === undefined) return undefined;
  const full = withFigureDefaults(id, params);
  const merged = mergeVariants(file, full, slots);
  const teach = (text: string): string => capitalise(fill(id, text, full, slots, "prose").trim());
  return {
    description: merged.description,
    defaultLevel: merged.defaultLevel,
    walkthrough: { line: teach(merged.walkthrough.line), teach: teach(merged.walkthrough.teach) },
    forms: formsOf(id, merged.call, full, slots),
  };
}

/**
 * Just the call forms, for the places that want the caller's words and nothing
 * else: the note card, the calling card, the bubble.
 *
 * Longest first, which is the order the card's fitting rule reads them in.
 */
export function resolveFigureForms(
  id: string,
  params: Record<string, unknown>,
  slots: TextSlots = {},
): readonly CallForm[] | undefined {
  const file = FIGURE_TEXTS[id];
  if (file === undefined) return undefined;
  const full = withFigureDefaults(id, params);
  return formsOf(id, mergeVariants(file, full, slots).call, full, slots);
}

/** The longest form that fits in `beats`, or the shortest there is. */
export function formFor(forms: readonly CallForm[], beats: Beat): CallForm | undefined {
  if (forms.length === 0) return undefined;
  return forms.find((form) => form.beats <= beats) ?? forms[forms.length - 1];
}

/** The call's own parameters over the definition's defaults. */
function withFigureDefaults(id: string, params: Record<string, unknown>): Record<string, unknown> {
  return { ...defaultsOf(id), ...params };
}

/** A definition's own shorthand defaults, or nothing for the engine's two. */
function defaultsOf(id: string): Record<string, unknown> {
  const def = DATA_DEFINITIONS.find((each) => each.id === id);
  return def === undefined ? {} : { ...paramDefaults(def) };
}

/** Every call form of a merged file, resolved, longest first. */
function formsOf(
  id: string,
  call: Record<string, string>,
  params: Record<string, unknown>,
  slots: TextSlots,
): readonly CallForm[] {
  return Object.entries(call)
    .map(([key, text]) => ({
      beats: Number(key),
      text: fill(id, text, params, slots, "call").trim().toUpperCase(),
    }))
    .sort((a, b) => b.beats - a.beats);
}

/**
 * A walkthrough's first letter, capitalised.
 *
 * A template may open on a slot — `"{who} take right hands in the middle"` —
 * and the slot's words are written in the case they take in the middle of a
 * sentence, because that is where most of them land. One rule here beats a
 * capital in the vocabulary and a lowercase exception everywhere else.
 */
const capitalise = (text: string): string => text.slice(0, 1).toUpperCase() + text.slice(1);

/** The file's own texts with every variant this call matches applied over them. */
export function mergeVariants(
  file: FigureTextFile,
  params: Record<string, unknown>,
  slots: TextSlots = {},
): Omit<FigureTextFile, "id" | "variants"> {
  let out: Omit<FigureTextFile, "id" | "variants"> = {
    description: file.description,
    defaultLevel: file.defaultLevel,
    walkthrough: { ...file.walkthrough },
    call: { ...file.call },
  };
  for (const [key, override] of Object.entries(file.variants ?? {})) {
    if (!variantMatches(key, params, slots)) continue;
    out = {
      description: override.description ?? out.description,
      defaultLevel: override.defaultLevel ?? out.defaultLevel,
      walkthrough: { ...out.walkthrough, ...override.walkthrough },
      call: { ...out.call, ...override.call },
    };
  }
  return out;
}

/** Whether a `"<param>=<value>"` key describes this call. */
export function variantMatches(
  key: string,
  params: Record<string, unknown>,
  slots: TextSlots = {},
): boolean {
  const at = key.indexOf("=");
  if (at < 0) return false;
  const name = key.slice(0, at);
  const want = key.slice(at + 1);
  if (name === "who" || name === "to") {
    const who = name === "who" ? whoSlot(params, slots) : slots.to;
    return who !== undefined && whoValue(who) === want;
  }
  const held = params[name];
  return held !== undefined && variantValue(held) === want;
}

/** How a parameter value is written on the left of a variant key. */
export function variantValue(value: unknown): string {
  const who = Array.isArray(value) ? whoOf(value) : undefined;
  return who === undefined ? String(value) : whoValue(who);
}

/** How a `who` is written on the right of a variant key: `who=robins`, `who=partner`. */
function whoValue(who: WhoWord): string {
  return typeof who === "string" ? `${who}s` : whoWordKey(who);
}

/** A relation's own record spelling; `relationWords.ts` owns the inverse. */
function whoWordKey(who: Exclude<WhoWord, RoleName>): string {
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

export type { Register };

/** `{slot}`, and nothing else: the whole of the template language. */
const SLOT = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

/** Every slot name this text uses, in the order it uses them. */
export function slotsIn(text: string): string[] {
  return [...text.matchAll(SLOT)].map((m) => m[1]!);
}

/** One text with every slot filled in. */
function fill(
  id: string,
  text: string,
  params: Record<string, unknown>,
  slots: TextSlots,
  register: Register,
): string {
  return text.replace(SLOT, (_whole, name: string) => {
    const filled = slotText(name, params, slots, register);
    if (filled === undefined) {
      throw new Error(
        `${id}: nothing to put in "{${name}}" — ` +
          `the call has no such parameter, or its value has no words`,
      );
    }
    return filled;
  });
}

/** What one slot resolves to, or `undefined` when nothing can fill it. */
function slotText(
  name: string,
  params: Record<string, unknown>,
  slots: TextSlots,
  register: Register,
): string | undefined {
  if (name === "who") {
    const who = whoSlot(params, slots);
    return who === undefined ? undefined : relationWords(who, register);
  }
  if (name === "to") {
    return slots.to === undefined ? undefined : relationWords(slots.to, register);
  }
  const held = params[name];
  return held === undefined ? undefined : renderSlot(name, held, register);
}

/**
 * Who this call names: what the caller of the text layer supplied, else the
 * call's own pairing parameter.
 *
 * The definitions name the relation `pairs` (a balance, a swing, an allemande)
 * or `couples` (right and left through); the record writes it there, and `who`
 * on a `FigureCall` is the *actor selector*, which is a different question.
 * Reading both here is what lets one `{who}` slot serve every figure without
 * the files knowing which parameter their own definition happens to use.
 */
function whoSlot(params: Record<string, unknown>, slots: TextSlots): WhoWord | undefined {
  if (slots.who !== undefined) return slots.who;
  return whoOf(params["pairs"]) ?? whoOf(params["couples"]);
}

/**
 * **Who one call of a dance names**, for whoever is about to resolve its texts.
 *
 * Two places a record can say it, and both are ordinary: a figure that pairs
 * dancers up carries the relation in its own pairing parameter ("balance and
 * swing your neighbor"), and a figure each dancer does alone carries it in the
 * call's actor selector ("robins loop right"). A selector that names a *place*
 * rather than a person — `"ones"`, `"twos"`, a list of stations — names nobody
 * this vocabulary can say, and answers `undefined`, which is what makes the
 * dance's own flourish the right text for those calls.
 */
export function callWho(call: { who?: unknown; params?: object }): WhoWord | undefined {
  const params = (call.params ?? {}) as Record<string, unknown>;
  return whoOf(params["pairs"]) ?? whoOf(params["couples"]) ?? whoOf(call.who);
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
 * one slot is what keeps the calling card and the walkthrough from drifting.
 */
const SLOTS: Record<string, (value: unknown, register: Register) => string | undefined> = {
  hand: sideWords,
  firstHand: sideWords,
  secondHand: sideWords,
  by: sideWords,
  amount: amountWords,
  places: placesWords,
  direction: directionWords,
  hold: holdWords,
  for: countWords,
  chains: roleGroupWords,
  start: roleGroupWords,
  centre: roleGroupWords,
  facesIn: roleGroupWords,
  roller: roleOneWords,
  leadRole: roleOneWords,
  firstPass: pairingWords,
  secondPass: pairingWords,
  balanceWith: pairingWords,
};

/** Every slot name a text is allowed to use. */
export const SLOT_NAMES: readonly string[] = ["who", "to", ...Object.keys(SLOTS)];

/**
 * The two slot names W1 wrote that M13 retired.
 *
 * `{pairs}` and `{couples}` named the *parameter* a figure happened to pair on;
 * `{who}` names the dancer, whichever parameter carried them. A file that still
 * writes the old names fails at load by name rather than resolving to something
 * that looks right in one figure and wrong in the next.
 */
export const RETIRED_SLOTS: readonly string[] = ["where", "pairs", "couples"];

/** One parameter value, in the words this register uses for it. */
export function renderSlot(name: string, value: unknown, register: Register): string | undefined {
  return SLOTS[name]?.(value, register);
}

function sideWords(value: unknown): string | undefined {
  if (value === "R" || value === "right") return "right";
  if (value === "L" || value === "left") return "left";
  return undefined;
}

/** How far round a turn for two goes, or how far round a ring a walk travels. */
function amountWords(value: unknown, register: Register): string | undefined {
  if (typeof value !== "number") return undefined;
  for (const [amount, words] of AMOUNTS) {
    if (Math.abs(amount - value) < 1e-6) return words[register];
  }
  return undefined;
}

/**
 * The amounts the corpus writes, in the user's own words.
 *
 * "Once and a half", never "one and a half" (the user, D15), in **both**
 * registers: a caller says the same words over the band as in the walkthrough,
 * and W1's call register said the encoder's number back.
 */
const AMOUNTS: ReadonlyArray<[number, { call: string; prose: string }]> = [
  [0.25, { call: "a quarter", prose: "a quarter of the way round" }],
  [1 / 3, { call: "a third", prose: "a third of the way round" }],
  [0.5, { call: "half way", prose: "half way round" }],
  [0.75, { call: "three quarters", prose: "three quarters of the way round" }],
  [0.875, { call: "seven eighths", prose: "seven eighths of the way round" }],
  [1, { call: "once", prose: "once around" }],
  [1.25, { call: "once and a quarter", prose: "once and a quarter" }],
  [1.5, { call: "once and a half", prose: "once and a half" }],
  [2, { call: "twice", prose: "twice around" }],
];

/** How many places round a ring a figure travels. */
function placesWords(value: unknown, register: Register): string | undefined {
  return typeof value === "number" ? PLACES[value]?.[register] : undefined;
}

/**
 * Places round a ring, where a place is a quarter of it (D17).
 *
 * "Circle left three places", never "three quarters" — the user's own word, and
 * the one change that makes the generated call and the hall's own call the same
 * sentence.
 */
const PLACES: Record<number, { call: string; prose: string }> = {
  1: { call: "one place", prose: "one place" },
  2: { call: "half way", prose: "half way round" },
  3: { call: "three places", prose: "three places" },
  4: { call: "once", prose: "all the way round" },
};

/** Which way a figure travels: a word, or the `1`/`-1` a figure counts in. */
function directionWords(value: unknown): string | undefined {
  if (value === 1) return "left";
  if (value === -1) return "right";
  const words = ["left", "right", "across", "along", "clockwise", "counterclockwise"];
  return typeof value === "string" && words.includes(value) ? value : undefined;
}

/** A role, as the two dancers of it: the pair who chain across. */
function roleGroupWords(value: unknown, register: Register): string | undefined {
  if (value !== "lark" && value !== "robin") return undefined;
  return register === "call" ? `${value}s` : `the ${value}s`;
}

/** A role, as the one dancer of it who does the thing: the roller. */
function roleOneWords(value: unknown, register: Register): string | undefined {
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

/** How many dance it: a hey for four, a hey for three. */
function countWords(value: unknown): string | undefined {
  const words: Record<number, string> = { 2: "two", 3: "three", 4: "four" };
  return typeof value === "number" ? words[value] : undefined;
}

/**
 * A pairing parameter other than the call's own `who`: a square through's two
 * hands, an interrupted square through's balance.
 *
 * Read through the same relation word table as `{who}`, so "partners" is "your
 * partner" wherever it is written.
 */
function pairingWords(value: unknown, register: Register): string | undefined {
  const who = whoOf(value);
  return who === undefined ? undefined : relationWords(who, register);
}

/** The figure a text belongs to, the two engine-supplied ones included. */
export function figureDefOf(id: string): AnyFigureDef | undefined {
  if (id === waitOut.id) return waitOut as AnyFigureDef;
  if (id === WALK_TO_STATION.id) return WALK_TO_STATION as AnyFigureDef;
  const coded = contraFigureOf(id) as AnyFigureDef | undefined;
  if (coded) return coded;
  // **A figure that is data with no coded twin**: its parameters, its beats and
  // its call text live on the `FigureDefinition`, and the interpreter is what
  // turns those into the `AnyFigureDef` a text is checked and resolved against.
  const definition = DATA_DEFINITIONS.find((def) => def.id === id);
  return definition === undefined
    ? undefined
    : (interpretDefinition(definition) as unknown as AnyFigureDef);
}

/** The library definition of that id, or `undefined` for the engine's two. */
export function definitionOf(id: string): FigureDefinition | undefined {
  return DATA_DEFINITIONS.find((def) => def.id === id);
}

/**
 * What is wrong with the texts on disk, one line per fault, empty when nothing
 * is.
 *
 * Every figure the **library** holds has a file; every file has all seven texts
 * and an `id` that is its own key; every call form is keyed by a count of beats
 * and the three the voice asks for are there; every slot in every text — the
 * base texts and every variant's — names `{who}`, `{to}`, or a shorthand
 * parameter the definition declares *and* the vocabulary above has words for;
 * every variant key names one of those too. That is the whole contract, and it
 * is checked at load, because the alternative is a `{pairs}` printed on the
 * Moves page.
 */
export function checkFigureTexts(): string[] {
  const faults: string[] = [];
  const ids = textedFigureIds();
  for (const id of ids) {
    if (!hasFigureText(id)) faults.push(`${id}: no data/figures/${id}.json`);
  }
  for (const [key, file] of Object.entries(FIGURE_TEXTS)) {
    if (file.id !== key) faults.push(`${key}: the file inside says its id is "${file.id}"`);
    if (!ids.includes(file.id)) {
      faults.push(`${file.id}: a text file for a figure the library does not hold`);
      continue;
    }
    const declared = new Set(Object.keys(paramsOfFigure(file.id)));
    if (typeof file.description !== "string" || file.description.trim() === "") {
      faults.push(`${file.id}: no description`);
    }
    if (file.defaultLevel !== "name" && file.defaultLevel !== "line") {
      faults.push(`${file.id}: defaultLevel is "${String(file.defaultLevel)}", not name or line`);
    }
    for (const beats of REQUIRED_FORM_BEATS) {
      if (file.call[String(beats)] === undefined) {
        faults.push(`${file.id}: no ${String(beats)}-beat call form`);
      }
    }
    for (const [where, texts] of textsOf(file)) {
      for (const [field, text] of Object.entries(texts)) {
        if (typeof text !== "string" || text.trim() === "") {
          faults.push(`${file.id} ${where}.${field}: empty`);
          continue;
        }
        if (where.endsWith("call") && !/^\d+$/.test(field)) {
          faults.push(`${file.id} ${where}: "${field}" is not a count of beats`);
        }
        for (const slot of slotsIn(text)) {
          if (RETIRED_SLOTS.includes(slot)) {
            faults.push(`${file.id} ${where}.${field}: "{${slot}}" is gone — write "{who}"`);
          } else if (slot === "who" || slot === "to") {
            continue;
          } else if (!declared.has(slot)) {
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
      if (name === "who" || name === "to") continue;
      if (name === "" || !declared.has(name)) {
        faults.push(`${file.id} variant "${key2}": ${file.id} has no parameter "${name}"`);
      }
    }
  }
  return faults;
}

/** Which shorthand parameters a figure declares, the engine's two included. */
function paramsOfFigure(id: string): Record<string, unknown> {
  const definition = definitionOf(id);
  if (definition !== undefined) return paramDefaults(definition);
  const def = figureDefOf(id);
  return def === undefined ? {} : ({ ...def.defaults } as Record<string, unknown>);
}

/** Every text in a file, base and variants, labelled by where it came from. */
export function textsOf(file: FigureTextFile): Array<[string, Record<string, unknown>]> {
  const out: Array<[string, Record<string, unknown>]> = [
    ["description", { description: file.description }],
    ["walkthrough", { ...file.walkthrough }],
    ["call", { ...file.call }],
  ];
  for (const [key, override] of Object.entries(file.variants ?? {})) {
    if (override.description !== undefined) {
      out.push([`${key} description`, { description: override.description }]);
    }
    if (override.walkthrough) out.push([`${key} walkthrough`, { ...override.walkthrough }]);
    if (override.call) out.push([`${key} call`, { ...override.call }]);
  }
  return out;
}

const FAULTS = checkFigureTexts();
if (FAULTS.length > 0) {
  throw new Error(`data/figures is not loadable:\n  ${FAULTS.join("\n  ")}`);
}
