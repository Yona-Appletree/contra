import { SCRIPT_DECIDER_DEFAULTS, danceSchedule } from "@caller/choreo";
import {
  DEMO_DANCES,
  callScript,
  callingCard,
  contraDataFigures,
  createContraRegistry,
} from "@caller/contra";
import { layoutHall } from "@caller/hall";
import { describe, expect, it } from "vitest";
import { CYCLE_BEATS, ITEM_BEATS, createDemoProgram } from "./program.js";

/**
 * **AC3: the bubble and the calling card are one function.**
 *
 * The user's second named risk for this milestone. A card that says one thing
 * and a caller that says another is worse than no card at all, and the two are
 * a long way apart in the code — the card is a table on the dance page and the
 * bubble is an utterance the decider put on a timeline through a form-neutral
 * hook. So the check is end to end: build the evening the app builds, read what
 * the caller actually says on the first and second times through, and compare it
 * with what the card prints in its first and second columns.
 */

/** Two lines: enough to dance every programme dance, including the becket ones. */
const world = layoutHall({ lines: 2, couplesPerLine: [5, 4] });

/**
 * What the caller says on one time through of one dance, **read at the beats
 * the calls are due on**.
 *
 * Not a window: an utterance starts its own figure's `lead` beats early, the
 * library's leads are two *and* four, and A Rare Bird's last call is a two-beat
 * pull-by said two beats early — which lands on the same beat a four-beat window
 * round the next time through would start at. So the expected beat of every call
 * is computed from the script and the figure's own lead, and the timeline is
 * read at exactly those beats.
 */
function said(slug: string, timeThrough: number): { want: string[]; got: string[] } {
  const { decider, dances } = createDemoProgram(world, slug);
  const dance = dances.find((each) => each.slug === slug)!;
  const item = dances.findIndex((each) => each.slug === slug);
  const from = item * ITEM_BEATS + (timeThrough - 1) * CYCLE_BEATS;
  decider.advance(from + CYCLE_BEATS + 4);

  const registry = createContraRegistry(contraDataFigures());
  const schedule = danceSchedule(dance);
  const leadOf = (offset: number): number => {
    if (timeThrough === 1 && offset === 0) return SCRIPT_DECIDER_DEFAULTS.firstCallLeadBeats;
    const here = schedule.find((each) => each.start === offset) ?? schedule[0]!;
    return registry.get(here.call.figure).lead;
  };

  // **Grouped by the beat each call is due on**, because two calls really can
  // share one: a two-beat figure said two beats early and a four-beat one said
  // four beats early land together, and the hall hears both — which is what
  // `callAt`'s earliest-wins rule is for.
  const expected = new Map<number, string[]>();
  for (const one of callScript(dance, timeThrough)) {
    const at = Math.max(0, from + one.offset - leadOf(one.offset));
    expected.set(at, [...(expected.get(at) ?? []), one.text]);
  }
  const utterances = decider.timeline().utterances();
  // Anything said inside the time through that no call was due on is an extra
  // the caller should not have said, and shows up as a row with no expectation.
  for (const u of utterances) {
    if (u.start <= from || u.start >= from + CYCLE_BEATS - 4) continue;
    if (!expected.has(u.start)) expected.set(u.start, ["(nothing was due on this beat)"]);
  }

  const beats = [...expected.keys()].sort((a, b) => a - b);
  const line = (at: number, texts: readonly string[]): string =>
    `${String(at - from)}: ${[...texts].sort().join(" | ")}`;
  return {
    want: beats.map((at) => line(at, expected.get(at)!)),
    got: beats.map((at) =>
      line(
        at,
        utterances.filter((u) => u.start === at).map((u) => u.text),
      ),
    ),
  };
}

describe("the caller says what the card prints", () => {
  // One case per dance: each builds a whole evening and dances two times
  // through, which is the expensive part, so fifteen of them in one case would
  // share one budget. 1.5 s each on a laptop and CI is some fifteen times
  // slower, so the budget is explicit.
  it.each(DEMO_DANCES.map((d) => d.slug))(
    "%s: the first and second times through",
    (slug) => {
      for (const timeThrough of [1, 2]) {
        const { want, got } = said(slug, timeThrough);
        expect(got, `${slug} time ${String(timeThrough)}`).toEqual(want);
      }
    },
    30 * 1000,
  );

  it("is the same function the card is: the first column is the first time through", () => {
    for (const dance of DEMO_DANCES) {
      const first = callScript(dance, 1);
      for (const row of callingCard(dance)) {
        const cell = row.byTime[0]!;
        const spoken = first.find((one) => one.covers.includes(row.index))!;
        if (cell.mergedInto === undefined) expect(cell.text, dance.slug).toBe(spoken.text);
        else expect(spoken.covers[0], dance.slug).toBe(cell.mergedInto);
      }
    }
  });

  it("says Butter's first two figures in one breath, and the rest one at a time", () => {
    const butter = DEMO_DANCES.find((d) => d.slug === "butter")!;
    const first = callScript(butter, 1);
    expect(first[0]!.text).toBe("SHIFT LEFT, CIRCLE LEFT THREE PLACES");
    expect(first[0]!.covers).toEqual([0, 1]);
    // One fewer utterance than calls, which is what a merge is.
    expect(first.length).toBe(butter.phrases.flatMap((p) => p.figures).length - 1);
    // And at the second time through there is no room for the long form, so
    // nothing merges and every call says its own short one.
    const second = callScript(butter, 2);
    expect(second.map((one) => one.covers)).toEqual([[0], [1], [2], [3], [4], [5], [6]]);
    expect(second[0]!.text).toBe("SLIDE LEFT");
  });
});
