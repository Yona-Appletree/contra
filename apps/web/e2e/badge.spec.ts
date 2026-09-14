import { expect, test } from "@playwright/test";

/**
 * The build-info badge, and through it the popover's behaviour.
 *
 * This workspace has no DOM test environment, and the popover's whole
 * substance is measured geometry — a rect from the trigger, a size from the
 * panel, a path unioned from the two — which a jsdom stub would have to fake
 * wholesale. So the behaviour that needs a browser is a Playwright case here,
 * against the built app, and the arithmetic underneath it is a unit test in
 * `@caller/ui-base` (`popoverPosition`, `mergedOutlinePath`).
 */

const TRIGGER = "build-info-trigger";
const PANEL = "build-info-panel";

test("the badge opens a panel that is one shape with its trigger", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByTestId(TRIGGER);
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  // Icon-only: the build identity rides the hover title.
  await expect(trigger).toHaveAttribute("title", /^Build info — /);

  await trigger.click();
  const panel = page.getByTestId(PANEL);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-settled", "1");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toContainText("Build info");
  await expect(panel.getByRole("link", { name: /Source on GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/Yona-Appletree/contra",
  );

  // One path, drawn as the union of the two rects: it must reach from the
  // trigger's top down past the panel's top, which no single rect's outline
  // could, and it must carry the concave fillets where the two meet.
  const outline = page.locator("svg path[fill-rule='evenodd']");
  const d = (await outline.getAttribute("d")) ?? "";
  expect(d).not.toBe("");
  expect(d.match(/M/g), "one subpath: trigger and panel are joined").toHaveLength(1);
  const sweeps = d
    .split("A")
    .slice(1)
    .map((arc) => arc.split(/\s+/)[4]);
  const ones = sweeps.filter((flag) => flag === "1").length;
  expect(
    Math.min(ones, sweeps.length - ones),
    `concave fillets where the trigger meets the panel: ${d}`,
  ).toBeGreaterThan(0);
});

test("the panel dismisses on an outside click, on Escape, and on the trigger", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByTestId(TRIGGER);
  const panel = page.getByTestId(PANEL);

  await trigger.click();
  await expect(panel).toHaveAttribute("data-settled", "1");
  // Bottom-left of the viewport: under the panel, which hangs off the right.
  await page.mouse.click(20, 600);
  await expect(panel).toBeHidden();

  await trigger.click();
  await expect(panel).toHaveAttribute("data-settled", "1");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await trigger.click();
  await expect(panel).toHaveAttribute("data-settled", "1");
  // While open the trigger's visual lives in the layer; clicking it closes.
  await trigger.click({ force: true });
  await expect(panel).toBeHidden();
});

test("dismissing returns focus to the trigger", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByTestId(TRIGGER);
  const panel = page.getByTestId(PANEL);

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveAttribute("data-settled", "1");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();

  // And after an outside click, which moves focus off the button entirely.
  await trigger.click();
  await expect(panel).toHaveAttribute("data-settled", "1");
  await page.mouse.click(20, 600);
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the panel fits a 390 px phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByTestId(TRIGGER);
  await trigger.click();
  const panel = page.getByTestId(PANEL);
  await expect(panel).toHaveAttribute("data-settled", "1");

  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  // The tab bar is still one row: the badge must not have pushed a tab off.
  await expect(page.getByTestId("tab-dances")).toBeVisible();
});
