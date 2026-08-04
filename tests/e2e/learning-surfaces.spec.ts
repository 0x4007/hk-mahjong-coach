import { expect, test } from "@playwright/test";

test("exposes first-person setup, seeded rooms, rules glossary, profile, and drills", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Stay in the hand." })).toBeVisible();
  await expect(page.getByText("Live first-person preview")).toBeVisible();
  await expect(page.getByLabel("Match length")).toHaveValue("one_wind");
  await page.getByLabel("Match length").selectOption("full_four_winds");
  await expect(page.getByLabel("Match length")).toHaveValue("full_four_winds");

  const demoRooms = page.locator(".demo-card");
  await expect(demoRooms).toHaveCount(10);
  const tileBasics = demoRooms.filter({ hasText: "Tile basics" });
  await expect(tileBasics).toHaveCount(1);
  await tileBasics.getByRole("button", { name: "Enter room" }).click();
  await expect(
    page.getByRole("heading", { name: "Read the table. Make one clear decision." }),
  ).toBeVisible();
  await expect(page.getByText("Live first-person table")).toBeVisible();

  await page.getByRole("button", { name: "Rules" }).click();
  await expect(page.getByRole("heading", { name: "Rules and glossary" })).toBeVisible();
  await expect(page.getByText("42 semantic tile types")).toBeVisible();
  await expect(page.getByText("Dragon Pung or Kong")).toHaveCount(3);

  await page.getByRole("button", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Learner" })).toBeVisible();
  const highContrast = page.getByRole("button", { name: "Enable high contrast" });
  await expect(highContrast).toHaveCount(1);
  await highContrast.click();
  await expect(page.getByRole("button", { name: "Disable high contrast" })).toBeVisible();

  await page.getByRole("button", { name: "Drills" }).click();
  await expect(page.getByRole("heading", { name: "One useful prompt at a time" })).toBeVisible();
  const drillChoices = page.locator(".drill-choices button");
  await expect(drillChoices).not.toHaveCount(0);
  await drillChoices.first().click();
  await expect(page.getByText(/remaining/)).toBeVisible();
});
