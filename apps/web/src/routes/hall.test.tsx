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
    // The tune's own notation is still there until P5 moves it into its box.
    expect(html).toContain('data-testid="hall-notation"');
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

  it("the tune and zoom selectors are gone", () => {
    const html = render();
    expect(html).not.toContain('data-testid="hall-tune-select"');
    expect(html).not.toContain('data-testid="hall-zoom-auto"');
    expect(html).not.toContain('data-testid="hall-zoom-4"');
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
