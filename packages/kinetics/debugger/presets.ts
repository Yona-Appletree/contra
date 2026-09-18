import type { EveningResult, Source } from "@caller/lang";
import { loadForEval } from "@caller/lang";

/**
 * The `.dance` files, bundled as text, and the dances the language finds in
 * them.
 *
 * There is **one home for `.dance` text** (notes D2) and it is
 * `packages/lang/dances/`, so the debugger globs across the workspace — vite
 * serves anything under the workspace root, which is what makes the two
 * packages share one directory of fixtures rather than two copies of it (R3).
 * The deliberately-broken ones under `broken/` are the language's own tests
 * and have nothing to animate.
 */
const FILES = import.meta.glob("../../lang/dances/*.dance", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const fileNameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

export const SOURCES: Source[] = Object.entries(FILES)
  .map(([path, text]) => ({ name: fileNameOf(path), text }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** A dance the picker can run: a `fn` with a `setup` in it, and what it takes. */
export interface DanceOption {
  name: string;
  module: string;
  label: string;
  /** The hall facts the dance declares — `minor-sets`, and its default. */
  facts: { name: string; fallback: number }[];
}

/** The labels worth keeping from round 1, where the dance is still the same one. */
const LABELS: Readonly<Record<string, string>> = {
  fixture: "pair — bow, do-si-do, allemande",
  solo: "solo — the lark, nobody across",
  butter: "Butter",
  "robins-on-a-wire": "Robins on a Wire",
  "robins-on-a-wire-passed": "Robins on a Wire — allemande the hand you hold",
};

/** Every dance in the bundle, as the language sees them, sorted by name. */
export function dancesIn(sources: readonly Source[]): DanceOption[] {
  const program = loadForEval(sources);
  const out: DanceOption[] = [];
  for (const [module, mod] of program.modules) {
    for (const decl of mod.file.decls) {
      if (decl.kind !== "fn") continue;
      if (!decl.body.some((stmt) => stmt.kind === "setup")) continue;
      out.push({
        name: decl.name,
        module,
        label: LABELS[decl.name] ?? `${decl.name} — ${module}.dance`,
        facts: decl.params.map((param) => ({
          name: param.name,
          fallback: param.default?.kind === "int" ? param.default.value : 3,
        })),
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const DANCES: DanceOption[] = dancesIn(SOURCES);

/** Where each time through sits on the evening's beat line. */
export interface TimeSpan {
  time: number;
  offset: number;
  length: number;
}

export const spansOf = (evening: EveningResult | undefined): TimeSpan[] => {
  const spans: TimeSpan[] = [];
  let offset = 0;
  for (const time of evening?.times ?? []) {
    spans.push({ time: time.time, offset, length: time.length });
    offset += time.length;
  }
  return spans;
};

/** `time 3 · beat 7.50` — where the bar is, in a caller's own words. */
export function timeLabel(spans: readonly TimeSpan[], beat: number): string {
  const span = spans.find((s) => beat < s.offset + s.length) ?? spans[spans.length - 1];
  if (span === undefined) return `beat ${beat.toFixed(2)}`;
  return `time ${String(span.time)} · beat ${(beat - span.offset).toFixed(2)}`;
}
