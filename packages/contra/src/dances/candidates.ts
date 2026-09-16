import type { Dance } from "@caller/choreo";
import type { Selector } from "@caller/choreo";
import type { ContraCall, ContraPhrase, DanceProgression } from "../figures/chain.js";
import { CANDIDATE_FILES } from "./candidateFiles.js";
import { DANCE_FILES } from "./danceFiles.js";
import type { DanceFile } from "./loadDances.js";
import { danceFromFile } from "./loadDances.js";

/**
 * **A candidate record** (M9h): one caller's reading of where a dance
 * physically carries its progression, written as the transcript's record plus
 * the clauses that reading adds.
 *
 * Five dances of the acceptance set are blocked on one question and it is a
 * choreography question, not an engine one (director E6, DD59): *the engine
 * reseats every dancer at the boundary, and the bodies of these five end a
 * whole shift away, because their encoded figures walk nobody to the new
 * place.* Where the travel really happens is a fact about the dance that a
 * caller knows and a measurement cannot supply — so DD60 asks it **by showing**
 * (the user's own words: "figure out a way to ask me by showing me the dances,
 * maybe alternatives so I can see it. its hard to imagine it all"), and these
 * are the alternatives.
 *
 * ## Why a patch and not a whole record
 *
 * `data/dances/<slug>.json` **stays the transcript's record** and is not
 * touched: a candidate is a reading of it, and a reading that had to copy four
 * hundred lines of phrases would drift from the thing it is a reading of the
 * first time either changed. So a candidate file is the two or three clauses
 * the reading adds and nothing else — which is also exactly what a reviewer
 * wants to read, because the clause *is* the reading.
 *
 * ## What a candidate may say
 *
 * Only what a dance record may already say, and only the fields that answer
 * E6: `progresses` on a call (`set/planCycle.ts`'s `PROGRESSES_PARAM`), the
 * relation a call names, and the record's own `progression`. There is no new
 * mechanism here and no new figure geometry: a candidate that cannot be written
 * with what exists is reported as one rather than invented.
 *
 * **`startPlaces` is not a candidate**, and a candidate file has no way to say
 * it: {@link CandidateFile} carries a `progression` and a list of clauses and
 * nothing else, so the only fields a reading can reach are the ones on a call.
 * Moving a dance's first places moves the number the oracle reads without moving
 * a dancer, which is oracle-tuning; the question is where the *dancing* carries
 * the shift.
 *
 * ## Where they live
 *
 * `data/dances/lab/<slug>~<id>.json`, beside the record and **never in the
 * programme**: a candidate is not in {@link import('./index.js').ALL_DANCES},
 * has no programme card and no Stage page. It is reachable by
 * `pnpm dance <slug>~<id>` and by `#/lab/dance/<slug>`, which is the page the
 * question is asked on.
 */
export interface CandidateFile {
  /** The dance this is a reading of: a slug with a `data/dances/<slug>.json`. */
  of: string;
  /** This reading's own name, unique within its dance: the `<id>` of the slug. */
  id: string;
  /** What to call it on the page. */
  title: string;
  /** **One line**: what this reading assumes, in a caller's words. */
  assumes: string;
  /** The transcript's own words this reading is built on, quoted. */
  quotes?: string;
  /**
   * Where this reading comes from, when it comes from somewhere other than the
   * Caller's Box transcript already in the record.
   *
   * **ContraDB prints a pilcrow (`⁋`) against the figure that carries the
   * progression**, which is the same question E6 asks, answered by the people
   * who catalogue the dance. Two of the five have a page there — Jeremy Corners
   * and The Set Monster, both Isaac Banner's — and where one does, its pilcrows
   * are a candidate in their own right and lead the list.
   */
  source?: { name: string; url: string };
  /** Anything a reader of the file needs told, including the measured numbers. */
  notes?: string;
  /**
   * The record's own progression, where the reading changes it.
   *
   * One reading in the set needs it: The Set Monster's triple progression read
   * as *three* carries of one place rather than one carry of three. A set
   * progresses once per call that claims it, so "three places, three times" is
   * `{ lark: 1, robin: 1 }` claimed by three calls, and that is a different
   * record field rather than a different clause.
   */
  progression?: DanceProgression;
  /** The clauses this reading adds, each addressed at one call of the record. */
  patch: readonly CandidatePatch[];
}

/**
 * One clause of a reading: a call of the record, and what the reading writes on
 * it.
 *
 * The address is `"<phrase>/<index>"` — the phrase's own name and the call's
 * zero-based place in it, which is how a record is read aloud ("B1's second
 * call") and the only two coordinates a phrase list has. A concurrent call is
 * addressed by its parent, because a `while`'s branches are one call and
 * `progresses` is read across all of them.
 */
