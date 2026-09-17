import type { Beat } from "@caller/core";
import type { EndPose } from "../figure/FigureDef.js";
import type { GroupSelector, StationId } from "../formation/Formation.js";

/**
 * The tags contra formations happen to define, named for the sake of editor
 * completion. They are not the whole list and this package never reads them: a
 * square defines `heads` and `sides` and has no `ones` at all.
 */
export type CommonSelector =
  "all" | "larks" | "robins" | "ones" | "twos" | "neighbors" | "partners";

/**
 * Which dancers of a group a figure call is aimed at. `'all'` is every station;
 * an array names stations directly; **any other string is a tag the formation
 * defines** and resolves (see `Formation.tags`), which is what keeps the
 * selector form-neutral.
 *
 * The pairing tags — contra's `'neighbors'` and `'partners'` — name *who you
 * dance it with*, not a subset of the floor, so a formation resolves them to
 * the whole group and the pairing itself is a figure parameter. That is M8's
 * business; here they are carried and resolved, not interpreted.
 */
export type Selector = CommonSelector | (string & Record<never, never>) | StationId[];

/** One figure in a dance. Data only: no functions, so it serialises. */
export interface FigureCall {
  /** A figure id in the registry. */
  figure: string;
  beats: Beat;
  params?: object;
  who?: Selector;
  /**
   * How wide this call draws its dancers from — which partition of the whole set
   * it runs in ({@link Formation.groupsFor}). Left out is `"hands-four"`, the
   * ordinary minor set, which is every call written so far.
   *
   * `who` picks dancers *within* a group; this picks the group. A figure that
   * reaches past the minor set — a shadow allemande, a diagonal chain, long
   * lines that sweep the couple standing out — says so here, and `who` then
   * names its dancers in the wider layout exactly as it does in the narrow one.
   */
  group?: GroupSelector;
  /**
   * Which true end(s) a widened group's call is willing to widen into. Default
   * `"both"`.
   *
   * A selector like `"line"` computes the *widest* widening it can — up to six
   * stations, four dancing plus a waiting couple at each true end that has
   * one — regardless of this field (`Formation.groupsFor` never reads it).
   * `ends` is what the decider consults, per call, to decide whether *this*
   * call actually reaches a given true end's waiting couple: `long-lines`
   * ("dancers standing out normally do participate") is `"both"`,
   * `down-the-hall` ("dancers out at the bottom... have to walk down, too") is
   * `"bottom"`, so a `wait-top` couple is never swept into it even in the same
   * schedule as a `"both"` call that does sweep it in. Read by asking the
   * formation for two well-known tag names, `"wait-top"`/`"wait-bottom"` — the
   * same vocabulary `GroupPlan.kind`'s two outs already use — and excluding
   * whichever of them this call's `ends` does not permit; a formation that
   * never widens anything need not define either tag.
   */
  ends?: "both" | "top" | "bottom";
  /** Overrides the figure's own call text for this dance. */
  call?: string;
  /**
   * Overrides the rhythm estimate ({@link import('../decider/spokenBeats.js').spokenBeats})
   * of how long this call takes to say, in beats.
   *
   * Left out — every call so far — is the estimate from the words themselves;
   * this is for the rare call the estimate gets wrong (a number spelled out,
   * an abbreviation, a name).
   */
  spokenBeats?: Beat;
  /**
   * Other calls danced **at the same time as this one**, by other dancers.
   *
   * The corpus's own `||` and its own word: *"(2) Women cast back || Men go
   * forward"*, *"(4) Men allemande right 1 || Women loop right"*, *"go forward
   * and back while partner roll away"*. 735 corpus dances write `||` and 189
   * write "while", so a call list that can only run one figure at a time cannot
   * hold the corpus (M8; `vision.md` §"Resolution").
   *
   * A branch is an ordinary call in every respect but two: its `beats` may be
   * left out, in which case it takes this call's, and it may not carry a `while`
   * of its own — two levels of nesting would be a different thing from "these
   * calls run together" and no transcript writes one.
   *
   * **The actors must be disjoint.** This call and each of its branches are
   * resolved against the same dancers at the same beats, and a dancer cannot be
   * in two figures at once ({@link import('../timeline/Timeline.js').Timeline}
   * enforces exactly that, per dancer); the planner checks it before anything is
   * emitted. A dancer named by none of them is on hold-place for the whole
   * length, exactly as they are for an ordinary call.
   *
   * How long the whole call takes is the **longest** of the branches and this
   * one ({@link callBeats}) — a two-beat cast back beside a two-beat walk
   * forward is two beats, and a four-beat allemande beside a four-beat loop is
   * four.
   */
  while?: ConcurrentCall[];
}

