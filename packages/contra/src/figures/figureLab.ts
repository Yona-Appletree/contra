import type { Beat } from "@caller/core";
import type { Dance, Formation, Group, MotionStats, StationId } from "@caller/choreo";
import {
  SEAM_BEATS,
  createGroup,
  createTimeline,
  danceBeats,
  motionReport,
  withDefaults,
} from "@caller/choreo";
import type { CheckOverrides, FigureChecks } from "./figureChecks.js";
import { CHECK_FRAME, checkGroup, figureChecks } from "./figureChecks.js";
import { isKnownWrong } from "./knownWrong.js";
import { CONTRA_MOTION_BOUNDS } from "./motionBounds.js";
import { createContraRegistry } from "./registry.js";
import type { FigureDefinition } from "../library/FigureDefinition.js";
import { contraLibrary } from "../library/figures/index.js";
import { DEMO_DANCES } from "../dances/index.js";
import { CLOSURE_PX, COLLISION_PX, danceAlone, linesFor, oraclesFor } from "../dances/oracle.js";
import type { DanceOracles } from "../dances/oracle.js";
import { BECKET } from "../formation/becket.js";

/**
 * `packages/contra/scripts/figureLab.mjs`'s data (O1): everything `pnpm figure
 * <id>` prints about one figure, without the pictures.
 *
 * Every function here is pure, the same split `reportMotion.ts` uses: this
 * file answers "what is true of one figure", the `.mjs` script prints it and
 * drives Playwright for the pictures. Nothing here writes to disk.
 */

/** How far past one time through a seam-row run reads, to catch the wrap. */
const WRAP_BUFFER: Beat = SEAM_BEATS;

/**
 * Every dance that calls this figure at least once, in programme order.
 *
 * `dances` defaults to the demo's own {@link DEMO_DANCES} — the only corpus
 * `pnpm figure` ever passes — and is otherwise there so a test can hand this
 * (and {@link figureLabReport}, which threads it through) a small fixture
 * instead of running the sweep below over the whole real corpus.
 */
export function dancesUsingFigure(id: string, dances: readonly Dance[] = DEMO_DANCES): Dance[] {
  return dances.filter((dance) =>
    dance.phrases.some((phrase) => phrase.figures.some((call) => call.figure === id)),
  );
}

/** The couples a dance is checked at: `reportMotion.ts`'s own convention. */
export function danceCouples(dance: Dance): number {
  return linesFor(dance).includes(6) && dance.formation === BECKET.id ? 6 : 4;
}

/**
 * One figure, sampled alone in a duple-improper or becket minor set of four,
 * with nothing before it, so every number is the figure's own.
 *
 * `undefined` when the id names no registry figure (an engine figure such as
 * `wait-out` and `walk-to-station`, or a typo — the caller decides which).
 */
export function figureAloneRow(
  id: string,
  kind: "duple" | "becket",
  overrides: CheckOverrides = {},
): MotionStats | undefined {
  const registry = createContraRegistry([], overrides);
  if (!registry.has(id)) return undefined;
  const def = registry.get(id);
  const group = aloneGroup(kind);
  const timeline = createTimeline(registry);
  timeline.addGroup(group);
  const bindings: Record<string, string> = {};
  for (const station of group.stations) bindings[station.id] = station.id;
  timeline.add({
    kind: "figure",
    group: group.id,
    figure: id,
    params: withDefaults(def, {}, def.beats),
    bindings,
    start: 0,
    end: def.beats,
  });
  const report = motionReport(timeline, def.beats, { bounds: CONTRA_MOTION_BOUNDS });
  return report.figures[0];
}

/** A group of four on {@link CHECK_FRAME}, in the formation asked for. */
function aloneGroup(kind: "duple" | "becket"): Group {
  if (kind === "duple") return checkGroup();
  const formation: Formation = BECKET;
  const stations = formation.group(4);
  const members: Record<StationId, string> = {};
  for (const station of stations) members[station.id] = station.id;
  return createGroup(
    { id: "figure-lab-becket", kind: "set", frame: CHECK_FRAME, stations, members, couples: [] },
    formation.roleSet,
  );
}

/**
 * Every `A → id` and `id → B` seam key that occurs over one time through of a
 * dance, including the wrap from its last figure back to its first (the dance
 * repeats).
 */
