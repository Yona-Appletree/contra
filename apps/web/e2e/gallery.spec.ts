import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The move gallery (F3b): the Moves tab, and the strips an agent reads.
 *
 * The strips are the deliverable the director reads — one rendered frame per
 * half beat of every figure and every seam, at 4&times;, with the beat drawn
 * under each frame in the hall's own bitmap font — and they are written on
 * every run like M5's pair strips are, committed, never compared. Nothing here
 * touches a golden.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const STRIP_DIR = join(HERE, "strips");
const FIGURE_DIR = join(STRIP_DIR, "figures");
const SEAM_DIR = join(STRIP_DIR, "seams");

/** The brief's step: a seam is two beats, and one frame per beat misses it. */
const STEP = 0.5;

/** The brief's zoom for the strips. */
const ZOOM = 4;

/** What the gallery page says about one tile, read off its own DOM. */
interface TileInfo {
  key: string;
  kind: "figure" | "seam";
  beats: number;
  source: string;
  formation: string;
}

test.describe("the move gallery", () => {
  test("the tab bar reaches the stage, the moves and the dances", async ({ page }) => {
    await page.goto("#/");
    await expect(page.getByTestId("tab-stage")).toHaveAttribute("aria-current", "page");

    await page.getByTestId("tab-moves").click();
    await expect(page.getByTestId("tab-moves")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("moves-controls")).toBeVisible();

    await page.getByTestId("tab-dances").click();
    await expect(page.getByTestId("tab-dances")).toHaveAttribute("aria-current", "page");
    // Ten encoded dances, each card a link on to the stage.
    await expect(page.getByTestId("dance-card")).toHaveCount(10);
    await expect(page.getByTestId("dance-card").first()).toHaveAttribute("href", /^#\/dance\//);
  });

  test("a dance card goes to the stage playing that dance", async ({ page }) => {
    await page.goto("#/dances");
    const card = page.getByTestId("dance-card").nth(1);
    const slug = await card.getAttribute("data-slug");
    await card.click();
    await expect(page).toHaveURL(new RegExp(`#/dance/${slug ?? ""}`));
    await expect(page.getByTestId("tab-stage")).toHaveAttribute("aria-current", "page");
  });

  test("opens at 2x, plays, scrubs and deep-links one move at 4x", async ({ page }) => {
    await page.goto("#/moves");
    // DD20: the zooms are 1, 2, 3, 4, 6 and the gallery opens at 2.
    await expect(page.getByTestId("moves-zoom-2")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("moves-zoom-8")).toHaveCount(0);
    // The user asked for tiles animating in real time: it opens playing.
    await expect(page.getByTestId("moves-play")).toHaveText("Pause");

    const tiles = page.getByTestId("moves-tile");
    expect(await tiles.count()).toBeGreaterThan(40);

    // Pause first: the shared clock keeps advancing the beat every animation
    // frame, and scrubbing while it plays races the assertion below against
    // that rAF loop. Pausing is itself a control under test (DD20 opens
    // playing; the button must actually stop the beat).
    await page.getByTestId("moves-play").click();
    await expect(page.getByTestId("moves-play")).toHaveText("Play");

    await page.getByTestId("moves-scrub").fill("12");
    await expect(page.getByTestId("moves-scrub")).toHaveValue("12");

    await page.goto("#/moves/balance");
    await expect(page.getByTestId("moves-tile")).toHaveCount(1);
    await expect(page.getByTestId("moves-zoom-4")).toHaveAttribute("aria-pressed", "true");

    await page.goto("#/moves/seam/long-lines--robins-chain");
    await expect(page.getByTestId("moves-tile")).toHaveCount(1);
    await expect(page.getByTestId("moves-tile")).toHaveAttribute(
      "data-key",
      "long-lines--robins-chain",
    );

    await page.goto("#/moves/not-a-figure");
    await expect(page.getByTestId("moves-missing")).toBeVisible();
  });

  test("the bare route draws one canvas and nothing else", async ({ page }) => {
    await page.goto("#/moves/swing?bare=1&beat=6&zoom=4");
    await expect(page.getByTestId("moves-canvas")).toHaveAttribute("data-ready", "1");
    await expect(page.getByTestId("tabs")).toHaveCount(0);
  });

  test("writes the figure and seam strips, and the index that lists them", async ({ page }) => {
    // Fifty-odd strips, each a page load and a few dozen canvases.
    test.setTimeout(20 * 60 * 1000);
    await page.setViewportSize({ width: 1280, height: 900 });

    const tiles = await tileList(page);
    expect(tiles.length).toBeGreaterThan(40);

    rmSync(FIGURE_DIR, { recursive: true, force: true });
    rmSync(SEAM_DIR, { recursive: true, force: true });
    mkdirSync(FIGURE_DIR, { recursive: true });
    mkdirSync(SEAM_DIR, { recursive: true });

    const rows: string[][] = [];
    for (const tile of tiles) {
      const link = tile.kind === "seam" ? `#/moves/seam/${tile.key}` : `#/moves/${tile.key}`;
      await page.goto(`${link}?strip=1&bare=1&zoom=${ZOOM}&step=${STEP}`);
      const strip = page.getByTestId("moves-strip");
      await expect(strip).toHaveAttribute("data-key", tile.key);
      const cells = Number(await strip.getAttribute("data-cells"));
      await expect(strip.locator('canvas[data-ready="1"]')).toHaveCount(cells);
      const png = await strip.screenshot();
      const dir = tile.kind === "seam" ? SEAM_DIR : FIGURE_DIR;
      writeFileSync(join(dir, `${tile.key}.png`), png);
      rows.push(indexRow(tile, cells, link));
    }

    writeFileSync(join(STRIP_DIR, "README.md"), indexPage(rows));
  });
});

/** Every tile the gallery renders, in the order it renders them. */
async function tileList(page: Page): Promise<TileInfo[]> {
  await page.goto("#/moves");
  await expect(page.getByTestId("moves-tile").first()).toBeVisible();
  return page.getByTestId("moves-tile").evaluateAll((nodes) =>
    nodes.map((node) => ({
      key: node.getAttribute("data-key") ?? "",
      kind: (node.getAttribute("data-kind") ?? "figure") as "figure" | "seam",
      beats: Number(node.getAttribute("data-beats") ?? "0"),
      source: node.getAttribute("data-source") ?? "",
      formation: node.getAttribute("data-formation") ?? "",
    })),
  );
}

function indexRow(tile: TileInfo, cells: number, link: string): string[] {
  const file = tile.kind === "seam" ? `seams/${tile.key}.png` : `figures/${tile.key}.png`;
  const source = tile.source === "" ? "figure defaults" : tile.source;
  return [
    `\`${tile.key}\``,
    `[${file}](./${file})`,
    `\`${link}\``,
    String(tile.beats),
    String(cells),
    tile.formation,
    source,
  ];
}

/** The header the index's table carries. */
const COLUMNS = ["move", "strip", "deep link", "beats", "frames", "formation", "params from"];

/**
 * A markdown table padded the way `prettier` pads one, so the generated index
 * passes `pnpm format:check` without anybody running `--write` over it: every
 * cell in a column is padded to the longest cell in that column, and the rule
 * under the header is that many dashes.
 */
function table(header: readonly string[], rows: readonly string[][]): string {
  const width = header.map((h, i) =>
    Math.max(3, h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((c, i) => c.padEnd(width[i]!)).join(" | ")} |`;
  return [line(header), line(width.map((w) => "-".repeat(w))), ...rows.map((r) => line(r))].join(
    "\n",
  );
}

function indexPage(rows: string[][]): string {
  return `<!-- Written by e2e/gallery.spec.ts on every run. Do not edit by hand. -->

# Move gallery strips

One rendered frame per **half beat** at **${ZOOM}×**, laid out left to right,
with the beat drawn under each frame in the hall's own bitmap font. A figure
strip covers the figure's own beats, counted from 0. A seam strip covers the
four beats each side of the seam, counted **from the seam**, so \`-4\` is four
beats before the join and \`0\` is the first frame of the second figure.

A strip longer than 32 frames is drawn at a coarser step so the image stays a
readable width; the \`frames\` column says how many frames each one actually
has.

These are written on every \`playwright test\` run and committed. They are
**not** compared against anything — they are what a reviewer looks at.

The deep link opens the same tile live, looping, on the Moves tab, and the
order of the table is the order that page is in: each figure, then every seam
that leaves it (U2). It used to be all nineteen figures and then all
thirty-five seams; nothing else about the strips changed when it moved.

${table(COLUMNS, rows)}

M5's pair strips (\`01-walk-in.png\` … \`09-fall-back.png\`) are in this
directory too; they are gate G1's artifact and come from \`e2e/pair.spec.ts\`.
`;
}