export interface CandidatePatch {
  /** `"B1/1"`: the phrase's name, then the call's index within it. */
  at: string;
  /** Merged over the call's own `params`; `null` removes one. */
  params?: Readonly<Record<string, unknown>>;
  /** Replaces the call's `who`, for a reading that changes who a call is with. */
  who?: Selector;
}

/** What a candidate's dance is called everywhere: `contrablend~rollaways`. */
export const candidateSlug = (of: string, id: string): string => `${of}~${id}`;

/** The two halves of a candidate slug, or `undefined` for an ordinary one. */
export function splitCandidateSlug(slug: string): { of: string; id: string } | undefined {
  const at = slug.indexOf("~");
  if (at <= 0 || at === slug.length - 1) return undefined;
  return { of: slug.slice(0, at), id: slug.slice(at + 1) };
}

/**
 * The record a candidate reads: the transcript's own file with the reading's
 * clauses written on to it.
 *
 * The base's `notes` is **kept** and the candidate's own is appended after it,
 * so a reader of the candidate still gets everything that was measured about
 * the dance itself and then what this reading changes.
 */
export function candidateFile(candidate: CandidateFile): DanceFile {
  const base = DANCE_FILES[candidate.of];
  if (base === undefined) {
    throw new Error(
      `candidate "${candidate.id}" reads dance "${candidate.of}", which has no ` +
        `data/dances/${candidate.of}.json`,
    );
  }
  const phrases = (base.phrases as ContraPhrase[]).map((phrase) => ({
    ...phrase,
    figures: phrase.figures.map((call) => ({ ...call })),
  }));
  for (const patch of candidate.patch) {
    const call = callAt(candidate, phrases, patch.at);
    if (patch.params !== undefined) {
      const params: Record<string, unknown> = { ...(call.params as object) };
      for (const [key, value] of Object.entries(patch.params)) {
        if (value === null) delete params[key];
        else params[key] = value;
      }
      call.params = params;
    }
    if (patch.who !== undefined) call.who = patch.who;
  }
  const notes = [
    `**Candidate reading "${candidate.id}" of ${candidate.of}** — ${candidate.assumes}`,
    ...(candidate.quotes === undefined ? [] : [`The transcript: ${candidate.quotes}`]),
    ...(candidate.notes === undefined ? [] : [candidate.notes]),
    ...(base.notes === undefined ? [] : [`The record this reads: ${base.notes}`]),
  ].join(" ");
  return {
    ...base,
    slug: candidateSlug(candidate.of, candidate.id),
    title: `${base.title} — ${candidate.title}`,
    status: "lab",
    phrases,
    notes,
    ...(candidate.progression === undefined ? {} : { progression: candidate.progression }),
  };
}

/** The call a patch addresses, or a message saying what the record does have. */
function callAt(
  candidate: CandidateFile,
  phrases: readonly ContraPhrase[],
  at: string,
): ContraCall {
  const [name, index] = at.split("/");
  const phrase = phrases.find((p) => p.name === name);
  if (phrase === undefined) {
    throw new Error(
      `candidate "${candidate.of}~${candidate.id}" patches "${at}", and ${candidate.of} has ` +
        `no phrase "${String(name)}" (it has: ${phrases.map((p) => p.name).join(", ")})`,
    );
  }
  const call = phrase.figures[Number(index)];
  if (call === undefined) {
    throw new Error(
      `candidate "${candidate.of}~${candidate.id}" patches "${at}", and ${candidate.of}'s ` +
        `${phrase.name} has ${String(phrase.figures.length)} calls ` +
        `(${phrase.figures.map((c) => c.figure).join(", ")})`,
    );
  }
  return call;
}

/** Every candidate reading, in file order, as a loaded dance. */
export const CANDIDATE_DANCES: readonly Dance[] = CANDIDATE_FILES.map((candidate) =>
  danceFromFile(candidateFile(candidate)),
);

/** The readings of one dance, in the order their files are listed. */
export const candidatesOf = (slug: string): readonly CandidateFile[] =>
  CANDIDATE_FILES.filter((c) => c.of === slug);

/** Every dance a candidate reads, in the order the files are listed. */
export const CANDIDATE_BASES: readonly string[] = [...new Set(CANDIDATE_FILES.map((c) => c.of))];

/** The candidate file behind a `<slug>~<id>`, or `undefined`. */
export const candidateBySlug = (slug: string): CandidateFile | undefined => {
  const split = splitCandidateSlug(slug);
  if (split === undefined) return undefined;
  return CANDIDATE_FILES.find((c) => c.of === split.of && c.id === split.id);
};