export function seamKeysFor(id: string, dance: Dance): string[] {
  const calls = dance.phrases.flatMap((phrase) => phrase.figures.map((call) => call.figure));
  const keys = new Set<string>();
  for (let i = 1; i < calls.length; i++) {
    if (calls[i - 1] === id || calls[i] === id) keys.add(`${calls[i - 1]} → ${calls[i]}`);
  }
  if (calls.length > 1 && (calls[calls.length - 1] === id || calls[0] === id)) {
    keys.add(`${calls[calls.length - 1]} → ${calls[0]}`);
  }
  return [...keys];
}

/**
 * The motion oracle's seam rows for one figure, over the dances that call it
 * only, one time through each (plus the {@link WRAP_BUFFER} needed to see the
 * wrap seam), worst of the dances merged when more than one produces the same
 * seam key.
 */
export function figureSeamRows(
  id: string,
  dances: readonly Dance[],
  overrides: CheckOverrides = {},
): MotionStats[] {
  const seams = new Map<string, MotionStats>();
  for (const dance of dances) {
    const couples = danceCouples(dance);
    const until = danceBeats(dance) + WRAP_BUFFER;
    const decider = danceAlone(dance, couples, until, overrides);
    const report = motionReport(decider.timeline(), until, { bounds: CONTRA_MOTION_BOUNDS });
    for (const row of report.seams) {
      if (!isSeamKeyFor(row.key, id)) continue;
      const found = seams.get(row.key);
      seams.set(row.key, found ? worstOf(found, row) : { ...row });
    }
  }
  return [...seams.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Whether a `"prev → next"` seam key has this figure on either side. */
const isSeamKeyFor = (key: string, id: string): boolean =>
  key.startsWith(`${id} → `) || key.endsWith(` → ${id}`);

/** The worse of two rows for the same key, field by field. */
function worstOf(a: MotionStats, b: MotionStats): MotionStats {
  const worse = <
    K extends
      | "handSpeed"
      | "elbowSpeed"
      | "elbowPerHand"
      | "heightRate"
      | "elbowHeightRate"
      | "flipJump"
      | "dip",
  >(
    key: K,
  ) => (b[key].value > a[key].value ? b[key] : a[key]);
  return {
    key: a.key,
    handSpeed: worse("handSpeed"),
    elbowSpeed: worse("elbowSpeed"),
    elbowPerHand: worse("elbowPerHand"),
    heightRate: worse("heightRate"),
    elbowHeightRate: worse("elbowHeightRate"),
    flipJump: worse("flipJump"),
    dip: worse("dip"),
    stateFlips: a.stateFlips + b.stateFlips,
    ...((a.firstFlip ?? b.firstFlip) ? { firstFlip: a.firstFlip ?? b.firstFlip } : {}),
    nonFinite: a.nonFinite + b.nonFinite,
    ...((a.firstNonFinite ?? b.firstNonFinite)
      ? { firstNonFinite: a.firstNonFinite ?? b.firstNonFinite }
      : {}),
    reversals: a.reversals + b.reversals,
    samples: a.samples + b.samples,
  };
}

/**
 * Every `figureChecks.ts` entry that is about this figure: its own group, and
 * any seam group with it on either side (e.g. `balance → swing` for
 * `id === "swing"`).
 */
export function figureAssertionGroups(id: string, overrides: CheckOverrides = {}): FigureChecks[] {
  return figureChecks(overrides).filter((group) => group.key === id || isSeamKeyFor(group.key, id));
}

/** One dance's closure/reach/collision oracle, over one time through. */
export interface FigureOracleRow {
  dance: string;
  couples: number;
  until: Beat;
  oracles: DanceOracles;
}

/** AC5, AC1 and AC6 over the dances that call this figure, one time through each. */
export function figureOracles(
  id: string,
  dances: readonly Dance[],
  overrides: CheckOverrides = {},
): FigureOracleRow[] {
  return dances.map((dance) => {
    const couples = danceCouples(dance);
    const until = danceBeats(dance);
    return {
      dance: dance.slug,
      couples,
      until,
      oracles: oraclesFor(dance, couples, until, overrides),
    };
  });
}

/** `pnpm figure <id>`'s whole text report, and whether the loop is green. */
export interface FigureLabReport {
  id: string;
  /** `false` when any assertion (not already known-wrong) or any oracle failed, or the id is unknown. */
  ok: boolean;
  text: string;
}

/**
 * Everything `pnpm figure <id>` prints except the pictures: the assertions,
 * the motion row(s) alone, the seam rows and the oracle summary — steps 1
 * through 3 and the head of step 5 of the brief's ordered list.
 *
 * `dance`, when given, narrows the seam rows and the oracles to that one
 * dance (restricted further from "the dances that call this figure", not
 * instead of it — a dance that does not call the figure at all yields no rows
 * either way).
 *
 * `demoDances` is the corpus `dance` and the seam/oracle sweep run over; it
 * defaults to {@link DEMO_DANCES} (what `pnpm figure` always passes) and
 * exists otherwise so a test can substitute a small fixture rather than
 * paying for the sweep over every real demo dance.
 *
 * `overrides` is what `pnpm figure <id> --chain <n>` passes: the same
 * figure-id-to-defaults-override map `createContraRegistry`'s second argument
 * and `?chain=` already take, threaded through **all four** of the sections
 * below — the assertions, the motion rows alone, the seam rows and the oracles
 * — so a candidate is measured the whole way down and not only where it is
 * convenient. The empty map, which is every caller but the flag, is the
 * shipped figure and every number in this file is unchanged by its presence.
 */
export function figureLabReport(
  id: string,
  dance?: string,
  demoDances: readonly Dance[] = DEMO_DANCES,
  overrides: CheckOverrides = {},
): FigureLabReport {
  const registry = createContraRegistry([], overrides);
  const known = registry.has(id);
  const def = known ? registry.get(id) : undefined;
  const definition = definitionOf(id);

  const usedDances = dancesUsingFigure(id, demoDances);
  const scoped = dance === undefined ? usedDances : usedDances.filter((d) => d.slug === dance);
  const becketUsed = usedDances.some((d) => d.formation === BECKET.id);

  const assertionGroups = figureAssertionGroups(id, overrides);
  const duple = figureAloneRow(id, "duple", overrides);
  const becket = becketUsed ? figureAloneRow(id, "becket", overrides) : undefined;
  const seams = figureSeamRows(id, scoped, overrides);
  const oracleRows = figureOracles(id, scoped, overrides);

  let ok = known;
  const lines: string[] = [`# pnpm figure ${id}`, ""];

  if (!known) {
    lines.push(`no such figure: \`createContraRegistry().has("${id}")\` is false.`, "");
  } else {
    lines.push(`**${id}** — ${def!.call}`);
    lines.push(def!.describe ?? "_no description._");
    lines.push(`params: \`${JSON.stringify({ ...def!.defaults, beats: def!.beats })}\``, "");
  }

  lines.push(...definitionSection(id, definition));

  lines.push("## 1. Assertions", "");
  if (assertionGroups.length === 0) {
    lines.push(`_no \`figureChecks.ts\` entries for \`${id}\`._`, "");
  }
  for (const group of assertionGroups) {
    lines.push(`### \`${group.key}\``);
    if (group.describe) lines.push(`> ${group.describe}`);
    lines.push("");
    for (const result of group.results) {
      const known2 = isKnownWrong(group.key, result.label);
      if (!result.pass && !known2) ok = false;
      const mark = result.pass ? "pass" : known2 ? "known" : "FAIL";
      lines.push(`- [${mark}] ${result.label} — ${result.note}`);
    }
    lines.push("");
  }

  lines.push("## 2. Motion, alone", "");
  lines.push(motionLine("duple", duple));
  if (becketUsed) lines.push(motionLine("becket", becket));
  lines.push("");

  lines.push(
    scoped.length === 0
      ? "## Seam rows — no dance in scope calls this figure"
      : `## Seam rows — over ${scoped.map((d) => `\`${d.slug}\``).join(", ")}, one time through each`,
    "",
  );
  if (seams.length === 0) lines.push("_none._");
  for (const row of seams) lines.push(motionLine(row.key, row));
  lines.push("");

  lines.push("## 3. Oracles — closure (AC5), reach (AC1), collision (AC6)", "");
  if (oracleRows.length === 0) lines.push("_no dance in scope calls this figure._");
  for (const row of oracleRows) {
    const o = row.oracles;
    const closureOk = o.closurePx < CLOSURE_PX;
    const reachOk = o.maxShort === 0;
    const collisionOk = o.minDistancePx > COLLISION_PX;
    const coverageOk = o.coverage.length === 0;
    if (!closureOk || !reachOk || !collisionOk || !coverageOk) ok = false;
    lines.push(
      `- \`${row.dance}\` (${String(row.couples)} couples, ${String(row.until)} beats): ` +
        `closure ${mark(closureOk)} (worst ${o.closurePx.toFixed(4)} px) · ` +
        `reach ${mark(reachOk)} (worst short ${o.maxShort.toFixed(4)} px) · ` +
        `collision ${mark(collisionOk)} (closest ${Number.isFinite(o.minDistancePx) ? o.minDistancePx.toFixed(3) : "—"} px) · ` +
        `coverage ${mark(coverageOk)}${coverageOk ? "" : ` (${o.coverage.join("; ")})`}`,
    );
  }
  lines.push("");

  return { id, ok, text: lines.join("\n") };
}

