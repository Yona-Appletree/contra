import { medleys, tunes } from "@caller/music";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TunePage, TunesPage, medleysWith } from "./tunes.js";

/**
 * Static renders, as `dances.test.tsx` does: what the Tunes tab (F4) puts on
 * the page needs no interaction to prove — the cards, the notation's home, the
 * band switcher, the chart, the references and the sets — and the player is
 * only made on a tap, so a render never touches `AudioContext`.
 */
describe("TunesPage (F4: #/tunes)", () => {
  const html = renderToStaticMarkup(<TunesPage />);

  it("has one card per bundled tune, each linking to its own page, with a play button", () => {
    const cards = [...html.matchAll(/data-testid="tune-card" data-slug="([^"]+)"/g)].map(
      (m) => m[1],
    );
    // Reels then jigs, each in the bundle's own order.
    const byType = (type: "reel" | "jig"): string[] =>
      tunes.filter((tune) => tune.type === type).map((tune) => tune.slug);
    expect(cards).toEqual([...byType("reel"), ...byType("jig")]);
    for (const tune of tunes) {
      expect(html).toContain(`href="#/tunes/${tune.slug}"`);
    }
    expect(html.match(/data-testid="tune-play"/g)?.length).toBe(tunes.length);
  });

  it("files the reels before the jigs", () => {
    expect(html.indexOf("Reels")).toBeLessThan(html.indexOf("Jigs"));
    expect(html.match(/data-testid="tunes-group"/g)?.length).toBe(2);
  });

  it("says each tune's band and the sets it is in", () => {
    expect(html).toContain("the house band: fiddle, piano and bass");
    expect(html).toContain("a banjo band: banjo, guitar and bass");
    expect(html).toContain("in reel-set");
  });
});

describe("TunePage (F4: #/tunes/<slug>)", () => {
  const page = (slug: string, query = ""): string =>
    renderToStaticMarkup(<TunePage slug={slug} params={new URLSearchParams(query)} />);

  it("has the head, the notation, the four bands, the chart, the references and the sets", () => {
    const html = page("soldiers-joy");
    expect(html).toContain('data-testid="tune-page" data-slug="soldiers-joy" data-band="house"');
    expect(html).toContain("A reel in D major, at 112 beats a minute.");
    expect(html).toContain('data-testid="tune-notation"');
    expect(html).toContain('class="caller-music-notation"');
    expect(html.match(/data-testid="tune-band-/g)?.length).toBe(4);
    expect(html).toContain("the house band (as written)");
    expect(html).toContain('data-testid="tune-page-chart"');
    // The chart: 32 cells, one a bar, the half-bar pairs written as a pair.
    expect(html.match(/data-bar="\d+"/g)?.length).toBe(32);
    expect(html).toContain("https://en.wikipedia.org/wiki/Soldier%27s_Joy");
    expect(html).toContain("typed from memory");
    expect(html).toContain('href="#/?tune=reel-set"');
  });

  it("marks the tune's own band as written, and takes another from ?band=", () => {
    expect(page("old-joe-clark")).toContain('data-testid="tune-band-banjo" aria-pressed="true"');
    expect(page("old-joe-clark")).toContain("a banjo band (as written)");
    const piano = page("old-joe-clark", "band=piano");
    expect(piano).toContain('data-band="piano"');
    expect(piano).toContain('data-testid="tune-band-piano" aria-pressed="true"');
    expect(piano).toContain('data-testid="tune-band-banjo" aria-pressed="false"');
    // The notation is the rearranged tune's: the piano's program, not the banjo's.
    expect(piano).toContain("piano, guitar and bass. The same setting");
  });

  it("writes a half-bar pair as a pair", () => {
    expect(page("golden-slippers")).toContain("G / A7");
  });

  it("says so for a tune that does not exist", () => {
    expect(page("no-such-tune")).toContain('data-testid="tune-page-missing"');
  });
});

describe("medleysWith", () => {
  it("finds every set a tune is in, in the sets' own order", () => {
    const washerwoman = tunes.find((tune) => tune.slug === "irish-washerwoman")!;
    expect(medleysWith(washerwoman).map((set) => set.slug)).toEqual(["jig-set", "swallowtail-set"]);
    // Every bundled tune is in at least one set, so no page says "no set".
    for (const tune of tunes) expect(medleysWith(tune).length).toBeGreaterThan(0);
    expect(medleys.length).toBe(6);
  });
});
