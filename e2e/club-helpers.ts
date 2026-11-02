import { expect, type Page } from "@playwright/test";

/**
 * Make a Club through the real New club sheet: Clubs → Add club → name → Create club. Ends on the
 * new Club's page, in Players Edit mode with an empty row focused (after the creator's own row on
 * a Shared club). Returns the new Club's id.
 */
export async function createClubFromSheet(page: Page, name: string): Promise<string> {
  await page.goto("/clubs");
  await page.getByRole("button", { name: "Add club" }).click();
  const sheet = page.getByRole("dialog", { name: "New club" });
  await sheet.getByRole("textbox", { name: "Club name" }).fill(name);
  await sheet.getByRole("button", { name: "Create club" }).click();
  await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  // The just-created flag leaves the URL once the page is open.
  await expect(page).toHaveURL(/\/clubs\/[^/?]+$/);
  return decodeURIComponent(new URL(page.url()).pathname.split("/").at(-1)!);
}

/** Fill the empty row (the last one) and add rows for the rest, by name. */
export async function addPlayersInEditMode(page: Page, names: readonly string[]) {
  const fields = page.getByRole("textbox", { name: "Player name" });
  for (const [index, name] of names.entries()) {
    if (index > 0) await page.getByRole("button", { name: "Add player" }).click();
    await fields.last().fill(name);
  }
}
