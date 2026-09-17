import { tunes } from "@caller/music";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HallPage } from "./hall.js";

/**
 * A static render (see `dances.test.tsx`'s doc comment for why): `HallPage`
 * runs its clock, its render loop and its audio priming from `useEffect`,
 * none of which fires during a static render, so this proves only what U3
 * asks for — the note card's own markup at beat 0 — not the live simulation.
 */
describe("HallPage (U3: the diagrams leave the Stage)", () => {
  it("no longer renders T2's DanceTraces on the note card", () => {
    const html = renderToStaticMarkup(
      <HallPage dance="airpants" tune={undefined} params={new URLSearchParams("beat=0")} />,
    );
    expect(html).toContain('data-testid="hall-card"');
    expect(html).not.toContain('data-testid="dance-traces"');
  });

  it("links the note card to the dance's own page instead", () => {
    const html = renderToStaticMarkup(
      <HallPage dance="airpants" tune={undefined} params={new URLSearchParams("beat=0")} />,
    );
    expect(html).toContain('data-testid="hall-dance-page-link"');
    expect(html).toContain('href="#/dances/airpants"');
  });

  it("draws a pixel play glyph on the stage instead of a labelled play button", () => {
    const html = renderToStaticMarkup(
      <HallPage dance="airpants" tune={undefined} params={new URLSearchParams("beat=0")} />,
    );
    expect(html).toContain('data-testid="hall-play"');
    // P3: the play control is the transport's ▶, named "Play"/"Pause" (D5) —
    // the speaker that said "Play music" is the Tunes tab's button now.
    expect(html).toContain('aria-label="Play"');
    expect(html).not.toContain("Play music");
    // The control row keeps no button of its own with the old text.
    expect(html).not.toContain(">Play<");
  });
});

/**
 * P3: the Stage's chrome is the transport band under the hall and the mute chip
 * on it — the speaker and the reset button are gone from this page.
 */
