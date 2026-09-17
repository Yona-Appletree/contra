import { angleDiff, angleOf, dist } from "@caller/core";
import type { DancerId, Dialect } from "../dialect/Dialect.js";
import type { CompiledSequence } from "../lang/compile.js";
import type { Instr, WindowName } from "./Instruction.js";
import type { Program } from "./Program.js";

/**
 * The listing (AC6): a program printed the way a dancer would say it — one
 * block per beat, hands at the half beat, distances in centimetres, directions
 * relative to the dancer, the other dancer by name. The user reads this at the
 * gate, so words, not codes.
 */
export interface ListingLine {
  beat: number;
  half: 0 | 1;
  text: string;
  window: WindowName;
  call: number;
}

export function listing(
  program: Program,
  dialect: Dialect,
  sequence: CompiledSequence,
): ListingLine[] {
  const lines: ListingLine[] = [];
  const calls = sequence.perDancer[program.dancer] ?? [];
  // Follow the hip as the steps say, to describe each step relative to the facing.
  const initial = dialect.initial().dancers[program.dancer];
  let p = initial?.p ?? [0, 0];
  let facing = initial?.facing ?? 0;
  const name = (id: DancerId): string => (dialect.dancers.length > 2 ? id : dialect.roleOf(id));
  for (const slot of program.slots) {
    const call = calls.find((c) => c.id === slot.call);
    const partner = call?.cast.partner;
    const parts: string[] = [];
    for (const instr of slot.instrs) {
      const said = say(instr, p, facing, partner, name);
      if (said) parts.push(said);
      if (instr.op === "step") p = instr.to;
      if (instr.op === "pivot") facing += instr.deg;
    }
    if (parts.length === 0) continue;
    lines.push({
      beat: slot.beat,
      half: slot.half,
      text: parts.join(" · "),
      window: slot.window,
      call: slot.call,
    });
  }
  return lines;
}

/** One line of a listing as the debugger prints it: `beat 12 · entry · …`. */
export const formatLine = (line: ListingLine): string =>
  `beat ${line.beat}${line.half ? "½" : ""} · ${line.window} · ${line.text}`;

function say(
  instr: Instr,
  p: readonly [number, number],
  facing: number,
  partner: DancerId | undefined,
  name: (id: DancerId) => string,
): string | undefined {
  switch (instr.op) {
    case "stand":
      return "stand";
    case "step": {
      const dx = instr.to[0] - p[0];
      const dy = instr.to[1] - p[1];
      const rel = angleDiff(facing, angleOf(dx, dy));
      const cm = Math.round(instr.lengthCm / 5) * 5;
      return `step ${direction(rel)} ${cm} cm`;
    }
    case "pivot":
      return `turn ${turn(instr.deg)}`;
    case "hold":
      return `take ${instr.hand} hands with ${name(instr.with)} — ${instr.hold}`;
    case "drop":
      return `let go ${instr.hand} hand`;
    case "lean":
      return instr.deg === 0 ? "straighten up" : `bow ${instr.deg}°`;
    case "look":
      if (instr.at === "down") return "look down";
      if (typeof instr.at === "string") return `look at ${name(instr.at)}`;
      return partner === undefined ? "look ahead" : "look ahead";
    case "buzz":
      return instr.on ? "buzz step" : "walk";
  }
}

function direction(rel: number): string {
  const a = Math.abs(rel);
  const side = rel > 0 ? "right" : "left";
  if (a <= 22.5) return "forward";
  if (a >= 157.5) return "back";
  if (a < 67.5) return `forward and to the ${side}`;
  if (a <= 112.5) return `to the ${side}`;
  return `back and to the ${side}`;
}

function turn(deg: number): string {
  const side = deg > 0 ? "right" : "left";
  const a = Math.abs(deg);
  if (a < 10) return `a touch ${side}`;
  if (a < 60) return `an eighth ${side}`;
  if (a < 120) return `a quarter ${side}`;
  if (a < 170) return `three eighths ${side}`;
  return `half round ${side}`;
}

/** Whether a step ends nearer the partner than it started, for tests and the timeline. */
export const approaches = (
  from: readonly [number, number],
  to: readonly [number, number],
  other: readonly [number, number],
): boolean => dist(to, other) < dist(from, other);
