/** Every complaint, rustc-shaped, the way the CLI prints them. Click one and
 * the source pane shows its file with the span selected. */
import { renderText } from "../../src/diagnostics/render.js";
import type { Diagnostic } from "../../src/diagnostics/Diagnostic.js";
import { h } from "../dom.js";
import type { Pane, View } from "../view.js";

export function diagnosticsPane(view: View): Pane {
  const seen = new Set<string>();
  const list = view.model.diagnostics.filter((d) => {
    const key = `${d.code}${d.message}${d.span?.file ?? ""}${String(d.span?.start ?? "")}${String(d.beat ?? "")}${d.dancers.join()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (list.length === 0) {
    return { fact: "clean", body: h("div", { class: "empty" }, "no complaints") };
  }

  const blocks = list.map((complaint) => {
    const block = h(
      "pre",
      { class: `complaint ${complaint.severity}` },
      oneText(complaint, view.model.sources),
    );
    const span = complaint.span;
    if (span !== undefined) {
      block.classList.add("clickable");
      block.addEventListener("click", () => {
        view.show(span.file, span);
      });
    }
    return block;
  });

  const errors = list.filter((d) => d.severity === "error").length;
  return {
    fact: `${String(errors)} error${errors === 1 ? "" : "s"}, ${String(list.length - errors)} warning${list.length - errors === 1 ? "" : "s"}`,
    body: h("div", { class: "complaints" }, ...blocks),
  };
}

/** `renderText` for one, without its "1 error, 0 warnings" tail. */
function oneText(
  complaint: Diagnostic,
  sources: readonly { name: string; text: string }[],
): string {
  const lines = renderText([complaint], sources).trimEnd().split("\n");
  lines.pop();
  return lines.join("\n").trimEnd();
}
