import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";
import { drawBubble } from "../bubble/drawBubble.js";
import type { BlitCtx2D, HallTheme } from "../floor/drawFloor.js";
import { drawFloor } from "../floor/drawFloor.js";
import { FONT } from "../font/Font.js";
import { drawFurniture } from "../furniture/drawFurniture.js";
import { layoutHall } from "./layoutHall.js";

/**
 * The hall with nobody dancing in it: the boards, the walls, the stage, the
 * band on the beat, the caller and their bubble. The dancers are the demo's
 * (M9); this is the room they dance in.
 */
function HallView({
  lines,
  couples,
  theme,
  zoom,
  beat,
  call,
}: {
  /** How many lines of dancers the hall is sized for. */
  lines: number;
  /** Couples in the longest line; the others step down from it. */
  couples: number;
  theme: HallTheme;
  zoom: number;
  /** Where in the beat the band is. Drag it to see the bow, strum, nod, lean. */
  beat: number;
  /** What the caller is calling. Empty for no bubble. */
  call: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const perLine = Array.from({ length: lines }, (_, i) => Math.max(1, couples - i));
    const hall = layoutHall({ lines, couplesPerLine: perLine, zoom });

    canvas.width = hall.world.w * zoom;
    canvas.height = hall.world.h * zoom;
    canvas.style.width = `${hall.world.w * zoom}px`;
    canvas.style.height = `${hall.world.h * zoom}px`;
    canvas.style.imageRendering = "pixelated";

    const display = canvas.getContext("2d");
    if (display === null) return;

    const layer = new OffscreenCanvas(hall.world.w, hall.world.h);
    const g = layer.getContext("2d") as BlitCtx2D | null;
    if (g === null) return;
    drawFloor(g, hall, theme);
    drawFurniture(g, hall, beat);
    if (call !== "") {
      drawBubble(g, FONT, call, hall.caller, { world: hall.world });
    }

    display.imageSmoothingEnabled = false;
    display.drawImage(layer, 0, 0, hall.world.w, hall.world.h, 0, 0, canvas.width, canvas.height);
  }, [lines, couples, theme, zoom, beat, call]);

  return <canvas ref={ref} style={{ display: "block" }} />;
}

const meta = {
  title: "Hall/The hall",
  component: HallView,
  argTypes: {
    lines: { control: { type: "range", min: 1, max: 4, step: 1 } },
    couples: { control: { type: "range", min: 2, max: 9, step: 1 } },
    theme: { control: "select", options: ["grange", "gym", "night"] },
    zoom: { control: { type: "range", min: 1, max: 4, step: 1 } },
    beat: { control: { type: "range", min: 0, max: 2, step: 0.05 } },
  },
} satisfies Meta<typeof HallView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The demo's hall: two lines, five couples and four, at a laptop's zoom. */
export const Grange: Story = {
  args: { lines: 2, couples: 5, theme: "grange", zoom: 3, beat: 0, call: "" },
};

/** The same hall with the caller calling. */
export const Calling: Story = {
  args: { ...Grange.args, call: "HANDS FOUR FROM THE TOP" },
};

/** A long call, wrapped at the bubble's 22 columns. */
export const LongCall: Story = {
  args: { ...Grange.args, call: "LONG LINES FORWARD & BACK, ROBINS CHAIN ¾" },
};

/** A school gym: painted lines, pale boards. */
export const Gym: Story = { args: { ...Grange.args, theme: "gym" } };

/** An evening hall under three lamps. */
export const Night: Story = { args: { ...Grange.args, theme: "night" } };

/** Four lines, nine couples each — the biggest hall the layout has to size. */
export const FourLines: Story = {
  args: { ...Grange.args, lines: 4, couples: 9, zoom: 1 },
};
