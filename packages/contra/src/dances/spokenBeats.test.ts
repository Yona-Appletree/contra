import { spokenBeats } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DEMO_DANCES } from "./index.js";

/**
 * C3's evidence: the spoken-length estimate applied to every call the ten
 * demo dances actually use.
 *
 * One case per dance, each asserting every one of its figures' beats and
 * printing them in the failure message — so a `pnpm --filter @caller/contra
 * test` run makes the whole table visible, which is what the milestone's
 * report is built from. Every dance writes its own call text (`dances.test.ts`
 * already checks every figure has one), so this reads `figure.call` directly
 * rather than going through the registry's own default.
 */
describe("spokenBeats over the ten demo dances' own calls", () => {
  for (const dance of DEMO_DANCES) {
    it(`${dance.slug}: every call gets a beat count of at least one`, () => {
      const calls = dance.phrases.flatMap((phrase) =>
        phrase.figures.map((figure) => ({
          phrase: phrase.name,
          figure: figure.figure,
          call: figure.call!,
          figureBeats: figure.beats,
          spoken: spokenBeats(figure.call!),
        })),
      );
      const table = calls
        .map(
          (c) =>
            `${c.phrase} ${c.figure} (${String(c.figureBeats)} beats): "${c.call}" -> ${String(c.spoken)} spoken beat(s)`,
        )
        .join("\n");
      // The table itself is the evidence the report quotes; every one of the
      // demo's 69-odd figure calls is asserted at least one beat long, which
      // is the estimate's only hard floor.
      console.info(`${dance.slug}:\n${table}`);
      for (const c of calls) expect(c.spoken, `${dance.slug}\n${table}`).toBeGreaterThanOrEqual(1);
      // A handful of calls (e.g. after-the-solstice's B2 "PASS THROUGH ALONG
      // THE SET", a two-beat figure) estimate longer than the figure's own
      // duration — the words genuinely take longer to say than the figure
      // takes to dance. That is not a bug in the estimate; it is what "the
      // call runs into its figure, which is right" (the brief) looks like
      // when it runs into the *next* figure too. Printed rather than
      // asserted against, since flagging it is more useful than hiding it
      // behind a passing test.
      const overrun = calls.filter((c) => c.spoken > c.figureBeats);
      if (overrun.length > 0) {
        console.info(
          `${dance.slug}: ${String(overrun.length)} call(s) estimate longer than their own figure:\n` +
            overrun
              .map(
                (c) =>
                  `  ${c.phrase} ${c.figure}: "${c.call}" (${String(c.spoken)} > ${String(c.figureBeats)})`,
              )
              .join("\n"),
        );
      }
    });
  }
});
