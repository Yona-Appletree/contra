import type { Diagnostic, Fact, Source } from "./Diagnostic.js";
import { CODES } from "./codes.js";

/**
 * Diagnostics in rustc's shape, for a terminal or an agent:
 *
 * ```text
 * error[K022]: 1R: a 90 cm step at beat 31 in swing
 *   --> butter.dance:23:9
 *    |
 * 23 |         swing($partner, beats = 16);
 *    |         ^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *    = beat 31 · 1R 2R 3R 4R
 *    = compile: repeat[0]/phrase/swing · swing($partner, beats = 16); · beats 32–48
 *    = schedule: swing: entry 32–34 (…)
 *    = help: the entry should bring the couple closer first
 * ```
 */
export function renderText(
  diagnostics: readonly Diagnostic[],
  sources: readonly Source[] = [],
): string {
  const lines: string[] = [];
  for (const d of diagnostics) {
    const title = CODES[d.code]?.title;
    lines.push(`${d.severity}[${d.code}]${title === undefined ? "" : ` ${title}`}: ${d.message}`);
    const source = sources[0];
    if (d.span !== undefined && source !== undefined) {
      const { line, col, text } = lineAt(source.text, d.span.start);
      const width = Math.max(1, Math.min(d.span.end, source.text.length) - d.span.start);
      const caret =
        " ".repeat(col - 1) +
        "^".repeat(Math.max(1, Math.min(width, Math.max(1, text.length - col + 1))));
      const gutter = String(line).length;
      lines.push(`  --> ${source.name}:${String(line)}:${String(col)}`);
      lines.push(`  ${" ".repeat(gutter)} |`);
      lines.push(`  ${String(line)} | ${text}`);
      lines.push(`  ${" ".repeat(gutter)} | ${caret}`);
    }
    const where: string[] = [];
    if (d.beat !== undefined) where.push(`beat ${fmt(d.beat)}`);
    if (d.dancers.length > 0) where.push(d.dancers.join(" "));
    if (where.length > 0) lines.push(`   = ${where.join(" · ")}`);
    for (const f of d.trace) lines.push(`   = ${factText(f)}`);
    if (d.suggestion !== undefined) lines.push(`   = help: ${d.suggestion}`);
    lines.push("");
  }
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  lines.push(
    errors === 0 && warnings === 0
      ? "no complaints"
      : `${String(errors)} error${errors === 1 ? "" : "s"}, ${String(warnings)} warning${warnings === 1 ? "" : "s"}`,
  );
  return lines.join("\n") + "\n";
}

const factText = (f: Fact): string =>
  `${f.layer}: ${f.what}${f.why === undefined ? "" : ` — ${f.why}`}${f.beat === undefined || f.what.includes("beat") ? "" : ` (beat ${fmt(f.beat)})`}`;

const fmt = (beat: number): string => (Number.isInteger(beat) ? String(beat) : beat.toFixed(2));

/** The 1-based line and column of an offset, and that line's text. */
export function lineAt(text: string, offset: number): { line: number; col: number; text: string } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === "\n") {
      line += 1;
      lineStart = i + 1;
    }
  }
  const lineEnd = text.indexOf("\n", lineStart);
  return {
    line,
    col: offset - lineStart + 1,
    text: text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd),
  };
}

/** The same, as JSON an agent reads: one object per diagnostic, spans as line and column too. */
export function renderJson(
  diagnostics: readonly Diagnostic[],
  sources: readonly Source[] = [],
): string {
  const source = sources[0];
  const items = diagnostics.map((d) => ({
    ...d,
    ...(d.span !== undefined && source !== undefined
      ? { location: { file: source.name, ...lineAt(source.text, d.span.start) } }
      : {}),
  }));
  return JSON.stringify(
    { diagnostics: items, errors: diagnostics.filter((d) => d.severity === "error").length },
    null,
    2,
  );
}