const mark = (good: boolean): string => (good ? "pass" : "FAIL");

/**
 * The figure's own **definition**, when the library has one.
 *
 * `pnpm figure <id>` has to work on a definition, not only on a coded figure:
 * from M2 the library is where a figure's actors, anchor, roles, holds, ends
 * and timing live, and by M5 it is the only place. A figure that is still
 * bridged prints the bridge, which says so in one line.
 */
function definitionSection(id: string, definition: FigureDefinition | undefined): string[] {
  if (!definition) return [`## 0. Definition`, "", `_the library has no \`${id}\`._`, ""];
  if (definition.shape.kind === "legacy") {
    return [
      `## 0. Definition`,
      "",
      `\`${id}\` is still a **coded** figure, reached through the legacy bridge. ` +
        `Everything below measures that figure; M4 and M5 are what empty the bridge.`,
      "",
    ];
  }
  return [
    `## 0. Definition`,
    "",
    `\`${id}\` is a figure **as data**: the shape kind is \`${definition.shape.kind}\`, ` +
      `so nothing below runs any code of this figure's own.`,
    "",
    `- roles: ${definition.roles.map((role) => `\`${role}\``).join(", ")}`,
    `- actors: \`${definition.actors}\` · anchor: \`${JSON.stringify(definition.anchor)}\``,
    `- ends: \`${JSON.stringify(definition.ends)}\` · timing: ` +
      `\`${definition.timing.stretch}\`/\`${definition.timing.profile}\` · ` +
      `nominal ${String(definition.nominalBeats)} beats`,
    ...definition.holds.map((hold) =>
      hold.kind === "ring"
        ? `- holds: the ring, hands all the way round`
        : `- holds: \`${hold.a}.${sideWord(hold.aSide)}\` in \`${hold.b}.${sideWord(hold.bSide)}\`` +
          (hold.when
            ? ` — only when \`${hold.when.param}\` is ${hold.when.is.map(String).join(" or ")}`
            : ""),
    ),
    "",
  ];
}

