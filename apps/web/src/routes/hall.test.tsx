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

  it("draws the speaker icon on the stage instead of a labelled play button", () => {
    const html = renderToStaticMarkup(
      <HallPage dance="airpants" tune={undefined} params={new URLSearchParams("beat=0")} />,
    );
    expect(html).toContain('data-testid="hall-play"');
    expect(html).toContain("Play music");
    // The control row keeps no button of its own with the old text.
    expect(html).not.toContain(">Play<");
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

  it("the reset control sits beside the speaker, with its own accessible name", () => {
    const html = render();
    expect(html).toContain('data-testid="hall-reset"');
    expect(html).toContain("Restart this dance");
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