/**
 * One branch of a {@link FigureCall.while}: a call that runs beside another.
 *
 * `beats` left out is the parent call's, which is what a transcript means by
 * `(4) Men allemande right 1 || Women loop right` — one count for the pair of
 * them. `while` is not nested: a branch names no branches of its own.
 */
export type ConcurrentCall = Omit<FigureCall, "beats" | "while"> & { beats?: Beat };

/**
 * The name of a phrase of a dance.
 *
 * `"A1" | "A2" | "B1" | "B2"` is the ordinary contra tune and is what every
 * dance written before M8 has, but it is **not** the whole vocabulary and this
 * package never reads it: 113 corpus dances have phrases beyond A1–B2, and a
 * record with two passes writes its second pass's phrases as `2A1 … 2B2`
 * (`docs/dance-record.md`). A phrase name is a label, and the beat arithmetic
 * comes from the figures.
 */
export type PhraseName = CommonPhraseName | (string & Record<never, never>);

/** The four phrases of an ordinary contra tune, named for editor completion. */
export type CommonPhraseName = "A1" | "A2" | "B1" | "B2";

/** One phrase of a dance. */
export interface DancePhrase {
  name: PhraseName;
  figures: FigureCall[];
}

/**
 * **One edit a caller made to one entry of a walkthrough** (vision §4).
 *
 * Paragraphs around the entry, or a replacement for its own mechanics line.
 * Plain strings, in the caller's own words: the voice rules are checked over
 * `data/figures/`, which is the language, and a caller correcting one dance is
 * not writing the language.
 */
export interface TeachEdit {
  before?: string;
  after?: string;
  replace?: string;
}

/** A dance, as data. Survives `JSON.parse(JSON.stringify(dance))` unchanged. */
export interface Dance {
  slug: string;
  title: string;
  author: string;
  /** A formation id. */
  formation: string;
  /**
   * Every phrase of the record, in order — **all of its passes**, one after
   * another (M8).
   *
   * A two-pass dance writes eight phrases (`A1 A2 B1 B2 2A1 2A2 2B1 2B2`) and
   * says `passes: 2`; one time through the record is then both passes, which is
   * what a caller means by "it's a two-tune dance". See {@link passes}.
   */
  phrases: DancePhrase[];
  /**
   * How many equal **passes** {@link phrases} holds. Left out is one, which is
   * every dance written before M8.
   *
   * A pass is one time through the tune; a record with two of them dances a
   * different pass each time and the two differ (Anna's Reel exchanges the
   * roles throughout). The phrase list is flat, so nothing that walks a dance's
   * figures has to know about passes at all; what does change is **where the
   * progression fires** — at the end of every pass, not at the end of the
   * record — which is {@link progressEvery}.
   *
   * `phrases.length` must be a whole multiple of it, and every pass must be the
   * same number of beats long ({@link validateDance}).
   */
  passes?: number;
  /**
   * How many passes go by between progressions. Left out is one: the set
   * progresses at the end of **every** pass, which is what a two-pass dance
   * ordinarily means.
   *
   * `2` is the other answer the corpus writes — a record whose two passes are
   * one progression between them, so a couple dances the whole record with the
   * same neighbours. Must divide {@link passes}.
   */
  progressEvery?: number;
  notes?: string;
  /**
   * **How many beats of words this dance gets per time through**, 1-based, the
   * last repeating for ever after.
   *
   * Left out — every dance so far — is the caller's own policy (4, then 2, then
   * 2, then 1): the whole sentence the first time, the middle form for the next
   * two, and a word after that. A dance that is harder than it looks, or easier,
   * says so here and the calls stay long or go short sooner.
   *
   * A count of beats rather than a register name, because that is what the
   * fitting rule takes: the longest form that fits in both this and the window
   * the call before it leaves. `@caller/choreo` carries it and never reads it;
   * `@caller/contra`'s `callScript` is what it is for.
   */
  callBudgets?: readonly Beat[];
  /**
   * **A caller's own edits to this dance's walkthrough**, keyed by phrase and
   * figure.
   *
   * Left out — every dance so far — and that is the point: generated text is
   * never stored, so the only thing on disk is what a human wrote. See
   * `@caller/contra`'s `text/teach.ts` for the key grammar and
   * `docs/dance-record.md` for the shape.
   */
  teach?: Record<string, TeachEdit>;
  /**
   * Where each station's dancer stands at beat 0 of **every** time through, in
   * the group frame's own axes. Left out — the usual case — means the
   * formation's own stations.
   *
   * A dance whose first figure is the progression starts somewhere else. A
   * becket dance that shifts left in its first two beats dances the rest of the
   * time through with the couple it shifted *to*, so the minor set a time
   * through runs in is the one the shift makes, and the dancers begin one
   * couple place back along their own line. The stations stay the formation's;
   * this says where the dance picks people up from and, by the same token,
   * where it has to leave them — closure (AC5) is measured against these places
   * in the progressed set, not against the stations.
   *
   * Two things read it: the eight-beat line-up walks people here rather than to
   * the stations, and a waiting couple's `wait-out` crosses over from here. The
   * dance's own figures are told by their own parameters, which is what
   * `chainCalls` threads.
   */
  startPlaces?: Record<StationId, EndPose>;
  /**
   * Parameters for the figure a waiting couple is given (`wait-out`), for the
   * dances that need to say something about it. Left out is the figure's own
   * defaults, which is every dance so far bar one.
   *
   * A becket dance that shifts left in two beats needs its waiting couple to
   * slide off the end of the line in the same two beats: `wait-out` takes four
   * to step together by default, and a couple still sliding at beat 2 is 0.06 px
   * from the couple sliding into the place it is leaving (AC6 wants 8).
   */
  waitOut?: object;
}

