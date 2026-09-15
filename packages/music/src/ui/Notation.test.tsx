// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Notation } from "./Notation.js";
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
});
