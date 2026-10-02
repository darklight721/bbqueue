import { expect, test } from "@playwright/test";

test.describe("Offline", () => {
  test.skip(
    ({ browserName }) => browserName === "webkit",
    'Playwright WebKit fails offline reloads (context.setOffline blocks service-worker-served navigations: "WebKit encountered an internal error")',
  );

  test("app shell loads and routes render offline after first visit", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "BBQueue" })).toBeVisible();

    // Wait for the SW to be active, then reload so this page is controlled by it.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await context.setOffline(true);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "BBQueue" })).toBeVisible();

    // Deep link while offline is served via navigateFallback.
    await page.goto("/clubs");
    await expect(page.getByRole("heading", { level: 1, name: "Clubs" })).toBeVisible();

    // Client-side navigation also works.
    await page.goBack();
    await expect(page.getByRole("link", { name: "New session" })).toBeVisible();
  });
});
