import { DEMO_DANCES } from "@caller/contra";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The move gallery (F3b): the Moves tab, and the strips an agent reads.
 *
 * The strips are the deliverable the director reads — one rendered frame per
 * half beat of every figure and every seam, at 4&times;, with the beat drawn
 * under each frame in the hall's own bitmap font — and they are written on
 * every run like M5's pair strips are, committed, never compared. Nothing here
 * touches a golden.
 *
 * `STRIPS_FIGURE` (O1, set by `pnpm strips --figure <id>`) narrows the strip
 * write below to that one figure's tile and the seam tiles either side of it,
 * and skips the directory wipe and the index rewrite — only a full,
 * unflagged run can get either of those right. `STRIPS_OUT` points the
 * filtered write at a directory (e.g. the committed `strips/` itself, to
 * update just that figure's files there); left unset it goes to
 * `data/local/figure-lab/<id>/strips/`, gitignored. Neither variable does
 * anything to this test when unset, which is how the default, unflagged
 * `playwright test` run stays byte-identical to before O1.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const STRIP_DIR = join(HERE, "strips");
const FIGURE_DIR = join(STRIP_DIR, "figures");
const SEAM_DIR = join(STRIP_DIR, "seams");
/** M12: one strip per parameter row, from the row's own deep link. */
const VARIANT_DIR = join(STRIP_DIR, "variants");

const FIGURE_FILTER = process.env.STRIPS_FIGURE;

/** Where a filtered run writes: `STRIPS_OUT`, or the local scratch default. */
function filteredStripDir(id: string): string {
  const override = process.env.STRIPS_OUT;
  if (override !== undefined) return resolve(override);
  return resolve(HERE, "../../..", "data/local/figure-lab", id, "strips");
}

/** Whether one tile is the figure itself, or a seam either side of it. */
function touchesFigure(tile: TileInfo, id: string): boolean {
  if (tile.kind === "figure") return tile.key === id;
  return tile.key.startsWith(`${id}--`) || tile.key.endsWith(`--${id}`);
}

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
    // One card per programme dance, each a link on to the stage: read off
    // the programme rather than written down, so the next dance to land is
    // not a test edit.
    await expect(page.getByTestId("dance-card")).toHaveCount(DEMO_DANCES.length);
    await expect(page.getByTestId("dance-card").first()).toHaveAttribute("href", /^#\/dance\//);
  });

  test("a dance card goes to the stage, starting that dance's own line-up", async ({ page }) => {
    await page.goto("#/dances");
    const card = page.getByTestId("dance-card").nth(1);
    const slug = await card.getAttribute("data-slug");
    await card.click();
    await expect(page.getByTestId("tab-stage")).toHaveAttribute("aria-current", "page");

    // U4 requirement 6: the tapped dance starts at the beginning of its own
    // line-up, not its dancing beat 0 — so, like every ordinary dance-to-dance
    // transition, the URL (and the card, and the dance select) do not catch
    // up to it until it actually starts dancing, `LINEUP_BEATS` (36) later.
    await page.waitForFunction(() => document.documentElement.dataset["hallReady"] === "true");
    await page.evaluate(() => window.hallDemo?.seek((window.hallDemo?.beat() ?? 0) + 36));
    await expect(page).toHaveURL(new RegExp(`#/dance/${slug ?? ""}`));
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
    await expect(page.getByTestId("moves-missing")).toHaveAttribute("data-problem", "0");
  });

  /**
   * M12: the page is a browser of definitions, so the index is families of
   * definitions and every row says what its figure **is** off the definition
   * itself.
   */
  test("lists the library's definitions in families, each with its own facts", async ({ page }) => {
    await page.goto("#/moves");
    // More than one family and every family chip has a section to jump to.
    const families = page.getByTestId("moves-family");
    expect(await families.count()).toBeGreaterThan(5);
    await expect(page.getByTestId("moves-families").locator("a").first()).toBeVisible();

    // The two figures the **registry** holds and the library does not are
    // filed as such and say so, rather than being listed by hand beside the
    // definitions.
    await expect(page.locator('[data-testid="moves-family"][data-key="engine"]')).toBeVisible();
    await expect(page.locator('[data-testid="moves-facts"][data-key="wait-out"]')).toContainText(
      "no definition",
    );

    // A definition's row carries its own facts: the swing is eight beats, minted
    // per pair, anchored where the pair meets, and it gathers people home.
    const swing = page.locator('[data-testid="moves-facts"][data-key="swing"]');
    await expect(swing).toContainText("8 beats");
    await expect(swing).toContainText("pairs");
    await expect(swing).toContainText("meet");
    await expect(swing).toContainText("gathers");
    // Its parts are a lark's and a robin's, and D5 wants the role words in the
    // role colours — `ROLE_COLOURS`, which every renderer reads.
    const lark = swing.locator(".moves-role", { hasText: "lark" });
    await expect(lark).toHaveCSS("color", "rgb(224, 163, 46)");

    // The parameter spec, and which of its parameters a dance actually writes.
    await expect(page.locator('[data-testid="moves-params"][data-key="swing"]')).toContainText(
      "written by a dance",
    );
    // The dance ↔ figure index, the other way round from the dance page's own.
    await expect(page.locator('[data-testid="moves-dances"][data-key="swing"]')).toContainText(
      "danced in",
    );
  });

  /**
   * M12: the parameter rows — the same figure at another tuning, generated from
   * the record, the move's texts and the parameter spec.
   */
  test("gives each definition its parameter rows, and deep-links one of them", async ({ page }) => {
    await page.goto("#/moves");
    const hey = page.locator('[data-testid="moves-variants"][data-key="hey"]');
    await expect(hey).toContainText("parameter rows");
    // The five the brief names, each generated rather than written down.
    const keys = await hey
      .locator('[data-testid="moves-variant"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-key") ?? ""));
    expect(keys).toContain("hey~amount=0.5");
    expect(keys).toContain("hey~for=3");
    const circle = page.locator('[data-testid="moves-variants"][data-key="circle"]');
    await expect(circle.locator('[data-key="circle~direction=right"]')).toHaveCount(1);
    const star = page.locator('[data-testid="moves-variants"][data-key="star"]');
    await expect(star.locator('[data-key="star~hand=L+amount=0.875"]')).toHaveCount(1);

    // One of them on its own: a real tile, with the texts the move's own file
    // writes for that tuning.
    await page.goto("#/moves/hey~amount=0.5");
    await expect(page.getByTestId("moves-tile")).toHaveCount(1);
    await expect(page.getByTestId("moves-tile")).toHaveAttribute("data-kind", "variant");
    await expect(page.getByTestId("moves-calls")).toContainText("HALF A HEY");
    await expect(page.getByTestId("moves-description")).toContainText("Four dancers weave");

    // A tuning that expands and that this tile cannot draw says so, rather than
    // taking the page down: a hey for three is a real hey with one dancer
    // standing out, and a tile of two couples has nobody to stand out.
    await page.goto("#/moves/hey~for=3");
    const missing = page.getByTestId("moves-missing");
    await expect(missing).toHaveAttribute("data-problem", "1");
    await expect(missing).toContainText("cannot draw");
  });

  test("a row says the move's own walkthrough, and its teach behind a disclosure", async ({
    page,
  }) => {
    // W1: the AI paragraph is gone. One row, one deep link: enough to prove the
    // texts reach the built page with their slots filled, without a case per
    // tile (fifty-odd page loads for one assertion each).
    //
    // 0.3 s on a laptop, and CI is some fifteen times slower, so the budget is
    // explicit rather than left to the 30 s default to catch by accident.
    test.setTimeout(30 * 1000);
    await page.goto("#/moves/circle?beat=6");
    // What the figure is, in the third person, under the id (A11).
    await expect(page.getByTestId("moves-description")).toHaveText(
      "Four dancers join hands in a ring and walk it round.",
    );
    const line = page.getByTestId("moves-walkthrough-line");
    // The user's own sentence for this figure, resolved from `{places}` and
    // `{direction}`: "take hands in a ring. circle three places to your left".
    await expect(line).toHaveText("Take hands in a ring. Circle three places to your left.");

    // **On a figure's own page the teach starts open** (P5): somebody who
    // followed "show" from a walkthrough entry came here to read the whole
    // thing. In the index it stays behind the disclosure, which is the point of
    // the row.
    const teach = page.getByTestId("moves-walkthrough-teach");
    await expect(teach).toBeVisible();
    await expect(teach).not.toContainText("{");
    await page.goto("#/moves");
    await expect(page.getByTestId("moves-walkthrough-teach").first()).toBeHidden();
    await page.goto("#/moves/circle?beat=6");
    // The ending hint is its own element under the teach, generated rather than
    // written (D22, D29).
    await expect(page.getByTestId("moves-hint")).toHaveText(
      "Your partner is beside you. Your neighbor is across from you.",
    );

    // The three forms, longest first, in the bubble's capitals.
    await expect(page.getByTestId("moves-calls")).toHaveText(
      "CIRCLE LEFT THREE PLACES · CIRCLE LEFT · CIRCLE",
    );
  });

  test("the show link opens a figure from one dance's own call", async ({ page }) => {
    // D23: the walkthrough card's "show". The tile is Butter's own chain — its
    // formation, its parameters, its dancers — rather than the gallery's
    // first-call tile, and the teach is open because somebody came here to read
    // it.
    test.setTimeout(30 * 1000);
    await page.goto("#/moves/robins-chain?dance=butter&figure=4");
    const tile = page.getByTestId("moves-tile");
    await expect(tile).toHaveCount(1);
    await expect(tile).toHaveAttribute("data-formation", "becket");
    await expect(tile).toHaveAttribute("data-source", "butter");
    await expect(page.getByTestId("moves-walkthrough-teach")).toBeVisible();
    await expect(page.getByTestId("moves-hint")).toBeVisible();

    // A stale link — a dance that never calls this figure at that index — falls
    // back to the ordinary tile rather than to an empty page.
    await page.goto("#/moves/robins-chain?dance=butter&figure=99");
    await expect(page.getByTestId("moves-tile")).toHaveCount(1);
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

    const all = await tileList(page);
    expect(all.length).toBeGreaterThan(40);

    const filtered = FIGURE_FILTER !== undefined;
    const tiles = filtered ? all.filter((tile) => touchesFigure(tile, FIGURE_FILTER!)) : all;
    if (filtered) expect(tiles.length).toBeGreaterThan(0);

    const figureDir = filtered ? join(filteredStripDir(FIGURE_FILTER!), "figures") : FIGURE_DIR;
    const seamDir = filtered ? join(filteredStripDir(FIGURE_FILTER!), "seams") : SEAM_DIR;
    if (!filtered) {
      rmSync(FIGURE_DIR, { recursive: true, force: true });
      rmSync(SEAM_DIR, { recursive: true, force: true });
    }
    mkdirSync(figureDir, { recursive: true });
    mkdirSync(seamDir, { recursive: true });

    const rows: string[][] = [];
    for (const tile of tiles) {
      const link = tile.kind === "seam" ? `#/moves/seam/${tile.key}` : `#/moves/${tile.key}`;
      await page.goto(`${link}?strip=1&bare=1&zoom=${ZOOM}&step=${STEP}`);
      const strip = page.getByTestId("moves-strip");
      await expect(strip).toHaveAttribute("data-key", tile.key);
      const cells = Number(await strip.getAttribute("data-cells"));
      await expect(strip.locator('canvas[data-ready="1"]')).toHaveCount(cells);
      const png = await strip.screenshot();
      const dir = tile.kind === "seam" ? seamDir : figureDir;
      // A **dance-local** figure's id carries its dance's slug and a slash
      // (`fatal-attraction/go-forward`, M8), so its strip lands in a directory
      // of that name — which is the filing a reader wants anyway.
      const file = join(dir, `${tile.key}.png`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, png);
      rows.push(indexRow(tile, cells, link));
    }

    // **The parameter rows' strips** (M12). A parameter row is text on the
    // index — its tile costs a planner run and there are a hundred of them — so
    // its strip comes from its own deep link, exactly as `pnpm figure`'s
    // pictures do. A row whose tuning expands and cannot be drawn writes no PNG
    // and says why in the index instead of failing the run: that is the
    // generated catalogue working, not a defect.
    const variantRows: string[][] = [];
    if (!filtered) {
      rmSync(VARIANT_DIR, { recursive: true, force: true });
      mkdirSync(VARIANT_DIR, { recursive: true });
      for (const variant of await variantList(page)) {
        await page.goto(`#/moves/${variant.key}?strip=1&bare=1&zoom=${ZOOM}&step=${STEP}`);
        const strip = page.getByTestId("moves-strip");
        const missing = page.getByTestId("moves-missing");
        await expect(strip.or(missing)).toBeVisible();
        if ((await missing.count()) > 0) {
          variantRows.push([`\`${variant.key}\``, "—", variant.from, "does not draw"]);
          continue;
        }
        const cells = Number(await strip.getAttribute("data-cells"));
        await expect(strip.locator('canvas[data-ready="1"]')).toHaveCount(cells);
        const file = join(VARIANT_DIR, `${variant.key}.png`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, await strip.screenshot());
        variantRows.push([
          `\`${variant.key}\``,
          `[variants/${variant.key}.png](./variants/${variant.key}.png)`,
          variant.from,
          String(cells),
        ]);
      }
    }

    // Only a full, unfiltered run can get the index right: it lists every
    // tile, and a filtered run only ever wrote a few of them.
    if (!filtered) writeFileSync(join(STRIP_DIR, "README.md"), indexPage(rows, variantRows));
  });
});

