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
