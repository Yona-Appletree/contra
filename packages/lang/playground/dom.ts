/** Two element factories and nothing else: the playground has no framework. */

type Child = Node | string | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | number | boolean>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  apply(node, attrs);
  add(node, children);
  return node;
}

export function s(
  tag: string,
  attrs: Readonly<Record<string, string | number | boolean>> = {},
  ...children: Child[]
): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  apply(node, attrs);
  add(node, children);
  return node;
}

function apply(node: Element, attrs: Readonly<Record<string, string | number | boolean>>): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
}

function add(node: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

/** Replace a node's children in one go. */
export function fill(node: Element, ...children: Child[]): void {
  node.replaceChildren();
  add(node, children);
}
