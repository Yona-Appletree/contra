import type { DancerId } from "../src/dialect/Dialect.js";
import type { Vec3 } from "../src/motion/Vec3.js";
import type { Run } from "../src/pipeline.js";

/**
 * What every pane is: an element, a run to draw, and a beat to point at.
 *
 * `setRun` is the expensive one — it rebuilds whatever the pane draws once per
 * compile — and `setBeat` is called sixteen times a second while the bar
 * plays, so it may only move a line.
 */
export interface Pane {
  el: HTMLElement;
  setRun(view: View): void;
  setBeat(beat: number): void;
}

/** The run, and whose body the listing and the graphs are about. */
export interface View {
  run: Run;
  /** The dancers the dancer toggle has chosen; never empty while there are dancers. */
  pick: readonly DancerId[];
}

/**
 * Lark gold, robin red — `ROLE_COLOURS` in
 * `packages/hall/src/appearance/roleColours.ts`, copied as literals because
 * this package may not import `@caller/hall` (DA13). Nothing that
 * distinguishes the roles may be blue-ish or pink-ish, here or anywhere.
 */
export const ROLE_COLOURS = { lark: "#e0a32e", robin: "#c8362f" } as const;

/** Two skin tones, by role for now; a seeded choice later (the phase file). */
export const SKIN = { lark: "#e8c39e", robin: "#c99a6b" } as const;

export const colourOf = (run: Run, dancer: DancerId): string =>
  ROLE_COLOURS[run.dialect.roleOf(dancer)];

export const skinOf = (run: Run, dancer: DancerId): string => SKIN[run.dialect.roleOf(dancer)];

/**
 * Where everybody stands at beat 0 — the **set**, not the travel.
 *
 * The camera frames this rather than the bounds of every hip over the whole
 * run: seven times through a becket walks the whole hall, and a view scaled to
 * fit that is a view of nothing.
 */
export const setPoints = (run: Run): Vec3[] =>
  Object.values(run.dialect.initial().dancers).map((d) => ({ x: d.p[0], y: d.p[1], z: 0 }));

/** The two long lines, as x, or nothing when the floor is not two lines. */
export const linesOf = (run: Run): number[] => {
  const xs = new Set<number>();
  for (const d of Object.values(run.dialect.initial().dancers)) xs.add(Math.round(d.p[0]));
  return xs.size === 2 ? [...xs].sort((a, b) => a - b) : [];
};

/**
 * Whether this dancer is out at this beat: the scheduler made their call a
 * stand for want of anybody to dance with, or the call is the wait-out itself.
 */
export const standingAt = (run: Run, dancer: DancerId, beat: number): boolean => {
  const calls = run.schedule?.calls[dancer] ?? [];
  const call = calls.find((c) => beat >= c.call.start && beat < c.call.end);
  if (!call) return false;
  return call.call.figure.id === "wait-out" || call.notes.some((note) => note.includes("nobody"));
};

/**
 * How brightly a dancer is drawn: the picked one full, the rest behind them,
 * and anybody standing out dimmer still.
 */
export const alphaOf = (
  run: Run,
  dancer: DancerId,
  pick: ReadonlySet<DancerId>,
  beat: number,
): number => (pick.has(dancer) ? 1 : 0.42) * (standingAt(run, dancer, beat) ? 0.5 : 1);

const hex = (colour: string, i: number): number => parseInt(colour.slice(1 + i * 2, 3 + i * 2), 16);

/** `a` faded toward `b`: the pixel pane has no alpha, so it mixes with the floor instead. */
export const mix = (a: string, b: string, k: number): string => {
  if (a.length !== 7 || b.length !== 7) return a;
  const channel = (i: number): string =>
    Math.round(hex(a, i) * k + hex(b, i) * (1 - k))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
};

/** `document.createElement`, with a class and some text, in one line. */
export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** The same for SVG, whose attributes are all strings anyway. */
export const svg = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
};

/** A pane's shell: the labelled box the grid puts it in, with room for its own controls. */
export const paneShell = (
  name: string,
): { section: HTMLElement; head: HTMLElement; body: HTMLElement } => {
  const section = el("section");
  section.dataset.pane = name;
  const head = el("h2");
  head.append(el("span", "pane-name", name));
  const body = el("div", "body");
  section.append(head, body);
  return { section, head, body };
};
