import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";
import { createRenderer } from "./renderer/Renderer.js";
import { FIXTURE_NAMES, fixture } from "./testing/fixtures.js";

/**
 * One fixture frame, drawn the way the golden tests draw it. The floor layer
 * is filled with a flat board colour here — M4 paints the real boards, walls
 * and stage into the same layer — so the bodies' outlines read.
 */
function FixtureFrame({
  name,
  zoom,
  aa,
  floor,
}: {
  /** Which fixture to draw. */
  name: string;
  /** Integer display zoom. */
  zoom: number;
  /** Smooth downsample (the settled look) or hard-edged sprites. */
  aa: boolean;
  /** Flat floor colour, or `""` for the bare backdrop. */
  floor: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const f = fixture(name);
    const renderer = createRenderer(canvas, {
      world: { ...f.world, zoom },
      aa,
      skirts: f.skirts ?? false,
    });
    if (floor !== "") {
      const g = renderer.layers.floor.getContext("2d");
      if (g !== null) {
        g.fillStyle = floor;
        g.fillRect(0, 0, renderer.world.w, renderer.world.h);
      }
    }
    renderer.render(f.frame);
  }, [name, zoom, aa, floor]);

  return (
    <figure style={{ margin: 0 }}>
      <canvas ref={ref} style={{ display: "block", imageRendering: "pixelated" }} />
      <figcaption style={{ fontFamily: "ui-monospace, Menlo, monospace", paddingTop: 8 }}>
        {fixture(name).description}
      </figcaption>
    </figure>
  );
}

const meta = {
  title: "Hall/Frames",
  component: FixtureFrame,
  argTypes: {
    name: { control: "select", options: FIXTURE_NAMES },
    zoom: { control: { type: "range", min: 1, max: 10, step: 1 } },
    floor: { control: "color" },
  },
  args: { name: "two-hand-hold", zoom: 6, aa: true, floor: "#c9a06a" },
} satisfies Meta<typeof FixtureFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The eight facings: does a body read as pointing somewhere from every angle? */
export const Facings: Story = { args: { name: "facings" } };

/** Two hands at the contract's 14 px: the hands have to meet by construction. */
export const TwoHandHold: Story = { args: { name: "two-hand-hold" } };

/** The stacking invariant: the robin's hand on top, the robin's arms over the lark's. */
export const Swing: Story = { args: { name: "swing" } };

/** The `aa: false` contract: alpha thresholded, every point on a whole px. */
export const HardEdges: Story = { args: { name: "two-hand-hold", aa: false } };

/** What the hall sees at 1×, before M4's walls and boards. */
export const BareBackdrop: Story = { args: { name: "swing", zoom: 3, floor: "" } };
