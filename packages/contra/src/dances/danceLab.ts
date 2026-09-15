import type { Beat } from "@caller/core";
import type { Dance, DancerId, MotionStats, PhraseName, StationId } from "@caller/choreo";
import {
  MOTION_STEP,
  callBeats,
  concurrentCalls,
  createHall,
  danceBeats,
  danceSchedule,
  motionReport,
  poseAt,
} from "@caller/choreo";
import type { ContraCall } from "../figures/chain.js";
import type { Carried } from "../figures/ContraFigure.js";
import { CONTRA_MOTION_BOUNDS } from "../figures/motionBounds.js";
import type { Library } from "../library/Library.js";
import { contraDataEngine } from "../library/engine.js";
import { contraDataFigures } from "../library/figures/index.js";
import { waypointMeets } from "../library/kinds/waypoints.js";
import { latticeSpan } from "../set/lattice.js";
import type { SetShapeKind, TargetShape } from "../set/shape.js";
import { shapeFromEnds, shapeMiss, solveShape, turnsToTarget } from "../set/shape.js";
import { contraCyclePlanner } from "../set/planCycle.js";
import { isRelationWord, parseRelation, relate } from "../set/relations.js";
import { HOLD_PLACE_FIGURE } from "../set/resolve.js";
import { setRulesFor } from "../set/SetRules.js";
import { modelFromSet } from "../set/SetModel.js";
import { UNSUPPORTED_FIGURES } from "./acceptance.js";
import { ALL_DANCES } from "./index.js";
import type { MotionMetric } from "./motionAllowlist.js";
import { motionAllowance } from "./motionAllowlist.js";
import type { DanceOracles } from "./oracle.js";
import {
  CLOSURE_PX,
  COLLISION_PX,
  danceAlone,
  formationFor,
  linesFor,
  oraclesFor,
} from "./oracle.js";

/**
 * `packages/contra/scripts/danceLab.mjs`'s data: everything `pnpm dance <slug>`
 * prints, without the pictures.
 *
 * The same split `figureLab.ts` uses — this file answers "does this dance
 * resolve and dance", the `.mjs` script prints it, spawns `traces:export` for
 * the SVGs and turns both into one exit code.
 *
 * It is the inner loop of the whole rebuild and the consumer the corpus
 * translation is designed for (`plan.md` goal 4): an agent handed a transcript
 * and `docs/dance-record.md` writes a dance file and finds out from **one
 * command** whether every call resolves, whether the dance closes, reaches and
 * misses at every checked line length, and whether anything moves faster than
 * the library allows.
 */

/** Everything the lab found about one dance, and whether the loop is green. */
export interface DanceLabReport {
  slug: string;
  /** `false` when any call failed to resolve, any oracle failed, or any motion row is over bound and not allowed. */
  ok: boolean;
  text: string;
}

/** One call of a dance, as the new layer resolved it in one set. */
export interface ResolutionRow {
  phrase: PhraseName;
  /** The figure the call names. */
  figure: string;
  start: Beat;
  beats: Beat;
  /** The group instance that danced it. */
  group: string;
  /** Figure-role → dancer, for the dancers this instance cast. */
  cast: Record<StationId, DancerId>;
  /** The definition's anchor rule. */
  anchor: string;
  /** The definition's ends rule. */
  ends: string;
  /** Hands the instance took over from the one before it, as `c1/lark.R↔c1/robin.L`. */
  carriedIn: string[];
  /** Hands the instance handed on to the next one. */
  carriedOut: string[];
  /** Everybody this call left standing, in their own hold-place instance. */
  holdPlace: DancerId[];
}

/**
 * How one dance resolves, read back off a real run through the contra planner.
 *
 * Not a second implementation of resolution: the planner is run for one time
 * through and the timeline it produced is read, so the table is what actually
 * happened rather than what a parallel code path thinks would.
 */
