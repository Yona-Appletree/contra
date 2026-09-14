// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Notation } from "./Notation.js";
import { soldiersJoy } from "../tunes/soldiersJoy.js";

afterEach(cleanup);

describe("Notation", () => {
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
});
