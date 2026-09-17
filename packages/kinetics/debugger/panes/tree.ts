import type { DancerId } from "../../src/dialect/Dialect.js";
import { expr } from "../../src/lang/format.js";
import type { Membership } from "../../src/tree/membership.js";
import type { Group } from "../../src/tree/Tree.js";
import { chainTo } from "../../src/tree/Tree.js";
import { colourOfKind, membershipAt, membershipIndexAt } from "../groups.js";
import { ROLE_COLOURS, el, paneShell, type Pane, type View } from "../view.js";

/**
 * The formation's tree, with the seating at the bar (P5): every group with
 * its kind and what it provides, every place with its role and whoever is
 * standing on it now. The followed dancer's chain — the groups they are in
 * — is lit, which is the picture of "the groups they're in, all of them"
 * the user asked for.
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
    const index = membershipIndexAt(run, beat);
    const pickKey = pick.join(",");
    if (index === shownIndex && pickKey === shownPick) return;
    shownIndex = index;
    shownPick = pickKey;
    const membership = membershipAt(run, beat) ?? run.floor.initial;
    const chain = new Set<string>();
    const followed: DancerId[] = pick.length === run.dialect.dancers.length ? [] : [...pick];
    for (const d of followed) {
      const path = membership.placeOf.get(d);
      if (path !== undefined) for (const g of chainTo(run.floor.root, path)) chain.add(g.path);
    }
    list.replaceChildren(node(run.floor.root, membership, chain, followed));
    list.prepend(
      el(
        "div",
        "tree-head",
        `seating ${String(index + 1)} of ${String(run.sequence?.memberships.length ?? 1)}`,
      ),
    );
  };

  const node = (
    group: Group,
    membership: Membership,
    chain: ReadonlySet<string>,
    followed: readonly DancerId[],
  ): HTMLElement => {
    const box = el("div", chain.has(group.path) ? "group on" : "group");
    const head = el("div", "group-head");
    const kind = el("span", "kind", group.kind);
    kind.style.color = colourOfKind(group.kind);
    head.append(kind);
    if (group.name !== group.kind) head.append(el("span", "gname", group.name));
    for (const p of group.provides) {
      head.append(el("span", "provide", `$${p.name}: ${p.type} = ${expr(p.deferred.expr)}`));
    }
    if (group.next) head.append(el("span", "provide", `next = ${expr(group.next.expr)}`));
    box.append(head);
    for (const place of group.places) {
      const who = membership.dancerOf.get(place.path);
      const line = el(
        "div",
        who === undefined ? "place empty" : followed.includes(who) ? "place on" : "place",
      );
      const role = el("span", "role", place.role ?? place.name);
      role.style.color =
        place.role === "Robin"
          ? ROLE_COLOURS.robin
          : place.role === "Lark"
            ? ROLE_COLOURS.lark
            : "";
      line.append(role, el("span", "who", who ?? "·"));
      line.title = `${place.path} (${String(place.frame.x)}, ${String(place.frame.y)}) ${String(place.frame.facing)}°`;
      box.append(line);
    }
    for (const child of group.children) box.append(node(child, membership, chain, followed));
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
