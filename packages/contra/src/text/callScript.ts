import type { Beat } from "@caller/core";
import type { Dance, FigureCall, Formation, PhraseName } from "@caller/choreo";
import { callBeats, concurrentCalls, danceSchedule, spokenBeats } from "@caller/choreo";
import { formationById } from "../dances/formations.js";
import { danceBoundaries } from "../set/planCycle.js";
import type { CallForm, CallToken, CallTokenKind } from "./figureText.js";
import { callWho, resolveFigureForms } from "./figureText.js";
import type { WhoWord } from "./relationWords.js";
import { toOf } from "./seam.js";

/**
 * **The calling card, as a computation** (vision §3).
 *
 * What a caller says over the band is not a second text beside the walkthrough:
 * it is the same figure said at whatever length there is room for. How much room
 * there is comes from two numbers — the **window**, which is how many beats of
 * silence the call before this one leaves, and the **budget**, which is how much
 * a caller is still saying this many times through — and the longest form that
 * fits in both is what gets said.
 *
 * One function, three readers (AC3): the card's three columns, the Stage's note
 * card, and the caller's own bubble, which reaches it through the decider's
 * `callsFor` option. They agree because they are one function, not because
 * somebody kept three lists in step.
 */

/**
 * How many beats before a figure a caller starts saying it.
 *
 * **A text-layer constant, and a deviation from the plan's A22** (which expected
 * every definition to carry `lead: 4`): the merged library's short figures carry
 * `lead: 2` — a pull-by, a loop, a cast back, a bend the line, a turn as
 * couples, a turn alone. Those are the figures whose *own* call is two beats
 * long, so the number is about the figure's length rather than about how far
 * ahead a caller speaks, and the window is the latter. `callScript.test.ts`
 * pins the set of leads the library actually carries.
 */
export const LEAD_BEATS: Beat = 4;

/** How many beats of words a caller still spends per call, per time through. */
export interface CallPolicy {
  /** One per time through, 1-based; the last repeats for ever after. */
  budgets: readonly Beat[];
}

/**
 * The first time through gets the whole sentence, the next two get the middle
 * form, and after that a word (vision §3).
 */
export const DEFAULT_CALL_POLICY: CallPolicy = { budgets: [4, 2, 2, 1] };

export type { CallToken, CallTokenKind };

/** One thing the caller says, and when. */
export interface SpokenCall {
  /** The beat of the time through it is said before: the first covered call's start. */
  offset: Beat;
  /** The schedule indices it covers: one, or two when merged. */
  covers: readonly number[];
  text: string;
  tokens: readonly CallToken[];
  /** The register it is said in: how long a form this is, not how long it takes. */
  beats: Beat;
  /** How many beats of silence the call before this one left. */
  window: Beat;
  /**
   * The dance's own override of how long these words take to say, where it set
   * one and this utterance is one call.
   *
   * Left out — every call of every dance so far — the decider estimates from the
   * words themselves (C3's `spokenBeats`), which is also the only honest answer
   * for a merged call made of two dances' worth of words.
   */
  spokenBeats?: Beat;
}

/** One row of the calling card: one written call of the record. */
export interface CallingCardRow {
  phrase: PhraseName;
  /** Which pass of the record, from zero. */
  pass: number;
  index: number;
  figure: string;
  /** The figures of a concurrent call's branches, after the parent's. */
  branches?: readonly string[];
  beats: Beat;
  window: Beat;
  byTime: readonly CallingCardCell[];
}

/** One cell of one row: what the caller says for this call at one budget. */
export interface CallingCardCell {
  budget: Beat;
  text: string;
  tokens: readonly CallToken[];
  /** Set when this call's words were said as part of the row above's. */
  mergedInto?: number;
}

/**
 * What the caller says on time through `timeThrough` (1-based), in order.
 *
 * The decider's bubble is this list, keyed by beat offset (A23): a merged call
 * is one utterance covering two figures, and a concurrent call is one utterance
 * covering one.
 */
export function callScript(
  dance: Dance,
  timeThrough: number,
  policy: CallPolicy = DEFAULT_CALL_POLICY,
): readonly SpokenCall[] {
  return spokenAt(dance, budgetFor(policy, timeThrough));
}

/** How many beats of words this time through gets. */
export function budgetFor(policy: CallPolicy, timeThrough: number): Beat {
  const at = Math.max(1, Math.min(timeThrough, policy.budgets.length));
  return policy.budgets[at - 1]!;
}

/**
 * The whole card: one row per written call, one cell per distinct budget.
 *
 * The same function as {@link callScript} read the other way round — down the
 * record rather than along one time through — which is what makes the card and
 * the bubble one thing.
 */
