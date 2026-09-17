import type { DancerId } from "../src/dialect/Dialect.js";
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
