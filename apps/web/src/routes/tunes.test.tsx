import { medleys, tunes } from "@caller/music";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TunePage, TunesPage, medleysWith } from "./tunes.js";

/**
 * Static renders, as `dances.test.tsx` does: what the Tunes tab (F4) puts on
 * the page needs no interaction to prove — the book's rows, the panel, the
 * band switcher, the chart, the references and the sets — and the player is
 * only made on a tap, so a render never touches `AudioContext`.
 */
describe("TunesPage (F4: #/tunes, the jukebox)", () => {
  const page = (query = ""): string =>
    renderToStaticMarkup(<TunesPage params={new URLSearchParams(query)} />);

  it("has one row per bundled tune, reels then jigs, and the first tune on the panel", () => {
    const html = page();
    const rows = [...html.matchAll(/data-testid="tune-row" data-slug="([^"]+)"/g)].map((m) => m[1]);
    const byType = (type: "reel" | "jig"): string[] =>
      tunes.filter((tune) => tune.type === type).map((tune) => tune.slug);
    expect(rows).toEqual([...byType("reel"), ...byType("jig")]);
    expect(html.indexOf("Reels")).toBeLessThan(html.indexOf("Jigs"));
    expect(html).toContain(`data-testid="tunes-page" data-tune="${rows[0] ?? ""}"`);
    expect(html).toContain(`data-testid="tune-panel" data-slug="${rows[0] ?? ""}"`);
    // The picked row is marked; nothing sounds before a tap.
    expect(html).toContain(
      `data-slug="${rows[0] ?? ""}" data-sounding="false" aria-current="true"`,
    );
    expect(html.match(/data-testid="tune-play"/g)?.length).toBe(1);
  });

  it("opens on ?tune= and ?band=, and links the picked tune's own page", () => {
    const html = page("tune=old-joe-clark&band=piano");
    expect(html).toContain('data-testid="tunes-page" data-tune="old-joe-clark"');
    expect(html).toContain('data-testid="tune-panel" data-slug="old-joe-clark" data-band="piano"');
    expect(html).toContain('data-slug="old-joe-clark" data-sounding="false" aria-current="true"');
    expect(html).toContain('href="#/tunes/old-joe-clark"');
    expect(html).toContain("a banjo band (as written)");
  });

  it("falls back to the first tune for a tune it does not have", () => {
    expect(page("tune=no-such-tune")).toContain(
      `data-testid="tunes-page" data-tune="${tunes[0]!.slug}"`,
    );
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
    // The page is the tune alone: no book, no link to itself.
    expect(html).not.toContain('data-testid="tune-row"');
    expect(html).not.toContain('data-testid="tune-page-link"');
  });

  it("marks the tune's own band as written, and takes another from ?band=", () => {
    expect(page("old-joe-clark")).toContain('data-testid="tune-band-banjo" aria-pressed="true"');
    expect(page("old-joe-clark")).toContain("a banjo band (as written)");
    const piano = page("old-joe-clark", "band=piano");
    expect(piano).toContain('data-band="piano"');
    expect(piano).toContain('data-testid="tune-band-piano" aria-pressed="true"');
    expect(piano).toContain('data-testid="tune-band-banjo" aria-pressed="false"');
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
    // Every bundled tune is in at least one set, so no panel says "no set".
    for (const tune of tunes) expect(medleysWith(tune).length).toBeGreaterThan(0);
    expect(medleys.length).toBe(6);
  });
});