export function danceResolution(dance: Dance, couples: number): ResolutionRow[] {
  const { library } = contraDataEngine();
  const timeline = danceAlone(dance, couples, danceBeats(dance), {}, LAB_RUN).timeline();
  const rows: ResolutionRow[] = [];
  for (const { call: written, start, phrase } of danceSchedule(dance)) {
    // **A concurrent call is several figures at one beat** (M8), and the table
    // has a row for each of them: the larks' allemande and the robins' loop are
    // both what happened at beat 48.
    const beats = callBeats(written);
    const here = timeline.figures().filter((e) => e.start === start && e.end <= start + beats);
    const holds = here.filter((e) => e.figure === HOLD_PLACE_FIGURE);
    for (const call of concurrentCalls(written)) {
      for (const event of here) {
        if (event.figure !== call.figure || event.end !== start + call.beats) continue;
        const def = library.has(call.figure) ? library.get(call.figure) : undefined;
        const carried = (event.params as { carried?: Carried }).carried;
        // The dancers this call left out, in the **same minor set** as this
        // instance — not in the same group. A data figure's instance is a group
        // of two minted per pair (`set0/p0/allemande/1R-2R#3`) and the hold-place
        // instance beside it is the minor set's own (`set0/p0#4`), so comparing
        // whole group ids matched nothing and the table silently dropped every
        // hold-place row from the moment M2 migrated a figure. The minor set is
        // the first two segments of either id.
        const mine = minorSetOf(event.group);
        const standing = holds.filter((h) => minorSetOf(h.group) === mine);
        rows.push({
          phrase,
          figure: call.figure,
          start,
          beats: call.beats,
          group: event.group,
          cast: { ...event.bindings },
          anchor: def === undefined ? "—" : JSON.stringify(def.anchor),
          ends: def === undefined ? "—" : JSON.stringify(def.ends),
          carriedIn: joinsOf(carried?.in, event.bindings),
          carriedOut: joinsOf(carried?.out, event.bindings),
          holdPlace: standing.flatMap((h) => Object.values(h.bindings)),
        });
      }
    }
  }
  return rows;
}

/**
 * The minor set a group instance belongs to: the first two segments of its id.
 *
 * `set0/p0#4` and `set0/p0/allemande/1R-2R#3` are the same four dancers' minor
 * set, partitioned two different ways by two different calls. Everything after
 * the second segment names the instance rather than the place.
 */
function minorSetOf(group: string): string {
  return group.split("/").slice(0, 2).join("/").replace(/#\d+$/, "");
}

/**
 * A `Carried` side as readable `c1/lark.R↔c1/robin.L` strings, deduplicated and
 * sorted.
 *
 * Named by **dancer**, not by the instance's own station or figure-role. A hold
 * crossing a call boundary is one pair of hands seen from two figures, and
 * since M2 those two figures need not name their parts the same way: a balance
 * calls them `a` and `b` and the swing that takes the hold over calls them
 * `lark` and `robin`. The dancer is the thing both figures agree about, so a
 * reader — and the test that checks the two sides of every seam agree — can
 * line the two rows up.
 */
function joinsOf(
  side: Carried["in"] | undefined,
  cast: Readonly<Record<StationId, DancerId>>,
): string[] {
  if (!side) return [];
  const who = (role: StationId): string => short(cast[role] ?? role);
  const out = new Set<string>();
  for (const [role, hands] of Object.entries(side)) {
    for (const [mine, held] of Object.entries(hands)) {
      if (!held) continue;
      const a = `${who(role)}.${mine}`;
      const b = `${who(held.with)}.${held.side}`;
      out.add([a, b].sort().join("↔"));
    }
  }
  return [...out].sort();
}

/** The line length the resolution table and the motion rows are read at. */
export const labCouples = (dance: Dance): number => linesFor(dance)[0] ?? 4;

/**
 * Which figures this dance calls that the rebuild still owes, and nothing else.
 *
 * A lab dance encoded from a transcript may name a figure a later milestone
 * owns — M6's own three do — and a dance that owes one **cannot be planned at
 * all**: resolution throws on the first call it reaches. Anything that would
 * try to dance it asks this first (`@caller/web`'s `danceOrder`), and
 * `pnpm dance <slug>` opens with it.
 */
export const danceOwes = (dance: Dance): string[] =>
  [
    ...new Set(
      danceSchedule(dance)
        .map((s) => s.call.figure)
        .filter((figure) => UNSUPPORTED_FIGURES[figure] !== undefined),
    ),
  ].sort();

/** One dancer a call's own relation leaves out, and which end of the set they are at. */
export interface EndEffectRow {
  couples: number;
  phrase: PhraseName;
  figure: string;
  start: Beat;
  /** The relation word the call named. */
  relation: string;
  dancer: DancerId;
  /** `"top"` or `"bottom"`: which end of the line this dancer is standing at. */
  end: "top" | "bottom";
}

/**
 * **The end-effects table** (M6): which calls leave whom out, at which end.
 *
 * M6's end-of-set rule is the simplest one there is — *a relation that resolves
 * to nobody leaves that dancer on hold-place for the call* — and this is the
 * rule read out loud. It is computed from the **lattice**, not from the
 * timeline: for every call that names a relation, every dancer that relation
 * answers nobody for is a row, at whichever end of the line they are standing.
 * So it says why somebody stood still, not merely that they did.
 *
 * It is evidence rather than failure. A dance with a wide relation has busier
 * ends at short line lengths by construction — Whoosh reaches N4, so a
 * two-couple line has nobody to reach — and the table is how a caller finds out
 * how long a line that dance wants.
 */
export function endEffects(dance: Dance, couples: number): EndEffectRow[] {
  const formation = formationFor(dance);
  const set = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]).sets[0];
  if (!set) return [];
  const { library } = contraDataEngine();
  const model = modelFromSet(formation, set, new Map());
  const table = setRulesFor(formation).relations;
  const span = latticeSpan(model);
  const rows: EndEffectRow[] = [];
  for (const { call, start, phrase } of danceSchedule(dance)) {
    for (const word of relationsOf(call, library)) {
      const rel = parseRelation(word);
      for (const dancer of Object.values(model.dancers)) {
        if (relate(model, table, dancer.id, rel) !== undefined) continue;
        const { position } = dancer.slot;
        rows.push({
          couples,
          phrase,
          figure: call.figure,
          start,
          relation: word,
          dancer: dancer.id,
          end: position - span.lowest <= span.highest - position ? "top" : "bottom",
        });
      }
    }
  }
  return rows;
}

