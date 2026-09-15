import type { Dance, Formation } from "@caller/choreo";
import type { ContraCall, ContraDanceSpec, ContraPhrase } from "../figures/chain.js";
import { contraDance } from "../figures/chain.js";
import { contraFigureOf } from "../figures/registry.js";
import { DATA_DEFINITIONS } from "../library/figures/index.js";
import { paramDefaults } from "../library/interpret.js";
import { REBIND_PARAM } from "../set/planCycle.js";
import { TRADE_PARAM } from "../set/resolve.js";
import { UNSUPPORTED_FIGURES } from "./acceptance.js";
import { formationById } from "./formations.js";

/**
 * A dance's provenance: the Caller's Box page it was transcribed from, read
 * rather than assumed (`docs/adr/2026-09-13-corpus-and-permission.md`).
 */
export interface DanceFileSource {
  /** The Caller's Box dance id. */
  callersBoxId: number;
  /** The page the figures and beat counts were quoted from, figure for figure. */
  url: string;
  /** That page's own `Permission:` field, verbatim. */
  permission: string;
  /** The A1/A2/B1/B2 sequence, quoted from that page, exactly as it prints. */
  transcript: string;
}

/**
 * What a dance file on disk holds: `ContraDanceSpec` with the formation named
 * by id — a string a JSON file can hold — instead of the object, plus the
 * provenance every dance file carries.
 *
 * Deliberately **not** a `Dance`: `from` and `carried` are threaded by
 * {@link contraDance} at load time and must never appear in the file (see
 * `chainCalls`'s own doc comment for why a dance cannot write them by hand).
 */
export interface DanceFile extends Omit<ContraDanceSpec, "formation"> {
  /** A formation id (see {@link formationById}). */
  formation: string;
  source: DanceFileSource;
  /**
   * `"lab"` for a dance that is being worked on but is not shippable yet.
   *
   * A lab dance loads like any other, is exported as `LAB_DANCES`, is reachable
   * by `pnpm dance <slug>` and by `danceBySlug`, and is **excluded** from
   * `DEMO_DANCES` and from the check that every dance file is in the programme.
   * The demo therefore never shows a dance that does not dance (A8), and a
   * milestone that is encoding a hard dance can commit the record, run the lab
   * on it and watch it come good without putting it on the Stage.
   *
   * Left out is a shipped dance, which is every file today; the dance moves out
   * of `"lab"` and into `programme.json` when its own milestone's definition of
   * done is met.
   */
  status?: "lab";
  /**
   * **Dance-local figures** (D10): definition literals this dance may call by
   * name, as well as anything in the library.
   *
   * The map's key is the local name and its value is a `FigureDefinition`
   * written out in full but for its `id`, which is supplied as
   * `<slug>/<name>` — so a call in this dance's own phrases writes
   * `"figure": "fatal-attraction/go-forward"` and a reader always knows where to
   * look. Two dances cannot collide, and **promoting one is a copy**: move the
   * literal into `library/figures/<name>.ts`, drop the slug from the calls, and
   * nothing else changes.
   *
   * What it is for is the figure one dance needs and no other asks for: Fatal
   * Attraction's two-beat "men go forward" beside the women's cast back. The
   * alternative is a library figure nothing else ever calls, or a call the
   * record cannot make at all.
   *
   * Read by {@link import('./danceFiles.js').localFigureDefinitions}, which the
   * library folds into `DATA_DEFINITIONS`, so a local figure resolves, draws,
   * has a Moves tile and is checked for its parameters exactly like any other.
   */
  figures?: Record<string, unknown>;
}

/**
 * The parameters **every** call may carry, whatever figure it names.
 *
 * None of them is a figure parameter: each is a call-level instruction to the
 * layer above the figure, read there and stripped before the figure is planned.
 *
 * - `rebind` (M6) tells the **set** who you are bound to when the figure lets
 *   go — Contrablend's "(new partner)".
 * - `trade` (M7, Q10) tells **resolution** which of a same-role pair takes which
 *   figure-role — Anna's Reel's "women swing".
 * - `form` (M7, Q6) tells the **interpreter** the shape this call forms, over
 *   whatever the definition's own `ends` said. A caller's shape clause ("; form
 *   wave of four (men in center)") belongs to the call and not to the word
 *   "allemande", which is why it is here and not in a definition.
 */
const CALL_PARAMS: readonly string[] = [REBIND_PARAM, TRADE_PARAM, "form"];

/**
 * Check one call names a real figure, only the parameters that figure
 * declares, and a group selector its formation defines — the schema check the
 * brief asks for, beyond `validateDance`'s own shape check.
 *
 * `from` and `carried` are excluded from "declares": both are on every
 * figure's `defaults` (the first because every contra figure takes one, the
 * second because {@link contraFigure} injects it), and both are exactly the
 * two things {@link contraDance} derives and a dance file must never write.
 *
 * **`group` is a call field, not a figure parameter**, and belongs beside
 * `who` rather than inside `params`: it says how wide the call draws its
 * dancers from — which partition of the whole set it runs in — where `params`
 * tune the figure itself. A file that names a selector its formation has not
 * built yet fails here, with the selectors it does have, rather than deep
 * inside the decider on the first time through.
 */
