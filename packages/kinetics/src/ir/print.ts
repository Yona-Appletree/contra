import type {
  Arrangement,
  Contract,
  FigureIR,
  HoldRef,
  IntrinsicLine,
  IntrinsicOp,
  LookRule,
  Params,
  Window,
} from "./Figure.js";
import { beatsOf, defaultParams, resolveChoice, resolveNumber } from "./Figure.js";

/**
 * The IR as the text the debugger's Source pane shows beneath the program
 * when a call is lit: what this figure needs, what it does with its beats,
 * where it looks and what it leaves behind.
 *
 * The parameters are resolved, so a call reads as the call the dancer heard —
 * `allemande(right)` shows `allemande-R` and `partner on right`, not the
 * branch that produced them. Beats inside the body are counted from the body's
 * start, so beat 0 is the dancer's "one".
 *
 * ```text
 * allemande(right)  8 beats (min 4)
 * pre   facing partner · right hands within reach · hold allemande-R right with partner
 * body  orbit hands · 1 turn · partner on right · facing tangent · r 7 px · ≤ 0.25 turn/beat
 * look  partner
 * post  facing partner · hands free · apart 14 px
 * ```
 */
export const printFigure = (figure: FigureIR, params?: Params): string => {
  const p: Params = { ...defaultParams(figure), ...params };
  const lines = [printHeader(figure, p), row("pre", printContract(figure.pre, p))];
  for (const window of figure.windows) lines.push(...printWindow(window, p));
  if (figure.look.length > 0) lines.push(row("look", figure.look.map(printLook).join(" · ")));
  lines.push(row("post", printContract(figure.post, p)));
  return lines.join("\n");
};

const LABEL_WIDTH = 6;

const row = (label: string, text: string): string => label.padEnd(LABEL_WIDTH) + text;

const INDENT = " ".repeat(LABEL_WIDTH);

/**
 * `allemande(right)  8 beats (min 4)`. Arguments are printed up to the last
 * one worth saying — one with no default, or one the call moved off its
 * default — so the list stays positional and a call that said nothing prints
 * nothing.
 */
const printHeader = (figure: FigureIR, params: Params): string => {
  const said = figure.params.filter((spec) => spec.kind !== "dancer");
  let last = -1;
  said.forEach((spec, i) => {
    if (spec.default === undefined || params[spec.name] !== spec.default) last = i;
  });
  const args = said.slice(0, last + 1).map((spec) => printValue(params[spec.name]));
  const call = args.length > 0 ? `${figure.id}(${args.join(", ")})` : figure.id;
  return `${call}  ${num(beatsOf(figure, params))} beats (min ${num(figure.beats.min)})`;
};

const printValue = (value: string | number | undefined): string =>
  typeof value === "number" ? num(value) : (value ?? "?");

/**
 * Facing first, then what the hands are doing, then how the bodies stand —
 * the order a dancer checks them in.
 */
const printContract = (contract: Contract, params: Params): string => {
  const clauses: string[] = [];
  for (const arrangement of contract.arrangement) {
    if (arrangement.kind === "facing") clauses.push(printArrangement(arrangement));
  }
  if (contract.holds.length === 0) clauses.push("hands free");
  for (const hold of contract.holds) clauses.push(...printHold(hold, params));
  for (const arrangement of contract.arrangement) {
    if (arrangement.kind !== "facing") clauses.push(printArrangement(arrangement));
  }
  return clauses.join(" · ");
};

const printArrangement = (arrangement: Arrangement): string => {
  const who = arrangement.who === "self" ? "" : `${arrangement.who} `;
  switch (arrangement.kind) {
    case "facing":
      return `${who}facing ${arrangement.toward}`;
    case "apart": {
      const span =
        arrangement.minPx === arrangement.maxPx
          ? num(arrangement.minPx)
          : `${num(arrangement.minPx)}–${num(arrangement.maxPx)}`;
      return `${who}apart ${span} px`;
    }
    case "beside":
      return `${who}beside ${arrangement.of} on the ${arrangement.side}, ${num(
        arrangement.spacingPx,
      )} px, facing the same way`;
  }
};

