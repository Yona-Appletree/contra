import type { Node } from "@caller/lang";
import { showValue } from "@caller/lang";
import type { DancerId } from "../../src/dialect/Dialect.js";
import type { Membership } from "../../src/sequence/CompiledSequence.js";
import { colourOfKind, membershipAt, membershipIndexAt } from "../groups.js";
import { ROLE_COLOURS, el, paneShell, type Pane, type View } from "../view.js";

/**
 * The tree `setup` built, with the seating **at the bar**: every node with its
 * kind, its id and the parameters it was invoked with, every place with
 * whoever is standing on it now, every anchor it declared. The followed
 * dancer's lineage — the groups they are in — is lit, which is the picture of
 * "the groups they're in, all of them" the user asked for.
 */
export function treePane(): Pane {
  const { section, body } = paneShell("tree");
  const list = el("div", "tree");
  body.append(list);

  let view: View | undefined;
  let shownIndex = -1;
  let shownPick = "";

  const draw = (beat: number): void => {
    if (!view) return;
    const { run, pick } = view;
    const tree = run.evening?.tree;
    if (tree === undefined) {
      list.replaceChildren(el("div", "empty", "no tree: the dance did not run"));
      return;
    }
    const index = membershipIndexAt(run, beat);
    const pickKey = pick.join(",");
    if (index === shownIndex && pickKey === shownPick) return;
    shownIndex = index;
    shownPick = pickKey;
    const membership = membershipAt(run, beat);
    if (membership === undefined) return;
    const lineage = new Set<string>();
    const followed: DancerId[] =
      pick.length === (run.dialect?.dancers.length ?? 0) ? [] : [...pick];
    const byPath = new Map(tree.nodes.map((node) => [node.path, node]));
    for (const d of followed) {
      const path = membership.placeOf.get(d);
      if (path === undefined) continue;
      for (let at = byPath.get(path); at !== undefined; at = at.parent) lineage.add(at.path);
    }
    list.replaceChildren(...tree.roots.map((root) => node(root, membership, lineage, followed)));
    list.prepend(
      el(
        "div",
        "tree-head",
        `seating ${String(index + 1)} of ${String(run.sequence?.memberships.length ?? 1)}`,
      ),
    );
  };

  const node = (
    at: Node,
    membership: Membership,
    lineage: ReadonlySet<string>,
    followed: readonly DancerId[],
  ): HTMLElement => {
    const box = el("div", lineage.has(at.path) ? "group on" : "group");
    const head = el("div", "group-head");
    const kind = el("span", "kind", at.kind);
    kind.style.color = colourOfKind(at.kind);
    head.append(kind, el("span", "gname", at.idLabel));
    for (const [name, value] of Object.entries(at.params)) {
      if (name === "id") continue;
      head.append(el("span", "provide", `${name} = ${showValue(value)}`));
    }
    for (const [name, value] of Object.entries(at.anchors)) {
      head.append(el("span", "provide", `anchor ${name} = ${showValue(value)}`));
    }
    box.append(head);
    if (at.place) {
      const who = membership.dancerOf.get(at.path);
      const line = el(
        "div",
        who === undefined ? "place empty" : followed.includes(who) ? "place on" : "place",
      );
      const role = el("span", "role", at.idLabel);
      role.style.color =
        at.idLabel === "Robin"
          ? ROLE_COLOURS.robin
          : at.idLabel === "Lark"
            ? ROLE_COLOURS.lark
            : "";
      line.append(role, el("span", "who", who ?? "·"));
      line.title = `${at.path} (${String(at.frame.x)}, ${String(at.frame.y)}) ${String(at.frame.heading)}°`;
      box.append(line);
    }
    for (const child of at.children) box.append(node(child, membership, lineage, followed));
    return box;
  };

  return {
    el: section,
    setRun(next) {
      view = next;
      shownIndex = -1;
    },
    setBeat: draw,
  };
}