export function callingCard(
  dance: Dance,
  policy: CallPolicy = DEFAULT_CALL_POLICY,
): readonly CallingCardRow[] {
  const schedule = danceSchedule(dance);
  const passes = passOf(dance);
  const budgets = [...new Set(policy.budgets)].sort((a, b) => b - a);
  const byBudget = budgets.map((budget) => ({ budget, said: spokenAt(dance, budget) }));

  return schedule.map(({ call, phrase }, index) => {
    const branches = (call.while ?? []).map((one) => one.figure);
    return {
      phrase,
      pass: passes[index]!,
      index,
      figure: call.figure,
      ...(branches.length === 0 ? {} : { branches }),
      beats: callBeats(call),
      window: windowsOf(dance)[index]!,
      byTime: byBudget.map(({ budget, said }) => cellFor(said, budget, index)),
    };
  });
}

/** One row's cell at one budget: its own words, or the row it was merged into. */
function cellFor(said: readonly SpokenCall[], budget: Beat, index: number): CallingCardCell {
  const spoken = said.find((one) => one.covers[0] === index);
  if (spoken !== undefined) {
    return { budget, text: spoken.text, tokens: spoken.tokens };
  }
  const swallowed = said.find((one) => one.covers.includes(index));
  return {
    budget,
    text: "",
    tokens: [],
    ...(swallowed === undefined ? {} : { mergedInto: swallowed.covers[0]! }),
  };
}

/**
 * **Each call's own words at one budget, unmerged**: the Stage's note card.
 *
 * A card is read, not heard, so it has a line per figure whether or not the
 * caller says two of them in one breath.
 */
export function callTexts(dance: Dance, budget: Beat, formation?: Formation): readonly CallForm[] {
  const forms = formsOf(dance, formation);
  return forms.map((choices) => fit(choices, budget) ?? EMPTY_FORM);
}

const EMPTY_FORM: CallForm = { beats: 0, text: "", tokens: [] };

/** One spoken call while it is still being built up. */
type Building = {
  -readonly [K in keyof SpokenCall]: K extends "covers" | "tokens"
    ? SpokenCall[K] extends readonly (infer T)[]
      ? T[]
      : SpokenCall[K]
    : SpokenCall[K];
};

/** What the caller says at one budget, in order, with the merges applied. */
function spokenAt(dance: Dance, budget: Beat, formation?: Formation): SpokenCall[] {
  const schedule = danceSchedule(dance);
  const forms = formsOf(dance, formation);
  const windows = windowsOf(dance);
  const firstOfPhrase = firstsOfPhrase(dance);

  const out: Building[] = [];
  for (const [index, { call, start }] of schedule.entries()) {
    const window = windows[index]!;
    const choices = forms[index]!;
    const last = out[out.length - 1];
    // **The merge** (Q9, A21): a call whose window is too short for a whole
    // sentence is said in the same breath as the one before it — "SHIFT LEFT,
    // CIRCLE LEFT THREE PLACES" — as long as the two are in the same phrase. A
    // zero-beat call leaves no window at all, so the call after it merges at
    // every budget.
    const merges =
      last !== undefined &&
      last.covers.includes(index - 1) &&
      !firstOfPhrase[index]! &&
      (window === 0 || (window < LEAD_BEATS && budget >= LEAD_BEATS));
    if (merges) {
      // The window is what forced the merge, so the second half of the breath
      // is chosen on the budget alone.
      const form = fit(choices, budget) ?? EMPTY_FORM;
      last.text = `${last.text}, ${form.text}`;
      // The comma rides on the last word of the first call, so that the tokens
      // still join back into the text a caller reads.
      const tail = last.tokens[last.tokens.length - 1];
      if (tail !== undefined) tail.text = `${tail.text},`;
      last.tokens.push(...form.tokens.map((token) => ({ ...token })));
      last.beats += form.beats;
      last.covers.push(index);
      delete last.spokenBeats;
      continue;
    }
    const form = fit(choices, Math.min(window, budget)) ?? EMPTY_FORM;
    out.push({
      offset: start,
      covers: [index],
      text: form.text,
      tokens: form.tokens.map((token) => ({ ...token })),
      beats: form.beats,
      window,
      ...(call.spokenBeats === undefined ? {} : { spokenBeats: call.spokenBeats }),
    });
  }
  return out;
}

/** The longest form that fits, or the shortest there is. */
const fit = (forms: readonly CallForm[], beats: Beat): CallForm | undefined =>
  forms.find((form) => form.beats <= beats) ?? forms[forms.length - 1];

/**
 * Every call's forms, longest first, with the dance's own flourish folded in.
 *
 * Three things happen here that do not happen in `resolveFigureText`:
 *
 * - a **concurrent** call's forms are the parent's and each branch's of the same
 *   length, joined by `WHILE` and their beats summed (A20), because a caller
 *   saying two things says both of them;
 * - a chain's `{to}` is supplied from the resolution (A18), so "ROBINS CHAIN TO
 *   YOUR PARTNER" is derived rather than written in the dance file;
 * - a dance's own `call` — a **flourish**, after this milestone — joins the list
 *   as a form of its own, as long as it takes to say, and wins whenever there is
 *   room for it.
 */