/** A hand, as `L` when the definition names one and `<hand>` when a call does. */
const sideWord = (side: "L" | "R" | { param: string }): string =>
  typeof side === "string" ? side : `<${side.param}>`;

/**
 * The library's definition of a figure, or `undefined`.
 *
 * Built off the plain registry rather than the data one, so that asking for a
 * figure the library has not got is an ordinary "no" and not an error.
 */
function definitionOf(id: string): FigureDefinition | undefined {
  const library = contraLibrary(createContraRegistry());
  return library.has(id) ? library.get(id) : undefined;
}

/** One motion row, formatted with over-bound values marked `**like this**`. */
function motionLine(label: string, row: MotionStats | undefined): string {
  if (!row) return `- \`${label}\`: not measured`;
  const b = CONTRA_MOTION_BOUNDS;
  const worst =
    row.handSpeed.dancer === undefined
      ? ""
      : ` — worst hand \`${row.handSpeed.dancer}\` ${row.handSpeed.side} at beat ${row.handSpeed.beat!.toFixed(3)}`;
  return (
    `- \`${label}\`: hand ${over(row.handSpeed.value, b.handSpeedPx)} px/beat · ` +
    `elbow ${over(row.elbowSpeed.value, b.elbowSpeedPx)} px/beat · ` +
    `elbow/hand ${over(row.elbowPerHand.value, b.elbowPerHand, 2)}× · ` +
    `height ${over(row.heightRate.value, b.heightRatePx)} px/beat · ` +
    `flips ${String(row.stateFlips)} · NaN ${String(row.nonFinite)} · ` +
    `dip ${over(row.dip.value, b.dipPx, 2)} px${worst}`
  );
}

/** A number, marked `**like this**` when it is over its bound. */
const over = (value: number, bound: number, places = 1): string =>
  value > bound ? `**${value.toFixed(places)}**` : value.toFixed(places);