function checkCall(
  danceSlug: string,
  phraseName: string,
  formation: Formation,
  call: ContraCall,
): void {
  // **A concurrent branch is an ordinary call** and is checked as one (M8): it
  // names a real figure, only that figure's parameters, and a group the
  // formation defines. What it may not do is carry branches of its own, which
  // the type forbids and this says out loud for a JSON file, which has no types.
  for (const branch of call.while ?? []) {
    if ((branch as { while?: unknown }).while !== undefined) {
      throw new Error(
        `${danceSlug} ${phraseName}: "${branch.figure}" runs beside "${call.figure}" and cannot ` +
          `carry a "while" of its own`,
      );
    }
    checkCall(danceSlug, phraseName, formation, { ...branch, beats: branch.beats ?? call.beats });
  }
  const declared = declaredParams(danceSlug, phraseName, call.figure);
  if (declared !== undefined) {
    for (const key of Object.keys(call.params ?? {})) {
      if (declared.has(key)) continue;
      throw new Error(
        `${danceSlug} ${phraseName}: "${call.figure}" has no parameter "${key}" ` +
          `(declares: ${[...declared].sort().join(", ")})`,
      );
    }
  }
  if (call.group !== undefined) {
    try {
      formation.groupFor(call.group);
    } catch (cause) {
      throw new Error(
        `${danceSlug} ${phraseName}: "${call.figure}" wants group "${call.group}", ` +
          `which formation "${formation.id}" does not define`,
        { cause },
      );
    }
  }
}

/**
 * Which parameters a figure declares, or `undefined` for a figure the rebuild
 * has not written yet.
 *
 * Three answers, in order:
 *
 * - a **coded** figure's own `defaults`, less the two the chain derives;
 * - a **definition's** canonical parameters, for a figure that is data and has
 *   no coded twin — M6's `pull-by` and `grand-right-and-left` are the first;
 * Every figure also takes {@link REBIND_PARAM}, which is not a figure parameter
 * at all: it is a call-level instruction to the **set** — "when this figure lets
 * go, whoever was your shadow is your partner" — that the planner reads and
 * strips back out before the figure is planned. It is written in `params`
 * because `FigureCall` is `@caller/choreo`'s and "partner" is a contra word
 * (AC7); see `set/planCycle.ts`.
 *
 * - **`undefined`**, and no check at all, for a figure on
 *   `acceptance.ts`'s own unsupported list. A transcript in the acceptance set
 *   may name a figure a later milestone owns, and this milestone's brief is
 *   explicit about what to do: *encode the call and leave the figure on the
 *   list with the owning milestone, so the dance stays `lab` and the test says
 *   exactly what is missing*. A dance file written that way loads, and
 *   `pnpm dance <slug>` fails with the figure's own name and its milestone in
 *   the message rather than the package failing to import. A figure that is
 *   neither known nor owed is still a typo, and still throws here.
 */
function declaredParams(
  danceSlug: string,
  phraseName: string,
  figure: string,
): Set<string> | undefined {
  const coded = contraFigureOf(figure);
  // **Every** data definition, not only the gatherers (M5): M4's carriers, M5's
  // schedule and M7's shapes are in the other lists and a call of one would
  // otherwise be checked against nothing. Since M8 the list includes the dance
  // files' own local figures (D10).
  const definition = DATA_DEFINITIONS.find((d) => d.id === figure);
  if (coded === undefined && definition === undefined) {
    if (UNSUPPORTED_FIGURES[figure] !== undefined) return undefined;
    throw new Error(`${danceSlug} ${phraseName}: "${figure}" is not a known contra figure`);
  }
  // **The union of both, where a figure is both** (M8). A migrated figure has a
  // coded twin *and* a definition, and the definition is what the engine the
  // Stage runs on resolves against: a parameter the definition added — the
  // star's `amount`, "star left 7/8" — is a parameter the record may write, and
  // checking only the coded twin's defaults refused it. A dance that writes one
  // is a new-engine dance by construction (`threadsOnTheOldPath`), because the
  // coded figure cannot read it.
  return new Set([
    ...Object.keys(coded?.defaults ?? {}).filter((k) => k !== "from" && k !== "carried"),
    ...(definition === undefined ? [] : Object.keys(paramDefaults(definition))),
    ...CALL_PARAMS,
  ]);
}

/**
 * Build a `Dance` from its file form: resolve the formation id, check every
 * figure id and parameter against the registry, then thread `from` and
 * `carried` through {@link contraDance} exactly as a TypeScript dance module
 * did before this milestone.
 */
export function danceFromFile(file: DanceFile): Dance {
  const formation: Formation = formationById(file.formation);
  for (const phrase of file.phrases as ContraPhrase[]) {
    for (const call of phrase.figures) checkCall(file.slug, phrase.name, formation, call);
  }
  const spec: ContraDanceSpec = {
    slug: file.slug,
    title: file.title,
    author: file.author,
    formation,
    phrases: file.phrases,
    ...(file.passes === undefined ? {} : { passes: file.passes }),
    ...(file.progressEvery === undefined ? {} : { progressEvery: file.progressEvery }),
    // **M8b**: this line was missing, and Contrablend is the only record that
    // writes the field, so nothing had noticed. `ContraDanceSpec.progression`
    // is M6's and `contraDance` threads it; `DanceFile` has always declared it
    // (it is `Omit<ContraDanceSpec, "formation">`); the file loader simply did
    // not copy it over, so `progressionOf(dance)` answered the single
    // progression and Contrablend's larks and robins both moved one place. The
    // record said "M1, W3" and the dance did not do it.
    ...(file.progression === undefined ? {} : { progression: file.progression }),
    ...(file.notes === undefined ? {} : { notes: file.notes }),
    ...(file.startPlaces === undefined ? {} : { startPlaces: file.startPlaces }),
    ...(file.waitOut === undefined ? {} : { waitOut: file.waitOut }),
  };
  return contraDance(spec);
}