/**
 * The relation words one call names: in `who`, in its `pairs` parameter, and —
 * since M7b — inside the figure it calls.
 *
 * A grand right and left is three pull-bys with three different dancers and one
 * call with no `pairs` at all, so the words that matter are the figure's own
 * (`kinds/waypoints.ts`'s `meets`). Without them the table said nothing about
 * the one call in Whoosh whose ends are busiest.
 */
function relationsOf(call: { figure?: string; who?: unknown; params?: unknown }, library: Library) {
  const out: string[] = [];
  const params = call.params as Record<string, unknown> | undefined;
  for (const value of [call.who, params?.["pairs"]]) {
    if (typeof value === "string" && isRelationWord(value)) out.push(value);
  }
  const def =
    call.figure !== undefined && library.has(call.figure) ? library.get(call.figure) : undefined;
  if (def?.shape.kind === "waypoints") {
    for (const word of waypointMeets(def.shape)) {
      if (isRelationWord(word)) out.push(word);
    }
  }
  return [...new Set(out)];
}

/** One call that names the shape it forms, and whether it really formed one. */
export interface ShapeRow {
  phrase: PhraseName;
  figure: string;
  start: Beat;
  /** The instance that formed it. */
  group: string;
  /** The shape the call — or the figure — says it leaves behind. */
  shape: SetShapeKind;
  /** How far the worst dancer is from really standing in it, px. */
  missPx: number;
  /** Whether the figure also settled the shape on to the formation's places. */
  settled: boolean;
  /** The turn the call stated, when it stated one. */
  said?: number;
  /** The turn the shape asks for, solved backwards from it (Q6). */
  solved?: number;
}

/** How far off a stated shape a call may leave its dancers before it is worth saying, px. */
export const SHAPE_SLOP_PX = 0.5;

/** How far off a stated turn a solved one may be before it is worth saying, in turns. */
export const AMOUNT_SLOP = 0.125;

