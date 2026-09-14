/**
 * `pnpm report:motion --figure <id>` (O1): patch one figure's rows into an
 * already-committed `docs/motion-report.md`, so a figure PR's report diff is
 * small and the full regeneration (`pnpm report:motion`, no flag) stays the
 * gate that actually recomputes everything.
 *
 * It never re-derives anything of its own: it is handed the *freshly
 * generated* full report — the exact text a plain `pnpm report:motion` would
 * write — and the *existing* file on disk, and copies over only the table
 * rows and the named subsections that mention the target key: the figure id
 * itself, or a `"prev → next"` seam key with that id on either side (e.g.
 * `balance → swing` for `id === "swing"`). Everything else in the existing
 * file is left untouched, byte for byte, even where a full regeneration would
 * also have changed it — an updated overall sample count, a top-ten table's
 * ranking gaining or losing a row. That is the trade the brief asks for: a
 * small diff now, and the full `--force` run is what makes the file exactly
 * right again before the final push.
 */

/** Every row and subsection {@link patchMotionReport} will touch for `id`. */
export function motionReportKeysOfInterest(freshText: string, id: string): Set<string> {
  const keys = new Set<string>([id]);
  const backtick = /`([^`]+)`/g;
  for (const match of freshText.matchAll(backtick)) {
    const token = match[1]!;
    if (token.includes(" → ") && (token.startsWith(`${id} → `) || token.endsWith(` → ${id}`))) {
      keys.add(token);
    }
  }
  return keys;
}

/** Patch `id`'s rows and subsections from `fresh` into `existing`. */
export function patchMotionReport(existing: string, fresh: string, id: string): string {
  const newLines = fresh.split("\n");
  const keys = motionReportKeysOfInterest(fresh, id);
  const figureKeys = new Set([...keys].filter((key) => !key.includes(" → ")));

  let lines = existing.split("\n");
  lines = patchTableRows(lines, newLines, (line) => line === "### The ten worst figures", keys);
  lines = patchTableRows(lines, newLines, (line) => line === "### The ten worst seams", keys);
  lines = patchTableRows(lines, newLines, (line) => line === "## Every figure, alone", keys);
  lines = patchTableRows(lines, newLines, (line) => line === "## Known wrong", keys);
  lines = patchSubsections(
    lines,
    newLines,
    (line) => line === "## What each figure actually does",
    (line, key) => line === `### \`${key}\``,
    keys,
  );
  lines = patchSubsections(
    lines,
    newLines,
    (line) => line === "## What every figure says it does",
    (line, key) => line.startsWith(`### \`${key}\``),
    figureKeys,
  );
  return lines.join("\n");
}

/** A markdown heading's level: `0` for a line that is not a heading. */
function headingLevel(line: string): number {
  const match = /^(#+)\s/.exec(line);
  return match ? match[1]!.length : 0;
}

/** The index of the first line matching `isHeader`, or `-1`. */
function findHeader(lines: readonly string[], isHeader: (line: string) => boolean): number {
  return lines.findIndex(isHeader);
}

/** `[at + 1, end)`: the block a heading at `at` owns, up to the next as-shallow heading. */
function blockEnd(lines: readonly string[], at: number): number {
  const level = headingLevel(lines[at] ?? "");
  for (let i = at + 1; i < lines.length; i++) {
    const found = headingLevel(lines[i]!);
    if (found > 0 && found <= level) return i;
  }
  return lines.length;
}

const ROW_KEY = /^\|\s*`([^`]+)`\s*\|/;

/** Replace, inside one table section, every row whose key is in `keys` with `fresh`'s row. */
function patchTableRows(
  oldLines: readonly string[],
  newLines: readonly string[],
  isHeader: (line: string) => boolean,
  keys: ReadonlySet<string>,
): string[] {
  const oldStart = findHeader(oldLines, isHeader);
  const newStart = findHeader(newLines, isHeader);
  if (oldStart < 0 || newStart < 0) return [...oldLines];
  const oldEnd = blockEnd(oldLines, oldStart);
  const newEnd = blockEnd(newLines, newStart);

  const freshRow = new Map<string, string>();
  for (let i = newStart; i < newEnd; i++) {
    const match = ROW_KEY.exec(newLines[i]!);
    if (match && keys.has(match[1]!)) freshRow.set(match[1]!, newLines[i]!);
  }

  const patched = [...oldLines];
  for (let i = oldStart; i < oldEnd; i++) {
    const match = ROW_KEY.exec(patched[i]!);
    if (!match) continue;
    const replacement = freshRow.get(match[1]!);
    if (replacement !== undefined) patched[i] = replacement;
  }
  return patched;
}

/**
 * Replace, inside one `##` section, the whole `###` subsection named for each
 * key in `keys` with `fresh`'s version of the same subsection.
 *
 * Recomputes the old section's own bounds before every key, because
 * replacing one subsection with a different number of lines shifts every
 * subsection after it.
 */
function patchSubsections(
  oldLines: readonly string[],
  newLines: readonly string[],
  isParentHeader: (line: string) => boolean,
  isSubHeaderFor: (line: string, key: string) => boolean,
  keys: ReadonlySet<string>,
): string[] {
  const newParent = findHeader(newLines, isParentHeader);
  if (newParent < 0) return [...oldLines];
  const newParentEnd = blockEnd(newLines, newParent);

  let result = [...oldLines];
  for (const key of keys) {
    const oldParent = findHeader(result, isParentHeader);
    if (oldParent < 0) continue;
    const oldParentEnd = blockEnd(result, oldParent);

    let oldSubStart = -1;
    for (let i = oldParent + 1; i < oldParentEnd; i++) {
      if (isSubHeaderFor(result[i]!, key)) {
        oldSubStart = i;
        break;
      }
    }
    if (oldSubStart < 0) continue;
    const oldSubEnd = blockEnd(result, oldSubStart);

    let newSubStart = -1;
    for (let i = newParent + 1; i < newParentEnd; i++) {
      if (isSubHeaderFor(newLines[i]!, key)) {
        newSubStart = i;
        break;
      }
    }
    if (newSubStart < 0) continue;
    const newSubEnd = blockEnd(newLines, newSubStart);

    result = [
      ...result.slice(0, oldSubStart),
      ...newLines.slice(newSubStart, newSubEnd),
      ...result.slice(oldSubEnd),
    ];
  }
  return result;
}