function formsOf(dance: Dance, formation?: Formation, withFlourish = true): CallForm[][] {
  const schedule = danceSchedule(dance);
  const targets = chainTargets(dance, formation);
  return schedule.map(({ call }, index) => {
    const branches = concurrentCalls(call);
    const each = branches.map((one) => resolvedForms(one, targets[index]));
    const joined = joinWhile(each);
    const flourish = withFlourish ? flourishForm(call) : undefined;
    return flourish === undefined
      ? joined
      : [flourish, ...joined].sort((a, b) => b.beats - a.beats);
  });
}

/** One call's own forms, or a single empty form when the texts cannot say it. */
function resolvedForms(call: FigureCall, to: WhoWord | undefined): readonly CallForm[] {
  try {
    const who = callWho(call);
    return (
      resolveFigureForms(
        call.figure,
        { ...(call.params ?? {}), beats: call.beats },
        { ...(who === undefined ? {} : { who }), ...(to === undefined ? {} : { to }) },
      ) ?? [{ beats: 1, text: call.figure.toUpperCase(), tokens: [] }]
    );
  } catch {
    return [{ beats: 1, text: call.figure.toUpperCase(), tokens: [] }];
  }
}

/** The parent's and each branch's forms of one length, joined by WHILE. */
function joinWhile(each: readonly (readonly CallForm[])[]): CallForm[] {
  const first = each[0] ?? [];
  if (each.length === 1) return [...first];
  return first.map((parent) => {
    let text = parent.text;
    let tokens: CallToken[] = [...parent.tokens];
    let beats = parent.beats;
    for (const branch of each.slice(1)) {
      const beside =
        branch.find((form) => form.beats === parent.beats) ?? branch[branch.length - 1];
      if (beside === undefined) continue;
      text = `${text} ${WHILE} ${beside.text}`;
      tokens = [...tokens, { kind: "what", text: WHILE }, ...beside.tokens];
      beats += beside.beats;
    }
    return { beats, text, tokens };
  });
}

/** The word a caller joins two calls danced at once with (A20). */
export const WHILE = "WHILE";

/**
 * The dance's own words for a call, as a form of its own.
 *
 * After this milestone a `call` in a dance file is a **flourish** and nothing
 * else — every call a figure's own forms can say has had its `call` deleted —
 * so it is the longest thing a caller could say here, and the fitting rule
 * decides whether there is room for it.
 */
function flourishForm(call: FigureCall): CallForm | undefined {
  if (call.call === undefined) return undefined;
  // **The 4-beat register, whatever the words weigh.** A flourish is what a
  // caller says when there is a whole sentence's room; how long it actually
  // takes to say is C3's estimate and is carried separately
  // ({@link SpokenCall.spokenBeats}, and the decider's own fallback).
  return {
    beats: Math.max(spokenBeats(call.call), LEAD_BEATS),
    text: call.call,
    tokens: classifyCall(call.call),
  };
}

/** `window(i)`: how many beats of silence the call before this one leaves. */
function windowsOf(dance: Dance): Beat[] {
  const schedule = danceSchedule(dance);
  return schedule.map((_entry, index) => {
    const before = schedule[(index - 1 + schedule.length) % schedule.length]!;
    return Math.min(LEAD_BEATS, callBeats(before.call));
  });
}

/** Whether each call of the schedule is the first of its own phrase. */
function firstsOfPhrase(dance: Dance): boolean[] {
  const out: boolean[] = [];
  for (const phrase of dance.phrases) {
    for (const [i] of phrase.figures.entries()) out.push(i === 0);
  }
  return out;
}

/** Which pass of the record each call of the schedule belongs to. */
function passOf(dance: Dance): number[] {
  const perPass = dance.phrases.length / (dance.passes ?? 1);
  const out: number[] = [];
  dance.phrases.forEach((phrase, index) => {
    for (let i = 0; i < phrase.figures.length; i++) out.push(Math.floor(index / perPass));
  });
  return out;
}

/**
 * The `{to}` of every call of the record, derived from the resolution (A18).
 *
 * `undefined` for every call that is not a chain, which is almost all of them,
 * and for a dance the planner cannot dance at all — a half-encoded lab dance —
 * where the forms fall back to what the texts can say without one.
 */
function chainTargets(dance: Dance, formation?: Formation): Array<WhoWord | undefined> {
  const schedule = danceSchedule(dance);
  try {
    const where = formation ?? formationById(dance.formation);
    const { reference, boundaries } = danceBoundaries(dance, where);
    return schedule.map((_entry, index) => {
      const at = boundaries.find((each) => each.index === index);
      return at === undefined ? undefined : toOf(at, reference);
    });
  } catch {
    return schedule.map(() => undefined);
  }
}

