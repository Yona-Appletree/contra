/**
 * One evaluation, as the panes read it.
 *
 * Two loaders again (see `cli/lang.mjs`): `loadTexts` + `checkProgram` for the
 * complaints, `loadForEval` + `runEvening` for the floor and the beats. Both
 * take the same array of texts, so an edit in the textarea reaches both, and
 * neither touches the disk — the `.dance` files arrive bundled.
 */
import { checkProgram } from "../src/check/check.js";
import type { Diagnostic, Source } from "../src/diagnostics/Diagnostic.js";
import type { EveningResult, Snapshot } from "../src/eval/index.js";
import { findDance, hallFacts, loadForEval, runEvening, shortPath } from "../src/eval/index.js";
import { loadTexts } from "../src/load.js";
import { moduleNameOf } from "../src/syntax/parser.js";

/** A dance the picker can run: a `fn` with a `setup` in it. */
export interface DanceOption {
  name: string;
  module: string;
}

/** Where one time through sits on the evening's beat line. */
export interface TimeSpan {
  time: number;
  offset: number;
  length: number;
}

/** A place in the tree, whoever is standing in it. */
export interface Place {
  path: string;
  x: number;
  y: number;
  heading: number;
  role?: string;
}

export interface Model {
  sources: Source[];
  /** Every `.dance` the playground bundled, by file name. */
  files: string[];
  /** The modules the shown file names — its `use` lines. */
  uses: string[];
  dances: DanceOption[];
  dance?: DanceOption;
  evening?: EveningResult;
  spans: TimeSpan[];
  totalBeats: number;
  places: Place[];
  /** The checker's, then the run's. */
  diagnostics: Diagnostic[];
}

export interface Request {
  sources: readonly Source[];
  /** The file shown in the textarea, which is also what the checker checks. */
  file: string;
  dance?: DanceOption;
  minorSets: number;
  times: number;
}

export function evaluate(request: Request): Model {
  const sources = [...request.sources];
  const files = sources.map((source) => source.name);

  const program = loadForEval(sources);
  const diagnostics: Diagnostic[] = [...program.diagnostics];

  const dances: DanceOption[] = [];
  for (const [name, module] of program.modules) {
    for (const decl of module.file.decls) {
      if (decl.kind !== "fn") continue;
      if (decl.body.some((stmt) => stmt.kind === "setup"))
        dances.push({ name: decl.name, module: name });
    }
  }
  dances.sort((a, b) => a.name.localeCompare(b.name));

  const wanted =
    dances.find((d) => request.dance !== undefined && sameDance(d, request.dance)) ??
    dances.find((d) => d.module === moduleNameOf(request.file)) ??
    dances[0];

  // The checker runs from an entry and follows its `use` lines, so the file in
  // the textarea is checked and so is the dance being run when it lives
  // somewhere else — otherwise picking `down-the-hall` while reading
  // `butter.dance` would show the run's complaints and hide the check's.
  const entries = [moduleNameOf(request.file)];
  if (wanted !== undefined && !entries.includes(wanted.module)) entries.push(wanted.module);
  let uses: string[] = [];
  for (const entry of entries) {
    const checked = loadTexts(sources, entry);
    diagnostics.push(
      ...checked.diagnostics,
      ...(checked.diagnostics.length > 0 ? [] : checkProgram(checked).diagnostics),
    );
    if (entry === entries[0]) uses = checked.entry?.ast.uses.map((use) => use.module) ?? [];
  }

  const model: Model = {
    sources,
    files,
    uses,
    dances,
    ...(wanted === undefined ? {} : { dance: wanted }),
    spans: [],
    totalBeats: 0,
    places: [],
    diagnostics,
  };
  if (wanted === undefined) return model;

  const ref = findDance(program, wanted.name, wanted.module);
  if (ref === undefined) return model;

  const evening = runEvening(program, ref, {
    times: request.times,
    args: hallFacts({ "minor-sets": request.minorSets }),
  });
  model.evening = evening;
  model.diagnostics = [...diagnostics, ...evening.diagnostics];

  let offset = 0;
  for (const time of evening.times) {
    model.spans.push({ time: time.time, offset, length: time.length });
    offset += time.length;
  }
  model.totalBeats = offset;

  model.places = evening.tree.places.map((place) => ({
    path: shortPath(place),
    x: place.frame.x,
    y: place.frame.y,
    heading: place.frame.heading,
    ...(roleOf(shortPath(place)) === undefined ? {} : { role: roleOf(shortPath(place)) }),
  }));
  return model;
}

const sameDance = (a: DanceOption, b: DanceOption): boolean =>
  a.name === b.name && a.module === b.module;

/** `…/Role(Lark)` — which of the two a place, or a dancer standing in one, is. */
export function roleOf(path: string): string | undefined {
  return /Role\(([A-Za-z]+)\)/.exec(path)?.[1];
}

/** Where a time's beat falls on the evening's own beat line. */
export function globalBeat(spans: readonly TimeSpan[], time: number, beat: number): number {
  return (spans.find((span) => span.time === time)?.offset ?? 0) + beat;
}

/** The evening's beat as `time 3 · beat 12`. */
export function localBeat(
  spans: readonly TimeSpan[],
  beat: number,
): { time: number; beat: number } {
  for (const span of spans) {
    if (beat < span.offset + span.length) return { time: span.time, beat: beat - span.offset };
  }
  const last = spans.at(-1);
  return last === undefined ? { time: 1, beat } : { time: last.time, beat: last.length };
}

/** Where everybody had got to at the last commit on or before `beat` (D6). */
export function snapshotAt(model: Model, beat: number): Snapshot | undefined {
  let found: Snapshot | undefined;
  for (const snapshot of model.evening?.snapshots ?? []) {
    const at = snapshot.at === "setup" ? 0 : globalBeat(model.spans, snapshot.time, snapshot.beat);
    if (at <= beat) found = snapshot;
  }
  return found;
}
