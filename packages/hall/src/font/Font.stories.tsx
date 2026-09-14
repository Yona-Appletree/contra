import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";
import { FONT, textWidth } from "./Font.js";
import { drawText } from "./drawText.js";
import { CHAR_ADVANCE_PX, GLYPHS, LINE_ADVANCE_PX } from "./glyphs.js";

const PAPER = "#efe6d0";
const INK = "#1b1410";
const GRID = "#d6c9ac";

const CHARACTERS = Object.keys(GLYPHS).filter((ch) => ch !== " ");

const SAMPLES = [
  "HANDS FOUR FROM THE TOP",
  "NEIGHBORS BALANCE & SWING",
  "CIRCLE LEFT ¾, ROBINS CHAIN",
  "LONG LINES FORWARD & BACK",
  "ALLEMANDE LEFT ½ - 90° 1234567890!",
];

/**
 * Every glyph the font has, drawn the way the bubble draws it, plus a few real
 * calls so the shapes can be judged as words rather than as a chart.
 */
function GlyphSheet({ zoom, columns, grid }: { zoom: number; columns: number; grid: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const cell = { w: CHAR_ADVANCE_PX + 2, h: LINE_ADVANCE_PX + 2 };
    const rows = Math.ceil(CHARACTERS.length / columns);
    const sheetH = rows * cell.h;
    const width = Math.max(columns * cell.w, ...SAMPLES.map((s) => textWidth(FONT, s) + 2));
    const height = sheetH + 4 + SAMPLES.length * LINE_ADVANCE_PX + 2;

    canvas.width = width * zoom;
    canvas.height = height * zoom;
    canvas.style.width = `${width * zoom}px`;
    canvas.style.height = `${height * zoom}px`;
    canvas.style.imageRendering = "pixelated";

    const g = canvas.getContext("2d");
    if (g === null) return;
    g.setTransform(zoom, 0, 0, zoom, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, width, height);

    CHARACTERS.forEach((ch, i) => {
      const x = (i % columns) * cell.w + 1;
      const y = Math.floor(i / columns) * cell.h + 1;
      if (grid) {
        g.fillStyle = GRID;
        g.fillRect(x, y, FONT.glyphW, FONT.glyphH);
      }
      drawText(g, FONT, ch, x, y, INK);
    });

    SAMPLES.forEach((line, i) => {
      drawText(g, FONT, line, 1, sheetH + 4 + i * LINE_ADVANCE_PX, INK);
    });
  }, [zoom, columns, grid]);

  return <canvas ref={ref} style={{ display: "block" }} />;
}

const meta = {
  title: "Hall/Bitmap font",
  component: GlyphSheet,
  argTypes: {
    zoom: { control: { type: "range", min: 1, max: 12, step: 1 } },
    columns: { control: { type: "range", min: 8, max: 32, step: 1 } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The hall's own 4 × 6 font. Text in the hall is pixels drawn on the canvas, " +
          "never HTML text over pixel graphics.",
      },
    },
  },
} satisfies Meta<typeof GlyphSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The whole set at the zoom the bubble is judged at. */
export const WholeSet: Story = { args: { zoom: 6, columns: 16, grid: true } };

/** What it looks like at the demo's own scale. */
export const AtZoomThree: Story = { args: { zoom: 3, columns: 16, grid: false } };