/**
 * **A flourish's parts, guessed from its words** (D26).
 *
 * A form knows its own kinds because it has a template; a dance's own line does
 * not, so the words are read against the small vocabulary a caller's line is
 * made of. Used for the flourishes and for a walkthrough heading, which may be
 * either.
 */
export function classifyCall(text: string): readonly CallToken[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const kinds = words.map((word) => WORD_KIND[word.replace(/[^A-Za-z-]/g, "").toUpperCase()]);
  // A joining word belongs to the part it joins, exactly as in a template.
  for (const [i, word] of words.entries()) {
    if (kinds[i] !== undefined) continue;
    if (!JOINING.has(word.toUpperCase())) continue;
    kinds[i] = kinds[i + 1] ?? kinds[i - 1];
  }
  const out: CallToken[] = [];
  for (const [i, word] of words.entries()) {
    const kind = kinds[i] ?? "what";
    const last = out[out.length - 1];
    if (last !== undefined && last.kind === kind) last.text = `${last.text} ${word}`;
    else out.push({ kind, text: word });
  }
  return out;
}

/**
 * **Whether two lines a caller could say are the same line**, allowing for the
 * encoder's own vocabulary and word order.
 *
 * What decides whether a dance file's `call` is a **flourish** — something no
 * figure's own forms can say, and therefore worth keeping — or the same call in
 * the corpus's words, which the record should stop repeating. The encoder writes
 * "ONE AND A HALF" where the user says "once and a half" and "THREE QUARTERS"
 * where the user says "three places" (D15, D17); it writes British spellings;
 * and it puts the person first or last as the transcript happened to. None of
 * those is a different call.
 */
export function saysTheSame(a: string, b: string): boolean {
  return sortedWords(a) === sortedWords(b);
}

/** One line's words, normalised to the user's vocabulary and sorted. */
function sortedWords(text: string): string {
  return text
    .toUpperCase()
    .replace(/\bONE AND A HALF\b/g, "ONCE AND A HALF")
    .replace(/\bALL THE WAY\b/g, "ONCE")
    .replace(/\bA HALF\b/g, "HALF WAY")
    .replace(/\bTHREE QUARTERS\b/g, "THREE PLACES")
    .replace(/\bLADIES\b/g, "ROBINS")
    .replace(/\bGENTS\b/g, "LARKS")
    .replace(/\bNEIGHBOUR(S?)\b/g, "NEIGHBOR$1")
    .replace(/\bCENTRE\b/g, "CENTER")
    .replace(/\b(YOUR|WITH)\b/g, "")
    .replace(/[^A-Z0-9 -]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * **The figure's own forms for one call of a record**, longest first, with the
 * dance's own flourish left out.
 *
 * What {@link saysTheSame} is asked about when deciding whether a `call` in a
 * dance file is a flourish at all: a call whose words any of these can say is
 * the corpus repeating what the figure already knows.
 */
export function formsFor(dance: Dance, index: number, formation?: Formation): readonly CallForm[] {
  return formsOf(dance, formation, false)[index] ?? [];
}

/** The tokens of a walkthrough heading, for the card that colours it (D26). */
export const headingTokens = (heading: string): readonly CallToken[] => classifyCall(heading);

/** The joining words a flourish uses, as a template uses them. */
const JOINING: ReadonlySet<string> = new Set(["WITH", "YOUR", "TO", "AND", "A"]);

/**
 * The words a caller's own line is made of, by part.
 *
 * Deliberately short: anything not here is what the figure is, which is the
 * right default — "PETRONELLA", "SASHAY", "CHAIN" are all the figure's own name.
 */
const WORD_KIND: Readonly<Record<string, CallTokenKind>> = {
  PARTNER: "who",
  PARTNERS: "who",
  NEIGHBOR: "who",
  NEIGHBOUR: "who",
  NEIGHBORS: "who",
  NEIGHBOURS: "who",
  SHADOW: "who",
  OPPOSITE: "who",
  ROBIN: "who",
  ROBINS: "who",
  LARK: "who",
  LARKS: "who",
  ONES: "who",
  TWOS: "who",
  ACTIVES: "who",
  EVERYBODY: "who",
  NUMBER: "who",
  LEFT: "way",
  RIGHT: "way",
  ACROSS: "way",
  ALONG: "way",
  UP: "way",
  DOWN: "way",
  CLOCKWISE: "way",
  COUNTERCLOCKWISE: "way",
  DIAGONAL: "way",
  ONCE: "far",
  TWICE: "far",
  HALF: "far",
  QUARTER: "far",
  QUARTERS: "far",
  EIGHTHS: "far",
  PLACE: "far",
  PLACES: "far",
  THIRD: "far",
};