/** Every parameter row the index page lists, in the order it lists them. */
async function variantList(page: Page): Promise<{ key: string; from: string }[]> {
  await page.goto("#/moves");
  await expect(page.getByTestId("moves-tile").first()).toBeVisible();
  return page.getByTestId("moves-variant").evaluateAll((nodes) =>
    nodes.map((node) => ({
      key: node.getAttribute("data-key") ?? "",
      // The line's own trailing note says where the row came from; the first
      // word after the bullet is enough for an index column.
      from: (node.textContent ?? "").includes("called in")
        ? "record"
        : (node.textContent ?? "").includes("texts")
          ? "texts"
          : "spec",
    })),
  );
}

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

/** The header the parameter rows' own table carries. */
const VARIANT_COLUMNS = ["parameter row", "strip", "from", "frames"];

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

function indexPage(rows: string[][], variantRows: string[][]): string {
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
that leaves it (U2). Since M12 the figures are **every definition the library
holds**, in the library's own order, rather than a hand-written list of ids.

${table(COLUMNS, rows)}

## Parameter rows

M12: the same figure at another tuning, generated from the record, the move's
texts and the definition's own parameter spec rather than listed by hand. Each
one is a deep link of its own — \`#/moves/<key>\` — and its strip is taken the
same way every other strip here is.

A row marked **does not draw** is a tuning that expands perfectly well and that
a tile of one two-couple set cannot show: a hey for three has nobody to stand
out, and a roll away with your neighbour in duple improper is with somebody
across the set rather than beside you. The page says so on the row; it is the
generated catalogue working, not a defect.

${table(VARIANT_COLUMNS, variantRows)}

M5's pair strips (\`01-walk-in.png\` … \`09-fall-back.png\`) are in this
directory too; they are gate G1's artifact and come from \`e2e/pair.spec.ts\`.
`;
}
