import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Get to the way on from the Welcome screen: the name form ("Continue", "Skip for now"), or
 * offline "Continue without an Account". Returns where it is, to look things up in.
 *
 * In a phone's browser (the iPhone and Pixel user agents of the e2e projects) installing comes
 * first, and the way on is in a bottom sheet behind "Continue in the browser anyway". Elsewhere
 * (desktop, a second browser context without a device, the installed app) it is right on the
 * screen.
 */
export async function openWelcomeWayOn(page: Page): Promise<Locator> {
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to BBQueue" })).toBeVisible();
  const anyway = page.getByRole("button", { name: "Continue in the browser anyway" });
  if (!(await anyway.isVisible())) return page.locator("body");
  await anyway.click();
  const sheet = page.getByRole("dialog", { name: "Continue in the browser" });
  await expect(sheet).toBeVisible();
  return sheet;
}
