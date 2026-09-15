import type { Dance } from "@caller/choreo";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isLabDance } from "../program.js";
import { DancePage, DancesPage } from "./dances.js";

/**
 * A static render, not a DOM one: `DancePage` and `DancesPage` need no
 * interaction to prove what U3 asks for — that the card, the shapes and the
 * two Stage links are on the page — so `react-dom/server` renders them to a
 * string in the plain Node environment this package's other tests already run
 * in, rather than pulling in jsdom and `@testing-library/react` for a first
 * route-render test.
 */
describe("DancePage (U3: #/dances/<slug>)", () => {
  it("has the calling card, the shapes, and a Stage link at both the top and the bottom", () => {
    const html = renderToStaticMarkup(<DancePage slug="airpants" params={new URLSearchParams()} />);
    expect(html).toContain('data-testid="dance-page"');
    expect(html).toContain('data-testid="dance-page-card"');
    expect(html).toContain('data-testid="dance-traces"');
    expect(html).toContain('data-testid="dance-page-play-top"');
    expect(html).toContain('data-testid="dance-page-play-bottom"');
    // Both Stage links go to the singular route, not the plural dance-page one.
    const playLinks = [...html.matchAll(/href="(#\/dance\/airpants)"/g)];
    expect(playLinks.length).toBe(2);
    expect(html).toContain('href="#/dances/airpants/traces"');
  });

  it("shows the head: title, choreographer, formation, the source line", () => {
    const html = renderToStaticMarkup(<DancePage slug="airpants" params={new URLSearchParams()} />);
    expect(html).toContain("Airpants");
    expect(html).toContain("Lisa Greenleaf");
    expect(html).toContain("duple-improper");
    expect(html).toContain("The Caller&#x27;s Box");
  });

  it("names becket's own progression direction for a becket dance", () => {
    const html = renderToStaticMarkup(<DancePage slug="butter" params={new URLSearchParams()} />);
    expect(html).toContain("becket, progresses left");
  });

  it("wraps the shapes by default (T6) and honours ?wrap=0, mirroring ?view=", () => {
    // Butter is T6's own acceptance case: the one becket dance in the demo
    // programme whose slide actually travels down the hall, so it is the one
    // dance whose trace differs between wrapped and unwrapped.
    const wrapped = renderToStaticMarkup(
      <DancePage slug="butter" params={new URLSearchParams()} />,
    );
    const unwrapped = renderToStaticMarkup(
      <DancePage slug="butter" params={new URLSearchParams("wrap=0")} />,
    );
    expect(wrapped).not.toBe(unwrapped);

    // A non-progressing dance's minor set never travels down the hall, so its
    // trace is byte-identical whether or not wrapping is asked for — the same
    // control T6's own screenshots use.
    const airpantsWrapped = renderToStaticMarkup(
      <DancePage slug="airpants" params={new URLSearchParams()} />,
    );
    const airpantsUnwrapped = renderToStaticMarkup(
      <DancePage slug="airpants" params={new URLSearchParams("wrap=0")} />,
    );
    expect(airpantsWrapped).toBe(airpantsUnwrapped);
  });

  it("carries the walkthrough, one step per figure, in order", () => {
    const html = renderToStaticMarkup(<DancePage slug="airpants" params={new URLSearchParams()} />);
    expect(html).toContain('data-testid="dance-page-walkthrough"');
    // Airpants' first figure, the user's own worked example's dance.
    expect(html).toContain("NEIGHBOR BALANCE AND SWING");
  });

  it("lists every call's resolution: the figure, the cast, the anchor and the ends (M3)", () => {
    const html = renderToStaticMarkup(<DancePage slug="airpants" params={new URLSearchParams()} />);
    expect(html).toContain('data-testid="dance-page-resolution"');
    expect(html).not.toContain('data-testid="dance-page-resolution-error"');
    // Airpants' six calls, each resolved into one instance per pair or one per
    // minor set: a row per instance, never fewer than one per call.
    const rows = [...html.matchAll(/data-figure="([a-z-]+)"/g)].map((m) => m[1]);
    expect(new Set(rows)).toEqual(
      new Set(["balance-and-swing", "long-lines", "allemande", "circle", "do-si-do"]),
    );
    // The two rules a reviewer is here to read, from the definitions
    // themselves rather than from anything this page decided.
    expect(html).toContain("&quot;meet&quot;");
    expect(html).toContain("&quot;home&quot;");
    // The cast is figure-roles to dancers, named by dancer, with the set
    // prefix trimmed because every row here is the same set.
    expect(html).toMatch(/lark=c\d\/lark/);
    expect(html).not.toContain("set0/c0/lark");
  });

  it("marks a lab dance as one, and a shipped dance not", () => {
    const shipped = renderToStaticMarkup(
      <DancePage slug="airpants" params={new URLSearchParams()} />,
    );
    expect(shipped).not.toContain('data-testid="dance-page-lab"');
    // No lab dance exists yet (`LAB_DANCES` is empty), so what is checked here
    // is the rule `isLabDance` applies, with fixtures, rather than a dance
    // added to the repository to make a test pass.
    expect(isLabDance("airpants")).toBe(false);
    expect(isLabDance("nobody-has-encoded-this")).toBe(false);
    const lab = { slug: "lab-one" } as Dance;
    const shippedOne = { slug: "shipped-one" } as Dance;
    expect(isLabDance("lab-one", [shippedOne], [shippedOne, lab])).toBe(true);
    expect(isLabDance("shipped-one", [shippedOne], [shippedOne, lab])).toBe(false);
  });

  it("says so, plainly, for a dance slug nobody encoded", () => {
    const html = renderToStaticMarkup(
      <DancePage slug="not-a-dance" params={new URLSearchParams()} />,
    );
    expect(html).toContain('data-testid="dance-page-missing"');
    expect(html).not.toContain('data-testid="dance-page"');
  });
});

describe("DancesPage (U3: the inline diagrams are gone)", () => {
  it("has ten cards, no trace drawing on any of them, and a link to each dance page", () => {
    const html = renderToStaticMarkup(<DancesPage />);
    expect((html.match(/data-testid="dance-card"/g) ?? []).length).toBe(10);
    expect(html).not.toContain('data-testid="dance-traces"');
    expect((html.match(/data-testid="dance-page-link"/g) ?? []).length).toBe(10);
    expect(html).toContain('href="#/dances/airpants"');
  });
});
