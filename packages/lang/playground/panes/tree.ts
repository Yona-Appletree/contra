/** The floor `setup` built, as `printTree` writes it: one node per line, its
 * frame in metres, the dancer at each leaf. */
import { printTree } from "../../src/eval/index.js";
import { h } from "../dom.js";
import type { Pane, View } from "../view.js";

export function treePane(view: View): Pane {
  const tree = view.model.evening?.tree;
  if (tree === undefined) return { fact: "", body: h("div", { class: "empty" }, "no floor") };
  return {
    fact: `${String(tree.dancers.length)} in ${String(tree.places.length)} places`,
    body: h("pre", { class: "dump" }, printTree(tree)),
  };
}
