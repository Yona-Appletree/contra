// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Notation, trimToWidth } from "./Notation.js";
import { soldiersJoy } from "../tunes/soldiersJoy.js";

afterEach(cleanup);

describe("Notation", () => {
  it("draws the tune's own title by default and leaves it out when asked", async () => {
    const withTitle = render(<Notation tune={soldiersJoy} beat={0} />);
    await waitFor(() => expect(withTitle.container.querySelector("svg")).toBeInTheDocument());
    expect(withTitle.container.querySelector(".abcjs-title")).toBeInTheDocument();
    cleanup();

    const without = render(<Notation tune={soldiersJoy} beat={0} showTitle={false} />);
    await waitFor(() => expect(without.container.querySelector("svg")).toBeInTheDocument());
    expect(without.container.querySelector(".abcjs-title")).not.toBeInTheDocument();
    // The staves are still all four, so the beat cursor's line index is unmoved.
    expect(without.container.querySelectorAll(".abcjs-staff-wrapper").length).toBe(4);
  });

  it("renders SVG notation for the tune", async () => {
    const { container } = render(<Notation tune={soldiersJoy} beat={0} />);
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
  });

  it("highlights the measure for beat 0 in phrase A1 (line 0, measure 0)", async () => {
    const { container } = render(<Notation tune={soldiersJoy} beat={0} />);
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
    const highlighted = container.querySelectorAll(".caller-music-current-measure");
    expect(highlighted.length).toBeGreaterThan(0);
    highlighted.forEach((el) => {
      expect(el.classList.contains("abcjs-l0")).toBe(true);
      expect(el.classList.contains("abcjs-m0")).toBe(true);
    });
  });

  it("moves the highlighted measure class as beat changes", async () => {
    const { container, rerender } = render(<Notation tune={soldiersJoy} beat={0} />);
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());

    // Beat 20: phrase A2 (line 1, beat 4 into it -> measure 2).
    rerender(<Notation tune={soldiersJoy} beat={20} />);
    await waitFor(() => {
      const highlighted = container.querySelectorAll(".caller-music-current-measure");
      expect(highlighted.length).toBeGreaterThan(0);
      highlighted.forEach((el) => {
        expect(el.classList.contains("abcjs-l1")).toBe(true);
        expect(el.classList.contains("abcjs-m2")).toBe(true);
      });
    });

    // Beat 50: phrase B2 (line 3, beat 2 into it -> measure 1).
    rerender(<Notation tune={soldiersJoy} beat={50} />);
    await waitFor(() => {
      const highlighted = container.querySelectorAll(".caller-music-current-measure");
      expect(highlighted.length).toBeGreaterThan(0);
      highlighted.forEach((el) => {
        expect(el.classList.contains("abcjs-l3")).toBe(true);
        expect(el.classList.contains("abcjs-m1")).toBe(true);
      });
    });
  });

  it("draws the chord symbols and still lands the cursor on the right measure", async () => {
    // Every bundled tune's ABC carries chord symbols; abcjs draws them above
    // the stave and tags them with the same line/measure classes as the notes,
    // so the highlight must keep landing on one measure and nothing else.
    expect(soldiersJoy.abc).toContain('"A7"');
    const { container, rerender } = render(<Notation tune={soldiersJoy} beat={0} />);
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
    expect(container.querySelectorAll(".abcjs-chord").length).toBeGreaterThan(0);

    // Beat 22: phrase A2 (line 1), beat 6 into it -> measure 3.
    rerender(<Notation tune={soldiersJoy} beat={22} />);
    await waitFor(() => {
      const highlighted = container.querySelectorAll(".caller-music-current-measure");
      expect(highlighted.length).toBeGreaterThan(0);
      highlighted.forEach((el) => {
        expect(el.classList.contains("abcjs-l1")).toBe(true);
        expect(el.classList.contains("abcjs-m3")).toBe(true);
      });
    });
  });

  it("takes labels, captions and a bar-click handler, and draws none of them in jsdom", async () => {
    // The decoration is positioned from `getBBox`, which jsdom does not
    // implement: there, the component renders the plain notation and appends
    // nothing (A5). This is the test that the props are inert rather than
    // broken — and, because captions prepend `%%staffsep` to the ABC, that
    // abcjs still parses the tune with the directive in front of it.
    const clicks: Array<[number, number]> = [];
    const { container } = render(
      <Notation
        tune={soldiersJoy}
        beat={0}
        staveLabels={["A1", "A2", "B1", "B2"]}
        captions={[{ line: 0, fromBar: 0, bars: 4, text: "Circle left 3/4", current: true }]}
        onBarClick={(line, measure) => clicks.push([line, measure])}
      />,
    );
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
    expect(container.querySelectorAll(".abcjs-staff-wrapper").length).toBe(4);
    expect(container.querySelector(".caller-music-decoration")).not.toBeInTheDocument();
    expect(container.querySelector(".caller-music-bar-hit")).not.toBeInTheDocument();
    expect(container.querySelector(".caller-music-caption")).not.toBeInTheDocument();
    expect(container.querySelector(".caller-music-stave-label")).not.toBeInTheDocument();
    expect(clicks).toEqual([]);
    // And the cursor still lands where it did.
    expect(container.querySelectorAll(".caller-music-current-measure").length).toBeGreaterThan(0);
  });
});

describe("trimToWidth", () => {
  it("leaves text that already fits alone", () => {
    expect(trimToWidth("Neighbour swing", () => true)).toBe("Neighbour swing");
    expect(trimToWidth("", () => false)).toBe("");
  });

  it("shortens to the first fit, with an ellipsis", () => {
    // Six characters' room: the longest prefix plus "…" that stays within it.
    const fitted = trimToWidth("Balance the ring", (candidate) => candidate.length <= 6);
    expect(fitted).toBe("Balan…");
  });

  it("drops a trailing space rather than leaving one before the ellipsis", () => {
    expect(trimToWidth("Star right", (candidate) => candidate.length <= 6)).toBe("Star…");
  });

  it("never returns an empty string for text that has one character's room", () => {
    const fitted = trimToWidth("Petronella", () => false);
    expect(fitted).not.toBe("");
    expect(fitted).toBe("P…");
  });
});
