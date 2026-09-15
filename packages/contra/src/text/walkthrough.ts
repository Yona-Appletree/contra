import type { Beat } from "@caller/core";
import type {
  Dance,
  DancerId,
  FigureCall,
  Formation,
  PhraseName,
  RoleName,
  SetState,
} from "@caller/choreo";
import { callBeats, concurrentCalls, danceSchedule, lineUpShiftOf } from "@caller/choreo";
import { formationById } from "../dances/formations.js";
import { progressionOf } from "../set/lattice.js";
import type { BoundarySnapshot } from "../set/planCycle.js";
import { danceBoundaries } from "../set/planCycle.js";
import type { TextLevel } from "./figureText.js";
import { callWho, formFor, resolveFigureText } from "./figureText.js";
import type { WhoWord } from "./relationWords.js";
import { relationWords } from "./relationWords.js";
import type { Hint } from "./seam.js";
import { seamHint, toOf } from "./seam.js";
import { applyTeach } from "./teach.js";

/**
 * **A whole dance's walkthrough**: the opening, one entry per call with its
 * seam hint, and the sentence at the wrap.
 *
 * One structure, three renderers (D5): the walkthrough card on the dance page,
 * the calling card beside it (`callScript.ts`, over the same record) and — one
 * day — the print sheet. Nothing here is stored: the dance file holds the
 * record and `data/figures/` holds the texts, and every sentence about *this*
 * dance is computed from the planner's own honest ends each time it is asked
 * for.
 */

/** One figure of one entry: a call, or one branch of a concurrent call. */
export interface WalkthroughLine {
  figure: string;
  params: Record<string, unknown>;
  /** The dancer this call names, in prose — the branch label on a `while` entry. */
  who?: string;
  /** The figure's own name for this entry, in sentence case. */
  heading: string;
  line: string;
  teach: string;
  defaultLevel: TextLevel;
  /** Which branch of a concurrent call this is; `0` is the call itself. */
  branch: number;
}

/** One call of the record, as a walkthrough reads it. */
export interface WalkthroughEntry {
  phrase: PhraseName;
  /** Which pass of the record, from zero. */
  pass: number;
  /** The call's index in the record's own schedule. */
  index: number;
  beats: Beat;
  /** The call and, for a concurrent call, its branches after it. */
  lines: readonly WalkthroughLine[];
  /** The whole call's name; a concurrent call joins its branches with " while ". */
  heading: string;
  /** The most open of its lines' levels. */
  defaultLevel: TextLevel;
  /** Where this call leaves you, said only when something changed. */
  hint?: Hint;
  /** Said before this entry where a pass of a multi-pass record ends. */
  passBreak?: string;
  /** A caller's own paragraph before this entry; see `teach.ts`. */
  before?: string;
  /** A caller's own paragraph after it. */
  after?: string;
}

/** Everything a walkthrough card renders. */
export interface WalkthroughCard {
  opening: { line: string; hint?: string };
  entries: readonly WalkthroughEntry[];
  wrap: { text: string; progressed: boolean };
}

/**
 * The walkthrough of one dance, danced headlessly through the planner.
 *
 * The same planner `pnpm dance` runs, on a probe line long enough to have an
 * interior minor set: the hints are what that set's four dancers would be told,
 * which is what a caller says to a hall.
 */
export function danceWalkthrough(dance: Dance, formation?: Formation): WalkthroughCard {
  const where = formation ?? formationById(dance.formation);
  const { reference, boundaries } = danceBoundaries(dance, where);
  const schedule = danceSchedule(dance);
  const shift = progressionOf(dance);

  const entries: WalkthroughEntry[] = [];
  for (const at of boundaries) {
    const written = schedule[at.index];
    if (written === undefined) continue;
    const lines = linesOf(written.call, at, reference);
    if (lines.length === 0) continue;
    const previous = entries[entries.length - 1];
    entries.push({
      phrase: at.phrase,
      pass: at.pass,
      index: at.index,
      beats: callBeats(written.call),
      lines,
      heading: lines.map((one) => one.heading).join(" while "),
      defaultLevel: lines.some((one) => one.defaultLevel === "line") ? "line" : "name",
      ...(hintAt(boundaries, at.index, reference) === undefined
        ? {}
        : { hint: hintAt(boundaries, at.index, reference)! }),
      ...(previous !== undefined && previous.pass !== at.pass
        ? { passBreak: `That's the ${ORDINALS[previous.pass] ?? "last"} pass.` }
        : {}),
    });
  }

  // **A caller's own edits last** (vision §4): everything above is computed, and
  // the overlay is the only thing on disk that a human wrote about *this*
  // dance's walkthrough.
  return applyTeach(
    {
      opening: openingOf(where, dance),
      entries,
      wrap: wrapOf(dance, shift, where),
    },
    dance.teach,
  );
}

/** How a caller counts the passes of a record that has more than one. */
const ORDINALS: readonly string[] = ["first", "second", "third", "fourth"];

/** The lines of one entry: the call, then each of its concurrent branches. */
function linesOf(
  call: FigureCall,
  at: BoundarySnapshot,
  reference: readonly DancerId[],
): WalkthroughLine[] {
  const to = toOf(at, reference);
  const out: WalkthroughLine[] = [];
  for (const [branch, one] of concurrentCalls(call).entries()) {
    const who = callWho(one);
    const texts = textsOf(one, who, to);
    if (texts === undefined) continue;
    const spoken = one.call ?? formFor(texts.forms, HEADING_BEATS)?.text ?? one.figure;
    out.push({
      figure: one.figure,
      params: { ...(one.params ?? {}) },
      ...(who === undefined ? {} : { who: relationWords(who, "prose") ?? "" }),
      heading: sentenceCase(spoken),
      line: texts.walkthrough.line,
      teach: texts.walkthrough.teach,
      defaultLevel: texts.defaultLevel,
      branch,
    });
  }
  return out;
}

