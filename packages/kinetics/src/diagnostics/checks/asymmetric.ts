import type { Run } from "../../pipeline.js";
import type { Diagnostic } from "../Diagnostic.js";
import { traceAt } from "../collect.js";

/**
 * K106 — a figure's members name each other. A dancer who swings someone
 * whose own swing at that beat names somebody else, or a ring of four whose
 * members do not all name the same four, is a dance that would only look
 * right by accident. The user's walk: *"everyone needs to specify the same
 * … that's actually a verification step."*
 */
export function asymmetricSelections(run: Run): Diagnostic[] {
  const sequence = run.sequence;
  if (!sequence) return [];
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const [dancer, calls] of Object.entries(sequence.perDancer)) {
    for (const call of calls) {
      const partner = call.cast.partner;
      if (partner !== undefined) {
        const theirs = (sequence.perDancer[partner] ?? []).find(
          (c) => c.start === call.start && c.figure.id === call.figure.id,
        );
        if (theirs === undefined || theirs.cast.partner !== dancer) {
          const key = [dancer, partner].sort().join("+") + `@${String(call.start)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            code: "K106",
            severity: "error",
            stage: "compile",
            message: `${dancer} dances ${call.figure.id} with ${partner} at beat ${String(call.start)}, but ${partner} ${theirs === undefined ? `is not dancing ${call.figure.id} then` : `names ${theirs.cast.partner ?? "nobody"}`}`,
            beat: call.start,
            dancers: [dancer, partner],
            span: call.span,
            trace: [...traceAt(run, dancer, call.start), ...traceAt(run, partner, call.start)],
            suggestion:
              "both dancers must read the same relation at the same beat; check which $ each side passed",
          });
        }
      }
      if (call.group !== undefined) {
        const mine = [...call.group].sort().join(" ");
        for (const other of call.group) {
          if (other === dancer) continue;
          const theirs = (sequence.perDancer[other] ?? []).find(
            (c) => c.start === call.start && c.figure.id === call.figure.id,
          );
          const theirGroup =
            theirs?.group === undefined ? undefined : [...theirs.group].sort().join(" ");
          if (theirGroup === mine) continue;
          const key = `${mine}@${String(call.start)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            code: "K106",
            severity: "error",
            stage: "compile",
            message: `${dancer} dances ${call.figure.id} with [${mine}] at beat ${String(call.start)}, but ${other} ${theirGroup === undefined ? "has no ring then" : `names [${theirGroup}]`}`,
            beat: call.start,
            dancers: [...call.group],
            span: call.span,
            trace: traceAt(run, dancer, call.start),
          });
        }
      }
    }
  }
  return out;
}
