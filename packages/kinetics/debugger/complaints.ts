import type { Diagnostic } from "../src/diagnostics/Diagnostic.js";
import { CODES } from "../src/diagnostics/codes.js";
import type { Run } from "../src/pipeline.js";

/** One line of the diagnostics strip: what minded, about whom, where, and why — and the diagnostic behind it. */
export interface Complaint {
  bad: boolean;
  /** The code and its title. */
  tag: string;
  /** The dancers and the beat, as much as is known. */
  where: string;
  message: string;
  /** How many dancers said the same thing. */
  count: number;
  diagnostic: Diagnostic;
}

/** Every diagnostic of the run, as the strip shows it, errors first. */
export const complaintsOf = (run: Run): Complaint[] =>
  [...run.diagnostics]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1))
    .map((d) => ({
      bad: d.severity === "error",
      tag: `${d.code} ${CODES[d.code]?.title ?? d.stage}`,
      where: [
        d.dancers.slice(0, 4).join(" ") +
          (d.dancers.length > 4 ? ` +${String(d.dancers.length - 4)}` : ""),
        d.beat === undefined
          ? ""
          : `beat ${Number.isInteger(d.beat) ? String(d.beat) : d.beat.toFixed(2)}`,
      ]
        .filter((s) => s !== "")
        .join(" · "),
      message: d.message,
      count: d.dancers.length,
      diagnostic: d,
    }));

/** What the run has to say when nothing went wrong. */
export const summaryOf = (run: Run): string =>
  `${String(run.endBeat)} beats · ${String(run.dialect.dancers.length)} dancers · no complaints`;
