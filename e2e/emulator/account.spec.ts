import { expect, test } from "@playwright/test";
import { serverAccountFor, signUp } from "./emulator.ts";

test.describe("Account on the server", () => {
  test("signing up creates the Account and reserves its Account ID; a reload keeps the same Account", async ({
    page,
  }) => {
    const account = await signUp(page, "Roy Smith");
    expect(account).toMatchObject({ name: "Roy Smith" });
    expect(account.accountId).toMatch(/^roy-[a-z0-9]{4}$/);

    await expect
      .poll(() => serverAccountFor(account.accountId))
      .toMatchObject({ name: "Roy Smith" });

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "BBQueue" })).toBeVisible();
    await page.getByRole("link", { name: /^Account settings/ }).click();
    await expect(page.getByRole("region", { name: "Your Account", exact: true })).toContainText(
      account.accountId,
    );
  });

  test("two people with the same name get different Account IDs", async ({ browser, baseURL }) => {
    const first = await (await browser.newContext({ baseURL })).newPage();
    const second = await (await browser.newContext({ baseURL })).newPage();
    const [a, b] = await Promise.all([signUp(first, "Sam Same"), signUp(second, "Sam Same")]);

    expect(a.accountId).not.toBe(b.accountId);
    expect(a.accountId).toMatch(/^sam-/);
    expect(b.accountId).toMatch(/^sam-/);
    await first.context().close();
    await second.context().close();
  });

  test("renaming in Account settings reaches the server", async ({ page }) => {
    const account = await signUp(page, "Ana Bell");
    await page.getByRole("link", { name: /^Account settings/ }).click();
    await page.getByRole("button", { name: "Edit name" }).click();
    await page.getByLabel("Your name").fill("Ana Beal");
    await page.getByLabel("Your name").press("Enter");

    await expect
      .poll(() => serverAccountFor(account.accountId))
      .toMatchObject({ name: "Ana Beal", accountId: account.accountId });
  });
});