/** One dance in a program, with the medley it is danced to. */
export interface ProgramItem {
  /** A dance slug. */
  dance: string;
  /** A medley slug, for `@caller/music`. */
  medley: string;
  timesThrough: number;
}

/** An evening, as data. */
export interface Program {
  slug: string;
  items: ProgramItem[];
}

/**
 * How long one call takes: its own beats, or its longest concurrent branch's
 * when a branch runs past it (M8).
 *
 * A branch with no `beats` of its own takes the parent's, so the ordinary
 * `(4) A || B` is four beats however it is written.
 */
export const callBeats = (call: FigureCall): Beat =>
  (call.while ?? []).reduce(
    (longest, branch) => Math.max(longest, branch.beats ?? call.beats),
    call.beats,
  );

/** How many beats a phrase's figures add up to. */
export const phraseBeats = (phrase: DancePhrase): Beat =>
  phrase.figures.reduce((sum, f) => sum + callBeats(f), 0);

/** How many passes a record holds (M8): its own, or one. */
export const dancePasses = (dance: Dance): number => dance.passes ?? 1;

/** How many beats one pass of a record is: one time through the tune. */
export const passBeats = (dance: Dance): Beat => danceBeats(dance) / dancePasses(dance);

/**
 * Which pass each phrase belongs to, and the beat that pass starts on — what a
 * planner needs to know where the progression falls.
 *
 * Phrases are handed out to passes in order, `phrases.length / passes` of them
 * each, which {@link validateDance} has already checked divides evenly.
 */
export function dancePassSpans(dance: Dance): Array<{ start: Beat; end: Beat }> {
  const passes = dancePasses(dance);
  const perPass = dance.phrases.length / passes;
  const spans: Array<{ start: Beat; end: Beat }> = [];
  let beat: Beat = 0;
  for (let p = 0; p < passes; p++) {
    const start = beat;
    for (let i = 0; i < perPass; i++) beat += phraseBeats(dance.phrases[p * perPass + i]!);
    spans.push({ start, end: beat });
  }
  return spans;
}

/**
 * How long one time through is: the sum of every phrase.
 *
 * Derived from the dance's own data, never from a meter constant — the beat is
 * the dance count, and a dance says how many counts it takes.
 */
export const danceBeats = (dance: Dance): Beat =>
  dance.phrases.reduce((sum, p) => sum + phraseBeats(p), 0);

