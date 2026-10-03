import { expect, test, type Page } from "@playwright/test";
import { readFakeAccount, readStoredData, seedStorage } from "./fixtures.ts";

const ROY = { accountId: "roy-7k3f", name: "Roy Smith" };

const home = (page: Page) => page.getByRole("heading", { level: 1, name: "BBQueue" });
const accountScreen = (page: Page) => page.getByRole("heading", { level: 1, name: "Account" });
const avatar = (page: Page) => page.getByRole("link", { name: /^Account settings/ });
const accountCard = (page: Page) => page.getByRole("region", { name: "Your Account", exact: true });

test.describe("Account settings", () => {
  test("with an Account: the avatar shows initials, renaming in place updates them and survives a reload", async ({
    page,
  }) => {
    await seedStorage(page, { account: ROY });
    await page.goto("/");

    await expect(avatar(page)).toHaveText("RS");
    await expect(avatar(page)).toHaveAccessibleName("Account settings, Roy Smith");
    await avatar(page).click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(accountScreen(page)).toBeVisible();
    await expect(accountCard(page)).toContainText("Roy Smith");
    await expect(accountCard(page)).toContainText("roy-7k3f");

    await page.getByRole("button", { name: "Edit name" }).click();
    const name = page.getByLabel("Your name");
    await expect(name).toBeFocused();
    await expect(name).toHaveValue("Roy Smith");
    await name.fill("Ana Bell");
    await name.press("Enter");

    await expect(name).toHaveCount(0);
    await expect(accountCard(page)).toContainText("Ana Bell");
    await expect(page.getByRole("button", { name: "Edit name" })).toBeFocused();
    // The Account ID never changes.
    await expect(accountCard(page)).toContainText("roy-7k3f");
    expect(await readFakeAccount(page)).toEqual({ accountId: "roy-7k3f", name: "Ana Bell" });

    await page.getByRole("button", { name: "Back" }).click();
    await expect(home(page)).toBeVisible();
    await expect(avatar(page)).toHaveText("AB");

    await page.reload();
    await expect(avatar(page)).toHaveText("AB");
    expect(await readStoredData(page, "account")).toEqual({
      accountId: "roy-7k3f",
      name: "Ana Bell",
    });
  });

  test("Escape cancels renaming; an empty name is refused", async ({ page }) => {
    await seedStorage(page, { account: ROY });
    await page.goto("/account");

    await page.getByRole("button", { name: "Edit name" }).click();
    const name = page.getByLabel("Your name");
    await name.fill("Somebody Else");
    await name.press("Escape");
    await expect(name).toHaveCount(0);
    await expect(accountCard(page)).toContainText("Roy Smith");
    await expect(page.getByRole("button", { name: "Edit name" })).toBeFocused();

    await page.getByRole("button", { name: "Edit name" }).click();
    await name.fill("   ");
    await name.press("Enter");
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter a name")).toBeVisible();
    expect(await readFakeAccount(page)).toEqual(ROY);
  });

  test("copying the Account ID confirms it was copied", async ({ page, context, browserName }) => {
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    await seedStorage(page, { account: ROY });
    await page.goto("/account");

    await page.getByRole("button", { name: "Copy Account ID" }).click();

    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Account ID copied");
    if (browserName === "chromium") {
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("roy-7k3f");
    }
  });

  test("skipped earlier: the default avatar leads to “Add your name”, which creates an Account", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(avatar(page)).toHaveAccessibleName("Account settings, no Account");
    await expect(avatar(page)).toHaveText("");
    await avatar(page).click();

    await expect(accountCard(page)).toContainText("No Account yet");
    await page.getByLabel("Your name").fill("Roy Smith");
    await page.getByRole("button", { name: "Add your name" }).click();

    await expect(accountCard(page)).toContainText("Roy Smith");
    const account = await readFakeAccount(page);
    expect(account).toMatchObject({ name: "Roy Smith" });
    await expect(accountCard(page)).toContainText(account!.accountId);

    await page.getByRole("button", { name: "Back" }).click();
    await expect(home(page)).toBeVisible();
    await expect(avatar(page)).toHaveText("RS");
  });

  test("offline: renaming and adding a name say they need a connection", async ({
    page,
    context,
  }) => {
    await page.goto("/account");
    await context.setOffline(true);
    await expect(
      page.getByText("An Account needs a connection. Connect to add your name."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add your name" })).toHaveCount(0);
    await context.setOffline(false);
    await expect(page.getByRole("button", { name: "Add your name" })).toBeVisible();
  });

  test("offline with an Account: Edit is turned off with the reason", async ({ page, context }) => {
    await seedStorage(page, { account: ROY });
    await page.goto("/account");
    await context.setOffline(true);

    await expect(page.getByRole("button", { name: "Edit name" })).toBeDisabled();
    await expect(page.getByText("Changing your name needs a connection.")).toBeVisible();
  });

  test("iOS Safari: the Add to Home Screen hint can be dismissed for good", async ({
    page,
    browserName,
  }) => {
    await seedStorage(page, { account: ROY });
    await page.goto("/account");
    await expect(accountCard(page)).toBeVisible();
    const hint = page.getByRole("region", { name: "Add to Home Screen to keep your Account" });

    if (browserName !== "webkit") {
      // Only iOS Safari clears an un-installed site's data; elsewhere there's nothing to say.
      await expect(hint).toHaveCount(0);
      return;
    }
    await expect(hint).toBeVisible();
    await hint.getByRole("button", { name: "Dismiss tip" }).click();
    await expect(hint).toHaveCount(0);

    await page.reload();
    await expect(accountCard(page)).toBeVisible();
    await expect(hint).toHaveCount(0);
  });
});