/**
 * **The shapes a dance says it forms** (Q6), measured.
 *
 * A figure's `ends` may name a **target shape** — "bend the line" leaves a ring,
 * a line of four leaves a line of four, a balance of the wave leaves the wave —
 * and a *call* may name one too, in its own `form` parameter, which is how a
 * transcript's exit clause is written down (*"; form wave of four (men in
 * center)"*). Either way the claim is checkable, and this is the check: solve
 * the shape from where the figure **really** left its dancers and measure how
 * far any of them is from the place it gives them.
 *
 * It is a **warning**, never a failure, and deliberately: the shape clause is a
 * description of where a figure leaves you, and a figure that leaves you
 * somewhere else is a thing a caller wants to be told about rather than a thing
 * that should stop the dance from loading. The same goes for the **amount**: a
 * call that states both a turn and a shape is stating one thing twice, and when
 * the two disagree the caller's word wins and the disagreement is printed.
 */
export function danceShapes(dance: Dance, couples: number): ShapeRow[] {
  const { library } = contraDataEngine();
  const beats = danceBeats(dance);
  const timeline = danceAlone(dance, couples, beats, {}, LAB_RUN).timeline();
  const rows: ShapeRow[] = [];
  for (const { call, start, phrase } of danceSchedule(dance)) {
    const target = targetOf(library, call);
    if (target === undefined) continue;
    for (const event of timeline.figures()) {
      if (event.start !== start || event.figure !== call.figure) continue;
      const cast = Object.values(event.bindings);
      if (cast.length < 2) continue;
      const ended = cast.map((dancer) => {
        const pose = poseAt(timeline, dancer, event.end);
        return { dancer, p: pose.p, facing: pose.facing };
      });
      // Read in the order they are really standing in, which is what the shape
      // is: `shapeFromEnds` sorts a row along itself and a ring round itself.
      const order = shapeFromEnds(target.shape, ended).order;
      const spots = order.map((dancer) => {
        const pose = poseAt(timeline, dancer, event.end);
        return { p: pose.p, facing: pose.facing };
      });
      const row: ShapeRow = {
        phrase,
        figure: call.figure,
        start,
        group: event.group,
        shape: target.shape,
        missPx: shapeMiss(target, spots),
        settled: target.settle === true,
      };
      const said = (call.params as Record<string, unknown> | undefined)?.["amount"];
      if (typeof said === "number" && spots.length > 1) {
        // Q6's other half: the turn the shape asks for, solved backwards from
        // it. The first dancer of the shape's own order is the one measured,
        // about the centre the shape sits on.
        const solved = solveShape(target, spots);
        const from = poseAt(timeline, order[0]!, event.start).p;
        row.said = said;
        row.solved = turnsToTarget(
          from,
          solved.spots[0]!.p,
          solved.centre,
          said < 0 ? -1 : 1,
          0.25,
        );
      }
      rows.push(row);
    }
  }
  return rows;
}

/** The shape a call forms: the figure's own, with whatever the call said over it. */
function targetOf(library: Library, call: ContraCall): TargetShape | undefined {
  const def = library.has(call.figure) ? library.get(call.figure) : undefined;
  const own =
    def !== undefined && typeof def.ends === "object" && "target" in def.ends
      ? def.ends.target
      : undefined;
  const said = (call.params as Record<string, unknown> | undefined)?.["form"];
  if (said === null || said === undefined || typeof said !== "object") return own;
  return { ...(own ?? { shape: "lines" }), ...(said as Partial<TargetShape>) };
}