/**
 * Check a dance is well formed, throwing on the first problem.
 *
 * Every phrase must be the same length and every figure must end on a figure
 * boundary inside it (vision D11: figure ends are fixed to phrase boundaries,
 * which is what lets the decider switch dances mid-tune without a feature).
 *
 * Three things M8 added, each with its own reason:
 *
 * - **A phrase's length is the sum over its calls of {@link callBeats}**, which
 *   is the max over a call and its concurrent branches. A branch that is longer
 *   than the call it runs beside would otherwise run past the phrase.
 * - **A call may take no beats at all.** 44 corpus dances have one: "face your
 *   neighbour", "form a wave" — a fact about where you end up rather than
 *   something you spend the music on. What is refused is a *negative* count and
 *   a call whose beats are not a number.
 * - **Passes.** `phrases.length` divides by `passes`, every pass is the same
 *   length, and `progressEvery` divides `passes`.
 */
export function validateDance(dance: Dance): Dance {
  if (dance.phrases.length === 0) throw new Error(`dance "${dance.slug}" has no phrases`);
  const first = phraseBeats(dance.phrases[0]!);
  for (const phrase of dance.phrases) {
    if (phrase.figures.length === 0) {
      throw new Error(`dance "${dance.slug}" phrase ${phrase.name} has no figures`);
    }
    const beats = phraseBeats(phrase);
    if (beats !== first) {
      throw new Error(
        `dance "${dance.slug}" phrase ${phrase.name} is ${beats} beats, ${dance.phrases[0]!.name} is ${first}`,
      );
    }
    for (const call of phrase.figures) {
      checkBeats(dance, phrase, call.figure, call.beats);
      for (const branch of call.while ?? []) {
        checkBeats(dance, phrase, branch.figure, branch.beats ?? call.beats);
      }
    }
  }
  const passes = dancePasses(dance);
  if (!Number.isInteger(passes) || passes < 1) {
    throw new Error(`dance "${dance.slug}" has ${String(passes)} passes, which is not a count`);
  }
  if (dance.phrases.length % passes !== 0) {
    throw new Error(
      `dance "${dance.slug}" has ${String(dance.phrases.length)} phrases in ${String(passes)} passes, ` +
        `which does not divide`,
    );
  }
  const every = dance.progressEvery ?? 1;
  if (!Number.isInteger(every) || every < 1 || passes % every !== 0) {
    throw new Error(
      `dance "${dance.slug}" progresses every ${String(every)} of ${String(passes)} passes, ` +
        `which does not divide`,
    );
  }
  return dance;
}

/** One call's own duration, checked: a count, and never negative. */
function checkBeats(dance: Dance, phrase: DancePhrase, figure: string, beats: Beat): void {
  if (typeof beats !== "number" || !Number.isFinite(beats) || beats < 0) {
    throw new Error(
      `dance "${dance.slug}" ${phrase.name}: "${figure}" has no duration (${String(beats)})`,
    );
  }
}

/**
 * Every figure call of a dance in order, with the beat it starts on.
 *
 * **One entry per written call**, concurrent branches included in their parent's
 * entry rather than as entries of their own (`call.while`): a `while` is one
 * call of the card that several people dance at once, and everything that reads
 * a schedule — the planner, the walkthrough, the seam pairs — has to see the
 * whole of it at once to know who is left over.
 */
export function danceSchedule(
  dance: Dance,
): Array<{ call: FigureCall; start: Beat; phrase: PhraseName }> {
  const out: Array<{ call: FigureCall; start: Beat; phrase: PhraseName }> = [];
  let beat = 0;
  for (const phrase of dance.phrases) {
    for (const call of phrase.figures) {
      out.push({ call, start: beat, phrase: phrase.name });
      beat += callBeats(call);
    }
  }
  return out;
}

/**
 * One call and every branch that runs beside it, flattened — the parent first.
 *
 * Each branch carries the beats it really dances, so a caller of this need not
 * remember that a branch with no count of its own takes its parent's.
 */
export function concurrentCalls(call: FigureCall): FigureCall[] {
  const branches = call.while ?? [];
  if (branches.length === 0) return [call];
  const parent: FigureCall = { ...call };
  delete parent.while;
  return [parent, ...branches.map((branch) => ({ ...branch, beats: branch.beats ?? call.beats }))];
}
