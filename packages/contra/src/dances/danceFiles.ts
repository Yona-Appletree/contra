import type { FigureDefinition } from "../library/FigureDefinition.js";
import type { DanceFile } from "./loadDances.js";

// Every dance file this package bundles, as data. Every file is
// `ContraDanceSpec` as written — title, author, formation id, phrases with
// figure calls and params, notes, `startPlaces`/`waitOut` where a dance has them
// — plus a `source` block with the Caller's Box id, URL, permission and the
// quoted transcript. Nothing here is reconstructed from memory (see
// `docs/adr/2026-09-13-corpus-and-permission.md`); the threaded `from` and
// `carried` places are derived by `danceFromFile` at load, never stored.
import aRareBirdFile from "../../../../data/dances/a-rare-bird.json" with { type: "json" };
import afterTheSolsticeFile from "../../../../data/dances/after-the-solstice.json" with { type: "json" };
import airpantsFile from "../../../../data/dances/airpants.json" with { type: "json" };
import annasReelFile from "../../../../data/dances/annas-reel.json" with { type: "json" };
import areYouMostDoneFile from "../../../../data/dances/are-you-most-done.json" with { type: "json" };
import butterFile from "../../../../data/dances/butter.json" with { type: "json" };
import chorusJigFile from "../../../../data/dances/chorus-jig.json" with { type: "json" };
import contraCockaigneFile from "../../../../data/dances/contra-cockaigne.json" with { type: "json" };
import contrablendFile from "../../../../data/dances/contrablend.json" with { type: "json" };
import fatalAttractionFile from "../../../../data/dances/fatal-attraction.json" with { type: "json" };
import jeremyCornersFile from "../../../../data/dances/jeremy-corners.json" with { type: "json" };
import jubilationFile from "../../../../data/dances/jubilation.json" with { type: "json" };
import kitchenStompFile from "../../../../data/dances/kitchen-stomp.json" with { type: "json" };
import neighborNeighborOnTheWallFile from "../../../../data/dances/neighbor-neighbor-on-the-wall.json" with { type: "json" };
import onTheProwlFile from "../../../../data/dances/on-the-prowl.json" with { type: "json" };
import thanksToTheGeneFile from "../../../../data/dances/thanks-to-the-gene.json" with { type: "json" };
import theBabyRoseFile from "../../../../data/dances/the-baby-rose.json" with { type: "json" };
import theCarouselFile from "../../../../data/dances/the-carousel.json" with { type: "json" };
import theNiceCombinationFile from "../../../../data/dances/the-nice-combination.json" with { type: "json" };
import theSetMonsterFile from "../../../../data/dances/the-set-monster.json" with { type: "json" };
import whooshFile from "../../../../data/dances/whoosh.json" with { type: "json" };

/**
 * Every dance file this package bundles, by its own slug.
 *
 * **A module of its own** (M8) so that the library can read the dances' own
 * `figures` maps — a dance-local figure (D10) is a definition the library has to
 * hold, and `dances/index.ts` is downstream of the library and cannot be asked
 * for it. Nothing here imports anything but the JSON, so it is a leaf.
 */
export const DANCE_FILES: Record<string, DanceFile> = Object.fromEntries(
  (
    [
      aRareBirdFile,
      afterTheSolsticeFile,
      airpantsFile,
      annasReelFile,
      areYouMostDoneFile,
      butterFile,
      chorusJigFile,
      contraCockaigneFile,
      contrablendFile,
      fatalAttractionFile,
      jeremyCornersFile,
      jubilationFile,
      kitchenStompFile,
      neighborNeighborOnTheWallFile,
      onTheProwlFile,
      thanksToTheGeneFile,
      theBabyRoseFile,
      theCarouselFile,
      theNiceCombinationFile,
      theSetMonsterFile,
      whooshFile,
    ] as DanceFile[]
  ).map((file) => [file.slug, file]),
);

/**
 * **Dance-local figures** (D10): the definitions the dance files carry
 * themselves, each under the id `<slug>/<name>`.
 *
 * A dance may need a figure no other dance in the corpus asks for — Fatal
 * Attraction's two-beat "men go forward" beside the women's cast back — and the
 * alternative to writing it here is either a library figure nothing else calls
 * or a call the record cannot make at all. The id carries the slug, so two
 * dances cannot collide and a reader of a call always knows where to look, and
 * **promoting one is a copy**: move the literal into
 * `library/figures/<name>.ts`, drop the slug from the calls that name it, and
 * nothing else changes.
 *
 * Read straight off the files rather than through `danceFromFile`, because
 * loading a dance is what needs them: `checkCall` asks whether a call names a
 * figure that exists, and a local figure has to exist by then.
 */
export function localFigureDefinitions(): readonly FigureDefinition[] {
  const out: FigureDefinition[] = [];
  for (const [name, file, definition] of localFigures()) {
    // Everything but the `texts` block, which belongs to `text/figureText.ts`
    // and is not part of a `FigureDefinition`.
    const rest: Record<string, unknown> = { ...(definition as Record<string, unknown>) };
    delete rest["texts"];
    out.push({ ...(rest as unknown as FigureDefinition), id: localFigureId(file.slug, name) });
  }
  return out;
}

/**
 * **A dance-local figure's four texts**, which live in the dance file beside the
 * definition they belong to.
 *
 * `data/figures/<id>.json` is where every library figure's texts live, and a
 * local figure's id has a slug and a slash in it — so a file of its own would be
 * a directory, and promoting the figure would be a copy of two things in two
 * places instead of one thing in one. The dance file carries them under the
 * definition's own `texts` key, in exactly the shape `data/figures/<id>.json`
 * has, and `text/figureText.ts` folds them into the same table.
 */
export function localFigureTexts(): readonly unknown[] {
  const out: unknown[] = [];
  for (const [name, file, definition] of localFigures()) {
    if (definition.texts === undefined) continue;
    out.push({ ...definition.texts, id: localFigureId(file.slug, name) });
  }
  return out;
}

/** Every dance-local figure: its local name, its dance's file, and the literal. */
function localFigures(): Array<[string, DanceFile, { texts?: object }]> {
  const out: Array<[string, DanceFile, { texts?: object }]> = [];
  for (const file of Object.values(DANCE_FILES)) {
    for (const [name, definition] of Object.entries(file.figures ?? {})) {
      out.push([name, file, definition as { texts?: object }]);
    }
  }
  return out;
}

/** What a dance-local figure is called everywhere outside its own dance file. */
export const localFigureId = (slug: string, name: string): string => `${slug}/${name}`;