/** `pnpm dance <slug>`'s whole text report, and whether the loop is green. */
export function danceLabReport(
  slug: string,
  couples?: number,
  dances: readonly Dance[] = ALL_DANCES,
): DanceLabReport {
  const dance = dances.find((d) => d.slug === slug);
  if (!dance) {
    return {
      slug,
      ok: false,
      text: [
        `# pnpm dance ${slug}`,
        "",
        `no such dance: \`data/dances/${slug}.json\` is not loaded ` +
          `(have: ${dances.map((d) => d.slug).join(", ")}).`,
        "",
      ].join("\n"),
    };
  }

  const at = couples ?? labCouples(dance);
  const lines: string[] = [`# pnpm dance ${slug}`, ""];
  lines.push(
    `**${dance.title}** — ${dance.author} · \`${dance.formation}\` · ` +
      `${String(danceBeats(dance))} beats · resolved at ${String(at)} couples`,
    "",
  );
  if (dance.notes) lines.push(`> ${dance.notes}`, "");

  let ok = true;

  // 0. What this dance is still owed, by name and by milestone.
  //
  // A lab dance encoded from a transcript may call a figure a later milestone
  // owns. That is deliberate — the call is written down so the record is
  // complete and the test says exactly what is missing — and it is the first
  // thing a reader wants, because nothing below it can be green until the
  // figure exists.
  const owed = danceOwes(dance);
  if (owed.length > 0) {
    ok = false;
    lines.push("## 0. Still owed", "");
    for (const figure of owed) {
      lines.push(`- \`${figure}\` — **${UNSUPPORTED_FIGURES[figure]!}** owns it.`);
    }
    lines.push(
      "",
      "This dance cannot resolve until they land, so everything below stops at the first one.",
      "",
      "resolution, oracles and motion: FAIL",
      "",
    );
    return { slug, ok, text: lines.join("\n") };
  }

  // 1. The resolution table: what each call became.
  lines.push("## 1. Resolution", "");
  let rows: ResolutionRow[] = [];
  try {
    rows = danceResolution(dance, at);
  } catch (error) {
    ok = false;
    lines.push(`**FAIL** — this dance does not resolve: ${String(error)}`, "");
  }
  let phrase: PhraseName | undefined;
  for (const row of rows) {
    if (row.phrase !== phrase) {
      phrase = row.phrase;
      lines.push(`### ${phrase}`, "");
    }
    const cast = Object.entries(row.cast)
      .map(([role, dancer]) => `${role}=${short(dancer)}`)
      .join(" ");
    lines.push(
      `- beat ${String(row.start)}+${String(row.beats)} \`${row.figure}\` ` +
        `in \`${row.group}\` — anchor ${row.anchor}, ends ${row.ends}`,
    );
    lines.push(`  - cast: ${cast}`);
    if (row.carriedIn.length > 0) lines.push(`  - carried in: ${row.carriedIn.join(", ")}`);
    if (row.carriedOut.length > 0) lines.push(`  - carried out: ${row.carriedOut.join(", ")}`);
    if (row.holdPlace.length > 0) {
      lines.push(`  - hold place: ${row.holdPlace.map(short).join(", ")}`);
    }
  }
  if (rows.length > 0) lines.push("");

  // 2. The oracles, at every line length this formation is checked at.
  lines.push("## 2. Oracles — closure (AC5), reach (AC1), collision (AC6), coverage", "");
  const until: Beat = danceBeats(dance) * 2;
  for (const line of linesFor(dance)) {
    let o;
    try {
      o = danceOracles(dance, line, until);
    } catch (error) {
      ok = false;
      lines.push(`- ${String(line)} couples: **FAIL** — ${String(error)}`);
      continue;
    }
    const closureOk = o.closurePx < CLOSURE_PX;
    const reachOk = o.maxShort === 0;
    const collisionOk = o.minDistancePx > COLLISION_PX;
    const coverageOk = o.coverage.length === 0;
    if (!closureOk || !reachOk || !collisionOk || !coverageOk) ok = false;
    lines.push(
      `- ${String(line)} couples: ` +
        `closure ${mark(closureOk)} (worst ${o.closurePx.toFixed(4)} px) · ` +
        `progressed ${o.progressedPx.toFixed(4)} px · ` +
        `reach ${mark(reachOk)} (worst short ${o.maxShort.toFixed(4)} px) · ` +
        `collision ${mark(collisionOk)} (closest ${fixed(o.minDistancePx)} px) · ` +
        `coverage ${mark(coverageOk)}${coverageOk ? "" : ` (${o.coverage.join("; ")})`}`,
    );
  }
  lines.push("");

  // 3. The end effects: which calls leave whom out, at which end (M6).
  lines.push("## 3. End effects — a relation that names nobody", "");
  lines.push(
    "A relation that resolves to nobody leaves that dancer on hold-place for the call. " +
      "These rows are evidence, not failure: a dance that reaches to N3 or N4 has busier " +
      "ends in a short line, and this is how long a line it is asking for.",
    "",
  );
  let endRows = 0;
  for (const line of linesFor(dance)) {
    const rows = endEffects(dance, line);
    endRows += rows.length;
    if (rows.length === 0) {
      lines.push(`- ${String(line)} couples: nobody is left out by an end.`);
      continue;
    }
    const byCall = new Map<string, EndEffectRow[]>();
    for (const row of rows) {
      const key = `${row.phrase} beat ${String(row.start)} \`${row.figure}\` (${row.relation})`;
      const seen = byCall.get(key);
      if (seen) seen.push(row);
      else byCall.set(key, [row]);
    }
    lines.push(`- ${String(line)} couples:`);
    for (const [key, group] of byCall) {
      const top = group.filter((r) => r.end === "top").map((r) => short(r.dancer));
      const bottom = group.filter((r) => r.end === "bottom").map((r) => short(r.dancer));
      lines.push(
        `  - ${key} — ` +
          [
            top.length === 0 ? "" : `top: ${top.join(", ")}`,
            bottom.length === 0 ? "" : `bottom: ${bottom.join(", ")}`,
          ]
            .filter((s) => s.length > 0)
            .join(" · "),
      );
    }
  }
  if (endRows === 0) lines.push("_no call of this dance names a relation._");
  lines.push("");

  // 3b. The shapes the dance says it forms, and whether it formed them (Q6).
  //
  // A warning, never a failure: a shape clause describes where a figure leaves
  // you, and a caller wants to be told when the description and the dancing
  // part company rather than have the dance refuse to load.
  const shapes = danceShapes(dance, at);
  if (shapes.length > 0) {
    lines.push("## 3b. Shapes — a call that names the shape it forms (Q6)", "");
    for (const row of shapes) {
      // A shape that settles on to the formation's own places is measured
      // against a **regular** one, and a contra set's four places are a
      // rectangle 32 px across and 20 along rather than a square: "bend the
      // line" really does leave four dancers in a ring they can all take hands
      // in, and really is not a circle. The warning says both.
      const why = row.settled ? ", settled on the formation's own places" : "";
      const off =
        row.missPx > SHAPE_SLOP_PX
          ? ` — **warning: ${row.missPx.toFixed(3)} px off a regular ${row.shape}${why}**`
          : "";
      const amount =
        row.said === undefined || row.solved === undefined
          ? ""
          : Math.abs(row.said - row.solved) > AMOUNT_SLOP
            ? ` · amount **warning**: the call says ${row.said.toFixed(2)} and the shape asks for ${row.solved.toFixed(2)}`
            : ` · amount ${row.said.toFixed(2)}, and the shape agrees`;
      lines.push(
        `- ${row.phrase} beat ${String(row.start)} \`${row.figure}\` forms a **${row.shape}** ` +
          `in \`${row.group}\` — worst ${row.missPx.toFixed(3)} px off it${off}${amount}`,
      );
    }
    lines.push("");
  }

  // 4. Motion: the dance's own seams, which fail unless allowlisted (R6).
  lines.push("## 4. Motion — the dance's seams", "");
  lines.push(
    `Bounds: hand ${CONTRA_MOTION_BOUNDS.handSpeedPx.toFixed(1)} · ` +
      `elbow ${CONTRA_MOTION_BOUNDS.elbowSpeedPx.toFixed(1)} · ` +
      `elbow/hand ${CONTRA_MOTION_BOUNDS.elbowPerHand.toFixed(2)}× · ` +
      `height ${CONTRA_MOTION_BOUNDS.heightRatePx.toFixed(1)} · ` +
      `dip ${CONTRA_MOTION_BOUNDS.dipPx.toFixed(2)} px. ` +
      "A value over its bound fails unless `motionAllowlist.ts` says why.",
    "",
  );
  const timeline = danceAlone(dance, at, until, {}, LAB_RUN).timeline();
  const motion = motionReport(timeline, until, {
    step: MOTION_STEP,
    bounds: CONTRA_MOTION_BOUNDS,
  });
  const reasons = new Map<string, string>();
  for (const row of [...motion.figures, ...motion.seams]) {
    const problems = overBound(row);
    for (const metric of problems) {
      const allowed = motionAllowance(dance.slug, row.key, metric);
      if (allowed === undefined) ok = false;
      else reasons.set(`${row.key} ${metric}`, allowed.reason);
    }
    lines.push(motionLine(row, dance.slug, problems));
  }
  if (motion.figures.length === 0 && motion.seams.length === 0) lines.push("_none measured._");
  lines.push("");
  if (reasons.size > 0) {
    lines.push("Allowed, with reasons:", "");
    for (const [key, reason] of [...reasons].sort()) lines.push(`- \`${key}\` — ${reason}`);
    lines.push("");
  }

  lines.push(
    ok ? "resolution, oracles and motion: green" : "resolution, oracles and motion: FAIL",
    "",
  );
  return { slug, ok, text: lines.join("\n") };
}