const printHold = (hold: HoldRef, params: Params): string[] => {
  const hand = resolveChoice(hold.hand, params);
  const id = resolveChoice(hold.hold, params);
  return [`${hand} hands within reach`, `hold ${id} ${hand} with ${hold.with}`];
};

const printWindow = (window: Window, params: Params): string[] => {
  const who = window.who ? `${window.who}: ` : "";
  const share = window.beats !== undefined ? ` · ${num(window.beats)} beats` : "";
  switch (window.kind) {
    case "stand":
      return [row("body", `${who}stand${share}`)];
    case "walk":
      return [row("body", `${who}walk ${window.direction} ${num(window.distancePx)} px${share}`)];
    case "pass":
      return [row("body", `${who}pass ${window.shoulder} shoulders${share}`)];
    case "pivot":
      return [row("body", `${who}turn ${num(window.deg)}°${share}`)];
    case "orbit": {
      const turns = window.turns === "free" ? "free" : num(resolveNumber(window.turns, params));
      const sense = resolveChoice(window.sense, params).replace(/-/g, " ");
      return [
        row(
          "body",
          [
            `${who}orbit ${window.axis}`,
            `${turns} ${turns === "1" ? "turn" : "turns"}`,
            sense,
            `facing ${window.facing}`,
            `r ${num(window.radiusPx)} px`,
            `≤ ${num(window.rateMaxTurnsPerBeat)} turn/beat`,
            ...(window.buzz ? ["buzz"] : []),
          ].join(" · ") + share,
        ),
      ];
    }
    case "intrinsic":
      return [row("body", `${who}intrinsic${share}`), ...printIntrinsic(window.lines)];
  }
};

/** One line per half beat, in the order the lines were authored. */
const printIntrinsic = (lines: readonly IntrinsicLine[]): string[] => {
  const slots: { key: string; beat: number; half: 0 | 1; ops: string[] }[] = [];
  for (const line of lines) {
    const who = line.who === "self" ? "" : `${line.who}: `;
    const key = `${line.beat}/${line.half}`;
    const slot = slots.find((s) => s.key === key);
    const text = who + printOp(line.op);
    if (slot) slot.ops.push(text);
    else slots.push({ key, beat: line.beat, half: line.half, ops: [text] });
  }
  const width = Math.max(...slots.map((s) => beatLabel(s.beat, s.half).length));
  return slots.map((s) => INDENT + beatLabel(s.beat, s.half).padEnd(width + 1) + s.ops.join(" · "));
};

const beatLabel = (beat: number, half: 0 | 1): string =>
  `beat ${num(beat)}${half === 1 ? "½" : ""}`;

const printOp = (op: IntrinsicOp): string => {
  switch (op.kind) {
    case "stand":
      return "stand";
    case "lean":
      return `lean ${num(op.deg)}°`;
    case "look":
      return `look ${op.at}`;
    case "step":
      return op.forwardPx >= 0
        ? `step forward ${num(op.forwardPx)} px`
        : `step back ${num(-op.forwardPx)} px`;
  }
};

const printLook = (rule: LookRule): string => {
  const who = rule.role === "self" ? "" : `${rule.role}: `;
  const span =
    rule.from === undefined && rule.to === undefined
      ? ""
      : ` ${num(rule.from ?? 0)}–${num(rule.to ?? 0)}`;
  const fallback = rule.elseAt === undefined ? "" : `, else ${rule.elseAt}`;
  return `${who}${rule.at}${span}${fallback}`;
};

/** Numbers as a caller would say them: no trailing zeros, no exponents. */
const num = (value: number): string => String(Math.round(value * 1000) / 1000);
