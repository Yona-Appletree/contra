import type { Dance } from "@caller/choreo";
import { concurrentCalls } from "@caller/choreo";
import type { FigureDefinition, SetShapeKind } from "@caller/contra";
import { ALL_DANCES, DATA_DEFINITIONS, DEMO_DANCES } from "@caller/contra";

/**
 * **The shapes a set stands in, listed apart from the figures** (DD41, DD42's
 * first step).
 *
 * The user, on the `diamond` row of the figure review: *"its not a move. its a
 * place setup. it means that the whole minor set is rotated 1/8 turn basically.
 * many normal moves can happen from it, but people are arranged differently."*
 * A shape is not a figure and the Moves page must not file it among them — so
 * the page opens with this list, which is `set/shape.ts`'s own `SetShapeKind`
 * and nothing else, and every figure family after it is figures.
 *
 * What a row says is read rather than written: which figures **form** this shape
 * (their `ends` names it) and which calls in the record **land** in it (a `form`
 * clause on the call). A definition or a call that starts naming a shape gets a
 * row entry with no edit here.
 *
 * DD42's full ruling — the page organised *by* shape, with the figures that
 * dance from each shown in it — is M12b's, after a `yona-ux` spike. This is the
 * half of it that is a fact about the model rather than a presentation choice.
 */

/** One shape of the set, as the Moves page lists it. */
export interface MoveShape {
  kind: SetShapeKind;
  /** What a caller calls it. */
  title: string;
  /** What it is, in a caller's words. */
  blurb: string;
  /** The figures whose own `ends` say they form it. */
  formedBy: readonly string[];
  /** The calls in the record that name it with a `form` clause. */
  landedIn: readonly MoveShapeCall[];
}

/** One call in the record that says it forms a shape. */
export interface MoveShapeCall {
  slug: string;
  title: string;
  phrase: string;
  figure: string;
  /** Which named place of the shape the call's own dancers take, if it said. */
  at?: string;
}

/**
 * The shapes, in the order DD42 names them: the default arrangement first, then
 * the ones a dance forms.
 */
const SHAPES: readonly { kind: SetShapeKind; title: string; blurb: string }[] = [
  {
    kind: "lines",
    title: "The lines",
    blurb:
      "The arrangement a contra set is in when nobody has formed anything: two lines the length of the hall, facing across, a hands four at every two couples.",
  },
  {
    kind: "line-of-four",
    title: "A line of four",
    blurb:
      "Four dancers in a row in a written order, hands joined along it, travelling the way the line faces: down the hall and back up it.",
  },
  {
    kind: "wave",
    title: "A wave",
    blurb:
      "A line of joined hands facing alternately one way and the other — down the set the long way, or across it between the lines.",
  },
  {
    kind: "ring",
    title: "A ring",
    blurb:
      "A circle of joined hands, everybody facing its middle, the places evenly spaced whatever the stations under it are.",
  },
  {
    kind: "diamond",
    title: "A diamond",
    blurb:
      "The whole minor set turned an eighth of a turn about its own middle: two dancers come into the centre of the set a long way apart, up and down it, and two are left out on the lines. Ordinary figures are danced from it; nothing forms it but arriving there.",
  },
];

/** Every shape, with the figures that form it and the calls that land in it. */
export function moveShapes(
  definitions: readonly FigureDefinition[] = DATA_DEFINITIONS,
  dances: readonly Dance[] = ALL_DANCES,
): MoveShape[] {
  const programme = new Set(DEMO_DANCES.map((dance) => dance.slug));
  const order = [
    ...dances.filter((dance) => programme.has(dance.slug)),
    ...dances.filter((dance) => !programme.has(dance.slug)),
  ];
  return SHAPES.map((shape) => ({
    ...shape,
    formedBy: definitions.filter((def) => targetShapeOf(def) === shape.kind).map((def) => def.id),
    landedIn: order.flatMap((dance) => callsForming(dance, shape.kind)),
  }));
}

/** The shape a definition's own `ends` says it forms. */
function targetShapeOf(def: FigureDefinition): string | undefined {
  return typeof def.ends === "object" && "target" in def.ends ? def.ends.target.shape : undefined;
}

/** The calls of one dance that carry a `form` clause naming this shape. */
function callsForming(dance: Dance, kind: SetShapeKind): MoveShapeCall[] {
  const out: MoveShapeCall[] = [];
  for (const phrase of dance.phrases) {
    for (const parent of phrase.figures) {
      for (const call of concurrentCalls(parent)) {
        const said = (call.params as Record<string, unknown> | undefined)?.["form"];
        if (typeof said !== "object" || said === null) continue;
        const form = said as { shape?: unknown; at?: unknown };
        if (form.shape !== kind) continue;
        out.push({
          slug: dance.slug,
          title: dance.title,
          phrase: phrase.name,
          figure: call.figure,
          ...(typeof form.at === "string" ? { at: form.at } : {}),
        });
      }
    }
  }
  return out;
}
