/** What every pane is handed: the evaluation, where the scrubber is, and the
 * two things a pane is allowed to change. */
import type { Span } from "../src/syntax/ast.js";
import type { Model } from "./model.js";

export interface View {
  model: Model;
  /** The scrubber, on the evening's own beat line. */
  beat: number;
  /** The file in the textarea. */
  file: string;
  setBeat: (beat: number) => void;
  /** Show a file, and select a span of it when one is given. */
  show: (file: string, span?: Span) => void;
}

/** A pane: a fact for its header, and its body. */
export interface Pane {
  fact: string;
  body: Node;
}