/**
 * One dance's oracles, run through the **new** planner.
 *
 * The lab measures the path the lab is for. The app still runs the default
 * planner in M1 and M3 is what flips it over; every other oracle in the
 * repository (`dances.test.ts`, `pnpm figure`, the motion report) stays on the
 * old path until then, which is why this is the one place that asks for the
 * contra planner by name.
 */
const danceOracles = (dance: Dance, couples: number, until: Beat): DanceOracles =>
  oraclesFor(dance, couples, until, {}, LAB_RUN);

/**
 * How the lab runs a dance: the contra planner, and a registry whose migrated
 * ids are the **interpreted** figures rather than the coded ones.
 *
 * Both halves or neither. `poseAt` resolves a figure by id in the registry, so
 * a run with the new library and the old registry would plan a data swing and
 * draw a coded one; `planCycle` refuses that by name rather than dancing it.
 *
 * Exported since M5, because it is no longer only the lab's: it is **what the
 * demo runs on** (`DEFAULT_ENGINE` has been `"new"` since M3), and a dance that
 * calls a figure for two with no coded twin — On the Prowl's shoulder round —
 * cannot be sampled on the old path at all. `dances.test.ts` runs AC5, AC1 and
 * AC6 on this, so what those three check is the dance as it ships.
 */