describe("HallPage (P3: the transport and the mute chip)", () => {
  const render = (params = "beat=0"): string =>
    renderToStaticMarkup(
      <HallPage dance="airpants" tune={undefined} params={new URLSearchParams(params)} />,
    );

  it("renders all five transport controls", () => {
    const html = render();
    for (const id of [
      "hall-prev-dance",
      "hall-prev-move",
      "hall-play",
      "hall-next-move",
      "hall-next-dance",
    ]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
  });

  it("renders the mute chip, unmuted, with its own accessible name", () => {
    const html = render();
    expect(html).toMatch(/data-testid="hall-mute"[^>]*aria-pressed="false"/);
    expect(html).toContain("Mute the band");
  });

  it("no longer renders the reset button or the stage speaker", () => {
    const html = render();
    expect(html).not.toContain('data-testid="hall-reset"');
    expect(html).not.toContain("Restart this dance");
    expect(html).not.toContain('class="speaker-button"');
  });
});

/**
 * P4: the notecard is the Stage's card now (AC6). A static render is enough
 * for the markup — the classes that say which call is being danced come off
 * `position.danceBeat`, which at `?beat=0` is the first move of Airpants.
 */
describe("HallPage (P4: the notecard)", () => {
  const render = (params = "beat=0"): string =>
    renderToStaticMarkup(
      <HallPage dance="airpants" tune={undefined} params={new URLSearchParams(params)} />,
    );

  it("renders the notecard, with Airpants' title, author and time through", () => {
    const html = render();
    expect(html).toContain('data-testid="hall-notecard"');
    expect(html).toContain("Airpants");
    expect(html).toContain("Lisa Greenleaf");
    expect(html).toContain("1 of 2");
  });

  it("writes one call per move — six for Airpants — with the first one on", () => {
    const html = render();
    const calls = [...html.matchAll(/data-testid="notecard-call"/g)];
    expect(calls).toHaveLength(6);
    // The first call carries `data-on="true"` at beat 0 and no other does.
    const on = [...html.matchAll(/data-testid="notecard-call" data-move="(\d+)" data-on="true"/g)];
    expect(on.map((m) => m[1])).toEqual(["0"]);
  });

  it("gives every call its own ⓘ", () => {
    const html = render();
    expect([...html.matchAll(/data-testid="notecard-info"/g)]).toHaveLength(6);
  });

  it("no longer puts @caller/music's Card on the Stage", () => {
    const html = render();
    expect(html).not.toContain("caller-music-card");
    // The tune's own notation is in the tune box now (P5), under the notecard.
    expect(html).toContain('data-testid="hall-notation"');
  });
});

/**
 * P5: the tune box under the notecard (AC8, AC9). A static render proves the
 * markup — the select, its options and the potatoes — which is all of the box
 * that does not need abcjs's own geometry; the labels, the captions and the
 * bar clicks are drawn from `getBBox` and are `hall.spec.ts`'s to prove.
 */
describe("HallPage (P5: the tune box)", () => {
  const render = (params = "beat=0"): string =>
    renderToStaticMarkup(
      <HallPage dance="airpants" tune={undefined} params={new URLSearchParams(params)} />,
    );

  it("renders the tune box with a native select of every bundled tune", () => {
    const html = render();
    expect(html).toMatch(/<select[^>]*data-testid="hall-tune-select"/);
    const box = html.slice(html.indexOf('data-testid="hall-tune-select"'));
    const options = [...box.slice(0, box.indexOf("</select>")).matchAll(/<option /g)];
    expect(options).toHaveLength(tunes.length);
  });

  it("puts the notation inside the box, where the cursor test still finds it", () => {
    const html = render();
    expect(html).toContain('class="tunebox-notation" data-testid="hall-notation"');
    // The interim sheet's own caption is gone: the select is the readout now.
    expect(html).not.toContain("stage-tune-caption");
  });

  it("shows four potatoes, none of them lit while the hall is dancing", () => {
    const html = render();
    expect(html).toMatch(/data-testid="hall-potatoes"[^>]*data-lit="0"/);
    const box = html.slice(html.indexOf('data-testid="hall-potatoes"'));
    expect([...box.slice(0, box.indexOf("</span>")).matchAll(/viewBox="0 0 10 8"/g)]).toHaveLength(
      4,
    );
  });

  it("lights the second potato on the second beat of a count-in", () => {
    // Dance 1's four potatoes are beats 168–172; 169.5 is inside the second.
    expect(render("beat=169.5")).toMatch(/data-testid="hall-potatoes"[^>]*data-lit="2"/);
  });
});

describe("HallPage (U4: the control bar)", () => {
  const render = (params = "beat=0"): string =>
    renderToStaticMarkup(
      <HallPage dance="airpants" tune={undefined} params={new URLSearchParams(params)} />,
    );

  it("the dance picker is a native select, not a custom popover", () => {
    const html = render();
    expect(html).toContain('data-testid="hall-dance-select"');
    // A real <select>, not a Radix trigger button standing in for one.
    expect(html).toMatch(/<select[^>]*data-testid="hall-dance-select"/);
  });

  it("the zoom selector is gone, and the tune select is not in the bar", () => {
    const html = render();
    expect(html).not.toContain('data-testid="hall-zoom-auto"');
    expect(html).not.toContain('data-testid="hall-zoom-4"');
    // U4 took the tune *set* selector out of the control bar and P5 did not
    // put it back: the select the page has now is the tune box's own, in the
    // aside, and it picks one tune for one dance rather than the evening's
    // medley. So the assertion is where it is, not that it does not exist.
    const bar = html.slice(html.indexOf('data-testid="hall-controls"'));
    expect(bar.slice(0, bar.indexOf('data-testid="hall-trails"'))).not.toContain(
      'data-testid="hall-tune-select"',
    );
  });

  it("the tempo readout has a fixed width, so its digits changing width cannot reflow the bar", () => {
    const html = render();
    const tag = html.match(/<span[^>]*data-testid="hall-tempo-value"[^>]*>/)?.[0];
    expect(tag).toBeDefined();
    expect(tag).toContain("w-[1.6em]");
    expect(tag).toContain("tabular-nums");
  });

  it("?zoom= still resolves with no selector left in the bar to have set it", () => {
    const html = render("beat=0&zoom=4");
    expect(html).toContain('data-testid="hall-canvas"');
    expect(html).not.toContain('data-testid="hall-zoom-4"');
  });
});
