import { parse } from "../src/lang/parser.js";
import type { File } from "../src/lang/syntax.js";
import type { Floor } from "../src/tree/floor.js";
import { floorOf } from "../src/tree/floor.js";

/** A time through, and the four phrases it is made of. */
export const TIME_THROUGH_BEATS = 64;
const PHRASES = ["A1", "A2", "B1", "B2"] as const;

/** Every `.dance` file under `dances/`, by path, as text (vite's `?raw`). */
const FILES = import.meta.glob("../dances/**/*.dance", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const text = (relative: string): string => {
  const found = FILES[`../dances/${relative}`];
  if (found === undefined) throw new Error(`no dance file ${relative}`);
  return found;
};

export const PRELUDE = text("prelude.dance");
export const COMMON = text("formations/common.dance");
export const MOVES: File = parse(text("moves.dance"));

/** The formations on disk (`becket`, `improper`, …), sorted. */
export const FORMATIONS: string[] = Object.keys(FILES)
  .filter((p) => p.includes("/formations/") && !p.endsWith("common.dance"))
  .map((p) => p.slice(p.lastIndexOf("/") + 1, -".dance".length))
  .sort();

/** The name of the size parameter a formation takes (`minor-sets`, `couples`), or none. */
export function sizeParamOf(formation: string): { name: string; fallback: number } | undefined {
  const file = parse(text(`formations/${formation}.dance`));
  const root = file.items.find((i) => i.kind !== "enum" && i.name === formation);
  if (root === undefined || root.kind === "enum") return undefined;
  const param = root.params.find((p) => p.name === "minor-sets" || p.name === "couples");
  if (param === undefined) return undefined;
  const fallback = param.default?.kind === "number" ? param.default.value : 3;
  return { name: param.name, fallback };
}

/** Build and seat a formation from its file, at `size` when it takes one. */
export function floorFor(formation: string, size: number | undefined): Floor {
  const files = [parse(PRELUDE), parse(COMMON), parse(text(`formations/${formation}.dance`))];
  const param = sizeParamOf(formation);
  const args = param === undefined || size === undefined ? {} : { [param.name]: size };
  return floorOf(files, formation, args);
}

/** A dance to run, and the floor it wants first. */
export interface Preset {
  label: string;
  source: string;
  formation: string;
  size?: number;
}

export const PRESETS: Record<string, Preset> = {
  pair: {
    label: "pair — bow, do-si-do, allemande",
    source: text("fixture.dance"),
    formation: "pair",
  },
  solo: {
    label: "solo — the lark, nobody across",
    source: text("fixture.dance"),
    formation: "solo",
  },
  contra: {
    label: "becket — bow, do-si-do, allemande with partner",
    source: text("fixture.dance"),
    formation: "becket",
    size: 2,
  },
  butter: {
    label: "Butter (chain and hey stood in)",
    source: text("butter.dance"),
    formation: "becket",
    size: 2,
  },
};

/** How many times through a run of `endBeat` beats is; never fewer than one. */
export const timesThrough = (endBeat: number): number =>
  Math.max(1, Math.ceil(endBeat / TIME_THROUGH_BEATS));

/** `time 3 · A2 · beat 71.50` — where the bar is, in a caller's own words. */
export const timeLabel = (beat: number): string => {
  const time = Math.floor(beat / TIME_THROUGH_BEATS) + 1;
  const phrase = PHRASES[Math.floor((beat % TIME_THROUGH_BEATS) / 16)] ?? "A1";
  return `time ${String(time)} · ${phrase} · beat ${beat.toFixed(2)}`;
};