export const LAB_RUN = { cycle: contraCyclePlanner, figures: contraDataFigures() };

/** One motion row, with every over-bound value marked and said to be allowed or not. */
function motionLine(row: MotionStats, slug: string, problems: readonly MotionMetric[]): string {
  const b = CONTRA_MOTION_BOUNDS;
  const verdict = problems
    .map((metric) => (motionAllowance(slug, row.key, metric) ? "" : ` **FAIL ${metric}**`))
    .join("");
  return (
    `- \`${row.key}\`: hand ${over(row.handSpeed.value, b.handSpeedPx)} · ` +
    `elbow ${over(row.elbowSpeed.value, b.elbowSpeedPx)} · ` +
    `elbow/hand ${over(row.elbowPerHand.value, b.elbowPerHand, 2)}× · ` +
    `height ${over(row.heightRate.value, b.heightRatePx)} · ` +
    `dip ${over(row.dip.value, b.dipPx, 2)} · ` +
    `flips ${String(row.stateFlips)} · NaN ${String(row.nonFinite)}${verdict}`
  );
}

/** Which of a row's five bounded columns are over their bound. */
function overBound(row: MotionStats): MotionMetric[] {
  const b = CONTRA_MOTION_BOUNDS;
  const out: MotionMetric[] = [];
  if (row.handSpeed.value > b.handSpeedPx) out.push("handSpeed");
  if (row.elbowSpeed.value > b.elbowSpeedPx) out.push("elbowSpeed");
  if (row.elbowPerHand.value > b.elbowPerHand) out.push("elbowPerHand");
  if (row.heightRate.value > b.heightRatePx) out.push("heightRate");
  if (row.dip.value > b.dipPx) out.push("dip");
  return out;
}

const mark = (good: boolean): string => (good ? "pass" : "FAIL");

const fixed = (n: number): string => (Number.isFinite(n) ? n.toFixed(3) : "—");

/** A number, marked `**like this**` when it is over its bound. */
const over = (value: number, bound: number, places = 1): string =>
  value > bound ? `**${value.toFixed(places)}**` : value.toFixed(places);

/** `set0/c3/lark` as `c3/lark`: the set is the same one all the way down the table. */
const short = (dancer: DancerId): string => dancer.split("/").slice(1).join("/");