/** The register an entry's heading is drawn from: the caller's 4-beat form. */
const HEADING_BEATS = 4;

/**
 * One call's texts, or `undefined` for a call this page cannot print.
 *
 * A **lab** dance is what needs the catch: a figure a later milestone owns, or
 * a parameter value the vocabulary has no words for, throws by name, and one
 * entry missing is better than a page that refused to build.
 */
function textsOf(
  call: FigureCall,
  who: WhoWord | undefined,
  to: WhoWord | undefined,
): ReturnType<typeof resolveFigureText> {
  try {
    return resolveFigureText(
      call.figure,
      { ...(call.params ?? {}), beats: call.beats },
      { ...(who === undefined ? {} : { who }), ...(to === undefined ? {} : { to }) },
    );
  } catch {
    return undefined;
  }
}

/**
 * The hint **after** the call at `index`, which is the hint the entry shows.
 *
 * A hint is a fact about a seam, and a seam is read at the boundary the *next*
 * call starts at: "your partner is beside you" is true once this figure has
 * finished, and it is worth saying because of what is coming. The last call of
 * a time through has none — the wrap sentence stands in.
 */
function hintAt(
  boundaries: readonly BoundarySnapshot[],
  index: number,
  reference: readonly DancerId[],
): Hint | undefined {
  const next = boundaries.find((each) => each.index === index + 1);
  return next === undefined ? undefined : seamHint(next, reference);
}

/** "SWING YOUR PARTNER" as a caller's own heading: "Swing your partner". */
function sentenceCase(text: string): string {
  const lower = text.toLowerCase();
  return lower.slice(0, 1).toUpperCase() + lower.slice(1);
}

/**
 * How the walkthrough opens: the formation's own words, plus the one thing a
 * **record** can add to them.
 *
 * A swap-sides progression (Anna's Reel) is a field of the record rather than a
 * formation of its own — it is duple improper danced with a different
 * progression — so the sentence that warns you about it belongs here and not in
 * `dupleImproper.ts`.
 */
function openingOf(formation: Formation, dance: Dance): { line: string; hint?: string } {
  const opening = formation.walkthroughOpening?.(lineUpShiftOf(formation, probe(formation)));
  if (opening === undefined) return { line: "" };
  if (progressionOf(dance).line !== "swap") return opening;
  const swap = "Every time through you swap sides with your partner.";
  return {
    line: opening.line,
    hint: opening.hint === undefined ? swap : `${opening.hint} ${swap}`,
  };
}

/** A line long enough for `lineUpShiftOf` to have an interior couple to measure. */
const probe = (formation: Formation): SetState =>
  formation.start({ id: "walkthrough-probe", couples: 8, centre: [0, 0], axis: 90 });

/**
 * The sentence at the wrap: what one time through did to you (D19).
 *
 * A becket dance says where its next neighbours are, because its first figure is
 * the slide that finds them. Every other dance reads the record's own
 * progression: how far each role moves, and whether the roles agree.
 */
function wrapOf(
  dance: Dance,
  shift: ReturnType<typeof progressionOf>,
  formation: Formation,
): { text: string; progressed: boolean } {
  const lineUp = lineUpShiftOf(formation, probe(formation));
  if (lineUp !== null) {
    return {
      text:
        `That's once through. Your new neighbors are on your ${lineUp} diagonal. ` +
        `Next time starts with the slide ${lineUp} to them.`,
      progressed: true,
    };
  }

  const places = shift.places;
  const roles = Object.keys(places) as RoleName[];
  const each = roles.map((role) => places[role] ?? 1);
  if (each.every((n) => n === 0)) {
    return {
      text: "That's once through, and you are back with the same couple.",
      progressed: false,
    };
  }

  const same = each.every((n) => n === each[0]);
  const head = same
    ? `You have progressed ${PLACES[each[0] ?? 1] ?? `${String(each[0])} places`}: ` +
      `ones down the hall, twos up.`
    : `You have progressed: ` +
      roles
        .map((role) => `${role === "lark" ? "larks" : "robins"} ${PLACES[places[role] ?? 1] ?? ""}`)
        .join(", ") +
      ".";
  const first = danceSchedule(dance)[0]?.call;
  const needsNeighbors = first !== undefined && isNeighborCall(first);
  const tail = needsNeighbors ? " Your new neighbors are along your line, past this couple." : "";
  const swap = shift.line === "swap" ? " You have swapped sides with your partner." : "";
  return { text: `${head}${tail}${swap}`, progressed: true };
}

/** How many places a progression moves you, in the user's own words. */
const PLACES: Readonly<Record<number, string>> = {
  1: "one place",
  2: "two places",
  3: "three places",
  4: "four places",
};

/** Whether the first call of the next time through is with a new neighbour. */
function isNeighborCall(call: FigureCall): boolean {
  return concurrentCalls(call).some((one) => {
    const who = callWho(one);
    return who !== undefined && typeof who !== "string" && who.kind === "neighbor";
  });
}
