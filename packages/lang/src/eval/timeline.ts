/**
 * What a time through leaves behind: the moves each dancer made, the events
 * that committed, the cards the caller said, and where everybody stood after
 * each commit.
 *
 * A move is a leaf — an `ir` name, its arguments already resolved for the
 * dancer who made it (a `Role` argument is a person, a `group` argument is a
 * node), and the beats it spans. The kinematics are somebody else's problem
 * (§7); this is the whole of what the language says about motion.
 */
import type { Span } from "../syntax/ast.js";
import type { Diagnostic } from "../diagnostics/Diagnostic.js";

/**
 * What an argument **points at**, beside the text of it (notes D3).
 *
 * `value` is for a person to read; `ref` is for a consumer to act on, so a
 * reader never has to parse `0-2R` back into a dancer. A place that somebody
 * is standing in refers to that somebody — which is what a move means by a
 * `Role` argument — and an empty one refers to the node, which is a place
 * with nobody in it and reads as nobody.
 */
export type MoveRef = { t: "dancer"; id: string } | { t: "node"; path: string };

export interface MoveArg {
  /** The parameter's name, as the move declared it. */
  name: string;
  /** The value as a fact: `0-2R`, `MinorSet(0)`, `Left`, `8`. */
  value: string;
  /** The person or the node the value names, where it names one. */
  ref?: MoveRef;
}

export interface Move {
  /** Who danced it. */
  dancer: string;
  /** The move's `ir` name: `swing`, `circle`, `wait-out`. */
  ir: string;
  args: readonly MoveArg[];
  /** The beat it starts on, counted from the top of this time through. */
  start: number;
  beats: number;
  /** The call in the text, so a consumer's complaint can point at it. */
  span: Span;
}

/** A dancer changing places: what `assign` queued and the commit applied. */
export interface EventRecord {
  dancer: string;
  /** The beat at the end of which it committed. */
  beat: number;
  from: string;
  to: string;
}

/** `card "Butter";` — what the caller's card says, and when. */
export interface CardRecord {
  beat: number;
  text: string;
  /** The dancers who ran the statement; a card is usually everybody's. */
  dancers: readonly string[];
}

/** Where one dancer stood at a commit point. */
export interface Position {
  dancer: string;
  place: string;
  x: number;
  y: number;
  heading: number;
}

/** Everybody's place at one moment: after setup, and after each commit. */
export interface Snapshot {
  time: number;
  beat: number;
  /** What happened just before: `"setup"` or `"commit"`. */
  at: "setup" | "commit";
  positions: readonly Position[];
}

/** One time through the dance, as the driver ran it. */
export interface TimeResult {
  time: number;
  firstTime: boolean;
  lastTime: boolean;
  /** What the dance's own dancers reached; `out` runs for exactly this (D4). */
  length: number;
  /** Who the dance could address, and who ran the formation's `out`. */
  inDancers: readonly string[];
  outDancers: readonly string[];
  moves: readonly Move[];
  events: readonly EventRecord[];
  cards: readonly CardRecord[];
  diagnostics: readonly Diagnostic[];
  snapshots: readonly Snapshot[];
}
