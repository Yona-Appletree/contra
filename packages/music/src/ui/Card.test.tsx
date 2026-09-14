// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card } from "./Card.js";
import type { CardProps } from "./Card.js";

const dance: CardProps["dance"] = {
  title: "Test Dance",
  phrases: [
    {
      name: "A1",
      figures: [
        { beats: 8, call: "Neighbours balance" },
        { beats: 8, call: "Neighbours swing" },
      ],
    },
    { name: "A2", figures: [{ beats: 16, call: "Long lines forward & back" }] },
    {
      name: "B1",
      figures: [
        { beats: 8, call: "Partners balance" },
        { beats: 8, call: "Partners swing" },
      ],
    },
    { name: "B2", figures: [{ beats: 16, call: "Circle left 3/4" }] },
  ],
};

describe("Card", () => {
  afterEach(cleanup);

  it("shows all four A1/A2/B1/B2 rows", () => {
    const { container } = render(<Card dance={dance} beat={0} />);
    const rows = container.querySelectorAll(".caller-music-card-phrase");
    expect(rows.length).toBe(4);
    expect(container.querySelector('[data-phrase="A1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-phrase="A2"]')).toBeInTheDocument();
    expect(container.querySelector('[data-phrase="B1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-phrase="B2"]')).toBeInTheDocument();
  });

  it("bolds the current figure at beat 0 (first figure of A1)", () => {
    const { getByText } = render(<Card dance={dance} beat={0} />);
    const on = getByText("Neighbours balance");
    const off = getByText("Neighbours swing");
    expect(on).toHaveStyle({ fontWeight: "bold" });
    expect(off).not.toHaveStyle({ fontWeight: "bold" });
  });

  it("bolds the right figure as the beat moves into the second figure of A1", () => {
    const { getByText } = render(<Card dance={dance} beat={10} />);
    const on = getByText("Neighbours swing");
    const off = getByText("Neighbours balance");
    expect(on).toHaveStyle({ fontWeight: "bold" });
    expect(off).not.toHaveStyle({ fontWeight: "bold" });
  });

  it("bolds the right row's figure in phrase B1 (beat 40)", () => {
    const { getByText } = render(<Card dance={dance} beat={40} />);
    // beat 40 -> phrase index 2 (B1), into-phrase beat 8 -> second figure ("Partners swing")
    const on = getByText("Partners swing");
    expect(on).toHaveStyle({ fontWeight: "bold" });
    const currentRow = on.closest(".caller-music-card-phrase");
    expect(currentRow).toHaveClass("caller-music-card-phrase--current");
    expect(currentRow).toHaveAttribute("data-phrase", "B1");
  });

  it("puts the title and the author in the header band", () => {
    const { container } = render(<Card dance={{ ...dance, author: "A Choreographer" }} beat={0} />);
    const head = container.querySelector(".caller-music-card-head");
    expect(head).toBeInTheDocument();
    expect(head?.querySelector(".caller-music-card-title")).toHaveTextContent("Test Dance");
    expect(head?.querySelector(".caller-music-card-author")).toHaveTextContent("A Choreographer");
  });

  it("leaves the author out when the dance has none", () => {
    const { container } = render(<Card dance={dance} beat={0} />);
    expect(container.querySelector(".caller-music-card-author")).not.toBeInTheDocument();
  });

  it("puts whatever it is given on the card under the phrases, and nothing when not", () => {
    const { container, rerender } = render(<Card dance={dance} beat={0} />);
    expect(container.querySelector(".caller-music-card-extra")).not.toBeInTheDocument();

    rerender(
      <Card dance={dance} beat={0}>
        <span>Soldier&rsquo;s Joy</span>
      </Card>,
    );
    const extra = container.querySelector(".caller-music-card-extra");
    expect(extra).toHaveTextContent("Soldier’s Joy");
    // Under the phrases, not above them: the body comes first in the card.
    const body = container.querySelector(".caller-music-card-body");
    expect(body?.nextElementSibling).toBe(extra);
  });

  it("fills the current phrase's bar proportionally to progress within it", () => {
    const { container } = render(<Card dance={dance} beat={4} />);
    const currentRow = container.querySelector(".caller-music-card-phrase--current");
    const fill = currentRow?.querySelector(".caller-music-card-fill") as HTMLElement;
    // beat 4 of 16 in phrase A1 -> 25%
    expect(fill.style.width).toBe("25%");
  });
});
