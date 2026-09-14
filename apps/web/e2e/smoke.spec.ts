import { expect, test } from "@playwright/test";

// M1 golden: a trivial passing spec that opens the built app and asserts
// the title. M3 adds the first real golden (pixel-comparison) test.
test("the built app has the expected title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Contra hall");
});
