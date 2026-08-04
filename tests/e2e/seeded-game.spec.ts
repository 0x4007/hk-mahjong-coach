import { expect, test } from "@playwright/test";

test("starts a seeded guided game and exposes keyboard-safe tile actions", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Ruleset").selectOption("training_relaxed_v1");
  await page.getByLabel("Mode").selectOption("learn");
  await page.getByLabel("Seed").fill("e2e-seeded-game");
  await page.getByRole("button", { name: "Start seeded hand" }).press("Enter");

  await expect(
    page.getByRole("heading", { name: "Read the table. Make one clear decision." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Select a legal move" })).toBeVisible();
  await expect(page.locator("[data-tile-face='true']").first()).toHaveAttribute(
    "aria-label",
    /English/,
  );

  const discard = page.getByRole("button", { name: /^Discard / }).first();
  await expect(discard).toBeEnabled();
  await discard.press("Enter");
  await expect(page.getByText(/Revision/)).toBeVisible();
});
